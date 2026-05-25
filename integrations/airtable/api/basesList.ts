import { airtableRequest } from "./_request";

/**
 * Airtable Bases List API wrapper — Slice 4.AIRTABLE-META-2.
 *
 * One endpoint:
 *   - `basesList` — GET /v0/meta/bases
 *
 * Lists the bases the connected user's token can access (across all
 * workspaces). Requires the `schema.bases:read` scope — ALREADY in the
 * Airtable manifest (no scope change / reconnect needed). Backs the
 * `airtable:bases` options resolver, the cascade root every Airtable
 * action + the `record_changed` trigger hang their `baseId` off.
 *
 * Distinct from `bases.ts` `basesGetSchema` (which lists the TABLES of a
 * single base via `/v0/meta/bases/{baseId}/tables`). This one lists the
 * bases themselves.
 *
 * Routes through the shared `airtableRequest` so 401 / 404 / error
 * mapping lives in one place (no new transport). Airtable paginates the
 * response with an `offset` cursor; the resolver fetches a single page
 * (most users have far fewer than one page of bases) and advertises
 * `hasMore` from the presence of `offset`.
 *
 * Response shape (per Airtable Web API):
 *   `{ bases: [{ id, name, permissionLevel }], offset? }`
 */

export interface AirtableBaseSummary {
  id: string;
  name: string;
  /** "none" | "read" | "comment" | "edit" | "create" — safe, non-secret. */
  permissionLevel?: string;
}

export interface BasesListResponse {
  bases: AirtableBaseSummary[];
  /** Present when there's a next page; undefined on the last page. */
  offset?: string;
}

export interface BasesListInput {
  accessToken: string;
  /** Pagination cursor returned by the previous page's `offset`. */
  offset?: string;
}

export async function basesList(
  input: BasesListInput,
): Promise<BasesListResponse> {
  const params = new URLSearchParams();
  if (input.offset !== undefined) {
    params.append("offset", input.offset);
  }
  return airtableRequest<BasesListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v0/meta/bases",
    query: params,
    resourceForNotFound: "bases",
  });
}
