import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL `create_column` — Slice 3.MONDAY-4.
 *
 * Adds a column to a board. `column_type` is Monday's `ColumnType` enum
 * (text / status / dropdown / numbers / date / people / …) — passed as
 * a string; Monday validates the actual enum server-side (we do NOT
 * pin a restrictive enum because Monday has ~30 column types and new
 * ones ship regularly).
 *
 * `defaults` is Monday's `JSON` scalar (a JSON-encoded STRING) carrying
 * type-specific configuration (status labels, dropdown options, rating
 * scale, etc.). The handler passes it through verbatim — the friendly
 * per-type builders (statusLabels → labels object, etc.) are deferred
 * to the column-aware editor polish (D-MON7). This mirrors how
 * `create_item` accepts raw `columnValues` JSON.
 *
 * Mutation arguments:
 *   - `board_id: ID!` — required.
 *   - `title: String!` — required (the column title).
 *   - `column_type: ColumnType!` — required.
 *   - `defaults: JSON` — optional.
 *
 * Returned shape: `{ id, title, type }`.
 */

export interface ColumnsCreateInput {
  accessToken: string;
  boardId: string;
  title: string;
  columnType: string;
  /** JSON-encoded defaults string. Omit to create with type defaults. */
  defaultsJson?: string;
}

export interface ColumnsCreateOutput {
  id: string;
  title: string | null;
  type: string | null;
}

const MUTATION_WITH_DEFAULTS = `
  mutation($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON!) {
    create_column(board_id: $boardId, title: $title, column_type: $columnType, defaults: $defaults) {
      id
      title
      type
    }
  }
`;

const MUTATION_WITHOUT_DEFAULTS = `
  mutation($boardId: ID!, $title: String!, $columnType: ColumnType!) {
    create_column(board_id: $boardId, title: $title, column_type: $columnType) {
      id
      title
      type
    }
  }
`;

export async function columnsCreate(
  input: ColumnsCreateInput,
): Promise<ColumnsCreateOutput> {
  const hasDefaults =
    input.defaultsJson !== undefined && input.defaultsJson.length > 0;
  const variables: Record<string, unknown> = {
    boardId: input.boardId,
    title: input.title,
    columnType: input.columnType,
  };
  if (hasDefaults) variables.defaults = input.defaultsJson;
  const data = await mondayRequest<{ create_column: ColumnsCreateOutput }>({
    accessToken: input.accessToken,
    query: hasDefaults ? MUTATION_WITH_DEFAULTS : MUTATION_WITHOUT_DEFAULTS,
    variables,
  });
  return data.create_column;
}
