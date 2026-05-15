import { notionRequest } from "./_request";

/**
 * Notion Databases API wrapper — Slice 9 + Notion 2.1 Commit 4.
 *
 * Two endpoints:
 *   - `databasesQuery` — POST /v1/databases/{id}/query (Slice 9)
 *   - `databasesCreate` — POST /v1/databases (Notion 2.1 Commit 4)
 *
 * Used by `actions/queryDatabase.ts` and `actions/createDatabase.ts`.
 *
 * Forward-passes `filter` and `sorts` verbatim to Notion's API for
 * query. V1's `advancedQuery.ts` builder is intentionally skipped —
 * V2 trusts the user's filter object and lets Notion validate it.
 * Same final wire-format, no V2 builder; less to maintain.
 */

/**
 * A single database row — Notion calls these "pages" too. Same shape as
 * NotionPage from `pages.ts` but exposed here under the database-row
 * intuition for caller readability.
 */
export interface DatabaseRow {
  object: "page";
  id: string;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  url?: string;
  parent?: { database_id: string };
  properties?: Record<string, unknown>;
}

export interface DatabasesQueryResponse {
  object: "list";
  results: DatabaseRow[];
  has_more: boolean;
  next_cursor: string | null;
  type?: "page";
}

export interface DatabasesQueryInput {
  accessToken: string;
  databaseId: string;
  /** Notion filter object — forward-passed verbatim. */
  filter?: Record<string, unknown>;
  /** Notion sorts array — forward-passed verbatim. */
  sorts?: ReadonlyArray<Record<string, unknown>>;
  /** Default 100 (Notion's hard ceiling); enforced at the schema layer. */
  pageSize?: number;
  startCursor?: string;
}

export async function databasesQuery(
  input: DatabasesQueryInput,
): Promise<DatabasesQueryResponse> {
  const body: Record<string, unknown> = {};
  if (input.filter !== undefined) body.filter = input.filter;
  if (input.sorts !== undefined) body.sorts = input.sorts;
  if (input.pageSize !== undefined) body.page_size = input.pageSize;
  if (input.startCursor !== undefined) body.start_cursor = input.startCursor;

  return notionRequest<DatabasesQueryResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v1/databases/${encodeURIComponent(input.databaseId)}/query`,
    body,
    resourceForNotFound: `database ${input.databaseId}`,
  });
}

// ─── databasesCreate ─────────────────────────────────────────────────────

/**
 * Notion's database response shape. Subset — only fields V2 reads.
 *
 * Notion returns the full database object on create. We expose stable
 * identifiers + the resolved title + the properties schema + parent
 * info; raw passthrough of every database field is NOT done.
 */
export interface NotionDatabase {
  object: "database";
  id: string;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  url?: string;
  title?: ReadonlyArray<{
    plain_text?: string;
    text?: { content?: string; link?: { url: string } | null };
  }>;
  description?: ReadonlyArray<{
    plain_text?: string;
    text?: { content?: string; link?: { url: string } | null };
  }>;
  is_inline?: boolean;
  parent?: {
    type?: "page_id" | "workspace" | "block_id";
    page_id?: string;
    block_id?: string;
    workspace?: boolean;
  };
  /**
   * The database property *schema* — keyed by property name; each value
   * is `{ id, name, type, <type-specific config> }`. NOT property
   * values for a database row (those live on page objects).
   */
  properties?: Record<string, unknown>;
}

export interface DatabasesCreateInput {
  accessToken: string;
  /** Page id under which the database is created. */
  parentPageId: string;
  /** Plain-text title; wrapper synthesizes the rich_text array. */
  title: string;
  /** Optional plain-text description; wrapper synthesizes rich_text. */
  description?: string;
  /**
   * Notion's `is_inline` flag — when true, the database renders inline
   * inside the parent page. When omitted, Notion's default (false) is
   * used. Q11 — undefined is omitted from the request body.
   */
  isInline?: boolean;
  /**
   * Database property *schema* keyed by property name. Each entry is
   * `{ type: <SupportedPropertyType> }`. Notion's API requires exactly
   * one property of type "title"; the action schema (createDatabase.schema.ts)
   * enforces that, so the wrapper assumes a valid input shape.
   *
   * V2 supports the 9 SupportedPropertyType members from
   * `_shared/notion/properties.ts`. Option-set configuration (select /
   * status options) is NOT supported in this batch — workflow authors
   * configure options manually in Notion's UI after creation, or wait
   * for a future expanded action.
   */
  properties: Record<string, { type: string }>;
}

export async function databasesCreate(
  input: DatabasesCreateInput,
): Promise<NotionDatabase> {
  const body: Record<string, unknown> = {
    parent: { type: "page_id", page_id: input.parentPageId },
    title: [{ type: "text", text: { content: input.title } }],
    properties: serializeDatabasePropertySchema(input.properties),
  };
  if (input.description !== undefined) {
    body.description = [
      { type: "text", text: { content: input.description } },
    ];
  }
  if (input.isInline !== undefined) {
    body.is_inline = input.isInline;
  }

  return notionRequest<NotionDatabase>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/databases",
    body,
    resourceForNotFound: `page ${input.parentPageId}`,
  });
}

/**
 * Convert V2's `{ <name>: { type } }` property descriptor into Notion's
 * wire-format property-schema map: `{ <name>: { <type>: {} } }`.
 * Notion expects an empty config object for property types that have
 * no per-column configuration (which is the case for all 9
 * SupportedPropertyType members in Batch 1).
 */
function serializeDatabasePropertySchema(
  properties: Record<string, { type: string }>,
): Record<string, Record<string, Record<string, never>>> {
  const out: Record<string, Record<string, Record<string, never>>> = {};
  for (const [name, descriptor] of Object.entries(properties)) {
    out[name] = { [descriptor.type]: {} };
  }
  return out;
}
