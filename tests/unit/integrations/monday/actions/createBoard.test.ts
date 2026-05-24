/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBoardsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/boardsCreate", () => ({
  boardsCreate: (...args: unknown[]) => mockBoardsCreate(...args),
}));

import { createBoard } from "@/integrations/monday/actions/createBoard";
import { CreateBoardConfigSchema } from "@/integrations/monday/actions/createBoard.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBoardsCreate.mockReset();
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

describe("create_board schema — boardKind required (no hidden default)", () => {
  it("requires boardName + boardKind", () => {
    expect(() =>
      CreateBoardConfigSchema.parse({ boardName: "B", boardKind: "public" }),
    ).not.toThrow();
    // boardKind missing → throws (no silent default; visibility must be explicit).
    expect(() => CreateBoardConfigSchema.parse({ boardName: "B" })).toThrow();
    expect(() =>
      CreateBoardConfigSchema.parse({ boardKind: "public" }),
    ).toThrow();
  });

  it("only accepts public / private / share for boardKind", () => {
    for (const kind of ["public", "private", "share"]) {
      expect(() =>
        CreateBoardConfigSchema.parse({ boardName: "B", boardKind: kind }),
      ).not.toThrow();
    }
    expect(() =>
      CreateBoardConfigSchema.parse({ boardName: "B", boardKind: "secret" }),
    ).toThrow();
  });
});

describe("create_board handler", () => {
  it("threads boardKind to the wrapper", async () => {
    mockBoardsCreate.mockResolvedValueOnce({
      id: "b-1",
      name: "B",
      description: null,
      board_kind: "private",
    });
    await createBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardName: "B", boardKind: "private" },
      triggerEvent: trigger(),
    });
    expect(mockBoardsCreate.mock.calls[0]![0]).toMatchObject({
      boardName: "B",
      boardKind: "private",
    });
  });

  it("output: boardId / boardName / description / boardKind / createdAt", async () => {
    mockBoardsCreate.mockResolvedValueOnce({
      id: "b-1",
      name: "Returned",
      description: "desc",
      board_kind: "public",
    });
    const result = await createBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardName: "B", boardKind: "public", description: "desc" },
      triggerEvent: trigger(),
    });
    expect(result.output.boardId).toBe("b-1");
    expect(result.output.boardName).toBe("Returned");
    expect(result.output.description).toBe("desc");
    expect(result.output.boardKind).toBe("public");
    expect(typeof result.output.createdAt).toBe("string");
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockBoardsCreate.mockResolvedValueOnce({
      id: "b",
      name: "B",
      description: null,
      board_kind: "public",
    });
    await createBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardName: "B", boardKind: "public" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
