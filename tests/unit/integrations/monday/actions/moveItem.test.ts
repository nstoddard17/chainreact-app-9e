/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsMove = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsMove", () => ({
  itemsMove: (...args: unknown[]) => mockItemsMove(...args),
}));

import { moveItem } from "@/integrations/monday/actions/items/moveItem";
import { MoveItemConfigSchema } from "@/integrations/monday/actions/items/moveItem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsMove.mockReset();
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
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

describe("move_item schema", () => {
  it("preserves V1 camelCase: boardId, itemId, targetGroupId", () => {
    expect(() =>
      MoveItemConfigSchema.parse({
        boardId: "b",
        itemId: "i",
        targetGroupId: "g-target",
      }),
    ).not.toThrow();
  });

  it("requires all three fields", () => {
    expect(() =>
      MoveItemConfigSchema.parse({ boardId: "b", itemId: "i" }),
    ).toThrow();
  });
});

describe("move_item handler", () => {
  it("forwards itemId + targetGroupId to itemsMove (NOT boardId — Monday infers it)", async () => {
    mockItemsMove.mockResolvedValueOnce({
      id: "i",
      name: "n",
      group: { id: "g-target", title: "Done" },
    });
    await moveItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i-1", targetGroupId: "g-target" },
      triggerEvent: trigger(),
    });
    const call = mockItemsMove.mock.calls[0]![0];
    expect(call.itemId).toBe("i-1");
    expect(call.targetGroupId).toBe("g-target");
    expect(call).not.toHaveProperty("boardId");
  });

  it("output: itemId / itemName / boardId / targetGroupId / targetGroupTitle / movedAt", async () => {
    mockItemsMove.mockResolvedValueOnce({
      id: "i-1",
      name: "Returned",
      group: { id: "g-resolved", title: "Done" },
    });
    const result = await moveItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b-input", itemId: "i", targetGroupId: "g-input" },
      triggerEvent: trigger(),
    });
    expect(result.output.itemId).toBe("i-1");
    expect(result.output.itemName).toBe("Returned");
    expect(result.output.boardId).toBe("b-input");
    expect(result.output.targetGroupId).toBe("g-resolved");
    expect(result.output.targetGroupTitle).toBe("Done");
    expect(typeof result.output.movedAt).toBe("string");
  });

  it("uses refreshAndRetry with provider='monday'", async () => {
    mockItemsMove.mockResolvedValueOnce({
      id: "i",
      name: "n",
      group: null,
    });
    await moveItem({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i", targetGroupId: "g" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
