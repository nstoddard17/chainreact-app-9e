import { trelloRequest } from "./_request";

/**
 * Trello Members List API wrapper — Slice 4.TRELLO-META-2.
 *
 * One endpoint:
 *   - `membersList` — GET /1/boards/{boardId}/members
 *
 * Lists the members of a single board. Backs the `trello:members`
 * options resolver, which serves the optional multi-value
 * `create_card.idMembers` field — single-parent cascade off `boardId`.
 *
 * **Privacy:** requests only `id,fullName,username` — NO email address.
 * The resolver surfaces the display name + username only; member emails
 * are never fetched, so they can never leak through resolver output.
 *
 * Routes through the shared `trelloRequest` (auth + 401/404 mapping in
 * one place). A 404 means the board is gone / access lost →
 * `TrelloNotFoundError`; the resolver maps that to empty items.
 * Read-only against the existing `read` scope — no reconnect. A board's
 * member list is small + unpaginated → the resolver reports
 * `hasMore: false`.
 */

export interface TrelloMemberSummary {
  id: string;
  fullName?: string | null;
  username?: string;
}

export interface MembersListInput {
  /** Decrypted Trello user token from the integration row. */
  accessToken: string;
  /** The board whose members to enumerate. */
  boardId: string;
}

export async function membersList(
  input: MembersListInput,
): Promise<ReadonlyArray<TrelloMemberSummary>> {
  const query = new URLSearchParams({ fields: "id,fullName,username" });
  return trelloRequest<ReadonlyArray<TrelloMemberSummary>>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/1/boards/${encodeURIComponent(input.boardId)}/members`,
    query,
    resourceForNotFound: `board ${input.boardId} members`,
  });
}
