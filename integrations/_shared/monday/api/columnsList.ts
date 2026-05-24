import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL
 * `boards(ids: $boardId) { columns { id title type } }` —
 * Slice 3.MONDAY-3 (options resolver layer).
 *
 * Reads the columns of a single board. Used by the `monday:columns`
 * AND the `monday:file_columns` options resolvers. The `file_columns`
 * resolver filters the same payload to `type === "file"` and prepends
 * the V1-preserved virtual `__item_files__` sentinel.
 *
 * Returned shape: array of `{id, title, type}`. `type` is Monday's
 * column type string (e.g. `"text"`, `"status"`, `"file"`, `"person"`).
 * Empty array when the board has no columns OR when the board id is
 * invalid (Monday returns an empty `boards` array — caller handles
 * the cascade).
 */

export interface ColumnsListInput {
  accessToken: string;
  boardId: string;
}

export interface MondayColumnSummary {
  id: string;
  title: string | null;
  type: string | null;
}

export interface ColumnsListOutput {
  columns: MondayColumnSummary[];
  boardFound: boolean;
}

const QUERY = `
  query($boardId: ID!) {
    boards(ids: [$boardId]) {
      id
      columns {
        id
        title
        type
      }
    }
  }
`;

interface QueryData {
  boards:
    | Array<{
        id: string;
        columns: MondayColumnSummary[] | null;
      }>
    | null;
}

export async function columnsList(
  input: ColumnsListInput,
): Promise<ColumnsListOutput> {
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { boardId: input.boardId },
  });
  const board = data.boards && data.boards.length > 0 ? data.boards[0]! : null;
  return {
    columns: board?.columns ?? [],
    boardFound: board !== null,
  };
}
