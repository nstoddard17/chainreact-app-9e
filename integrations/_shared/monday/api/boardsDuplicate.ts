import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `duplicate_board` — Slice 3.MONDAY-4.
 *
 * Clones a board. `duplicate_type` controls how much is copied:
 *   - `duplicate_board_with_structure` — columns/groups only, NO items
 *     (the least-data-copying option; handler default).
 *   - `duplicate_board_with_pulses` — structure + items, no updates.
 *   - `duplicate_board_with_pulses_and_updates` — everything.
 *
 * `duplicate_board` returns a `BoardDuplication` wrapper with a nested
 * `board` field — the wrapper unwraps it.
 *
 * Mutation arguments:
 *   - `board_id: ID!` — required (source board).
 *   - `duplicate_type: DuplicateBoardType!` — required (handler supplies
 *     the structure-only default when the author omits it).
 *   - `board_name: String` — optional (name for the new board).
 *
 * Returned shape: `{ id, name, description, board_kind }` (the NEW board).
 */

export type MondayDuplicateBoardType =
  | "duplicate_board_with_structure"
  | "duplicate_board_with_pulses"
  | "duplicate_board_with_pulses_and_updates";

export interface BoardsDuplicateInput {
  accessToken: string;
  boardId: string;
  duplicateType: MondayDuplicateBoardType;
  boardName?: string;
}

export interface BoardsDuplicateOutput {
  id: string;
  name: string | null;
  description: string | null;
  board_kind: string | null;
}

const MUTATION_WITH_NAME = `
  mutation($boardId: ID!, $duplicateType: DuplicateBoardType!, $boardName: String!) {
    duplicate_board(board_id: $boardId, duplicate_type: $duplicateType, board_name: $boardName) {
      board {
        id
        name
        description
        board_kind
      }
    }
  }
`;

const MUTATION_WITHOUT_NAME = `
  mutation($boardId: ID!, $duplicateType: DuplicateBoardType!) {
    duplicate_board(board_id: $boardId, duplicate_type: $duplicateType) {
      board {
        id
        name
        description
        board_kind
      }
    }
  }
`;

export async function boardsDuplicate(
  input: BoardsDuplicateInput,
): Promise<BoardsDuplicateOutput> {
  const hasName = input.boardName !== undefined && input.boardName.length > 0;
  const variables: Record<string, unknown> = {
    boardId: input.boardId,
    duplicateType: input.duplicateType,
  };
  if (hasName) variables.boardName = input.boardName;
  const data = await mondayRequest<{
    duplicate_board: { board: BoardsDuplicateOutput | null } | null;
  }>({
    accessToken: input.accessToken,
    query: hasName ? MUTATION_WITH_NAME : MUTATION_WITHOUT_NAME,
    variables,
  });
  const board = data.duplicate_board?.board ?? null;
  if (!board) {
    // Surfaced to the handler; mondayRequest already maps GraphQL errors,
    // so a null board here means a 200 with an unexpectedly empty
    // duplication payload.
    throw new Error("Monday duplicate_board returned no board.");
  }
  return board;
}
