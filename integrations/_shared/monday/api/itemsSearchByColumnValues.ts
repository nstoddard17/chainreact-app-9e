import { mondayRequest } from "./_request";
import type { MondayItemFull } from "./itemsGet";

/**
 * Wrapper for Monday GraphQL `items_page_by_column_values` —
 * Slice 3.MONDAY-4.
 *
 * Backs the column-targeted path of the `search_items` action: find
 * items on a board whose `columnId` matches `columnValue`. When the
 * author searches by item NAME instead (no columnId), the handler
 * routes to the MONDAY-2 `itemsList` wrapper + client-side name filter
 * (matches V1).
 *
 * Query arguments:
 *   - `board_id: ID!`
 *   - `columns: [{column_id, column_values: [value]}]`
 *   - `limit: Int!`
 *
 * Returned shape: `{ items, cursor }`.
 */

export interface ItemsSearchByColumnValuesInput {
  accessToken: string;
  boardId: string;
  columnId: string;
  columnValue: string;
  /** 1..100. */
  limit: number;
}

export interface ItemsSearchByColumnValuesOutput {
  items: MondayItemFull[];
  cursor: string | null;
}

const QUERY = `
  query($boardId: ID!, $columnId: String!, $columnValue: String!, $limit: Int!) {
    items_page_by_column_values(
      board_id: $boardId
      columns: [{ column_id: $columnId, column_values: [$columnValue] }]
      limit: $limit
    ) {
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

interface QueryData {
  items_page_by_column_values: {
    cursor: string | null;
    items: MondayItemFull[] | null;
  } | null;
}

export async function itemsSearchByColumnValues(
  input: ItemsSearchByColumnValuesInput,
): Promise<ItemsSearchByColumnValuesOutput> {
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: {
      boardId: input.boardId,
      columnId: input.columnId,
      columnValue: input.columnValue,
      limit: input.limit,
    },
  });
  return {
    items: data.items_page_by_column_values?.items ?? [],
    cursor: data.items_page_by_column_values?.cursor ?? null,
  };
}
