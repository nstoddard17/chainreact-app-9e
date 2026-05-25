import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `create_item` — Slice 3.MONDAY-2.
 *
 * Mutation arguments:
 *   - `board_id: ID!` — required.
 *   - `group_id: String!` — required. Monday's `create_item` accepts
 *     group_id as `String` (NOT `ID`); V1's mutation uses the same
 *     wire shape.
 *   - `item_name: String!` — required.
 *   - `column_values: JSON` — optional. Monday expects a JSON-encoded
 *     STRING (the GraphQL `JSON` scalar is a stringified object).
 *
 * Returned shape: `{ id, name, board.id, group.id, created_at }`.
 */

export interface ItemsCreateInput {
  accessToken: string;
  boardId: string;
  groupId: string;
  itemName: string;
  /**
   * JSON-encoded column-values map. Pass `undefined` to omit the
   * column_values arg from the mutation entirely (cleaner GraphQL — no
   * `null` arg). Callers stringify their object before calling.
   */
  columnValuesJson?: string;
}

export interface ItemsCreateOutput {
  id: string;
  name: string;
  board: { id: string } | null;
  group: { id: string } | null;
  created_at: string | null;
}

const MUTATION_WITH_COLUMNS = `
  mutation($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
    create_item(
      board_id: $boardId
      group_id: $groupId
      item_name: $itemName
      column_values: $columnValues
    ) {
      id
      name
      board { id }
      group { id }
      created_at
    }
  }
`;

const MUTATION_WITHOUT_COLUMNS = `
  mutation($boardId: ID!, $groupId: String!, $itemName: String!) {
    create_item(
      board_id: $boardId
      group_id: $groupId
      item_name: $itemName
    ) {
      id
      name
      board { id }
      group { id }
      created_at
    }
  }
`;

export async function itemsCreate(
  input: ItemsCreateInput,
): Promise<ItemsCreateOutput> {
  const hasColumns = input.columnValuesJson !== undefined;
  const variables: Record<string, unknown> = {
    boardId: input.boardId,
    groupId: input.groupId,
    itemName: input.itemName,
  };
  if (hasColumns) {
    variables.columnValues = input.columnValuesJson;
  }
  const data = await mondayRequest<{ create_item: ItemsCreateOutput }>({
    accessToken: input.accessToken,
    query: hasColumns ? MUTATION_WITH_COLUMNS : MUTATION_WITHOUT_COLUMNS,
    variables,
  });
  return data.create_item;
}
