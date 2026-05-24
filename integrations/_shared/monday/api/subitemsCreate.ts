import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `create_subitem` — Slice 3.MONDAY-2.
 *
 * Subitems live on Monday's hidden subitems board (auto-created per
 * parent board). Callers do NOT pass that board id — Monday's API
 * resolves it from the `parent_item_id` arg. D-MON6 explicitly
 * accepts this design (subitem boardId is intentionally opaque to
 * workflow authors).
 *
 * Mutation arguments:
 *   - `parent_item_id: ID!` — required.
 *   - `item_name: String!` — required (the new subitem's name).
 *   - `column_values: JSON` — optional. JSON-encoded STRING.
 *
 * Returned shape: `{ id, name, board.id, created_at }`. The `board.id`
 * is the resolved subitems-board id (informational; handlers may
 * surface it or hide it).
 */

export interface SubitemsCreateInput {
  accessToken: string;
  parentItemId: string;
  subitemName: string;
  columnValuesJson?: string;
}

export interface SubitemsCreateOutput {
  id: string;
  name: string;
  board: { id: string } | null;
  created_at: string | null;
}

const MUTATION_WITH_COLUMNS = `
  mutation($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
    create_subitem(
      parent_item_id: $parentItemId
      item_name: $itemName
      column_values: $columnValues
    ) {
      id
      name
      board { id }
      created_at
    }
  }
`;

const MUTATION_WITHOUT_COLUMNS = `
  mutation($parentItemId: ID!, $itemName: String!) {
    create_subitem(
      parent_item_id: $parentItemId
      item_name: $itemName
    ) {
      id
      name
      board { id }
      created_at
    }
  }
`;

export async function subitemsCreate(
  input: SubitemsCreateInput,
): Promise<SubitemsCreateOutput> {
  const hasColumns = input.columnValuesJson !== undefined;
  const variables: Record<string, unknown> = {
    parentItemId: input.parentItemId,
    itemName: input.subitemName,
  };
  if (hasColumns) variables.columnValues = input.columnValuesJson;
  const data = await mondayRequest<{ create_subitem: SubitemsCreateOutput }>({
    accessToken: input.accessToken,
    query: hasColumns ? MUTATION_WITH_COLUMNS : MUTATION_WITHOUT_COLUMNS,
    variables,
  });
  return data.create_subitem;
}
