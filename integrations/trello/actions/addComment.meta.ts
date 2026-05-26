import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:add_comment` — Slice 4.TRELLO-META-3.
 * Mirrors `addComment.schema.ts` (+ the UI-scope `boardId`). Write action
 * (medium risk).
 *
 * Picker cascade: `boardId` (UI-scope, optional) → `cardId`. The `text`
 * field is a textarea (Markdown). The output `text` echoes the comment
 * body → sensitive (also forced — `text` ∈ the sensitive-output suspicious
 * name set).
 */
export const trelloAddCommentMeta: ActionMeta = {
  key: "trello:add_comment",
  provider: "trello",
  type: "add_comment",
  displayName: "Add Comment",
  description: "Add a comment to a Trello card.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description:
        "Pick a board to populate the card picker below. Optional — leave empty if the card id comes from an upstream step.",
      type: "combobox",
      required: false,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
    {
      name: "cardId",
      label: "Card",
      description: "The card to comment on. Pick a board first, or paste a card id.",
      type: "combobox",
      required: true,
      optionsSource: "trello:cards",
      dependsOn: "boardId",
      placeholder: "Select a board first, or paste a card id",
    },
    {
      name: "text",
      label: "Comment",
      description: "The comment body. Trello supports Markdown.",
      type: "textarea",
      required: true,
      placeholder: "Write a comment…",
    },
  ],
  outputs: [
    { name: "commentId", type: "string", description: "The comment action id." },
    {
      name: "text",
      type: "string",
      description: "The comment body (echo of the posted text).",
      sensitive: true,
    },
    { name: "date", type: "string", description: "ISO-8601 comment timestamp." },
    {
      name: "memberCreatorId",
      type: "string",
      description: "Id of the member who posted the comment.",
    },
    {
      name: "memberCreatorUsername",
      type: "string",
      description: "Username of the commenter.",
    },
    {
      name: "memberCreatorFullName",
      type: "string",
      description: "Display name of the commenter.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "medium",
  riskDescription: "Posts a comment (recoverable — delete the comment to undo).",
};
