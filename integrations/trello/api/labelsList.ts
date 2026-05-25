import { trelloRequest } from "./_request";

/**
 * Trello Labels List API wrapper — Slice 4.TRELLO-META-2.
 *
 * One endpoint:
 *   - `labelsList` — GET /1/boards/{boardId}/labels
 *
 * Lists the labels defined on a single board. Backs the `trello:labels`
 * options resolver, which serves `add_label_to_card.labelId` + the
 * optional multi-value `create_card.idLabels` — single-parent cascade
 * off `boardId`. A `labelId` is an opaque 24-hex id (not name-resolvable
 * per the runtime schemas), so this picker is required.
 *
 * Trello defaults this endpoint to 50 labels and caps at 1000. A board's
 * label set is tiny in practice, so the helper requests the max in one
 * page (`limit=1000`) and the resolver reports `hasMore: false`.
 * `fields=id,name,color` keeps the payload to the id (resolver `value`),
 * name (`label`), and color (a safe label/`description` fallback).
 *
 * Routes through the shared `trelloRequest` (auth + 401/404 mapping in
 * one place). A 404 means the board is gone / access lost →
 * `TrelloNotFoundError`; the resolver maps that to empty items.
 * Read-only against the existing `read` scope — no reconnect.
 */

/** Trello caps the labels endpoint at 1000; a board's set is far smaller. */
export const TRELLO_LABELS_MAX = 1000;

export interface TrelloLabelSummary {
  id: string;
  /** A Trello label may have an empty name (color-only label). */
  name?: string;
  /** e.g. "green" / "blue_dark" / null for a no-color label. Non-secret. */
  color?: string | null;
}

export interface LabelsListInput {
  /** Decrypted Trello user token from the integration row. */
  accessToken: string;
  /** The board whose labels to enumerate. */
  boardId: string;
}

export async function labelsList(
  input: LabelsListInput,
): Promise<ReadonlyArray<TrelloLabelSummary>> {
  const query = new URLSearchParams({
    fields: "id,name,color",
    limit: String(TRELLO_LABELS_MAX),
  });
  return trelloRequest<ReadonlyArray<TrelloLabelSummary>>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/1/boards/${encodeURIComponent(input.boardId)}/labels`,
    query,
    resourceForNotFound: `board ${input.boardId} labels`,
  });
}
