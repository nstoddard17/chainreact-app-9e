/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsGet", () => ({
  itemsGet: (...args: unknown[]) => mockItemsGet(...args),
}));

import { getItem } from "@/integrations/monday/actions/getItem";
import { GetItemConfigSchema } from "@/integrations/monday/actions/getItem.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsGet.mockReset();
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

describe("get_item schema", () => {
  it("preserves V1 camelCase: boardId, itemId", () => {
    expect(() =>
      GetItemConfigSchema.parse({ boardId: "b", itemId: "i" }),
    ).not.toThrow();
  });

  it("requires both fields", () => {
    expect(() => GetItemConfigSchema.parse({ itemId: "i" })).toThrow();
  });
});

describe("get_item handler — pure read", () => {
  it("normalizes column_values with title from nested column.title", async () => {
    mockItemsGet.mockResolvedValueOnce({
      id: "i-1",
      name: "Item Name",
      state: "active",
      board: { id: "b", name: "Board" },
      group: { id: "g", title: "Group" },
      column_values: [
        {
          id: "status",
          type: "status",
          text: "Done",
          value: '{"index":1}',
          column: { id: "status", title: "Status" },
        },
        {
          id: "no_col",
          type: "text",
          text: "T",
          value: null,
          column: null,
        },
      ],
      created_at: "2026-05-24T00:00:00Z",
      updated_at: "2026-05-24T01:00:00Z",
      creator: { id: "u-1", name: "Alice" },
    });
    const result = await getItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", itemId: "i-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.itemId).toBe("i-1");
    expect(result.output.itemName).toBe("Item Name");
    expect(result.output.boardId).toBe("b");
    expect(result.output.boardName).toBe("Board");
    const cv = result.output.columnValues as Array<{
      id: string;
      title: string;
    }>;
    expect(cv[0]!.title).toBe("Status");
    // Falls back to id when column metadata missing.
    expect(cv[1]!.title).toBe("no_col");
  });

  it("throws NotFoundError when itemsGet returns null", async () => {
    mockItemsGet.mockResolvedValueOnce(null);
    await expect(
      getItem({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { boardId: "b", itemId: "missing" },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses refreshAndRetry with provider='monday'", async () => {
    mockItemsGet.mockResolvedValueOnce({
      id: "i",
      name: "n",
      state: null,
      board: null,
      group: null,
      column_values: [],
      created_at: null,
      updated_at: null,
      creator: null,
    });
    await getItem({
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
