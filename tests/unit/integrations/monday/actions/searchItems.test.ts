/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsList = jest.fn();
const mockItemsSearchByColumnValues = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsList", () => ({
  itemsList: (...args: unknown[]) => mockItemsList(...args),
}));
jest.mock("@/integrations/_shared/monday/api/itemsSearchByColumnValues", () => ({
  itemsSearchByColumnValues: (...args: unknown[]) =>
    mockItemsSearchByColumnValues(...args),
}));

import { searchItems } from "@/integrations/monday/actions/items/searchItems";
import { SearchItemsConfigSchema } from "@/integrations/monday/actions/items/searchItems.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsList.mockReset();
  mockItemsSearchByColumnValues.mockReset();
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

function fullItem(id: string, name: string, groupId = "g") {
  return {
    id,
    name,
    state: "active",
    board: { id: "b", name: "B" },
    group: { id: groupId, title: "G" },
    column_values: [],
    created_at: null,
    updated_at: null,
    creator: null,
  };
}

describe("search_items schema", () => {
  it("requires boardId + columnValue; defaults limit 25", () => {
    const parsed = SearchItemsConfigSchema.parse({
      boardId: "b",
      columnValue: "x",
    });
    expect(parsed.limit).toBe(25);
  });

  it("columnId / groupId optional", () => {
    expect(() =>
      SearchItemsConfigSchema.parse({
        boardId: "b",
        columnValue: "x",
        columnId: "c",
        groupId: "g",
      }),
    ).not.toThrow();
  });
});

describe("search_items handler — column path", () => {
  it("uses items_page_by_column_values when columnId present", async () => {
    mockItemsSearchByColumnValues.mockResolvedValueOnce({
      items: [fullItem("i-1", "Match")],
      cursor: null,
    });
    const result = await searchItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", columnValue: "v", columnId: "status", limit: 25 },
      triggerEvent: trigger(),
    });
    expect(mockItemsSearchByColumnValues).toHaveBeenCalled();
    expect(mockItemsList).not.toHaveBeenCalled();
    expect(result.output.count).toBe(1);
    expect(
      (result.output.items as Array<{ itemId: string }>)[0]!.itemId,
    ).toBe("i-1");
  });
});

describe("search_items handler — name path", () => {
  it("fetches board items + client-side substring filter when no columnId", async () => {
    mockItemsList.mockResolvedValueOnce({
      items: [fullItem("i-1", "Bug fix"), fullItem("i-2", "Feature")],
      cursor: null,
      board: { id: "b", name: "B" },
    });
    const result = await searchItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", columnValue: "bug", limit: 25 },
      triggerEvent: trigger(),
    });
    expect(mockItemsList).toHaveBeenCalled();
    expect(mockItemsSearchByColumnValues).not.toHaveBeenCalled();
    expect(result.output.count).toBe(1);
    expect(
      (result.output.items as Array<{ itemId: string }>)[0]!.itemId,
    ).toBe("i-1");
  });
});

describe("search_items handler — group filter", () => {
  it("applies optional groupId filter client-side", async () => {
    mockItemsSearchByColumnValues.mockResolvedValueOnce({
      items: [fullItem("i-1", "A", "g-1"), fullItem("i-2", "B", "g-2")],
      cursor: null,
    });
    const result = await searchItems({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        columnValue: "v",
        columnId: "c",
        groupId: "g-1",
        limit: 25,
      },
      triggerEvent: trigger(),
    });
    expect(result.output.count).toBe(1);
  });
});
