import { trelloRequest } from "./_request";

/**
 * Trello Lists List API wrapper — Slice 4.TRELLO-META-2.
 *
 * One endpoint:
 *   - `listsList` — GET /1/boards/{boardId}/lists
 *
 * Lists the lists (columns) of a single board. Backs the `trello:lists`
 * options resolver, which serves `create_card.listId`, `move_card.idList`
 * and `update_card.idList` — single-parent cascade off `boardId`.
 *
 * Routes through the shared `trelloRequest` so auth + 401/404 mapping
 * live in one place. A 404 here means the board was deleted or the token
 * lost access → `TrelloNotFoundError`; the resolver maps that to empty
 * items (cascade fallback) rather than an error.
 *
 * Read-only against the existing `read` scope — no scope change /
 * reconnect. `fields=id,name,closed` keeps the payload to the id (the
 * resolver `value`), name (`label`), and the closed flag (safe hint). No
 * card content is requested. Trello returns a board's lists in a single
 * unpaginated response (a board has few lists) → the resolver reports
 * `hasMore: false`. Trello defaults to open lists for this endpoint; the
 * `closed` field is requested defensively for the description.
 */

export interface TrelloListSummary {
  id: string;
  name: string;
  idBoard?: string;
  /** Archived (closed) list. Safe, non-secret. */
  closed?: boolean;
}

export interface ListsListInput {
  /** Decrypted Trello user token from the integration row. */
  accessToken: string;
  /** The board whose lists to enumerate. */
  boardId: string;
}

export async function listsList(
  input: ListsListInput,
): Promise<ReadonlyArray<TrelloListSummary>> {
  const query = new URLSearchParams({ fields: "id,name,closed" });
  return trelloRequest<ReadonlyArray<TrelloListSummary>>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/1/boards/${encodeURIComponent(input.boardId)}/lists`,
    query,
    resourceForNotFound: `board ${input.boardId} lists`,
  });
}
