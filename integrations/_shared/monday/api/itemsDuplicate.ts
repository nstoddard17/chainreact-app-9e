import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `duplicate_item` — Slice 3.MONDAY-4.
 *
 * Clones an item within its board. `with_updates` controls whether the
 * item's updates (comments) are copied into the clone.
 *
 * Mutation arguments:
 *   - `board_id: ID!` — required.
 *   - `item_id: ID!` — required (the source item).
 *   - `with_updates: Boolean` — optional. Defaults to false on the
 *     handler side.
 *
 * Returned shape: `{ id, name, board.id, group.id, created_at }` (the
 * NEW item).
 */

export interface ItemsDuplicateInput {
  accessToken: string;
  boardId: string;
  itemId: string;
  withUpdates: boolean;
}

export interface ItemsDuplicateOutput {
  id: string;
  name: string | null;
  board: { id: string } | null;
  group: { id: string } | null;
  created_at: string | null;
}

const MUTATION = `
  mutation($boardId: ID!, $itemId: ID!, $withUpdates: Boolean) {
    duplicate_item(board_id: $boardId, item_id: $itemId, with_updates: $withUpdates) {
      id
      name
      board { id }
      group { id }
      created_at
    }
  }
`;

export async function itemsDuplicate(
  input: ItemsDuplicateInput,
): Promise<ItemsDuplicateOutput> {
  const data = await mondayRequest<{ duplicate_item: ItemsDuplicateOutput }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: {
      boardId: input.boardId,
      itemId: input.itemId,
      withUpdates: input.withUpdates,
    },
  });
  return data.duplicate_item;
}
