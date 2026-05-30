/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `audience_event` receive helper — Slice 14
 * Commit 4. Covers the four URL/payload-derived authentication
 * layers + canonical TriggerEvent normalization.
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...a: unknown[]) => mockFindByWorkflowAndNode(...a),
}));

import { receiveMailchimpWebhook } from "@/integrations/mailchimp/triggers/audienceEvent/receive";

beforeEach(() => {
  mockFindByWorkflowAndNode.mockReset();
});

function makeTrigger(
  overrides: Partial<TriggerResourceRecord> = {},
): TriggerResourceRecord {
  return {
    id: "tr1",
    workflowId: "w1",
    workflowAccountId: "acct-w1",
    userId: "u1",
    provider: "mailchimp",
    eventType: "audience_event",
    nodeId: "n1",
    config: {
      audienceId: "1a2b3c4d5e",
      eventTypes: ["subscribe", "unsubscribe"],
      webhookId: "wh-uuid-1",
    },
    providerAccountId: "mc_xyz",
    registeredAt: "2026-01-01T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const SUBSCRIBE_BODY =
  "type=subscribe&fired_at=2025-05-10+12%3A34%3A56&data%5Bid%5D=abc&data%5Blist_id%5D=1a2b3c4d5e&data%5Bemail%5D=urist%40example.com";

const CALLBACK_URL =
  "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1";

// ─── unknown_workflow ───────────────────────────────────────────────────────

describe("receiveMailchimpWebhook — unknown_workflow", () => {
  it("returns unknown_workflow when workflowId query param is missing", async () => {
    const result = await receiveMailchimpWebhook({
      url: "https://app.example/api/webhooks/mailchimp?nodeId=n1",
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unknown_workflow when nodeId query param is missing", async () => {
    const result = await receiveMailchimpWebhook({
      url: "https://app.example/api/webhooks/mailchimp?workflowId=w1",
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when both query params are missing", async () => {
    const result = await receiveMailchimpWebhook({
      url: "https://app.example/api/webhooks/mailchimp",
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when URL is invalid", async () => {
    const result = await receiveMailchimpWebhook({
      url: "not-a-url",
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when no trigger row matches", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when row provider != mailchimp", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTrigger({ provider: "shopify" }),
    );
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });

  it("returns unknown_workflow when row eventType != audience_event", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTrigger({ eventType: "something_else" }),
    );
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("unknown_workflow");
  });
});

// ─── audience_mismatch ──────────────────────────────────────────────────────

describe("receiveMailchimpWebhook — audience_mismatch", () => {
  it("returns audience_mismatch when inbound list_id differs from trigger config", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTrigger());
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody:
        "type=subscribe&data%5Bid%5D=abc&data%5Blist_id%5D=different_list",
    });
    expect(result.kind).toBe("audience_mismatch");
    if (result.kind === "audience_mismatch") {
      expect(result.expected).toBe("1a2b3c4d5e");
      expect(result.received).toBe("different_list");
    }
  });

  it("returns audience_mismatch when inbound body has no list_id", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTrigger());
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: "type=subscribe&data%5Bid%5D=abc",
    });
    expect(result.kind).toBe("audience_mismatch");
  });

  it("returns audience_mismatch when trigger config has no audienceId (defensive)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTrigger({
        config: { eventTypes: ["subscribe"], webhookId: "wh-1" },
      }),
    );
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("audience_mismatch");
  });
});

// ─── unsupported_event_type ─────────────────────────────────────────────────

describe("receiveMailchimpWebhook — unsupported_event_type", () => {
  it("returns unsupported_event_type when type is outside the global allowlist", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTrigger());
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: "type=invented_event&data%5Blist_id%5D=1a2b3c4d5e",
    });
    expect(result.kind).toBe("unsupported_event_type");
    if (result.kind === "unsupported_event_type") {
      expect(result.receivedType).toBe("invented_event");
    }
  });

  it("returns unsupported_event_type when type is global-allowed but not in trigger selection", async () => {
    // Trigger subscribed to subscribe + unsubscribe, but the event is `profile`.
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTrigger());
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody:
        "type=profile&data%5Bid%5D=abc&data%5Blist_id%5D=1a2b3c4d5e",
    });
    expect(result.kind).toBe("unsupported_event_type");
  });

  it("returns unsupported_event_type when type field is empty", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTrigger());
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: "data%5Blist_id%5D=1a2b3c4d5e",
    });
    expect(result.kind).toBe("unsupported_event_type");
  });
});

// ─── events (happy path) ────────────────────────────────────────────────────

describe("receiveMailchimpWebhook — events", () => {
  it("returns events with canonical TriggerEvent shape on a valid delivery", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(makeTrigger());
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      const event = result.events[0]!;
      expect(event.provider).toBe("mailchimp");
      expect(event.eventType).toBe("audience_event");
      expect(event.providerAccountId).toBe("mc_xyz");
      expect(event.payload.type).toBe("subscribe");
      expect(event.payload.audienceId).toBe("1a2b3c4d5e");
      expect(event.payload.email).toBe("urist@example.com");
      // sha256 hex.
      expect(event.eventId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("dispatches when the event type IS in the trigger selection", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      makeTrigger({
        config: {
          audienceId: "1a2b3c4d5e",
          eventTypes: ["unsubscribe"],
          webhookId: "wh-1",
        },
      }),
    );
    const result = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody:
        "type=unsubscribe&data%5Bid%5D=abc&data%5Blist_id%5D=1a2b3c4d5e",
    });
    expect(result.kind).toBe("events");
  });

  it("eventId is identical for identical bodies (cross-retry dedup stability)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValue(makeTrigger());
    const r1 = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    const r2 = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    expect(r1.kind).toBe("events");
    expect(r2.kind).toBe("events");
    if (r1.kind === "events" && r2.kind === "events") {
      expect(r1.events[0]!.eventId).toBe(r2.events[0]!.eventId);
    }
  });

  it("eventId differs for different bodies", async () => {
    mockFindByWorkflowAndNode.mockResolvedValue(makeTrigger());
    const r1 = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY,
    });
    const r2 = await receiveMailchimpWebhook({
      url: CALLBACK_URL,
      rawBody: SUBSCRIBE_BODY + "&extra=field",
    });
    if (r1.kind === "events" && r2.kind === "events") {
      expect(r1.events[0]!.eventId).not.toBe(r2.events[0]!.eventId);
    }
  });
});
