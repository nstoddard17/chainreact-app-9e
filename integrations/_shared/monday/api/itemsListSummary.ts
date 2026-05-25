import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL
 * `boards(ids: $boardId) { items_page(limit: $limit) { items { id name } cursor } }`
 * — Slice 3.MONDAY-3 (options resolver layer).
 *
 * Reads a single page of item id/name pairs for the `monday:items`
 * options resolver. Distinct from MONDAY-2's
 * [`itemsList`](./itemsList.ts) which fetches the FULL item shape
 * (column_values + creator + timestamps) for the `list_items` action
 * — pickers only need `{id, name}` and the heavier query would burn
 * GraphQL complexity budget for no UX benefit.
 *
 * Returned shape: array of `{id, name}`, plus the next-page cursor
 * (null when no more pages). `boardFound` distinguishes "board exists
 * but empty" from "board id invalid / no access" for cascade fallback.
 */

export interface ItemsListSummaryInput {
  accessToken: string;
  boardId: string;
  /** 1..100. Defaults to 100 (resolver-default — pickers show as
   * many as fit in a single fetch). */
  limit?: number;
}

export interface MondayItemSummary {
  id: string;
  name: string | null;
}

export interface ItemsListSummaryOutput {
  items: MondayItemSummary[];
  cursor: string | null;
  boardFound: boolean;
}

const QUERY = `
  query($boardId: ID!, $limit: Int!) {
    boards(ids: [$boardId]) {
      id
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
        }
      }
    }
  }
`;

interface QueryData {
  boards:
    | Array<{
        id: string;
        items_page: {
          cursor: string | null;
          items: MondayItemSummary[] | null;
        } | null;
      }>
    | null;
}

export async function itemsListSummary(
  input: ItemsListSummaryInput,
): Promise<ItemsListSummaryOutput> {
  const limit = input.limit ?? 100;
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { boardId: input.boardId, limit },
  });
  const board = data.boards && data.boards.length > 0 ? data.boards[0]! : null;
  return {
    items: board?.items_page?.items ?? [],
    cursor: board?.items_page?.cursor ?? null,
    boardFound: board !== null,
  };
}
