import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `delete_item` — Slice 3.MONDAY-2.
 *
 * Monday's `delete_item` is a soft-delete — items move to a recycle
 * bin and can be restored from the UI. The mutation returns the
 * deleted item's `id` only; the handler discards the body and
 * synthesizes a structural-only output (no echoed names / columns)
 * per D-MON4.
 *
 * Mutation arguments:
 *   - `item_id: ID!` — required. Note: Monday's `delete_item` does
 *     NOT take `board_id` even though the V2 handler requires it from
 *     the user — handler validates the pair but the GraphQL call only
 *     needs the item id.
 *
 * Returned shape: `{ id }`.
 */

export interface ItemsDeleteInput {
  accessToken: string;
  itemId: string;
}

export interface ItemsDeleteOutput {
  id: string;
}

const MUTATION = `
  mutation($itemId: ID!) {
    delete_item(item_id: $itemId) {
      id
    }
  }
`;

export async function itemsDelete(
  input: ItemsDeleteInput,
): Promise<ItemsDeleteOutput> {
  const data = await mondayRequest<{ delete_item: ItemsDeleteOutput }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: { itemId: input.itemId },
  });
  return data.delete_item;
}
