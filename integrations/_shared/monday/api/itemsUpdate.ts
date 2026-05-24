import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `change_multiple_column_values` —
 * Slice 3.MONDAY-2.
 *
 * V1's `update_item` action funnels through this mutation. Even when
 * the workflow author only updates one column, V1 builds a single-key
 * column-values JSON object and uses the `change_multiple_column_values`
 * mutation — Monday's `change_simple_column_value` mutation is intended
 * for simple text columns only and doesn't support every column type.
 * `change_multiple_column_values` is the universal write path.
 *
 * Mutation arguments:
 *   - `board_id: ID!` — required.
 *   - `item_id: ID!` — required.
 *   - `column_values: JSON!` — required. JSON-encoded STRING.
 *
 * Returned shape: `{ id, name }`.
 */

export interface ItemsUpdateInput {
  accessToken: string;
  boardId: string;
  itemId: string;
  /** JSON-encoded column-values map. */
  columnValuesJson: string;
}

export interface ItemsUpdateOutput {
  id: string;
  name: string | null;
}

const MUTATION = `
  mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
    change_multiple_column_values(
      board_id: $boardId
      item_id: $itemId
      column_values: $columnValues
    ) {
      id
      name
    }
  }
`;

export async function itemsUpdate(
  input: ItemsUpdateInput,
): Promise<ItemsUpdateOutput> {
  const data = await mondayRequest<{
    change_multiple_column_values: ItemsUpdateOutput;
  }>({
    accessToken: input.accessToken,
    query: MUTATION,
    variables: {
      boardId: input.boardId,
      itemId: input.itemId,
      columnValues: input.columnValuesJson,
    },
  });
  return data.change_multiple_column_values;
}
