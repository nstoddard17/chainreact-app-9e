import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:add_label_to_card` — Slice 4.TRELLO-META-3.
 * Mirrors `addLabelToCard.schema.ts` (+ the UI-scope `boardId`). Write
 * action (medium risk — recoverable by removing the label).
 *
 * Picker cascade: `boardId` (UI-scope, optional) → `cardId` / `labelId`.
 * `labelId` is an opaque id (the schema deliberately rejects label names),
 * so the picker is the primary path.
 */
export const trelloAddLabelToCardMeta: ActionMeta = {
  key: "trello:add_label_to_card",
  provider: "trello",
  type: "add_label_to_card",
  displayName: "Add Label to Card",
  description: "Apply a label to a Trello card.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description:
        "Pick a board to populate the card / label pickers below. Optional — leave empty if the card id comes from an upstream step.",
      type: "combobox",
      required: false,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
    {
      name: "cardId",
      label: "Card",
      description: "The card to label. Pick a board first, or paste a card id.",
      type: "combobox",
      required: true,
      optionsSource: "trello:cards",
      allowManualEntry: true,
      dependsOn: "boardId",
      placeholder: "Select a board first, or paste a card id",
    },
    {
      name: "labelId",
      label: "Label",
      description: "The label to apply. Pick a board first.",
      type: "combobox",
      required: true,
      optionsSource: "trello:labels",
      dependsOn: "boardId",
      placeholder: "Select a board first",
    },
  ],
  outputs: [
    { name: "cardId", type: "string", description: "The card id." },
    {
      name: "idLabels",
      type: "array",
      description: "The card's full label-id list after the add.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 60,
  riskLevel: "medium",
  riskDescription: "Adds a label (recoverable — remove the label to undo).",
};
