/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsDuplicate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsDuplicate", () => ({
  itemsDuplicate: (...args: unknown[]) => mockItemsDuplicate(...args),
}));

import { duplicateItem } from "@/integrations/monday/actions/items/duplicateItem";
import { DuplicateItemConfigSchema } from "@/integrations/monday/actions/items/duplicateItem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsDuplicate.mockReset();
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

describe("duplicate_item schema", () => {
  it("requires boardId + itemId; withUpdates defaults false", () => {
    const parsed = DuplicateItemConfigSchema.parse({
      boardId: "b",
      itemId: "i",
    });
    expect(parsed.withUpdates).toBe(false);
  });

  it("accepts withUpdates boolean", () => {
    const parsed = DuplicateItemConfigSchema.parse({
      boardId: "b",
      itemId: "i",
      withUpdates: true,
    });
    expect(parsed.withUpdates).toBe(true);
  });
});

describe("duplicate_item handler", () => {
  it("threads withUpdates into the wrapper", async () => {
    mockItemsDuplicate.mockResolvedValueOnce({
      id: "new-1",
      name: "Copy",
      board: { id: "b" },
      group: { id: "g" },
      created_at: "2026-05-24T00:00:00Z",
    });
    await duplicateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i", withUpdates: true },
      triggerEvent: trigger(),
    });
    expect(mockItemsDuplicate.mock.calls[0]![0]).toMatchObject({
      boardId: "b",
      itemId: "i",
      withUpdates: true,
    });
  });

  it("output: newItemId / newItemName / originalItemId / boardId / groupId / createdAt", async () => {
    mockItemsDuplicate.mockResolvedValueOnce({
      id: "new-1",
      name: "Copy of X",
      board: { id: "b-1" },
      group: { id: "g-1" },
      created_at: "2026-05-24T00:00:00Z",
    });
    const result = await duplicateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "orig", withUpdates: false },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      newItemId: "new-1",
      newItemName: "Copy of X",
      originalItemId: "orig",
      boardId: "b-1",
      groupId: "g-1",
      createdAt: "2026-05-24T00:00:00Z",
    });
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockItemsDuplicate.mockResolvedValueOnce({
      id: "new",
      name: null,
      board: null,
      group: null,
      created_at: null,
    });
    await duplicateItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i", withUpdates: false },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
