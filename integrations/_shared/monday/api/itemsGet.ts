import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `items(ids: [...])` — Slice 3.MONDAY-2.
 *
 * Reads a single item by id. The GraphQL field accepts an array of
 * ids (we always send a single-element array). Includes board, group,
 * column_values, creator, timestamps.
 *
 * `column_values` does NOT have a `title` field in the Monday GraphQL
 * 2024-01 API — the column title comes from the nested `column.title`
 * field that V1 explicitly fetches. The handler normalizes this in
 * the output mapping.
 *
 * Returned shape: array of items (caller picks `[0]`).
 */

export interface ItemsGetInput {
  accessToken: string;
  itemId: string;
}

export interface MondayColumnValueShape {
  id: string;
  type: string | null;
  text: string | null;
  value: string | null;
  column: { id: string; title: string | null } | null;
}

export interface MondayItemFull {
  id: string;
  name: string | null;
  state: string | null;
  board: { id: string; name: string | null } | null;
  group: { id: string; title: string | null } | null;
  column_values: MondayColumnValueShape[];
  created_at: string | null;
  updated_at: string | null;
  creator: { id: string; name: string | null } | null;
}

const QUERY = `
  query($itemId: [ID!]) {
    items(ids: $itemId) {
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
`;

export async function itemsGet(
  input: ItemsGetInput,
): Promise<MondayItemFull | null> {
  const data = await mondayRequest<{ items: MondayItemFull[] }>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { itemId: [input.itemId] },
  });
  return data.items && data.items.length > 0 ? data.items[0]! : null;
}
