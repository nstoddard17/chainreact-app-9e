/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBoardsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/boardsList", () => ({
  boardsList: (...args: unknown[]) => mockBoardsList(...args),
}));

import { listBoards } from "@/integrations/monday/actions/boards/listBoards";
import { ListBoardsConfigSchema } from "@/integrations/monday/actions/boards/listBoards.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBoardsList.mockReset();
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

function makeBoards(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b-${i + 1}`,
    name: `Board ${i + 1}`,
    description: null,
    board_kind: "public",
    state: "active",
    updated_at: "2026-05-24T00:00:00Z",
    creator: { id: "u", name: "Alice" },
  }));
}

describe("list_boards schema", () => {
  it("defaults limit to 25", () => {
    const parsed = ListBoardsConfigSchema.parse({});
    expect(parsed.limit).toBe(25);
  });

  it("enforces 1..100 limit bounds", () => {
    expect(() => ListBoardsConfigSchema.parse({ limit: 0 })).toThrow();
    expect(() => ListBoardsConfigSchema.parse({ limit: 101 })).toThrow();
  });
});

describe("list_boards handler", () => {
  it("starts at page 1 when no cursor", async () => {
    mockBoardsList.mockResolvedValueOnce({ boards: makeBoards(3) });
    await listBoards({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25 },
      triggerEvent: trigger(),
    });
    expect(mockBoardsList.mock.calls[0]![0].page).toBe(1);
  });

  it("uses cursor as page index when provided", async () => {
    mockBoardsList.mockResolvedValueOnce({ boards: makeBoards(3) });
    await listBoards({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25, cursor: "3" },
      triggerEvent: trigger(),
    });
    expect(mockBoardsList.mock.calls[0]![0].page).toBe(3);
  });

  it("throws on invalid cursor", async () => {
    await expect(
      listBoards({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { limit: 25, cursor: "not-a-number" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("hasMore = true when page is full (count === limit)", async () => {
    mockBoardsList.mockResolvedValueOnce({ boards: makeBoards(25) });
    const result = await listBoards({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25 },
      triggerEvent: trigger(),
    });
    expect(result.output.hasMore).toBe(true);
    expect(result.output.nextCursor).toBe("2");
  });

  it("hasMore = false when page is short", async () => {
    mockBoardsList.mockResolvedValueOnce({ boards: makeBoards(10) });
    const result = await listBoards({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25 },
      triggerEvent: trigger(),
    });
    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextCursor).toBeNull();
  });

  it("normalizes output board shape (camelCase)", async () => {
    mockBoardsList.mockResolvedValueOnce({
      boards: [
        {
          id: "b-1",
          name: "B",
          description: "desc",
          board_kind: "public",
          state: "active",
          updated_at: "2026-05-24T00:00:00Z",
          creator: { id: "u", name: "Alice" },
        },
      ],
    });
    const result = await listBoards({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { limit: 25 },
      triggerEvent: trigger(),
    });
    const board = (result.output.boards as Array<Record<string, unknown>>)[0]!;
    expect(board).toEqual({
      boardId: "b-1",
      name: "B",
      description: "desc",
      boardKind: "public",
      state: "active",
      updatedAt: "2026-05-24T00:00:00Z",
      creatorId: "u",
      creatorName: "Alice",
    });
  });
});
