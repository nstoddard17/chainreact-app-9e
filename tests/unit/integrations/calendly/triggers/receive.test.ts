/**
 * @jest-environment node
 *
 * Tests for the shared Calendly webhook receive helper — Slice
 * 5.CALENDLY-1.
 *
 * Uses the REAL signature verifier (crypto HMAC, t=,v1= hex over
 * `<t>.<raw body>`) with a reversible fake for the token-encryption
 * seam, and mocks the trigger-row repo. No handshake path exists (V2
 * mints the signing key).
 */
import { createHmac } from "node:crypto";

const mockFind = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) => mockFind(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => {
    if (!s.startsWith("enc(") || !s.endsWith(")")) throw new Error("bad ciphertext");
    return s.slice(4, -1);
  },
}));

import { receiveCalendlyWebhook } from "@/integrations/calendly/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

const SECRET = "cal-signing-key-1";
const INVITEE_URI =
  "https://api.calendly.com/scheduled_events/EVT111/invitees/INV222";

function sign(body: string, secret: string = SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  const hex = createHmac("sha256", secret)
    .update(`${t}.${body}`, "utf8")
    .digest("hex");
  return `t=${t},v1=${hex}`;
}

function makeRequest(
  body: string,
  opts: { sig?: string | null; query?: string } = {},
): Request {
  const query = opts.query ?? "?workflowId=wf&nodeId=n";
  const headers: Record<string, string> = {};
  if (opts.sig) headers["calendly-webhook-signature"] = opts.sig;
  return new Request(`https://app.test/api/webhooks/calendly${query}`, {
    method: "POST",
    headers,
    body,
  });
}

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf",
    workflowAccountId: "acct-wf",
    userId: "user-1",
    provider: "calendly",
    eventType: "event_scheduled",
    nodeId: "n",
    config: {
      hookSecretEncrypted: `enc(${SECRET})`,
      webhookEnabled: true,
      calendlyUserId: "USER123",
      subscriptionUri: "https://api.calendly.com/webhook_subscriptions/SUB789",
    },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function inviteeCreatedBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "invitee.created",
    created_at: "2026-07-04T12:00:00.000000Z",
    created_by: "https://api.calendly.com/users/USER123",
    payload: {
      uri: INVITEE_URI,
      email: "invitee@example.test",
      name: "Ada Lovelace",
      status: "active",
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT111",
        name: "Discovery Call",
        start_time: "2026-07-10T15:00:00.000000Z",
        end_time: "2026-07-10T15:30:00.000000Z",
        event_type: "https://api.calendly.com/event_types/ET333",
      },
      ...overrides,
    },
  });
}

beforeEach(() => {
  mockFind.mockReset();
});

describe("receiveCalendlyWebhook — row resolution", () => {
  it("quiet-acks when query params are missing", async () => {
    const body = inviteeCreatedBody();
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body), query: "" }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unknown_workflow" });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("quiet-acks an unknown row", async () => {
    mockFind.mockResolvedValueOnce(null);
    const body = inviteeCreatedBody();
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("quiet-acks a row from another provider (never dispatches cross-provider)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ provider: "typeform" }));
    const body = inviteeCreatedBody();
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("marks a secretless row (aborted activation) unverifiable — nothing dispatched", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ config: { webhookEnabled: true, calendlyUserId: "USER123" } }),
    );
    const body = inviteeCreatedBody();
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unverifiable" });
  });
});

describe("receiveCalendlyWebhook — signature", () => {
  it("throws InvalidSignatureError on a missing header", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = inviteeCreatedBody();
    await expect(
      receiveCalendlyWebhook({
        request: makeRequest(body, { sig: null }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on a wrong-key signature", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = inviteeCreatedBody();
    await expect(
      receiveCalendlyWebhook({
        request: makeRequest(body, { sig: sign(body, "other-key") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when the verified body is not a JSON object", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = "not json";
    await expect(
      receiveCalendlyWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("receiveCalendlyWebhook — event classification", () => {
  it("quiet-acks unsupported event families (routing forms, no-shows, future)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({
      event: "routing_form_submission.created",
      payload: {},
    });
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({
      kind: "ignored_event",
      eventType: "routing_form_submission.created",
    });
  });

  it("quiet-acks an event that doesn't match the row's own trigger type (defense-in-depth)", async () => {
    // An invitee.canceled delivery arriving at an event_scheduled row —
    // each subscription carries exactly one event, so this is misrouted.
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "event_scheduled" }));
    const body = JSON.stringify({
      event: "invitee.canceled",
      created_at: "2026-07-04T12:00:00.000000Z",
      payload: { uri: INVITEE_URI },
    });
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({
      kind: "ignored_event",
      eventType: "invitee.canceled",
    });
  });
});

describe("receiveCalendlyWebhook — normalization", () => {
  it("returns one normalized event with row-attributed subscriber identity", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = inviteeCreatedBody();
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error(`expected events, got ${result.kind}`);
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.provider).toBe("calendly");
    expect(event.eventType).toBe("event_scheduled");
    expect(event.eventId).toBe("event_scheduled:USER123:INV222");
    expect(event.payload.subscriberUserId).toBe("USER123");
    expect(event.payload.meetingName).toBe("Discovery Call");
  });

  it("dispatches invitee.canceled through the canceled normalizer on an event_canceled row", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "event_canceled" }));
    const body = JSON.stringify({
      event: "invitee.canceled",
      created_at: "2026-07-04T13:00:00.000000Z",
      payload: {
        uri: INVITEE_URI,
        status: "canceled",
        rescheduled: false,
        cancellation: {
          canceled_by: "Ada Lovelace",
          reason: "no longer needed",
          canceler_type: "invitee",
        },
      },
    });
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error(`expected events, got ${result.kind}`);
    const event = result.events[0]!;
    expect(event.eventType).toBe("event_canceled");
    expect(event.eventId).toBe("event_canceled:USER123:INV222");
    expect(event.payload.cancellation).toEqual({
      canceledBy: "Ada Lovelace",
      reason: "no longer needed",
      cancelerType: "invitee",
    });
  });

  it("never leaks the signing key into the normalized event", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = inviteeCreatedBody();
    const result = await receiveCalendlyWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
