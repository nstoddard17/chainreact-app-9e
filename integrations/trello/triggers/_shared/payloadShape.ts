import type { OutputMeta } from "@/contracts/triggerMeta";

/**
 * Shared payload shape for all 6 Trello webhook triggers —
 * Slice 4.TRELLO-META-3.
 *
 * Every Trello webhook delivers one normalized event shape (see
 * `triggers/_shared/normalize.ts`); workflows branch on `actionType` /
 * `classifiedType`. The 6 trigger metas (`new_card`, `card_updated`,
 * `card_moved`, `comment_added`, `member_changed`, `card_archived`) all
 * emit this same `payloadShape`, so it lives here once rather than being
 * copy-pasted into each meta.
 *
 * **Sensitive fields** (redacted in the run-details API + variable
 * picker): `cardDesc` (card description), `commentText` (comment body),
 * `oldValues` (prior field values before an update), and `body` (the raw
 * webhook payload — also forced by the sensitive-output-coverage suspicious
 * name set). Ids / names / list labels / member display names / dates are
 * structural identifiers, not marked sensitive (mirrors the Airtable +
 * Slack precedent — short identifying labels are not over-marked).
 */
export const TRELLO_TRIGGER_PAYLOAD_SHAPE: readonly OutputMeta[] = [
  {
    name: "actionId",
    type: "string",
    description: "The Trello action id for this event.",
  },
  {
    name: "actionType",
    type: "string",
    description: "Trello's raw action type (e.g. createCard, updateCard).",
  },
  {
    name: "classifiedType",
    type: "string",
    description:
      "The normalized V2 event type (card.created / card.updated / card.moved / comment.added / member.changed / card.archived). Branch on this.",
  },
  { name: "boardId", type: "string", description: "The board id." },
  { name: "boardName", type: "string", description: "The board name." },
  { name: "cardId", type: "string", description: "The card id (when applicable)." },
  { name: "cardName", type: "string", description: "The card name (when applicable)." },
  { name: "cardUrl", type: "string", description: "The card URL (when applicable)." },
  {
    name: "cardDesc",
    type: "string",
    description: "The card description (user-entered content).",
    sensitive: true,
  },
  { name: "listId", type: "string", description: "The current list id." },
  { name: "listName", type: "string", description: "The current list name." },
  { name: "fromListId", type: "string", description: "Source list id (move events)." },
  { name: "fromListName", type: "string", description: "Source list name (move events)." },
  { name: "toListId", type: "string", description: "Target list id (move events)." },
  { name: "toListName", type: "string", description: "Target list name (move events)." },
  {
    name: "changedFields",
    type: "array",
    description: "Names of the card fields that changed (update events).",
  },
  {
    name: "oldValues",
    type: "object",
    description: "Prior card field values before the change (update events).",
    sensitive: true,
  },
  { name: "closed", type: "boolean", description: "The card's archived state." },
  {
    name: "commentText",
    type: "string",
    description: "The comment body (comment events).",
    sensitive: true,
  },
  { name: "memberId", type: "string", description: "Affected member id (member events)." },
  {
    name: "memberName",
    type: "string",
    description: "Affected member display name / username (member events).",
  },
  {
    name: "memberAction",
    type: "string",
    description: 'Whether the member was "added" or "removed".',
  },
  {
    name: "memberCreatorId",
    type: "string",
    description: "Id of the member who triggered the action.",
  },
  {
    name: "memberCreatorUsername",
    type: "string",
    description: "Username of the member who triggered the action.",
  },
  {
    name: "memberCreatorFullName",
    type: "string",
    description: "Display name of the member who triggered the action.",
  },
  { name: "date", type: "string", description: "ISO-8601 timestamp of the action." },
  {
    name: "body",
    type: "object",
    description: "The raw Trello webhook action payload.",
    sensitive: true,
  },
];
