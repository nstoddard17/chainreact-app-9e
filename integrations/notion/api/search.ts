import { notionRequest } from "./_request";

/**
 * Notion Search API wrapper — Slice 9.
 *
 * One endpoint:
 *   - `search` — POST /v1/search
 *
 * Used by `actions/search.ts`.
 *
 * Notion's `/v1/search` endpoint searches across all pages and
 * databases the integration has access to. The optional `filter`
 * narrows by object type (`page` or `database`); `sorts` is also
 * supported but Slice 9 leaves it forward-passable verbatim.
 */

/**
 * One search hit — either a `page` or a `database` object. Discriminated
 * by `object`. Slice 9 surfaces only id + title + parent + url back to
 * the engine; the property-polymorphism layer is exercised on `get_page`
 * + `query_database`, not on search hits.
 */
export interface SearchHit {
  object: "page" | "database";
  id: string;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  url?: string;
  parent?: Record<string, unknown>;
  /** Page properties (Notion returns the full property map). */
  properties?: Record<string, unknown>;
  /** Database title (rich-text array). */
  title?: ReadonlyArray<{ plain_text?: string; text?: { content?: string } }>;
}

export interface SearchResponse {
  object: "list";
  results: SearchHit[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface SearchInput {
  accessToken: string;
  /** Empty string = "all accessible objects." */
  query: string;
  /** Optional `{ value: "page" | "database", property: "object" }` filter. */
  filter?: { value: "page" | "database"; property: "object" };
  /** Default 100 (Notion's hard ceiling); enforced at schema layer. */
  pageSize?: number;
  startCursor?: string;
}

export async function search(input: SearchInput): Promise<SearchResponse> {
  const body: Record<string, unknown> = { query: input.query };
  if (input.filter !== undefined) body.filter = input.filter;
  if (input.pageSize !== undefined) body.page_size = input.pageSize;
  if (input.startCursor !== undefined) body.start_cursor = input.startCursor;

  return notionRequest<SearchResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/search",
    body,
    // Search 404 is unusual — Notion returns empty results rather than
    // 404 for "no matches." If 404 fires it means the integration was
    // revoked entirely; the resource label flags that.
    resourceForNotFound: "search endpoint",
  });
}
