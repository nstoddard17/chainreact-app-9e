import { trelloRequest } from "./_request";

/**
 * Trello Cards API wrappers — Slice 17 Commit 4.
 *
 * Endpoints:
 *   - `cardsCreate`   — POST   /1/cards
 *   - `cardsUpdate`   — PUT    /1/cards/{id}        (also covers move + archive)
 *   - `cardsAddComment` — POST /1/cards/{id}/actions/comments
 *   - `cardsAddLabel` — POST   /1/cards/{id}/idLabels
 *
 * All wrappers route through `trelloRequest` so auth + 401/404 mapping
 * live in one place.
 *
 * Response shape (subset of Trello's full card object) — only the fields
 * V2 handlers surface as downstream output variables.
 */

export interface TrelloCard {
  id: string;
  name: string;
  desc?: string | null;
  url?: string;
  shortUrl?: string;
  idList?: string;
  idBoard?: string;
  pos?: number;
  due?: string | null;
  dueComplete?: boolean;
  start?: string | null;
  closed?: boolean;
  idMembers?: ReadonlyArray<string>;
  idLabels?: ReadonlyArray<string>;
  shortLink?: string;
  badges?: Readonly<Record<string, unknown>>;
}

// ─── cardsCreate ─────────────────────────────────────────────────────────

export interface CardsCreateInput {
  accessToken: string;
  /** Required — Trello cards live in a list. */
  idList: string;
  /** Card title. */
  name: string;
  /** Optional Markdown description. */
  desc?: string;
  /** Position: "top", "bottom", or a numeric pos. */
  pos?: "top" | "bottom" | number;
  /** ISO-8601 due date. */
  due?: string;
  /** Mark due date complete on creation. */
  dueComplete?: boolean;
  /** ISO-8601 start date. */
  start?: string;
  /** Trello member ids to assign. */
  idMembers?: ReadonlyArray<string>;
  /** Trello label ids to apply. */
  idLabels?: ReadonlyArray<string>;
}

export async function cardsCreate(
  input: CardsCreateInput,
): Promise<TrelloCard> {
  const body: Record<string, unknown> = {
    idList: input.idList,
    name: input.name,
  };
  if (input.desc !== undefined) body.desc = input.desc;
  if (input.pos !== undefined) body.pos = input.pos;
  if (input.due !== undefined) body.due = input.due;
  if (input.dueComplete !== undefined) body.dueComplete = input.dueComplete;
  if (input.start !== undefined) body.start = input.start;
  if (input.idMembers !== undefined && input.idMembers.length > 0) {
    body.idMembers = input.idMembers.join(",");
  }
  if (input.idLabels !== undefined && input.idLabels.length > 0) {
    body.idLabels = input.idLabels.join(",");
  }

  return trelloRequest<TrelloCard>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/1/cards",
    body,
    resourceForNotFound: "cards",
  });
}

// ─── cardsUpdate ─────────────────────────────────────────────────────────

export interface CardsUpdateInput {
  accessToken: string;
  cardId: string;
  /** Any subset of these mutable fields. */
  name?: string;
  desc?: string;
  idList?: string;
  pos?: "top" | "bottom" | number;
  due?: string;
  dueComplete?: boolean;
  start?: string;
  closed?: boolean;
}

export async function cardsUpdate(
  input: CardsUpdateInput,
): Promise<TrelloCard> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.desc !== undefined) body.desc = input.desc;
  if (input.idList !== undefined) body.idList = input.idList;
  if (input.pos !== undefined) body.pos = input.pos;
  if (input.due !== undefined) body.due = input.due;
  if (input.dueComplete !== undefined) body.dueComplete = input.dueComplete;
  if (input.start !== undefined) body.start = input.start;
  if (input.closed !== undefined) body.closed = input.closed;

  return trelloRequest<TrelloCard>({
    accessToken: input.accessToken,
    method: "PUT",
    path: `/1/cards/${encodeURIComponent(input.cardId)}`,
    body,
    resourceForNotFound: `card ${input.cardId}`,
  });
}

// ─── cardsAddComment ─────────────────────────────────────────────────────

export interface TrelloCommentAction {
  id: string;
  type: "commentCard";
  date?: string;
  data?: { text?: string };
  memberCreator?: { id: string; username?: string; fullName?: string | null };
}

export interface CardsAddCommentInput {
  accessToken: string;
  cardId: string;
  text: string;
}

export async function cardsAddComment(
  input: CardsAddCommentInput,
): Promise<TrelloCommentAction> {
  return trelloRequest<TrelloCommentAction>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/1/cards/${encodeURIComponent(input.cardId)}/actions/comments`,
    body: { text: input.text },
    resourceForNotFound: `card ${input.cardId}`,
  });
}

// ─── cardsAddLabel ───────────────────────────────────────────────────────

/**
 * POST /1/cards/{id}/idLabels — Trello's endpoint for adding a label to
 * a card by label id. The response is the updated array of label ids
 * on the card.
 */
export interface CardsAddLabelInput {
  accessToken: string;
  cardId: string;
  labelId: string;
}

export async function cardsAddLabel(
  input: CardsAddLabelInput,
): Promise<ReadonlyArray<string>> {
  // The `value` is passed as a query param (not a body field) per
  // Trello docs for `idLabels` mutation.
  return trelloRequest<ReadonlyArray<string>>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/1/cards/${encodeURIComponent(input.cardId)}/idLabels`,
    query: new URLSearchParams({ value: input.labelId }),
    resourceForNotFound: `card ${input.cardId}`,
  });
}
