/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsDelete", () => ({
  itemsDelete: (...args: unknown[]) => mockItemsDelete(...args),
}));

import { deleteItem } from "@/integrations/monday/actions/deleteItem";
import { DeleteItemConfigSchema } from "@/integrations/monday/actions/deleteItem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

describe("delete_item schema", () => {
  it("preserves V1 camelCase: boardId, itemId", () => {
    expect(() =>
      DeleteItemConfigSchema.parse({ boardId: "b", itemId: "i" }),
    ).not.toThrow();
  });

  it("requires both boardId and itemId", () => {
    expect(() => DeleteItemConfigSchema.parse({ itemId: "i" })).toThrow();
    expect(() => DeleteItemConfigSchema.parse({ boardId: "b" })).toThrow();
  });
});

describe("delete_item handler — structural-only output (D-MON4)", () => {
  it("output is STRUCTURAL ONLY: success / deletedItemId / deletedAt", async () => {
    mockItemsDelete.mockResolvedValueOnce({ id: "i-deleted" });
    const result = await deleteItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i" },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output).sort()).toEqual([
      "deletedAt",
      "deletedItemId",
      "success",
    ]);
    expect(result.output.success).toBe(true);
    expect(result.output.deletedItemId).toBe("i-deleted");
    expect(typeof result.output.deletedAt).toBe("string");
  });

  it("does NOT echo deleted item name, body, or column values", async () => {
    // Even if the wire response somehow includes extra fields (defense
    // in depth), the handler must not surface them.
    mockItemsDelete.mockResolvedValueOnce({
      id: "i-deleted",
      // Hypothetical extra fields — the handler must ignore them.
      name: "Secret item name",
      body: "Confidential body",
      column_values: [{ id: "secret", value: "x" }],
    });
    const result = await deleteItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i" },
      triggerEvent: trigger(),
    });
    const outputStr = JSON.stringify(result.output);
    expect(outputStr).not.toContain("Secret item name");
    expect(outputStr).not.toContain("Confidential body");
    expect(outputStr).not.toContain("secret");
  });

  it("passes itemId only (not boardId) to the wrapper — delete_item mutation takes only item_id", async () => {
    mockItemsDelete.mockResolvedValueOnce({ id: "i-1" });
    await deleteItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i-1" },
      triggerEvent: trigger(),
    });
    expect(mockItemsDelete.mock.calls[0]![0].itemId).toBe("i-1");
    expect(mockItemsDelete.mock.calls[0]![0]).not.toHaveProperty("boardId");
  });

  it("uses refreshAndRetry with provider='monday'", async () => {
    mockItemsDelete.mockResolvedValueOnce({ id: "i" });
    await deleteItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
