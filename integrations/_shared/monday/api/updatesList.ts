import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `items(ids) { updates(limit) { ... } }` —
 * Slice 3.MONDAY-4.
 *
 * Pure read backing `list_updates`: list the updates (comments) on an
 * item. Update bodies are sensitive — the handler surfaces them because
 * reading them is the action's purpose, but never logs them.
 *
 * Returned shape: item identity + array of updates. Returns null when
 * the item doesn't exist (handler maps to NotFound).
 */

export interface UpdatesListInput {
  accessToken: string;
  itemId: string;
  /** 1..100. */
  limit: number;
}

export interface MondayUpdate {
  id: string;
  text_body: string | null;
  creator: { id: string; name: string | null } | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface UpdatesListOutput {
  itemId: string;
  itemName: string | null;
  updates: MondayUpdate[];
}

const QUERY = `
  query($itemId: [ID!], $limit: Int!) {
    items(ids: $itemId) {
      id
      name
      updates(limit: $limit) {
        id
        text_body
        creator { id name }
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
        updates: MondayUpdate[] | null;
      }>
    | null;
}

export async function updatesList(
  input: UpdatesListInput,
): Promise<UpdatesListOutput | null> {
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { itemId: [input.itemId], limit: input.limit },
  });
  const item = data.items && data.items.length > 0 ? data.items[0]! : null;
  if (!item) return null;
  return {
    itemId: item.id,
    itemName: item.name,
    updates: item.updates ?? [],
  };
}
