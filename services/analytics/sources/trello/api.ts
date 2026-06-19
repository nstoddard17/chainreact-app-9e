import { trelloRequest } from "@/integrations/trello/api/_request";
import { listsList, type TrelloListSummary } from "@/integrations/trello/api/listsList";
import { cardCreatedMs } from "./buckets";

/**
 * Bounded, READ-ONLY Trello board reader for the analytics source
 * (Slice ANALYTICS-SOURCES-TRELLO-1).
 *
 * Deliberately does NOT reuse the workflow `cardsList` wrapper: that wrapper
 * requests `fields=id,name,due,idList` (card NAME included). This reader requests
 * `fields=id,due,dueComplete,idList,closed` ONLY — no card name, description,
 * comments, checklists, members, attachments, or url is ever fetched. Each card is
 * projected to a transient {@link CardFact}; the card `id` is read only to derive
 * the created-time (via the id's embedded timestamp) and is never returned or
 * cached.
 *
 * SAFETY — bounded to prevent an unbounded board scan: Trello's `limit` is capped
 * at {@link MAX_CARDS}; if the board returns a full page we report `truncated`
 * rather than paging the whole board.
 *
 * Board scoping comes from a validated 24-hex board id; no raw Trello query/search
 * is ever taken from widget config.
 */

/** Trello's documented per-request ceiling for the board-cards endpoint. */
export const MAX_CARDS = 1000;

export type CardFilter = "open" | "closed" | "all";

/** Transient, non-identifying projection of one card. Never cached/returned to client. */
export interface CardFact {
  /** created_time epoch ms, derived from the card id (null when underivable). */
  createdMs: number | null;
  /** ISO due date or null. */
  due: string | null;
  dueComplete: boolean;
  /** List id the card sits in (structural; used to group by list). */
  idList: string | null;
  closed: boolean;
}

export interface BoardCardsResult {
  facts: CardFact[];
  truncated: boolean;
}

interface RawTrelloCard {
  id?: unknown;
  due?: unknown;
  dueComplete?: unknown;
  idList?: unknown;
  closed?: unknown;
}

/**
 * Fetch up to {@link MAX_CARDS} cards of a board (by `filter`), projected to
 * {@link CardFact}. Throws `Unauthorized401Error` / `TrelloNotFoundError` /
 * generic `Error`; the adapter classifies them.
 */
export async function fetchBoardCards(
  accessToken: string,
  boardId: string,
  filter: CardFilter,
  limit: number = MAX_CARDS,
): Promise<BoardCardsResult> {
  const query = new URLSearchParams({
    filter,
    fields: "id,due,dueComplete,idList,closed",
    limit: String(limit),
  });
  const raw = await trelloRequest<ReadonlyArray<RawTrelloCard>>({
    accessToken,
    method: "GET",
    path: `/1/boards/${encodeURIComponent(boardId)}/cards`,
    query,
    resourceForNotFound: `board ${boardId} cards`,
  });

  const facts: CardFact[] = raw.map((c) => ({
    createdMs: typeof c.id === "string" ? cardCreatedMs(c.id) : null,
    due: typeof c.due === "string" ? c.due : null,
    dueComplete: c.dueComplete === true,
    idList: typeof c.idList === "string" ? c.idList : null,
    closed: c.closed === true,
  }));

  return { facts, truncated: facts.length >= limit };
}

/** Fetch a board's open lists as `{ id, name }` (names are board-structure labels). */
export async function fetchBoardLists(
  accessToken: string,
  boardId: string,
): Promise<ReadonlyArray<TrelloListSummary>> {
  return listsList({ accessToken, boardId });
}
