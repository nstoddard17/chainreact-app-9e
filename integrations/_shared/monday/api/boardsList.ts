import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `boards(...)` — Slice 3.MONDAY-2.
 *
 * Lists boards visible to the authenticated user. Pagination is
 * page-based via `page` + `limit` args (Monday's GraphQL `boards`
 * field uses page-based, NOT cursor-based pagination).
 *
 * Returned shape: array of boards with metadata. Caller adds the
 * `count` / `hasMore` / `nextCursor` synthesizing.
 */

export interface BoardsListInput {
  accessToken: string;
  /** 1..100 — Monday's max is 200 but we cap at 100 for v1. */
  limit?: number;
  /** 1-based page index. Defaults to 1 (no cursor on first call). */
  page?: number;
}

export interface MondayBoardSummary {
  id: string;
  name: string | null;
  description: string | null;
  board_kind: string | null;
  state: string | null;
  updated_at: string | null;
  creator: { id: string; name: string | null } | null;
}

export interface BoardsListOutput {
  boards: MondayBoardSummary[];
}

const QUERY = `
  query($limit: Int!, $page: Int!) {
    boards(limit: $limit, page: $page) {
      id
      name
      description
      board_kind
      state
      updated_at
      creator { id name }
    }
  }
`;

export async function boardsList(
  input: BoardsListInput,
): Promise<BoardsListOutput> {
  const limit = input.limit ?? 25;
  const page = input.page ?? 1;
  const data = await mondayRequest<{ boards: MondayBoardSummary[] | null }>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { limit, page },
  });
  return { boards: data.boards ?? [] };
}
