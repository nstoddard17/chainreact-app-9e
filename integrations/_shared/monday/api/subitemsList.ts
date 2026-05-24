import { mondayRequest } from "./_request";
import type { MondayColumnValueShape } from "./itemsGet";

/**
 * Wrapper for Monday GraphQL `items(ids) { subitems { ... } }` —
 * Slice 3.MONDAY-4.
 *
 * Pure read backing `list_subitems`: list the subitems of a parent item.
 *
 * Returned shape: parent identity + array of subitems. Returns null
 * when the parent item doesn't exist (handler maps to NotFound).
 */

export interface SubitemsListInput {
  accessToken: string;
  parentItemId: string;
}

export interface MondaySubitem {
  id: string;
  name: string | null;
  state: string | null;
  board: { id: string; name: string | null } | null;
  column_values: MondayColumnValueShape[];
  created_at: string | null;
  updated_at: string | null;
}

export interface SubitemsListOutput {
  parentItemId: string;
  parentItemName: string | null;
  subitems: MondaySubitem[];
}

const QUERY = `
  query($itemId: [ID!]) {
    items(ids: $itemId) {
      id
      name
      subitems {
        id
        name
        state
        board { id name }
        column_values {
          id
          type
          text
          value
          column { id title }
        }
        created_at
        updated_at
      }
    }
  }
`;

interface QueryData {
  items:
    | Array<{
        id: string;
        name: string | null;
        subitems: MondaySubitem[] | null;
      }>
    | null;
}

export async function subitemsList(
  input: SubitemsListInput,
): Promise<SubitemsListOutput | null> {
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { itemId: [input.parentItemId] },
  });
  const parent = data.items && data.items.length > 0 ? data.items[0]! : null;
  if (!parent) return null;
  return {
    parentItemId: parent.id,
    parentItemName: parent.name,
    subitems: parent.subitems ?? [],
  };
}
