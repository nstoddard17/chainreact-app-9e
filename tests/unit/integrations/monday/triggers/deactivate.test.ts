/**
 * @jest-environment node
 *
 * Tests for the shared Monday trigger deactivation hook
 * (`triggers/_shared/deactivate.ts`) — Slice 3.MONDAY-7. Best-effort
 * delete_webhook: swallow NotFoundError / 401, propagate everything else,
 * skip when no webhookId.
 */
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();

jest.mock("@/integrations/_shared/monday/api/webhooksDelete", () => ({
  webhooksDelete: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

import { mondaySharedDeactivate } from "@/integrations/monday/triggers/_shared/deactivate";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
});

const integration = {
  id: "int-1",
  userId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "monday",
    eventType: "new_item",
    nodeId: "node-1",
    config,
    accountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("mondaySharedDeactivate", () => {
  it("deletes the webhook by its persisted id", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    await mondaySharedDeactivate({
      trigger: trigger({ webhookId: "wh-9" }),
      integration,
    });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]).toMatchObject({
      accessToken: "decrypted-ENC",
      webhookId: "wh-9",
      apiVersion: "2025-04",
    });
  });

  it("skips silently (no API call) when the row carries no webhookId", async () => {
    await mondaySharedDeactivate({ trigger: trigger({}), integration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (webhook already gone server-side)", async () => {
    mockDelete.mockRejectedValueOnce(new NotFoundError("monday resource"));
    await expect(
      mondaySharedDeactivate({
        trigger: trigger({ webhookId: "wh-9" }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (token revoked — re-auth won't help)", async () => {
    const err = new Error("401");
    err.name = "Unauthorized401Error";
    mockDelete.mockRejectedValueOnce(err);
    await expect(
      mondaySharedDeactivate({
        trigger: trigger({ webhookId: "wh-9" }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (lifecycle orchestrator catches + still deletes the row)", async () => {
    mockDelete.mockRejectedValueOnce(new Error("monday 500"));
    await expect(
      mondaySharedDeactivate({
        trigger: trigger({ webhookId: "wh-9" }),
        integration,
      }),
    ).rejects.toThrow("monday 500");
  });
});
