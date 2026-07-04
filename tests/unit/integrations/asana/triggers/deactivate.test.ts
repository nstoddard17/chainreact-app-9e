/**
 * @jest-environment node
 *
 * Tests for the shared Asana deactivation hook — Slice 5.ASANA-1.
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhooksDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

jest.mock("@/integrations/_shared/asana/api/webhooks", () => ({
  webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
}));

import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/asana/errors";
import { asanaSharedDeactivate } from "@/integrations/asana/triggers/_shared/deactivate";

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "asana",
    eventType: "new_task_in_project",
    nodeId: "node-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  } as never;
}

function integration() {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "asana",
    providerAccountId: "marcus@example.test",
    displayName: null,
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "",
    updatedAt: "",
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("asanaSharedDeactivate", () => {
  it("deletes the webhook by the stored gid", async () => {
    mockWebhooksDelete.mockResolvedValueOnce(undefined);
    await asanaSharedDeactivate({
      trigger: trigger({ webhookId: "wh-1" }),
      integration: integration(),
    });
    expect(mockWebhooksDelete.mock.calls[0]![0].webhookGid).toBe("wh-1");
  });

  it("skips silently when the row has no webhookId (aborted activation)", async () => {
    await asanaSharedDeactivate({
      trigger: trigger({ handshakePending: true }),
      integration: integration(),
    });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (already gone server-side)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new NotFoundError("webhook wh-1"));
    await expect(
      asanaSharedDeactivate({
        trigger: trigger({ webhookId: "wh-1" }),
        integration: integration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows IntegrationActionRequiredError (dead credential; best-effort cleanup)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "asana",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      asanaSharedDeactivate({
        trigger: trigger({ webhookId: "wh-1" }),
        integration: integration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors to the lifecycle orchestrator", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new Error("Asana 500"));
    await expect(
      asanaSharedDeactivate({
        trigger: trigger({ webhookId: "wh-1" }),
        integration: integration(),
      }),
    ).rejects.toThrow(/500/);
  });
});
