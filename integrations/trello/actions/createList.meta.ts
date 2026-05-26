import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:create_list` — Slice 4.TRELLO-META-3.
 * Mirrors `createList.schema.ts`. Write action (medium risk).
 *
 * `idBoard` is a REAL required field (not a UI-scope helper) → it uses the
 * `trello:boards` resolver with NO `dependsOn` (it IS the board the list
 * is created in). No card cascade here.
 */
export const trelloCreateListMeta: ActionMeta = {
  key: "trello:create_list",
  provider: "trello",
  type: "create_list",
  displayName: "Create List",
  description: "Create a new list (column) on a Trello board.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "idBoard",
      label: "Board",
      description: "The board the list is created on.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
    {
      name: "name",
      label: "List Name",
      description: "The list title.",
      type: "text",
      required: true,
      placeholder: "e.g. In Progress",
    },
    {
      name: "pos",
      label: "Position",
      description:
        '"top", "bottom", or a number (optional). Leave empty for Trello\'s default (bottom).',
      type: "text",
      required: false,
      placeholder: "top | bottom | number",
    },
  ],
  outputs: [
    { name: "listId", type: "string", description: "The new list id." },
    { name: "name", type: "string", description: "The list title." },
    { name: "idBoard", type: "string", description: "The board id." },
    { name: "pos", type: "number", description: "The list's position." },
    { name: "closed", type: "boolean", description: "Archived flag." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 70,
  riskLevel: "medium",
  riskDescription: "Creates a list (recoverable — archive the list to undo).",
};
