import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:move_card` — Slice 4.TRELLO-META-3.
 * Mirrors `moveCard.schema.ts` (+ the UI-scope `boardId`). Write action
 * (medium risk — recoverable by moving back).
 *
 * Picker cascade: `boardId` (UI-scope, optional) → `cardId` / `idList`.
 */
export const trelloMoveCardMeta: ActionMeta = {
  key: "trello:move_card",
  provider: "trello",
  type: "move_card",
  displayName: "Move Card",
  description: "Move a Trello card to a different list.",
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
      description: "The card to move. Pick a board first, or paste a card id.",
      type: "combobox",
      required: true,
      optionsSource: "trello:cards",
      dependsOn: "boardId",
      placeholder: "Select a board first, or paste a card id",
    },
    {
      name: "idList",
      label: "Target List",
      description: "The destination list. Pick a board first.",
      type: "combobox",
      required: true,
      optionsSource: "trello:lists",
      dependsOn: "boardId",
      placeholder: "Select a board first",
    },
    {
      name: "pos",
      label: "Position",
      description:
        '"top", "bottom", or a number (optional). Leave empty to keep the current position.',
      type: "text",
      required: false,
      placeholder: "top | bottom | number",
    },
  ],
  outputs: [
    { name: "cardId", type: "string", description: "The card id." },
    { name: "name", type: "string", description: "The card title." },
    { name: "idList", type: "string", description: "The new list id." },
    { name: "idBoard", type: "string", description: "The board id." },
    { name: "pos", type: "number", description: "The card's position post-move." },
    { name: "url", type: "string", description: "Full card URL." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "medium",
  riskDescription: "Moves a card between lists (recoverable — move it back).",
};
