import { mondayRequest } from "./_request";
import type {
  MondayColumnValueShape,
  MondayItemFull,
} from "./itemsGet";

/**
 * Wrapper for Monday GraphQL `boards(ids: ...) { items_page(...) }` —
 * Slice 3.MONDAY-2.
 *
 * Lists items on a single board with cursor-style pagination.
 * `items_page.cursor` is Monday's opaque pagination token; when null,
 * there are no more pages.
 *
 * Pagination shape:
 *   - First call: pass `cursor: null` (handler can also omit). Monday
 *     returns up to `limit` items + a `cursor` for the next page.
 *   - Subsequent calls: pass the returned `cursor` to advance. The
 *     `limit` continues to apply; `items_page(cursor: ...)` doesn't
 *     accept `limit` together with `cursor` per Monday docs — the
 *     limit is bound by the original page query.
 *
 * Returned shape: `{ items, cursor, board.{id,name} }`.
 */

export interface ItemsListInput {
  accessToken: string;
  boardId: string;
  /** 1..100 — Monday caps at 500 but we cap at 100 per slice scope. */
  limit?: number;
  /** Opaque next-page token from a previous call. */
  cursor?: string | null;
}

export interface ItemsListOutput {
  items: MondayItemFull[];
  cursor: string | null;
  board: { id: string; name: string | null } | null;
}

const QUERY_FIRST_PAGE = `
  query($boardId: ID!, $limit: Int!) {
    boards(ids: [$boardId]) {
      id
      name
      items_page(limit: $limit) {
        cursor
        items {
          id
          name
          state
          board { id name }
          group { id title }
          column_values {
            id
            type
            text
            value
            column { id title }
          }
          created_at
          updated_at
          creator { id name }
        }
      }
    }
  }
`;

// Monday's docs say `next_items_page(cursor)` is the cursor-driven
// pagination entry point. The cursor is opaque and limit cannot be
// changed mid-pagination.
const QUERY_NEXT_PAGE = `
  query($cursor: String!) {
    next_items_page(cursor: $cursor) {
      cursor
      items {
        id
        name
        state
        board { id name }
        group { id title }
        column_values {
          id
          type
          text
          value
          column { id title }
        }
        created_at
        updated_at
        creator { id name }
      }
    }
  }
`;

interface FirstPageData {
  boards:
    | Array<{
        id: string;
        name: string | null;
        items_page: {
          cursor: string | null;
          items: MondayItemFull[];
        } | null;
      }>
    | null;
}

interface NextPageData {
  next_items_page: {
    cursor: string | null;
    items: MondayItemFull[];
  } | null;
}

export async function itemsList(
  input: ItemsListInput,
): Promise<ItemsListOutput> {
  if (input.cursor) {
    const data = await mondayRequest<NextPageData>({
      accessToken: input.accessToken,
      query: QUERY_NEXT_PAGE,
      variables: { cursor: input.cursor },
    });
    return {
      items: data.next_items_page?.items ?? [],
      cursor: data.next_items_page?.cursor ?? null,
      // next_items_page doesn't expose board metadata; callers pass
      // through the boardId from input but we keep board=null for the
      // wire-level wrapper.
      board: null,
    };
  }

  const limit = input.limit ?? 25;
  const data = await mondayRequest<FirstPageData>({
    accessToken: input.accessToken,
    query: QUERY_FIRST_PAGE,
    variables: { boardId: input.boardId, limit },
  });
  const board = data.boards && data.boards.length > 0 ? data.boards[0]! : null;
  return {
    items: board?.items_page?.items ?? [],
    cursor: board?.items_page?.cursor ?? null,
    board: board ? { id: board.id, name: board.name } : null,
  };
}

// Re-export the item shape so action handlers can import it from a
// single shared source rather than couple to `itemsGet.ts`.
export type { MondayItemFull, MondayColumnValueShape };
