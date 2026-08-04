/**
 * @jest-environment node
 *
 * mailchimp/triggers/audienceEvent trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockWebhooksCreateOrAdopt = jest.fn();
const mockDecryptToken = jest.fn();
const mockWebhooksDelete = jest.fn();
const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/webhooks", () => {
  const actual = jest.requireActual("@/integrations/_shared/mailchimp/api/webhooks");
  return {
    ...actual,
    webhooksCreateOrAdopt: (...args: unknown[]) => mockWebhooksCreateOrAdopt(...args),
    webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
  };
});

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecryptToken(...a),
}));

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...a: unknown[]) => mockFindByWorkflowAndNode(...a),
}));

import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";
import { MissingDataCenterError, NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import { activate } from "@/integrations/mailchimp/triggers/audienceEvent/activate";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { deactivate } from "@/integrations/mailchimp/triggers/audienceEvent/deactivate";
import { receiveMailchimpWebhook } from "@/integrations/mailchimp/triggers/audienceEvent/receive";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Tests for the Mailchimp `audience_event` activation hook —
// Slice 14 Commit 4.
// Verifies:
// - Validates audienceId is required.
// - Validates eventTypes is non-empty and allowlist-conforming.
// - Rejects event types outside the allowlist with a typed error.
// - De-duplicates event types.
// - Reads dc from integration accountMetadata; throws
// MissingDataCenterError when absent.
// - Calls webhooksCreateOrAdopt with the full 6-event bitmap (true
// for selected, false for everything else).
// - Default sources: all true.
// - Callback URL contains workflowId + nodeId.
// - Returns the persisted config: webhookEnabled, audienceId,
// eventTypes, webhookId, webhookUrl, adopted.
// - MAILCHIMP_WEBHOOK_URL env override + NEXT_PUBLIC_APP_URL fallback.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockWebhooksCreateOrAdopt.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-token");
  mockWebhooksCreateOrAdopt.mockResolvedValue({
    webhook: {
      id: "wh-uuid-1",
      url: "ignored",
      events: {
        subscribe: true,
        unsubscribe: false,
        profile: false,
        cleaned: false,
        upemail: false,
        campaign: false,
      },
      sources: { user: true, admin: true, api: true },
      list_id: "1a2b3c4d5e",
    },
    adopted: false,
  });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MAILCHIMP_WEBHOOK_URL;
});

function makeNode(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    kind: "trigger",
    type: "audience_event",
    provider: "mailchimp",
    config,
    position: { x: 0, y: 0 },
  };
}

function makeIntegration(
  metadata: Record<string, unknown> = { dc: "us21", mailchimpAccountId: "mc_xyz" },
): IntegrationRecord {
  return {
    id: "i1",
    accountId: "acct-u1",
    connectedByUserId: "u1",
    provider: "mailchimp",
    providerAccountId: "mc_xyz",
    displayName: "Acme",
    accessTokenEncrypted: "enc-token",
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: ["account_access"],
    accountMetadata: metadata,
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const CTX = (config: Record<string, unknown>, metadata?: Record<string, unknown>) => ({
  node: makeNode(config),
  integration: makeIntegration(metadata),
  workflowId: "w1",
});

// ─── validation ─────────────────────────────────────────────────────────────

describe("activate — validation", () => {
  it("throws when audienceId is missing", async () => {
    await expect(
      activate(CTX({ eventTypes: ["subscribe"] })),
    ).rejects.toThrow(/audienceId is required/);
    expect(mockWebhooksCreateOrAdopt).not.toHaveBeenCalled();
  });

  it("throws when audienceId is empty string", async () => {
    await expect(
      activate(CTX({ audienceId: "", eventTypes: ["subscribe"] })),
    ).rejects.toThrow(/audienceId is required/);
  });

  it("throws when eventTypes is missing", async () => {
    await expect(activate(CTX({ audienceId: "list_1" }))).rejects.toThrow(
      /eventTypes is required/,
    );
    expect(mockWebhooksCreateOrAdopt).not.toHaveBeenCalled();
  });

  it("throws when eventTypes is empty array", async () => {
    await expect(
      activate(CTX({ audienceId: "list_1", eventTypes: [] })),
    ).rejects.toThrow(/eventTypes is required/);
  });

  it("throws on an event type outside the Slice 14 allowlist", async () => {
    await expect(
      activate(
        CTX({
          audienceId: "list_1",
          eventTypes: ["subscribe", "bogus_event"],
        }),
      ),
    ).rejects.toThrow(/'bogus_event' is not in the Slice 14 Batch 1 event-type allowlist/);
    expect(mockWebhooksCreateOrAdopt).not.toHaveBeenCalled();
  });

  it("throws MissingDataCenterError when integration metadata lacks dc", async () => {
    await expect(
      activate(
        CTX(
          { audienceId: "list_1", eventTypes: ["subscribe"] },
          { mailchimpAccountId: "mc_xyz" /* dc missing */ },
        ),
      ),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
    expect(mockWebhooksCreateOrAdopt).not.toHaveBeenCalled();
  });
});

// ─── wire shape ─────────────────────────────────────────────────────────────

describe("activate — wire shape", () => {
  it("calls webhooksCreateOrAdopt with the dc + bearer + audience + full bitmap", async () => {
    await activate(
      CTX({
        audienceId: "list_1",
        eventTypes: ["subscribe", "unsubscribe"],
      }),
    );
    expect(mockWebhooksCreateOrAdopt).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "decrypted-token",
        dc: "us21",
        audienceId: "list_1",
        events: {
          subscribe: true,
          unsubscribe: true,
          profile: false,
          cleaned: false,
          upemail: false,
          campaign: false,
        },
        sources: { user: true, admin: true, api: true },
      }),
    );
  });

  it("callback URL contains workflowId + nodeId query params", async () => {
    await activate(
      CTX({ audienceId: "list_1", eventTypes: ["subscribe"] }),
    );
    const call = mockWebhooksCreateOrAdopt.mock.calls[0]![0] as {
      url: string;
    };
    const parsed = new URL(call.url);
    expect(parsed.pathname).toBe("/api/webhooks/mailchimp");
    expect(parsed.searchParams.get("workflowId")).toBe("w1");
    expect(parsed.searchParams.get("nodeId")).toBe("n1");
  });

  it("respects MAILCHIMP_WEBHOOK_URL override and strips trailing path", async () => {
    process.env.MAILCHIMP_WEBHOOK_URL = "https://hooks.example/api/webhooks/mailchimp";
    await activate(
      CTX({ audienceId: "list_1", eventTypes: ["subscribe"] }),
    );
    const call = mockWebhooksCreateOrAdopt.mock.calls[0]![0] as {
      url: string;
    };
    expect(call.url).toBe(
      "https://hooks.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
    );
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    await activate(
      CTX({ audienceId: "list_1", eventTypes: ["subscribe"] }),
    );
    const call = mockWebhooksCreateOrAdopt.mock.calls[0]![0] as {
      url: string;
    };
    expect(call.url).toContain("http://localhost:3000/api/webhooks/mailchimp");
  });

  it("de-duplicates event types passed in config", async () => {
    await activate(
      CTX({
        audienceId: "list_1",
        eventTypes: ["subscribe", "subscribe", "unsubscribe"],
      }),
    );
    // The bitmap is set-based so duplicates don't matter at the wire,
    // but the returned eventTypes array should be the de-duped form.
    const result = await activate(
      CTX({
        audienceId: "list_1",
        eventTypes: ["subscribe", "subscribe", "unsubscribe"],
      }),
    );
    expect(result.eventTypes).toEqual(["subscribe", "unsubscribe"]);
  });
});

// ─── persisted config ───────────────────────────────────────────────────────

describe("activate — persisted config", () => {
  it("returns the right config patch for trigger_resources.upsert", async () => {
    const result = await activate(
      CTX({
        audienceId: "list_1",
        eventTypes: ["subscribe", "upemail"],
      }),
    );
    expect(result).toEqual({
      webhookEnabled: true,
      audienceId: "list_1",
      eventTypes: ["subscribe", "upemail"],
      webhookId: "wh-uuid-1",
      webhookUrl: expect.stringMatching(
        /\/api\/webhooks\/mailchimp\?workflowId=w1&nodeId=n1$/,
      ),
      adopted: false,
    });
  });

  it("returns adopted=true when the wrapper reports it adopted an existing webhook", async () => {
    mockWebhooksCreateOrAdopt.mockResolvedValueOnce({
      webhook: {
        id: "wh-existing",
        url: "u",
        events: {
          subscribe: true,
          unsubscribe: false,
          profile: false,
          cleaned: false,
          upemail: false,
          campaign: false,
        },
        sources: { user: true, admin: true, api: true },
      },
      adopted: true,
    });
    const result = await activate(
      CTX({ audienceId: "list_1", eventTypes: ["subscribe"] }),
    );
    expect(result.adopted).toBe(true);
    expect(result.webhookId).toBe("wh-existing");
  });

  it("does NOT include a 'type: subscription-watch' field (permanent endpoint)", async () => {
    // Anti-test for the renewal-cron interlock — Mailchimp webhooks
    // don't expire and we don't want the cron picking them up.
    const result = await activate(
      CTX({ audienceId: "list_1", eventTypes: ["subscribe"] }),
    );
    expect("type" in result).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// Tests for the Mailchimp `audience_event` deactivation hook —
// Slice 14 Commit 4.
// Verifies:
// - Skips silently when trigger.config lacks webhookId or audienceId.
// - Skips with a logged warn when integration metadata lacks dc.
// - Calls webhooksDelete with the right (dc, audienceId, webhookId).
// - Swallows NotFoundError (404 → already deleted).
// - Swallows Unauthorized401Error (token revoked → bail).
// - Propagates other errors (lifecycle catches and continues).
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockWebhooksDelete.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-token");
});

function makeTrigger(config: Record<string, unknown>): TriggerResourceRecord {
  return {
    id: "tr1",
    workflowId: "w1",
    workflowAccountId: "acct-w1",
    userId: "u1",
    provider: "mailchimp",
    eventType: "audience_event",
    nodeId: "n1",
    config,
    providerAccountId: "mc_xyz",
    registeredAt: "2026-01-01T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeIntegration(
  metadata: Record<string, unknown> = { dc: "us21" },
): IntegrationRecord {
  return {
    id: "i1",
    accountId: "acct-u1",
    connectedByUserId: "u1",
    provider: "mailchimp",
    providerAccountId: "mc_xyz",
    displayName: "Acme",
    accessTokenEncrypted: "enc-token",
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: ["account_access"],
    accountMetadata: metadata,
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("deactivate — skip cases", () => {
  it("returns silently when webhookId is missing", async () => {
    await expect(
      deactivate({
        trigger: makeTrigger({ audienceId: "list_1" }),
        integration: makeIntegration(),
      }),
    ).resolves.toBeUndefined();
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("returns silently when audienceId is missing", async () => {
    await expect(
      deactivate({
        trigger: makeTrigger({ webhookId: "wh-1" }),
        integration: makeIntegration(),
      }),
    ).resolves.toBeUndefined();
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("skips with a logged warn when integration accountMetadata lacks dc", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      deactivate({
        trigger: makeTrigger({ webhookId: "wh-1", audienceId: "list_1" }),
        integration: makeIntegration({ mailchimpAccountId: "mc_xyz" /* dc missing */ }),
      }),
    ).resolves.toBeUndefined();
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("deactivate — happy path + error tolerance", () => {
  it("calls webhooksDelete with (dc, audienceId, webhookId, accessToken)", async () => {
    mockWebhooksDelete.mockResolvedValueOnce(undefined);
    await deactivate({
      trigger: makeTrigger({ webhookId: "wh-1", audienceId: "list_1" }),
      integration: makeIntegration(),
    });
    expect(mockWebhooksDelete).toHaveBeenCalledWith({
      accessToken: "decrypted-token",
      dc: "us21",
      audienceId: "list_1",
      webhookId: "wh-1",
    });
  });

  it("swallows NotFoundError (404 — already deleted)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(
      new NotFoundError("webhook wh-1"),
    );
    await expect(
      deactivate({
        trigger: makeTrigger({ webhookId: "wh-1", audienceId: "list_1" }),
        integration: makeIntegration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (token revoked — bail)", async () => {
    class Unauthorized401Error extends Error {
      constructor() {
        super("401");
        this.name = "Unauthorized401Error";
      }
    }
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockWebhooksDelete.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      deactivate({
        trigger: makeTrigger({ webhookId: "wh-1", audienceId: "list_1" }),
        integration: makeIntegration(),
      }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("propagates other errors (lifecycle catches and continues)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new Error("network down"));
    await expect(
      deactivate({
        trigger: makeTrigger({ webhookId: "wh-1", audienceId: "list_1" }),
        integration: makeIntegration(),
      }),
    ).rejects.toThrow(/network down/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Tests for the Mailchimp `audience_event` receive helper — Slice 14
// Commit 4. Covers the four URL/payload-derived authentication
// layers + canonical TriggerEvent normalization.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

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

});
