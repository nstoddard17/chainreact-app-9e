/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `audience_event` deactivation hook —
 * Slice 14 Commit 4.
 *
 * Verifies:
 *   - Skips silently when trigger.config lacks webhookId or audienceId.
 *   - Skips with a logged warn when integration metadata lacks dc.
 *   - Calls webhooksDelete with the right (dc, audienceId, webhookId).
 *   - Swallows NotFoundError (404 → already deleted).
 *   - Swallows Unauthorized401Error (token revoked → bail).
 *   - Propagates other errors (lifecycle catches and continues).
 */
import type {
  IntegrationRecord,
} from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

const mockWebhooksDelete = jest.fn();
const mockDecryptToken = jest.fn();

jest.mock("@/integrations/_shared/mailchimp/api/webhooks", () => ({
  webhooksDelete: (...a: unknown[]) => mockWebhooksDelete(...a),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecryptToken(...a),
}));

import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import { deactivate } from "@/integrations/mailchimp/triggers/audienceEvent/deactivate";

beforeEach(() => {
  mockWebhooksDelete.mockReset();
  mockDecryptToken.mockReset();
  mockDecryptToken.mockReturnValue("decrypted-token");
});

function makeTrigger(config: Record<string, unknown>): TriggerResourceRecord {
  return {
    id: "tr1",
    workflowId: "w1",
    userId: "u1",
    provider: "mailchimp",
    eventType: "audience_event",
    nodeId: "n1",
    config,
    accountId: "mc_xyz",
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
    userId: "u1",
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
