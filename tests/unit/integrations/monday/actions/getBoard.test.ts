/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBoardsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/boardsGet", () => ({
  boardsGet: (...args: unknown[]) => mockBoardsGet(...args),
}));

import { getBoard } from "@/integrations/monday/actions/boards/getBoard";
import { GetBoardConfigSchema } from "@/integrations/monday/actions/boards/getBoard.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBoardsGet.mockReset();
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

describe("get_board schema", () => {
  it("requires boardId", () => {
    expect(() => GetBoardConfigSchema.parse({ boardId: "b" })).not.toThrow();
    expect(() => GetBoardConfigSchema.parse({})).toThrow();
  });
});

describe("get_board handler — pure read", () => {
  it("normalizes board with columns + groups + counts", async () => {
    mockBoardsGet.mockResolvedValueOnce({
      id: "b-1",
      name: "Board",
      description: "d",
      board_kind: "public",
      state: "active",
      updated_at: "2026-05-24T00:00:00Z",
      creator: { id: "u-1", name: "Alice" },
      columns: [{ id: "c1", title: "Status", type: "status" }],
      groups: [{ id: "g1", title: "Backlog", color: "#fff" }],
    });
    const result = await getBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.boardId).toBe("b-1");
    expect(result.output.columnCount).toBe(1);
    expect(result.output.groupCount).toBe(1);
    expect(
      (result.output.columns as Array<{ columnId: string }>)[0]!.columnId,
    ).toBe("c1");
    expect(
      (result.output.groups as Array<{ groupId: string }>)[0]!.groupId,
    ).toBe("g1");
  });

  it("throws NotFoundError when board missing", async () => {
    mockBoardsGet.mockResolvedValueOnce(null);
    await expect(
      getBoard({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { boardId: "gone" },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockBoardsGet.mockResolvedValueOnce({
      id: "b",
      name: null,
      description: null,
      board_kind: null,
      state: null,
      updated_at: null,
      creator: null,
      columns: [],
      groups: [],
    });
    await getBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
