import { notionRequest } from "./_request";

/**
 * Notion Databases API wrapper — Slice 9.
 *
 * One endpoint:
 *   - `databasesQuery` — POST /v1/databases/{id}/query
 *
 * Used by `actions/queryDatabase.ts`.
 *
 * Forward-passes `filter` and `sorts` verbatim to Notion's API. V1's
 * `advancedQuery.ts` builder is intentionally skipped — V2 trusts the
 * user's filter object and lets Notion validate it. Same final
 * wire-format, no V2 builder; less to maintain.
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
