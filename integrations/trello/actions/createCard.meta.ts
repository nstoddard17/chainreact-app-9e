import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:create_card` — Slice 4.TRELLO-META-3.
 * Mirrors `createCard.schema.ts` (+ the UI-scope `boardId`). Write action
 * (medium risk — recoverable by archiving/deleting the card).
 *
 * Picker cascade: `boardId` (UI-scope, optional — trello:boards) →
 * `listId` / `idMembers` / `idLabels` (dependsOn boardId). `boardId` is
 * optional so a `listId` wired from an upstream node still validates; the
 * pickers gate on it when present (Dropbox `folderPath` precedent).
 *
 * `desc` echoes user-entered Markdown back in the output → sensitive.
 */
export const trelloCreateCardMeta: ActionMeta = {
  key: "trello:create_card",
  provider: "trello",
  type: "create_card",
  displayName: "Create Card",
  description: "Create a new card in a Trello list.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description:
        "Pick a board to populate the list / member / label pickers below. Optional — leave empty if the list id comes from an upstream step.",
      type: "combobox",
      required: false,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
    {
      name: "listId",
      label: "List",
      description: "The list the card is created in. Pick a board first.",
      type: "combobox",
      required: true,
      optionsSource: "trello:lists",
      dependsOn: "boardId",
      placeholder: "Select a board first, or paste a list id",
    },
    {
      name: "name",
      label: "Card Name",
      description: "The card title.",
      type: "text",
      required: true,
      placeholder: "e.g. Follow up with customer",
    },
    {
      name: "desc",
      label: "Description",
      description: "Optional Markdown card description.",
      type: "textarea",
      required: false,
    },
    {
      name: "pos",
      label: "Position",
      description:
        "Where the item is placed. Leave empty for Trello's default. For a precise numeric position, map a number from a variable.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "top", label: "Top of list" },
        { value: "bottom", label: "Bottom of list" },
      ],
      placeholder: "Trello's default",
    },
    {
      name: "due",
      label: "Due Date",
      description: "Optional due date (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-06-01T17:00:00Z",
    },
    {
      name: "dueComplete",
      label: "Due Complete",
      description: "Mark the due date complete on creation.",
      type: "boolean",
      required: false,
    },
    {
      name: "start",
      label: "Start Date",
      description: "Optional start date (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-05-01T09:00:00Z",
    },
    {
      name: "idMembers",
      label: "Members",
      description: "Optional members to assign. Pick a board first.",
      type: "combobox",
      required: false,
      multiple: true,
      optionsSource: "trello:members",
      dependsOn: "boardId",
      placeholder: "Select a board first",
    },
    {
      name: "idLabels",
      label: "Labels",
      description: "Optional labels to apply. Pick a board first.",
      type: "combobox",
      required: false,
      multiple: true,
      optionsSource: "trello:labels",
      dependsOn: "boardId",
      placeholder: "Select a board first",
    },
  ],
  outputs: [
    { name: "cardId", type: "string", description: "The new card id." },
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
  displayOrder: 10,
  riskLevel: "medium",
  riskDescription: "Creates a card (recoverable — archive or delete to undo).",
};
