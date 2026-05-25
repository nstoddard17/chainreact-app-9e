/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBoardsDuplicate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/boardsDuplicate", () => ({
  boardsDuplicate: (...args: unknown[]) => mockBoardsDuplicate(...args),
}));

import { duplicateBoard } from "@/integrations/monday/actions/boards/duplicateBoard";
import { DuplicateBoardConfigSchema } from "@/integrations/monday/actions/boards/duplicateBoard.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBoardsDuplicate.mockReset();
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

describe("duplicate_board schema", () => {
  it("defaults duplicateType to structure-only (safe, least-data-copying)", () => {
    const parsed = DuplicateBoardConfigSchema.parse({ boardId: "b" });
    expect(parsed.duplicateType).toBe("duplicate_board_with_structure");
  });

  it("accepts the three DuplicateBoardType enum values", () => {
    for (const t of [
      "duplicate_board_with_structure",
      "duplicate_board_with_pulses",
      "duplicate_board_with_pulses_and_updates",
    ]) {
      expect(() =>
        DuplicateBoardConfigSchema.parse({ boardId: "b", duplicateType: t }),
      ).not.toThrow();
    }
    expect(() =>
      DuplicateBoardConfigSchema.parse({ boardId: "b", duplicateType: "all" }),
    ).toThrow();
  });
});

describe("duplicate_board handler", () => {
  it("threads duplicateType + newBoardName to the wrapper", async () => {
    mockBoardsDuplicate.mockResolvedValueOnce({
      id: "new-b",
      name: "Copy",
      description: null,
      board_kind: "public",
    });
    await duplicateBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        duplicateType: "duplicate_board_with_pulses",
        newBoardName: "Copy",
      },
      triggerEvent: trigger(),
    });
    expect(mockBoardsDuplicate.mock.calls[0]![0]).toMatchObject({
      boardId: "b",
      duplicateType: "duplicate_board_with_pulses",
      boardName: "Copy",
    });
  });

  it("output: newBoardId / newBoardName / originalBoardId / description / boardKind / createdAt", async () => {
    mockBoardsDuplicate.mockResolvedValueOnce({
      id: "new-b",
      name: "Copy of X",
      description: "d",
      board_kind: "private",
    });
    const result = await duplicateBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "orig",
        duplicateType: "duplicate_board_with_structure",
      },
      triggerEvent: trigger(),
    });
    expect(result.output.newBoardId).toBe("new-b");
    expect(result.output.originalBoardId).toBe("orig");
    expect(result.output.boardKind).toBe("private");
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockBoardsDuplicate.mockResolvedValueOnce({
      id: "new-b",
      name: null,
      description: null,
      board_kind: null,
    });
    await duplicateBoard({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        boardId: "b",
        duplicateType: "duplicate_board_with_structure",
      },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
