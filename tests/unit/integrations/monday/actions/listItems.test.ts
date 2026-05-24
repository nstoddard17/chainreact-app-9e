/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsList", () => ({
  itemsList: (...args: unknown[]) => mockItemsList(...args),
}));

import { listItems } from "@/integrations/monday/actions/listItems";
import { ListItemsConfigSchema } from "@/integrations/monday/actions/listItems.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsList.mockReset();
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

describe("list_items schema", () => {
  it("defaults limit to 25", () => {
    const parsed = ListItemsConfigSchema.parse({ boardId: "b" });
    expect(parsed.limit).toBe(25);
  });

  it("accepts cursor (opaque next-page token)", () => {
    const parsed = ListItemsConfigSchema.parse({
      boardId: "b",
      cursor: "opaque-token",
    });
    expect(parsed.cursor).toBe("opaque-token");
  });

  it("enforces 1..100 limit bounds", () => {
    expect(() =>
      ListItemsConfigSchema.parse({ boardId: "b", limit: 0 }),
    ).toThrow();
    expect(() =>
      ListItemsConfigSchema.parse({ boardId: "b", limit: 101 }),
    ).toThrow();
  });
});

describe("list_items handler — pure read", () => {
  it("returns count + hasMore + nextCursor", async () => {
    mockItemsList.mockResolvedValueOnce({
      items: [
        {
          id: "i-1",
          name: "n",
          state: "active",
          board: { id: "b", name: "B" },
          group: { id: "g", title: "G" },
          column_values: [],
          created_at: null,
          updated_at: null,
          creator: null,
        },
      ],
      cursor: "next-cursor",
      board: { id: "b", name: "B" },
    });
    const result = await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", limit: 25 },
      triggerEvent: trigger(),
    });
    expect(result.output.count).toBe(1);
    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextCursor).toBe("next-cursor");
  });

  it("client-side filters by groupId when provided", async () => {
    mockItemsList.mockResolvedValueOnce({
      items: [
        {
          id: "i-1",
          name: "in-group",
          state: "active",
          board: { id: "b", name: "B" },
          group: { id: "g-1", title: "G1" },
          column_values: [],
          created_at: null,
          updated_at: null,
          creator: null,
        },
        {
          id: "i-2",
          name: "out-of-group",
          state: "active",
          board: { id: "b", name: "B" },
          group: { id: "g-2", title: "G2" },
          column_values: [],
          created_at: null,
          updated_at: null,
          creator: null,
        },
      ],
      cursor: null,
      board: { id: "b", name: "B" },
    });
    const result = await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", limit: 25, groupId: "g-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.count).toBe(1);
    expect((result.output.items as Array<{ itemId: string }>)[0]!.itemId).toBe(
      "i-1",
    );
  });

  it("hasMore = false / nextCursor = null when cursor absent", async () => {
    mockItemsList.mockResolvedValueOnce({
      items: [],
      cursor: null,
      board: null,
    });
    const result = await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", limit: 25 },
      triggerEvent: trigger(),
    });
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextCursor).toBeNull();
  });

  it("forwards cursor to wrapper for paginated calls", async () => {
    mockItemsList.mockResolvedValueOnce({
      items: [],
      cursor: null,
      board: null,
    });
    await listItems({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", limit: 25, cursor: "page-2-token" },
      triggerEvent: trigger(),
    });
    expect(mockItemsList.mock.calls[0]![0].cursor).toBe("page-2-token");
  });
});
