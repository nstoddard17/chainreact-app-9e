import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:update_card` — Slice 4.TRELLO-META-3.
 * Mirrors `updateCard.schema.ts` (+ the UI-scope `boardId`). Write action
 * (medium risk). The runtime schema requires at least one mutable field;
 * all mutable fields here are optional (the author picks which to change).
 *
 * Picker cascade: `boardId` (UI-scope, optional) → `cardId` / `idList`.
 * `desc` echoes user-entered Markdown back → sensitive.
 */
export const trelloUpdateCardMeta: ActionMeta = {
  key: "trello:update_card",
  provider: "trello",
  type: "update_card",
  displayName: "Update Card",
  description:
    "Update an existing Trello card. Set at least one field to change (name, description, list, position, dates, or archive state).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description:
        "Pick a board to populate the card / list pickers below. Optional — leave empty if the card id comes from an upstream step.",
      type: "combobox",
      required: false,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
    {
      name: "cardId",
      label: "Card",
      description: "The card to update. Pick a board first, or paste a card id.",
      type: "combobox",
      required: true,
      optionsSource: "trello:cards",
      dependsOn: "boardId",
      placeholder: "Select a board first, or paste a card id",
    },
    {
      name: "name",
      label: "Card Name",
      description: "New card title (optional).",
      type: "text",
      required: false,
    },
    {
      name: "desc",
      label: "Description",
      description: "New Markdown description (optional).",
      type: "textarea",
      required: false,
    },
    {
      name: "idList",
      label: "List",
      description: "Move the card to this list (optional). Pick a board first.",
      type: "combobox",
      required: false,
      optionsSource: "trello:lists",
      dependsOn: "boardId",
      placeholder: "Select a board first",
    },
    {
      name: "pos",
      label: "Position",
      description: '"top", "bottom", or a number (optional).',
      type: "text",
      required: false,
      placeholder: "top | bottom | number",
    },
    {
      name: "due",
      label: "Due Date",
      description: "ISO-8601 due date (optional).",
      type: "text",
      required: false,
      placeholder: "2026-06-01T17:00:00Z",
    },
    {
      name: "dueComplete",
      label: "Due Complete",
      description: "Mark the due date complete.",
      type: "boolean",
      required: false,
    },
    {
      name: "start",
      label: "Start Date",
      description: "ISO-8601 start date (optional).",
      type: "text",
      required: false,
      placeholder: "2026-05-01T09:00:00Z",
    },
    {
      name: "closed",
      label: "Archived",
      description: "Set true to archive, false to unarchive.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "cardId", type: "string", description: "The card id." },
    { name: "name", type: "string", description: "The card title." },
    { name: "url", type: "string", description: "Full card URL, or null.", nullable: true },
    { name: "shortUrl", type: "string", description: "Short card URL, or null.", nullable: true },
    { name: "idList", type: "string", description: "The list id, or null.", nullable: true },
    { name: "idBoard", type: "string", description: "The board id, or null.", nullable: true },
    {
      name: "desc",
      type: "string",
      description: "The card description (user-entered Markdown), or null.",
      sensitive: true,
      nullable: true,
    },
    { name: "due", type: "string", description: "Due date (ISO-8601) or null.", nullable: true },
    { name: "dueComplete", type: "boolean", description: "Due-complete flag, or null.", nullable: true },
    { name: "start", type: "string", description: "Start date (ISO-8601) or null.", nullable: true },
    { name: "closed", type: "boolean", description: "Archived flag, or null.", nullable: true },
    { name: "idMembers", type: "array", description: "Assigned member ids." },
    { name: "idLabels", type: "array", description: "Applied label ids." },
    { name: "pos", type: "number", description: "The card's position, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "medium",
  riskDescription: "Updates a card (recoverable — edit again to revert).",
};
