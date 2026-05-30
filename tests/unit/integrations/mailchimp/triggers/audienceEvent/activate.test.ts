/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `audience_event` activation hook —
 * Slice 14 Commit 4.
 *
 * Verifies:
 *   - Validates audienceId is required.
 *   - Validates eventTypes is non-empty and allowlist-conforming.
 *   - Rejects event types outside the allowlist with a typed error.
 *   - De-duplicates event types.
 *   - Reads dc from integration accountMetadata; throws
 *     MissingDataCenterError when absent.
 *   - Calls webhooksCreateOrAdopt with the full 6-event bitmap (true
 *     for selected, false for everything else).
 *   - Default sources: all true.
 *   - Callback URL contains workflowId + nodeId.
 *   - Returns the persisted config: webhookEnabled, audienceId,
 *     eventTypes, webhookId, webhookUrl, adopted.
 *   - MAILCHIMP_WEBHOOK_URL env override + NEXT_PUBLIC_APP_URL fallback.
 */
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";

const mockWebhooksCreateOrAdopt = jest.fn();
const mockDecryptToken = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/webhooks", () => {
  const actual = jest.requireActual(
    "@/integrations/_shared/mailchimp/api/webhooks",
  );
  return {
    ...actual,
    webhooksCreateOrAdopt: (...a: unknown[]) => mockWebhooksCreateOrAdopt(...a),
  };
});

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecryptToken(...a),
}));

import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";
import { activate } from "@/integrations/mailchimp/triggers/audienceEvent/activate";

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
