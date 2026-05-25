/**
 * @jest-environment node
 *
 * Tests for Trello trigger lifecycle (activate + deactivate) — shared
 * across all 6 trigger types via `_shared/`.
 */
import { randomBytes } from "node:crypto";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { IntegrationRecord } from "@/repositories/integrations";

const mockWebhooksCreate = jest.fn();
const mockWebhooksDelete = jest.fn();

jest.mock("@/integrations/trello/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockWebhooksCreate(...args),
  webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
}));

import { buildTrelloActivate } from "@/integrations/trello/triggers/_shared/activate";
import { trelloSharedDeactivate } from "@/integrations/trello/triggers/_shared/deactivate";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockWebhooksCreate.mockReset();
  mockWebhooksDelete.mockReset();
});

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TRELLO_WEBHOOK_URL;
});

function makeIntegration(): IntegrationRecord {
  const { encryptToken } = jest.requireActual("@/core/encryption/tokens");
  return {
    id: "int-1",
    userId: "user-1",
    provider: "trello",
    providerAccountId: "mem-1",
    displayName: "User",
    accessTokenEncrypted: encryptToken("token-abc"),
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeNode(config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: "node-1",
    type: "trello.new_card",
    config,
  } as WorkflowNode;
}

describe("Trello activate (shared)", () => {
  it("creates a webhook on the configured boardId and stores webhookId + eventType + callbackURL", async () => {
    mockWebhooksCreate.mockResolvedValue({
      id: "wh-1",
      idModel: "board-1",
      callbackURL: "https://app.example.test/api/webhooks/trello?workflowId=wf-1&nodeId=node-1",
    });
    const activate = buildTrelloActivate("new_card");
    const result = await activate({
      node: makeNode({ boardId: "board-1" }),
      integration: makeIntegration(),
      workflowId: "wf-1",
    });
    expect(mockWebhooksCreate).toHaveBeenCalledTimes(1);
    const apiArg = mockWebhooksCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(apiArg.accessToken).toBe("token-abc");
    expect(apiArg.idModel).toBe("board-1");
    expect(apiArg.callbackURL).toBe(
      "https://app.example.test/api/webhooks/trello?workflowId=wf-1&nodeId=node-1",
    );

    expect(result).toEqual({
      webhookEnabled: true,
      boardId: "board-1",
      eventType: "new_card",
      webhookId: "wh-1",
      callbackURL:
        "https://app.example.test/api/webhooks/trello?workflowId=wf-1&nodeId=node-1",
      notificationUrl:
        "https://app.example.test/api/webhooks/trello?workflowId=wf-1&nodeId=node-1",
    });
  });

  it("each trigger event type registers its own activate function (shared logic, different stored eventType)", async () => {
    mockWebhooksCreate.mockResolvedValue({
      id: "wh-x",
      idModel: "board-1",
      callbackURL: "x",
    });
    const trigger = buildTrelloActivate("card_archived");
    const result = await trigger({
      node: makeNode({ boardId: "board-1" }),
      integration: makeIntegration(),
      workflowId: "wf-1",
    });
    expect(result.eventType).toBe("card_archived");
  });

  it("rejects activation when boardId is missing", async () => {
    const activate = buildTrelloActivate("new_card");
    await expect(
      activate({
        node: makeNode({}),
        integration: makeIntegration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/boardId is required/);
    expect(mockWebhooksCreate).not.toHaveBeenCalled();
  });

  it("honors TRELLO_WEBHOOK_URL override (e2e seam)", async () => {
    process.env.TRELLO_WEBHOOK_URL = "http://localhost:9885";
    mockWebhooksCreate.mockResolvedValue({
      id: "wh-1",
      idModel: "board-1",
      callbackURL: "x",
    });
    const activate = buildTrelloActivate("new_card");
    await activate({
      node: makeNode({ boardId: "board-1" }),
      integration: makeIntegration(),
      workflowId: "wf-1",
    });
    const apiArg = mockWebhooksCreate.mock.calls[0]![0] as { callbackURL: string };
    expect(apiArg.callbackURL).toBe(
      "http://localhost:9885/api/webhooks/trello?workflowId=wf-1&nodeId=node-1",
    );
  });

  it("does NOT store type: 'subscription-watch' (Trello webhooks don't expire)", async () => {
    mockWebhooksCreate.mockResolvedValue({
      id: "wh-1",
      idModel: "board-1",
      callbackURL: "x",
    });
    const activate = buildTrelloActivate("new_card");
    const result = await activate({
      node: makeNode({ boardId: "board-1" }),
      integration: makeIntegration(),
      workflowId: "wf-1",
    });
    expect((result as Record<string, unknown>).type).toBeUndefined();
  });
});

describe("Trello deactivate (shared)", () => {
  function makeTriggerRow(config: Record<string, unknown>) {
    return {
      id: "tr-1",
      workflowId: "wf-1",
      userId: "user-1",
      nodeId: "node-1",
      provider: "trello",
      eventType: "new_card",
      config,
      accountId: null,
      registeredAt: "2026-01-01T00:00:00Z",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
  }

  it("calls webhooksDelete with the stored webhookId", async () => {
    mockWebhooksDelete.mockResolvedValue(undefined);
    await trelloSharedDeactivate({
      trigger: makeTriggerRow({ webhookId: "wh-1" }),
      integration: makeIntegration(),
    });
    expect(mockWebhooksDelete).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "token-abc", webhookId: "wh-1" }),
    );
  });

  it("silently skips when webhookId is absent", async () => {
    await trelloSharedDeactivate({
      trigger: makeTriggerRow({}),
      integration: makeIntegration(),
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("swallows TrelloNotFoundError (webhook already deleted server-side)", async () => {
    mockWebhooksDelete.mockRejectedValue(
      new TrelloNotFoundError("webhook wh-1", "not found"),
    );
    await expect(
      trelloSharedDeactivate({
        trigger: makeTriggerRow({ webhookId: "wh-1" }),
        integration: makeIntegration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (token revoked)", async () => {
    const err = new Error("401");
    (err as Error).name = "Unauthorized401Error";
    mockWebhooksDelete.mockRejectedValue(err);
    await expect(
      trelloSharedDeactivate({
        trigger: makeTriggerRow({ webhookId: "wh-1" }),
        integration: makeIntegration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-recoverable errors", async () => {
    mockWebhooksDelete.mockRejectedValue(new Error("server boom"));
    await expect(
      trelloSharedDeactivate({
        trigger: makeTriggerRow({ webhookId: "wh-1" }),
        integration: makeIntegration(),
      }),
    ).rejects.toThrow(/server boom/);
  });
});
