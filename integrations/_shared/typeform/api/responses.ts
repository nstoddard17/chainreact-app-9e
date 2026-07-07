import type { TypeformAnswer } from "../answers";
import { typeformRequest } from "./_request";

/**
 * Typed Typeform Responses API wrapper — TYPEFORM-2.
 *
 * `GET /forms/{form_id}/responses` (scope `responses:read`) backs both
 * read actions:
 *   - `typeform:list_responses` — one bounded page per run.
 *   - `typeform:get_response` — Typeform has NO dedicated GET-one
 *     endpoint; single-response retrieval is honestly implemented as the
 *     same list call filtered with `included_response_ids` (the response
 *     `token`) and `page_size: 1`.
 *
 * Wire format (docs/providers/typeform/research.md, re-verified
 * 2026-07-06):
 *   - `page_size` default 25, max 1000 (V2 callers bound it to ≤100).
 *   - `since` / `until` — ISO 8601 UTC or unix seconds.
 *   - `query` — server-side search across answers/hidden/variables.
 *   - `before` — cursor token; traversal in processing order, documented
 *     as the safe way to walk the full set without repeats. Incompatible
 *     with `sort`, so this wrapper NEVER sends `sort` (default ordering:
 *     `submitted_at,desc` — newest first).
 *   - `response_type` is NOT sent — the API default returns COMPLETED
 *     responses only. Partial responses are plan-gated and deliberately
 *     out of scope (catalog audit, 2026-07-06).
 *
 * Items are parsed into a NARROW projection type — callers never see the
 * raw provider record. `metadata` (user_agent / referer / network_id —
 * respondent fingerprint data) and any provider URL are deliberately
 * dropped at this boundary.
 */

export interface TypeformResponseItem {
  token?: string;
  submitted_at?: string | null;
  landed_at?: string | null;
  hidden?: Record<string, unknown> | null;
  calculated?: { score?: number } | null;
  answers?: TypeformAnswer[] | null;
}

interface ResponsesListResponse {
  total_items?: number;
  page_count?: number;
  items?: Array<Record<string, unknown>>;
}

export interface ResponsesListInput {
  accessToken: string;
  formId: string;
  /** Page size, 1..100 (V2 bound — well under Typeform's 1000 max). */
  pageSize: number;
  /** Only responses submitted at/after this ISO 8601 UTC instant. */
  since?: string;
  /** Only responses submitted at/before this ISO 8601 UTC instant. */
  until?: string;
  /** Server-side search across answers / hidden fields / variables. */
  query?: string;
  /** Cursor: `token` of the last item from the previous page. */
  before?: string;
  /** Comma-separated response tokens (the get_response lookup path). */
  includedResponseIds?: string;
}

export interface ResponsesListPage {
  items: TypeformResponseItem[];
  /** Total responses matching the filter, when the API reports it. */
  totalItems: number | null;
}

/** Narrow one raw item to the projection type — never a spread. */
function projectItem(raw: Record<string, unknown>): TypeformResponseItem {
  const calculated =
    raw.calculated && typeof raw.calculated === "object" && !Array.isArray(raw.calculated)
      ? (raw.calculated as { score?: number })
      : null;
  const hidden =
    raw.hidden && typeof raw.hidden === "object" && !Array.isArray(raw.hidden)
      ? (raw.hidden as Record<string, unknown>)
      : null;
  return {
    token: typeof raw.token === "string" ? raw.token : undefined,
    submitted_at: typeof raw.submitted_at === "string" ? raw.submitted_at : null,
    landed_at: typeof raw.landed_at === "string" ? raw.landed_at : null,
    hidden,
    calculated,
    answers: Array.isArray(raw.answers) ? (raw.answers as TypeformAnswer[]) : null,
  };
}

export async function responsesList(
  input: ResponsesListInput,
): Promise<ResponsesListPage> {
  const query = new URLSearchParams({ page_size: String(input.pageSize) });
  if (input.since && input.since.length > 0) query.set("since", input.since);
  if (input.until && input.until.length > 0) query.set("until", input.until);
  if (input.query && input.query.length > 0) query.set("query", input.query);
  if (input.before && input.before.length > 0) query.set("before", input.before);
  if (input.includedResponseIds && input.includedResponseIds.length > 0) {
    query.set("included_response_ids", input.includedResponseIds);
  }
  const res = await typeformRequest<ResponsesListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/forms/${encodeURIComponent(input.formId)}/responses`,
    query,
    resourceForNotFound: `form ${input.formId}`,
  });
  return {
    items: Array.isArray(res.items) ? res.items.map(projectItem) : [],
    totalItems: typeof res.total_items === "number" ? res.total_items : null,
  };
}
