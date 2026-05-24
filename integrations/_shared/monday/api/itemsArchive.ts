import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `archive_item` — Slice 3.MONDAY-4.
 *
 * Archive is RECOVERABLE — archived items move to the board's archive
 * and can be restored from Monday's UI. Less destructive than
 * `delete_item` (which is a soft-delete to the recycle bin). The
 * handler still returns a structural-only output (no echoed name /
 * column values) consistent with the delete trio.
 *
 * Mutation arguments:
 *   - `item_id: ID!` — required.
 *
 * Returned shape: `{ id }`.
 */

export interface ItemsArchiveInput {
  accessToken: string;
  itemId: string;
}

export interface ItemsArchiveOutput {
  id: string;
}

const MUTATION = `
  mutation($itemId: ID!) {
    archive_item(item_id: $itemId) {
      id
    }
  }
`;

export async function itemsArchive(
  input: ItemsArchiveInput,
): Promise<ItemsArchiveOutput> {
  const data = await mondayRequest<{ archive_item: ItemsArchiveOutput }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: { itemId: input.itemId },
  });
  return data.archive_item;
}
