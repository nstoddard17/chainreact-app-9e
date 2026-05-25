/**
 * @jest-environment node
 *
 * Tests for the shared Monday trigger activation factory
 * (`triggers/_shared/activate.ts`) — Slice 3.MONDAY-7.
 */
const mockCreate = jest.fn();
const mockDecrypt = jest.fn();

jest.mock("@/integrations/_shared/monday/api/webhooksCreate", () => ({
  webhooksCreate: (...args: unknown[]) => mockCreate(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

import { buildMondayActivate } from "@/integrations/monday/triggers/_shared/activate";

beforeEach(() => {
  mockCreate.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
  mockCreate.mockResolvedValue({ id: "wh-1", board_id: "b-1" });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MONDAY_WEBHOOK_URL;
});

const baseIntegration = {
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

function node(config: Record<string, unknown>) {
  return {
    id: "node-trigger-1",
    kind: "trigger" as const,
    provider: "monday",
    type: "new_item",
    config,
    position: { x: 0, y: 0 },
  };
}

describe("buildMondayActivate — new_item (no config event)", () => {
  it("creates a webhook for create_item and persists webhookId/boardId/event", async () => {
    const activate = buildMondayActivate("new_item");
    const result = await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      accessToken: "decrypted-ENC",
      boardId: "b-1",
      event: "create_item",
      apiVersion: "2025-04",
    });
    // No config for the no-filter trigger.
    expect(mockCreate.mock.calls[0]![0].configJson).toBeUndefined();
    expect(result.webhookEnabled).toBe(true);
    expect(result.boardId).toBe("b-1");
    expect(result.event).toBe("create_item");
    expect(result.webhookId).toBe("wh-1");
    expect(result.columnId).toBeNull();
  });

  it("embeds workflowId + nodeId in the notification URL (strict-direct-lookup)", async () => {
    const activate = buildMondayActivate("new_item");
    await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf-42",
    });
    expect(mockCreate.mock.calls[0]![0].url).toBe(
      "https://app.example.test/api/webhooks/monday?workflowId=wf-42&nodeId=node-trigger-1",
    );
  });

  it("uses MONDAY_WEBHOOK_URL override when set", async () => {
    process.env.MONDAY_WEBHOOK_URL = "http://localhost:9920";
    const activate = buildMondayActivate("new_item");
    await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockCreate.mock.calls[0]![0].url).toBe(
      "http://localhost:9920/api/webhooks/monday?workflowId=wf&nodeId=node-trigger-1",
    );
  });

  it("does NOT register a subscription-watch marker (Monday webhooks don't expire)", async () => {
    const activate = buildMondayActivate("new_item");
    const result = await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(result.type).toBeUndefined();
  });

  it("rejects a missing boardId without calling create", async () => {
    const activate = buildMondayActivate("new_item");
    await expect(
      activate({
        node: node({}),
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/boardId is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("decrypts the integration access token before create", async () => {
    const activate = buildMondayActivate("new_item");
    await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockDecrypt).toHaveBeenCalledWith("ENC");
  });
});

describe("buildMondayActivate — column_changed (optional columnId filter)", () => {
  it("subscribes to board-wide change_column_value when no columnId is set", async () => {
    const activate = buildMondayActivate("column_changed");
    const result = await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockCreate.mock.calls[0]![0].event).toBe("change_column_value");
    expect(mockCreate.mock.calls[0]![0].configJson).toBeUndefined();
    expect(result.columnId).toBeNull();
  });

  it("subscribes to change_specific_column_value with a config filter when columnId is set", async () => {
    const activate = buildMondayActivate("column_changed");
    const result = await activate({
      node: node({ boardId: "b-1", columnId: "status" }),
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockCreate.mock.calls[0]![0].event).toBe(
      "change_specific_column_value",
    );
    expect(mockCreate.mock.calls[0]![0].configJson).toBe('{"columnId":"status"}');
    expect(mockCreate.mock.calls[0]![0].apiVersion).toBe("2025-04");
    expect(result.columnId).toBe("status");
    expect(result.event).toBe("change_specific_column_value");
  });

  it("rejects a non-string columnId", async () => {
    const activate = buildMondayActivate("column_changed");
    await expect(
      activate({
        node: node({ boardId: "b-1", columnId: 7 as unknown as string }),
        integration: baseIntegration,
        workflowId: "wf",
      }),
    ).rejects.toThrow(/columnId must be a string/);
  });
});

describe("buildMondayActivate — remaining triggers map to the right Monday event", () => {
  it.each([
    ["item_moved", "item_moved_to_any_group"],
    ["new_subitem", "create_subitem"],
    ["new_update", "create_update"],
  ] as const)("%s → %s", async (triggerType, mondayEvent) => {
    const activate = buildMondayActivate(triggerType);
    const result = await activate({
      node: node({ boardId: "b-1" }),
      integration: baseIntegration,
      workflowId: "wf",
    });
    expect(mockCreate.mock.calls[0]![0].event).toBe(mondayEvent);
    expect(result.event).toBe(mondayEvent);
  });
});
