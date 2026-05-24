import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `boards(ids: $boardId)` (single board with
 * columns + groups + creator) — Slice 3.MONDAY-4.
 *
 * Pure read backing the `get_board` action. Distinct from MONDAY-3's
 * `boardsList` (paginated list, summary fields) — this fetches one board
 * by id with its full nested column + group structure.
 *
 * `created_at` is NOT available on the Board type in API 2024-01 (V1
 * comment) — only `updated_at` is selected.
 *
 * Returned shape: single board or null.
 */

export interface BoardsGetInput {
  accessToken: string;
  boardId: string;
}

export interface MondayBoardColumn {
  id: string;
  title: string | null;
  type: string | null;
}

export interface MondayBoardGroup {
  id: string;
  title: string | null;
  color: string | null;
}

export interface MondayBoardFull {
  id: string;
  name: string | null;
  description: string | null;
  board_kind: string | null;
  state: string | null;
  updated_at: string | null;
  creator: { id: string; name: string | null } | null;
  columns: MondayBoardColumn[];
  groups: MondayBoardGroup[];
}

const QUERY = `
  query($boardId: [ID!]) {
    boards(ids: $boardId) {
      id
      name
      description
      board_kind
      state
      updated_at
      creator { id name }
      columns { id title type }
      groups { id title color }
    }
  }
`;

export async function boardsGet(
  input: BoardsGetInput,
): Promise<MondayBoardFull | null> {
  const data = await mondayRequest<{ boards: MondayBoardFull[] | null }>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { boardId: [input.boardId] },
  });
  return data.boards && data.boards.length > 0 ? data.boards[0]! : null;
}
