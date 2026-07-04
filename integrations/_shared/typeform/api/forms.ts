import { typeformRequest } from "./_request";

/**
 * Typed Typeform Forms API wrapper — Slice 5.TYPEFORM-1.
 *
 * `GET /forms` (scope `forms:read`) backs the `typeform:forms` option
 * source. Page-number pagination: `page` (default 1) + `page_size`
 * (default 10, max 200); the response reports `page_count` so `hasMore`
 * is `page < page_count`. `search` filters server-side by title — wired
 * to the option resolver's `ctx.q` so large accounts refine via the
 * picker's search box instead of paging.
 */

export interface TypeformFormSummary {
  id?: string;
  title?: string | null;
}

interface FormsListResponse {
  total_items?: number;
  page_count?: number;
  items?: TypeformFormSummary[];
}

export interface FormsListInput {
  accessToken: string;
  /** Server-side title filter (option resolver search box). */
  search?: string;
  /** Page size, 1..200 (Typeform max). */
  pageSize: number;
}

export interface FormsListPage {
  items: TypeformFormSummary[];
  hasMore: boolean;
}

export async function formsList(input: FormsListInput): Promise<FormsListPage> {
  const query = new URLSearchParams({
    page: "1",
    page_size: String(input.pageSize),
  });
  if (input.search && input.search.length > 0) {
    query.set("search", input.search);
  }
  const res = await typeformRequest<FormsListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/forms",
    query,
    resourceForNotFound: "forms list",
  });
  const pageCount = typeof res.page_count === "number" ? res.page_count : 1;
  return {
    items: Array.isArray(res.items) ? res.items : [],
    hasMore: pageCount > 1,
  };
}
