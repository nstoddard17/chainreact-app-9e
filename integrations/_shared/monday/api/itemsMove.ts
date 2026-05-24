import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `move_item_to_group` — Slice 3.MONDAY-2.
 *
 * Monday's mutation accepts `group_id: String!` (NOT `ID`). The
 * previous group is NOT exposed in the response — Monday's API
 * doesn't return it. Callers wanting "from / to" telemetry must
 * fetch the item before calling and stash the source group id.
 *
 * Mutation arguments:
 *   - `item_id: ID!`
 *   - `group_id: String!`
 *
 * Returned shape: `{ id, name, group.id, group.title }`.
 */

export interface ItemsMoveInput {
  accessToken: string;
  itemId: string;
  targetGroupId: string;
}

export interface ItemsMoveOutput {
  id: string;
  name: string | null;
  group: { id: string; title: string | null } | null;
}

const MUTATION = `
  mutation($itemId: ID!, $groupId: String!) {
    move_item_to_group(item_id: $itemId, group_id: $groupId) {
      id
      name
      group {
        id
        title
      }
    }
  }
`;

export async function itemsMove(
  input: ItemsMoveInput,
): Promise<ItemsMoveOutput> {
  const data = await mondayRequest<{ move_item_to_group: ItemsMoveOutput }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: { itemId: input.itemId, groupId: input.targetGroupId },
  });
  return data.move_item_to_group;
}
