import { trelloRequest } from "./_request";

/**
 * Trello Cards List API wrapper — Slice 4.TRELLO-META-2.
 *
 * One endpoint:
 *   - `cardsList` — GET /1/boards/{boardId}/cards
 *
 * Lists the open cards of a single board. Backs the `trello:cards`
 * options resolver, which serves the `cardId` field on `update_card` /
 * `move_card` / `archive_card` / `add_comment` / `add_label_to_card` —
 * single-parent cascade off `boardId`.
 *
 * **Bounded by design.** A busy board can hold thousands of cards, so
 * the helper always sends `filter=open` (skip archived) and a `limit`
 * query param. The resolver additionally caps + computes `hasMore`
 * client-side so output stays bounded even if a Trello version ignores
 * the `limit` param. `cardId` also commonly flows from an upstream
 * trigger, so the picker is a convenience, not the only path.
 *
 * **No card body content is requested** — only `id,name,due,idList`.
 * Card descriptions / comments / attachments are NEVER fetched here, so
 * they can never leak through resolver output.
 *
 * Routes through the shared `trelloRequest` (auth + 401/404 mapping in
 * one place). A 404 means the board is gone / access lost →
 * `TrelloNotFoundError`; the resolver maps that to empty items.
 * Read-only against the existing `read` scope — no reconnect.
 */

export interface TrelloCardSummary {
  id: string;
  name: string;
  idList?: string;
  /** ISO-8601 due date or null. Safe, non-secret scheduling metadata. */
  due?: string | null;
}

export interface CardsListInput {
  /** Decrypted Trello user token from the integration row. */
  accessToken: string;
  /** The board whose cards to enumerate. */
  boardId: string;
  /**
   * Upper bound on cards fetched in one page. The resolver passes its
   * page cap; the helper forwards it as Trello's `limit` query param.
   */
  limit: number;
}

export async function cardsList(
  input: CardsListInput,
): Promise<ReadonlyArray<TrelloCardSummary>> {
  const query = new URLSearchParams({
    filter: "open",
    fields: "id,name,due,idList",
    limit: String(input.limit),
  });
  return trelloRequest<ReadonlyArray<TrelloCardSummary>>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/1/boards/${encodeURIComponent(input.boardId)}/cards`,
    query,
    resourceForNotFound: `board ${input.boardId} cards`,
  });
}
