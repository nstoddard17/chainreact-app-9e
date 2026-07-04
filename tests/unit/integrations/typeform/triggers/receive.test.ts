/**
 * @jest-environment node
 *
 * Tests for the Typeform webhook receive helper — Slice 5.TYPEFORM-1.
 *
 * Uses the REAL signature verifier (crypto HMAC, sha256= + base64) with
 * a reversible fake for the token-encryption seam, and mocks the
 * trigger-row repo. No handshake path exists (V2 mints the secret).
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

import { receiveTypeformWebhook } from "@/integrations/typeform/triggers/newResponseInForm/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

const SECRET = "tf-hook-secret-1";

function sign(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("base64")}`;
}

function makeRequest(
  body: string,
  opts: { sig?: string | null; query?: string } = {},
): Request {
  const query = opts.query ?? "?workflowId=wf&nodeId=n";
  const headers: Record<string, string> = {};
  if (opts.sig) headers["typeform-signature"] = opts.sig;
  return new Request(`https://app.test/api/webhooks/typeform${query}`, {
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
    provider: "typeform",
    eventType: "new_response_in_form",
    nodeId: "n",
    config: {
      formId: "form-1",
      hookSecretEncrypted: `enc(${SECRET})`,
      webhookEnabled: true,
      webhookTag: "chainreact-abc",
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

function formResponseBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_id: "ev-1",
    event_type: "form_response",
    form_response: {
      form_id: "form-1",
      token: "resp-1",
      submitted_at: "2026-07-04T10:00:00Z",
      answers: [],
    },
    ...overrides,
  });
}

beforeEach(() => {
  mockFind.mockReset();
});

describe("receiveTypeformWebhook — routing", () => {
  it("returns unknown_workflow without query params / row / for foreign rows", async () => {
    const body = formResponseBody();
    expect(
      await receiveTypeformWebhook({
        request: makeRequest(body, { sig: sign(body), query: "" }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(null);
    expect(
      await receiveTypeformWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(triggerRow({ provider: "asana" }));
    expect(
      await receiveTypeformWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unverifiable (never dispatches) for a secretless row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ config: { formId: "form-1" } }),
    );
    const body = formResponseBody();
    const result = await receiveTypeformWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unverifiable" });
  });
});

describe("receiveTypeformWebhook — signature (fail closed)", () => {
  it("throws InvalidSignatureError on a bad signature", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = formResponseBody();
    await expect(
      receiveTypeformWebhook({
        request: makeRequest(body, { sig: sign("a different body") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when the header is absent", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = formResponseBody();
    await expect(
      receiveTypeformWebhook({
        request: makeRequest(body, { sig: null }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies with the ROW's own secret (a different webhook's secret fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = formResponseBody();
    await expect(
      receiveTypeformWebhook({
        request: makeRequest(body, { sig: sign(body, "some-other-secret") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies over the RAW body bytes (re-serialized body fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = '{ "event_type": "form_response" }';
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    await expect(
      receiveTypeformWebhook({
        request: makeRequest(reserialized, { sig: sign(body) }),
        rawBody: reserialized,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws on a verified but non-JSON body", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = "not json";
    await expect(
      receiveTypeformWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("receiveTypeformWebhook — event handling", () => {
  it("quiet-acks non-form_response event types (partial responses out of scope)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = formResponseBody({ event_type: "form_response_partial" });
    const result = await receiveTypeformWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({
      kind: "ignored_event",
      eventType: "form_response_partial",
    });
  });

  it("normalizes a form_response delivery with the SHORT eventType + token dedup key", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = formResponseBody();
    const result = await receiveTypeformWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.provider).toBe("typeform");
    expect(event.eventType).toBe("new_response_in_form");
    expect(event.eventId).toBe("new_response_in_form:form-1:resp-1");
    expect(event.providerAccountId).toBe("form-1");
    // The per-webhook secret never leaks into the normalized event.
    expect(JSON.stringify(event)).not.toContain(SECRET);
  });

  it("attributes the ROW's configured formId when the payload omits form_id", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({
      event_id: "ev-9",
      event_type: "form_response",
      form_response: { token: "resp-9" },
    });
    const result = await receiveTypeformWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.payload.formId).toBe("form-1");
  });

  it("produces the SAME eventId for a redelivery (dedup determinism)", async () => {
    const body = formResponseBody();
    mockFind.mockResolvedValue(triggerRow());
    const first = await receiveTypeformWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    const second = await receiveTypeformWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (first.kind !== "events" || second.kind !== "events") {
      throw new Error("expected events");
    }
    expect(first.events[0]!.eventId).toBe(second.events[0]!.eventId);
  });
});
