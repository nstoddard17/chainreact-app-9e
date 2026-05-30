/**
 * @jest-environment node
 *
 * Tests for `receiveStripeWebhook` — the orchestrator that
 * extracts the workflowId/nodeId query params, looks up the
 * trigger row, verifies signature, parses + filters the event,
 * and normalizes.
 */
import { createHmac } from "node:crypto";

const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { receiveStripeWebhook } from "@/integrations/stripe/webhooks/receive";

const SECRET = "whsec_test_signing";

beforeEach(() => {
  mockFindByWorkflowAndNode.mockReset();
});

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "stripe",
    eventType: "event_received",
    nodeId: "node-1",
    config: { endpointSecret: SECRET, ...overrides },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function buildSignedRequest(opts: {
  rawBody: string;
  secret?: string;
  timestamp: number;
  workflowId?: string;
  nodeId?: string;
  url?: string;
  signatureHeader?: string;
  skipSignatureHeader?: boolean;
}): Request {
  const url =
    opts.url ??
    `https://app.example.test/api/webhooks/stripe?workflowId=${opts.workflowId ?? "wf-1"}&nodeId=${opts.nodeId ?? "node-1"}`;

  const headers: Record<string, string> = {};
  if (!opts.skipSignatureHeader) {
    if (opts.signatureHeader) {
      headers["stripe-signature"] = opts.signatureHeader;
    } else {
      const sig = createHmac("sha256", opts.secret ?? SECRET)
        .update(`${opts.timestamp}.${opts.rawBody}`, "utf8")
        .digest("hex");
      headers["stripe-signature"] = `t=${opts.timestamp},v1=${sig}`;
    }
  }

  return new Request(url, {
    method: "POST",
    body: opts.rawBody,
    headers,
  });
}

const eventBody = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "payment_intent.succeeded",
  api_version: "2025-05-28.basil",
  created: 1700000000,
  livemode: false,
  account: "acct_connected_1",
  data: { object: { id: "pi_test_1", amount: 100, currency: "usd" } },
});

describe("receiveStripeWebhook", () => {
  it("returns events on valid signature + allowlisted event type", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    // Use the actual current epoch for the test request so
    // verifyStripeSignature's default tolerance check passes —
    // we don't override `nowSeconds` from the receive helper.
    const t = Math.floor(Date.now() / 1000);
    const result = await receiveStripeWebhook(
      buildSignedRequest({ rawBody: eventBody, timestamp: t }),
    );
    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventId).toBe("evt_test_1");
      expect(result.events[0]!.eventType).toBe("event_received");
      expect(result.events[0]!.payload.stripeEventType).toBe(
        "payment_intent.succeeded",
      );
    }
  });

  it("returns unknown_workflow when query params are missing", async () => {
    const req = new Request(
      "https://app.example.test/api/webhooks/stripe",
      { method: "POST", body: eventBody },
    );
    const result = await receiveStripeWebhook(req);
    expect(result.kind).toBe("unknown_workflow");
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unknown_workflow when only workflowId is present (no nodeId)", async () => {
    const req = new Request(
      "https://app.example.test/api/webhooks/stripe?workflowId=wf-1",
      { method: "POST", body: eventBody },
    );
    const result = await receiveStripeWebhook(req);
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when trigger row not found", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const t = Math.floor(Date.now() / 1000);
    const result = await receiveStripeWebhook(
      buildSignedRequest({ rawBody: eventBody, timestamp: t }),
    );
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when trigger row has wrong provider", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow(),
      provider: "airtable",
    });
    const t = Math.floor(Date.now() / 1000);
    const result = await receiveStripeWebhook(
      buildSignedRequest({ rawBody: eventBody, timestamp: t }),
    );
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when trigger row has wrong event_type", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow(),
      eventType: "wrong_trigger",
    });
    const t = Math.floor(Date.now() / 1000);
    const result = await receiveStripeWebhook(
      buildSignedRequest({ rawBody: eventBody, timestamp: t }),
    );
    expect(result.kind).toBe("unknown_workflow");
  });

  it("throws InvalidSignatureError on empty body", async () => {
    const req = new Request(
      "https://app.example.test/api/webhooks/stripe?workflowId=wf-1&nodeId=node-1",
      { method: "POST", body: "" },
    );
    await expect(receiveStripeWebhook(req)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it("throws InvalidSignatureError on missing endpointSecret in trigger config", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      triggerRow({ endpointSecret: undefined }),
    );
    const t = Math.floor(Date.now() / 1000);
    await expect(
      receiveStripeWebhook(
        buildSignedRequest({ rawBody: eventBody, timestamp: t }),
      ),
    ).rejects.toThrow(/missing endpointSecret/);
  });

  it("throws InvalidSignatureError on missing Stripe-Signature header", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    const t = Math.floor(Date.now() / 1000);
    await expect(
      receiveStripeWebhook(
        buildSignedRequest({
          rawBody: eventBody,
          timestamp: t,
          skipSignatureHeader: true,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws SignatureExpiredError when timestamp is outside the 300s tolerance", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    const oldT = Math.floor(Date.now() / 1000) - 600;
    await expect(
      receiveStripeWebhook(
        buildSignedRequest({ rawBody: eventBody, timestamp: oldT }),
      ),
    ).rejects.toBeInstanceOf(SignatureExpiredError);
  });

  it("throws InvalidSignatureError on signature mismatch (wrong secret)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    const t = Math.floor(Date.now() / 1000);
    await expect(
      receiveStripeWebhook(
        buildSignedRequest({
          rawBody: eventBody,
          secret: "whsec_wrong",
          timestamp: t,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("returns unsupported_event_type when event.type is outside the allowlist (after signature verify)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    const t = Math.floor(Date.now() / 1000);
    const offAllowlistBody = JSON.stringify({
      id: "evt_skip",
      object: "event",
      // valid Stripe event type, NOT in V2 allowlist.
      // `invoice.created` was the original example here but was
      // promoted to the allowlist in Stripe 2.1 Commit 3 alongside
      // `create_invoice` — `invoice.finalized` keeps the same
      // out-of-allowlist semantics for this test.
      type: "invoice.finalized",
      created: t,
      livemode: false,
      data: { object: {} },
    });
    const result = await receiveStripeWebhook(
      buildSignedRequest({ rawBody: offAllowlistBody, timestamp: t }),
    );
    expect(result.kind).toBe("unsupported_event_type");
    if (result.kind === "unsupported_event_type") {
      expect(result.stripeEventType).toBe("invoice.finalized");
    }
  });

  it("throws InvalidSignatureError on parsed event missing id or type", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    const t = Math.floor(Date.now() / 1000);
    const malformedBody = JSON.stringify({
      object: "event",
      type: "payment_intent.succeeded",
      // missing id
      created: t,
      data: { object: {} },
    });
    await expect(
      receiveStripeWebhook(
        buildSignedRequest({ rawBody: malformedBody, timestamp: t }),
      ),
    ).rejects.toThrow(/missing id or type/);
  });

  it("verifies signature against the EXACT raw body bytes (no JSON re-serialization)", async () => {
    // Whitespace differences between the signed body and the parsed
    // body would cause the digest to mismatch — receive must
    // capture rawBody before parsing.
    mockFindByWorkflowAndNode.mockResolvedValueOnce(triggerRow());
    const t = Math.floor(Date.now() / 1000);
    const bodyWithExtraWhitespace =
      '{ "id": "evt_test_1" , "object": "event" , "type": "payment_intent.succeeded" , "created": ' +
      String(t) +
      ' , "livemode": false , "data": { "object": {} } }';
    const result = await receiveStripeWebhook(
      buildSignedRequest({
        rawBody: bodyWithExtraWhitespace,
        timestamp: t,
      }),
    );
    expect(result.kind).toBe("events");
  });
});
