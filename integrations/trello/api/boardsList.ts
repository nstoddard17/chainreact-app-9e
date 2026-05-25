import { trelloRequest } from "./_request";

/**
 * Trello Boards List API wrapper — Slice 4.TRELLO-META-2.
 *
 * One endpoint:
 *   - `boardsList` — GET /1/members/me/boards
 *
 * Lists the boards the connected user's token can access. Backs the
 * `trello:boards` options resolver — the cascade ROOT every Trello
 * action's board picker (the UI-scope `boardId` field added in
 * TRELLO-META-3 + `create_list.idBoard`) and all 6 webhook triggers'
 * `boardId` hang off.
 *
 * Distinct from `boards.ts` `boardsCreate` (the mutation helper). The
 * existing `api/` helpers are mutation-only; the resolver layer needs a
 * read helper, so this lives in its own file (mirrors the Airtable
 * `basesList.ts` vs `bases.ts` split).
 *
 * Routes through the shared `trelloRequest` so the URL-param key+token
 * auth + 401 → `Unauthorized401Error` + 404 → `TrelloNotFoundError`
 * mapping live in one place (no new transport). The token NEVER appears
 * in any thrown error (the helper references method + path only).
 *
 * Read-only against the existing coarse `read` scope already in the
 * Trello manifest — no scope change / reconnect required.
 *
 * `fields=id,name,closed` keeps the payload minimal: just the opaque
 * board id (the resolver's `value`), the display name (the `label`), and
 * the closed/archived flag (surfaced as a safe `description` hint). No
 * board `prefs` / member data / card content is requested. The Trello
 * `/members/{id}/boards` endpoint is unpaginated for a single member, so
 * the resolver reports `hasMore: false`.
 */

export interface TrelloBoardSummary {
  id: string;
  name: string;
  /** Trello marks archived boards `closed: true`. Safe, non-secret. */
  closed?: boolean;
}

export interface BoardsListInput {
  /** Decrypted Trello user token from the integration row. */
  accessToken: string;
}

export async function boardsList(
  input: BoardsListInput,
): Promise<ReadonlyArray<TrelloBoardSummary>> {
  const query = new URLSearchParams({ fields: "id,name,closed" });
  return trelloRequest<ReadonlyArray<TrelloBoardSummary>>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/1/members/me/boards",
    query,
    resourceForNotFound: "boards",
  });
}
