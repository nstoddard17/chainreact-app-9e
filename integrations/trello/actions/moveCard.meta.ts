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
        "Where the item is placed. Leave empty to keep the current position. For a precise numeric position, map a number from a variable.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "top", label: "Top of list" },
        { value: "bottom", label: "Bottom of list" },
      ],
      placeholder: "Keep current position",
    },
  ],
  outputs: [
    { name: "cardId", type: "string", description: "The card id." },
    { name: "name", type: "string", description: "The card title." },
    // The handler coerces these to `?? null` from the Trello response (mirrors
    // create_card / update_card), so the metadata must mark them nullable.
    { name: "idList", type: "string", description: "The new list id, or null.", nullable: true },
    { name: "idBoard", type: "string", description: "The board id, or null.", nullable: true },
    { name: "pos", type: "number", description: "The card's position post-move, or null.", nullable: true },
    { name: "url", type: "string", description: "Full card URL, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "medium",
  riskDescription: "Moves a card between lists (recoverable — move it back).",
};
