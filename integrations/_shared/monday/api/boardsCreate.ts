import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `create_board` — Slice 3.MONDAY-4.
 *
 * Creates a new board. `board_kind` controls workspace-wide visibility
 * (`public` exposes the board to the entire workspace) — the handler
 * requires it explicitly (no silent default) per the no-hidden-high-
 * risk-defaults principle (V1 enforced the same via `requireExplicitField`).
 *
 * Mutation arguments:
 *   - `board_name: String!` — required.
 *   - `board_kind: BoardKind!` — required (`public` / `private` / `share`).
 *   - `description: String` — optional.
 *
 * Returned shape: `{ id, name, description, board_kind }`.
 */

export type MondayBoardKind = "public" | "private" | "share";

export interface BoardsCreateInput {
  accessToken: string;
  boardName: string;
  boardKind: MondayBoardKind;
  description?: string;
}

export interface BoardsCreateOutput {
  id: string;
  name: string | null;
  description: string | null;
  board_kind: string | null;
}

const MUTATION_WITH_DESCRIPTION = `
  mutation($boardName: String!, $boardKind: BoardKind!, $description: String!) {
    create_board(board_name: $boardName, board_kind: $boardKind, description: $description) {
      id
      name
      description
      board_kind
    }
  }
`;

const MUTATION_WITHOUT_DESCRIPTION = `
  mutation($boardName: String!, $boardKind: BoardKind!) {
    create_board(board_name: $boardName, board_kind: $boardKind) {
      id
      name
      description
      board_kind
    }
  }
`;

export async function boardsCreate(
  input: BoardsCreateInput,
): Promise<BoardsCreateOutput> {
  const hasDescription =
    input.description !== undefined && input.description.length > 0;
  const variables: Record<string, unknown> = {
    boardName: input.boardName,
    boardKind: input.boardKind,
  };
  if (hasDescription) variables.description = input.description;
  const data = await mondayRequest<{ create_board: BoardsCreateOutput }>({
    accessToken: input.accessToken,
    query: hasDescription
      ? MUTATION_WITH_DESCRIPTION
      : MUTATION_WITHOUT_DESCRIPTION,
    variables,
  });
  return data.create_board;
}
