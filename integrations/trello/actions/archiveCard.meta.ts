import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:archive_card` — Slice 4.TRELLO-META-3.
 * Mirrors `archiveCard.schema.ts` (+ the UI-scope `boardId`).
 *
 * **Risk: medium, NOT destructive.** Archiving is fully reversible
 * (`closed: false` unarchives) and Trello never hard-deletes via this
 * action — so it does NOT carry `isDestructive` / `requiresConfirmation`
 * (contrast Airtable `delete_record`). The `closed` UI default is `true`
 * to match the action name (not a hidden side effect).
 *
 * Picker cascade: `boardId` (UI-scope, optional) → `cardId`.
 */
export const trelloArchiveCardMeta: ActionMeta = {
  key: "trello:archive_card",
  provider: "trello",
  type: "archive_card",
  displayName: "Archive Card",
  description:
    "Archive (or unarchive) a Trello card. Reversible — set Archived off to restore the card.",
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
      description: "The card to archive. Pick a board first, or paste a card id.",
      type: "combobox",
      required: true,
      optionsSource: "trello:cards",
      dependsOn: "boardId",
      placeholder: "Select a board first, or paste a card id",
    },
    {
      name: "closed",
      label: "Archived",
      description:
        "On archives the card; off unarchives it. Defaults to archiving.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
  ],
  outputs: [
    { name: "cardId", type: "string", description: "The card id." },
    { name: "name", type: "string", description: "The card title." },
    { name: "closed", type: "boolean", description: "New archived state." },
    { name: "url", type: "string", description: "Full card URL." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "medium",
  riskDescription:
    "Archives a card — reversible (unarchive to restore); not a delete.",
};
