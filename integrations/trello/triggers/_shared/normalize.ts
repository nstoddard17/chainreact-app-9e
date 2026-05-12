import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Trello webhook event normalization — Slice 17 Commit 5.
 *
 * Ports V1's normalizer logic from
 * `lib/webhooks/normalizer.ts:213-361` with V2's canonical
 * TriggerEvent shape.
 *
 * Trello sends ONE webhook payload shape for ALL board events:
 *   { action: { id, type, date, data: { card, list, board, ... },
 *               memberCreator: { id, username, fullName } }, ... }
 *
 * The V2 event type is derived from `action.type` (with a
 * priority-ordered tiebreak for `updateCard`-shaped events that could
 * mean "moved," "archived," or "edited" depending on `data.old`):
 *
 *   createCard / copyCard       → trello.card.created
 *   updateCard w/ data.old.closed → trello.card.archived (priority!)
 *   updateCard w/ listBefore !== listAfter → trello.card.moved
 *   moveCardToBoard / moveCardFromBoard → trello.card.moved
 *   updateCard (other)          → trello.card.updated
 *   commentCard                 → trello.comment.added
 *   addMemberToCard /
 *     removeMemberFromCard      → trello.member.changed
 *   (other actions)             → null (unsupported — receive 200-skips)
 *
 * Dedup key = Trello action id (provider-issued UUID; the highest-
 * fidelity dedup signal Trello exposes).
 */

export type TrelloEventType =
  | "trello.card.created"
  | "trello.card.updated"
  | "trello.card.moved"
  | "trello.comment.added"
  | "trello.member.changed"
  | "trello.card.archived";

/**
 * Mapping between V2 trigger eventType (stored in
 * `trigger_resources.config.eventType` and used as the registration
 * key) and the canonical normalized event type emitted in
 * `TriggerEvent.eventType`.
 *
 * Trigger eventType is the short form (`new_card`, `card_archived`,
 * etc.); normalized event type is the namespaced form
 * (`trello.card.created`). The receive helper compares the
 * normalized type against the registered trigger's eventType (via
 * this mapping) to decide whether to dispatch.
 */
export const TRIGGER_EVENT_TO_NORMALIZED: Readonly<
  Record<string, TrelloEventType>
> = Object.freeze({
  new_card: "trello.card.created",
  card_updated: "trello.card.updated",
  card_moved: "trello.card.moved",
  comment_added: "trello.comment.added",
  member_changed: "trello.member.changed",
  card_archived: "trello.card.archived",
});

export const TRELLO_TRIGGER_EVENT_TYPES = Object.freeze(
  Object.keys(TRIGGER_EVENT_TO_NORMALIZED),
);

interface TrelloActionPayload {
  action?: {
    id?: string;
    type?: string;
    date?: string;
    data?: {
      card?: { id?: string; name?: string; desc?: string; shortLink?: string; url?: string; closed?: boolean };
      list?: { id?: string; name?: string };
      listBefore?: { id?: string; name?: string };
      listAfter?: { id?: string; name?: string };
      board?: { id?: string; name?: string };
      old?: Record<string, unknown>;
      text?: string;
      idMember?: string;
      member?: { id?: string; fullName?: string; username?: string };
    };
    memberCreator?: {
      id?: string;
      username?: string;
      fullName?: string;
    };
  };
}

/**
 * Returns the normalized event type for a Trello action payload, or
 * `null` if the action is unsupported (receive route 200-skips
 * unsupported actions).
 *
 * Priority order matters: `updateCard` w/ `data.old.closed` MUST
 * resolve to `trello.card.archived` BEFORE the list-change check, or
 * unarchive-into-different-list events would be miscategorized.
 */
export function classifyTrelloAction(
  payload: TrelloActionPayload,
): TrelloEventType | null {
  const action = payload.action;
  if (!action || typeof action.type !== "string") return null;
  const actionType = action.type;
  const data = action.data ?? {};

  // Archive/unarchive priority — V1 normalizer matches this order.
  const isArchiveChange =
    actionType === "updateCard" &&
    data.old !== undefined &&
    data.old !== null &&
    Object.prototype.hasOwnProperty.call(data.old, "closed");
  if (isArchiveChange) return "trello.card.archived";

  switch (actionType) {
    case "createCard":
    case "copyCard":
      return "trello.card.created";
    case "moveCardToBoard":
    case "moveCardFromBoard":
      return "trello.card.moved";
    case "updateCard": {
      const movedByUpdate = Boolean(
        data.listBefore?.id &&
          data.listAfter?.id &&
          data.listBefore.id !== data.listAfter.id,
      );
      return movedByUpdate ? "trello.card.moved" : "trello.card.updated";
    }
    case "commentCard":
      return "trello.comment.added";
    case "addMemberToCard":
    case "removeMemberFromCard":
      return "trello.member.changed";
    default:
      return null;
  }
}

/**
 * V2 trigger eventType names — the short form stored in
 * `trigger_resources.event_type` and consumed by
 * `dispatchTriggerEvent`'s `listForDispatch(provider, eventType)`
 * lookup. The classifier emits the namespaced form
 * (`trello.card.created`); the receive helper translates via
 * `TRIGGER_EVENT_TO_NORMALIZED` before calling `normalizeTrelloEvent`
 * so the emitted `TriggerEvent.eventType` matches what dispatch
 * looks up.
 */
export type TrelloTriggerEventName =
  | "new_card"
  | "card_updated"
  | "card_moved"
  | "comment_added"
  | "member_changed"
  | "card_archived";

export interface NormalizeTrelloEventInput {
  body: TrelloActionPayload;
  /**
   * V2 trigger eventType for the row that will receive this event —
   * stored as `TriggerEvent.eventType` so `dispatchTriggerEvent`'s
   * `(provider, eventType)` lookup against `trigger_resources` works.
   */
  triggerEventType: TrelloTriggerEventName;
  /**
   * Classified namespaced form — surfaced in payload for advanced
   * workflow refs (`{{nodeId.payload.classifiedType}}`). Kept distinct
   * from the canonical `TriggerEvent.eventType` so the two never
   * fight on dispatch lookup.
   */
  classifiedType: TrelloEventType;
}

interface TrelloCardPayload {
  id?: string;
  name?: string;
  desc?: string;
  shortLink?: string;
  url?: string;
  closed?: boolean;
}

function getCardUrl(card: TrelloCardPayload | undefined): string | null {
  if (!card) return null;
  if (typeof card.url === "string" && card.url.length > 0) return card.url;
  if (typeof card.shortLink === "string" && card.shortLink.length > 0) {
    return `https://trello.com/c/${card.shortLink}`;
  }
  return null;
}

/**
 * Convert a Trello webhook delivery to V2's canonical TriggerEvent
 * shape. Caller MUST have already verified the signature and
 * classified the event via `classifyTrelloAction`.
 *
 * The `accountId` field is set to the Trello board id — Trello board
 * webhooks are scoped to a board, and the board id is what
 * disambiguates events across multiple Trello integrations. It is
 * NOT the Trello member id (which would be the user's
 * `providerAccountId`); the webhook is account-agnostic in Trello's
 * model.
 */
export function normalizeTrelloEvent(
  input: NormalizeTrelloEventInput,
): TriggerEvent {
  const { body, triggerEventType, classifiedType } = input;
  const action = body.action ?? {};
  const data = action.data ?? {};
  const card = data.card ?? undefined;
  const board = data.board ?? undefined;
  const list = data.list ?? undefined;
  const listBefore = data.listBefore ?? undefined;
  const listAfter = data.listAfter ?? undefined;
  const memberCreator = action.memberCreator ?? undefined;

  const memberId =
    data.idMember ??
    data.member?.id ??
    null;
  const memberName =
    data.member?.fullName ??
    data.member?.username ??
    null;
  const memberAction =
    action.type === "addMemberToCard"
      ? "added"
      : action.type === "removeMemberFromCard"
        ? "removed"
        : null;

  const payload: Record<string, unknown> = {
    actionId: action.id ?? null,
    actionType: action.type ?? null,
    classifiedType,
    boardId: board?.id ?? null,
    boardName: board?.name ?? null,
    cardId: card?.id ?? null,
    cardName: card?.name ?? null,
    cardUrl: getCardUrl(card),
    cardDesc: card?.desc ?? null,
    listId: list?.id ?? listAfter?.id ?? listBefore?.id ?? null,
    listName: list?.name ?? listAfter?.name ?? listBefore?.name ?? null,
    fromListId: listBefore?.id ?? null,
    fromListName: listBefore?.name ?? null,
    toListId: listAfter?.id ?? null,
    toListName: listAfter?.name ?? null,
    changedFields:
      data.old !== undefined && data.old !== null
        ? Object.keys(data.old)
        : null,
    oldValues: data.old ?? null,
    closed: card?.closed ?? null,
    commentText: data.text ?? null,
    memberId,
    memberName,
    memberAction,
    memberCreatorId: memberCreator?.id ?? null,
    memberCreatorUsername: memberCreator?.username ?? null,
    memberCreatorFullName: memberCreator?.fullName ?? null,
    date: action.date ?? null,
    body,
  };

  const eventId = action.id ?? `${board?.id ?? "no-board"}:${action.date ?? Date.now()}`;
  const occurredAt = action.date ?? new Date().toISOString();
  const accountId = board?.id ?? "unknown-board";

  return {
    provider: "trello",
    eventType: triggerEventType,
    eventId,
    occurredAt,
    accountId,
    payload,
  };
}
