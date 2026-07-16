import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `duplicate_board` ActionMeta — Slice 3.MONDAY-6.
 *
 * `duplicateType` enum matches the runtime DuplicateBoardType (structure-
 * only safe default).
 */
export const mondayDuplicateBoardMeta: ActionMeta = {
  key: "monday:duplicate_board",
  provider: "monday",
  type: "duplicate_board",
  displayName: "Duplicate Board",
  description:
    "Clone a Monday board. Duplicate type controls how much is copied (structure only, + items, or + items and updates).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Source board",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "duplicateType",
      label: "Duplicate type",
      description:
        "Choose how much to copy: just the structure, structure + items, or structure + items + their updates.",
      type: "select",
      required: false,
      defaultValue: "duplicate_board_with_structure",
      options: [
        {
          value: "duplicate_board_with_structure",
          label: "Structure only (no items)",
        },
        { value: "duplicate_board_with_pulses", label: "Structure + items" },
        {
          value: "duplicate_board_with_pulses_and_updates",
          label: "Structure + items + updates",
        },
      ],
    },
    {
      name: "newBoardName",
      label: "New board name",
      type: "text",
      required: false,
      placeholder: "Copy of …",
    },
  ],
  outputs: [
    { name: "newBoardId", type: "string", description: "Id of the duplicated board." },
    {
      name: "newBoardName",
      type: "string",
      description: "Name of the duplicated board.",
      sensitive: true,
    },
    { name: "originalBoardId", type: "string", description: "Source board id (echo)." },
    { name: "description", type: "string", description: "New board description.", sensitive: true },
    { name: "boardKind", type: "string", description: "New board kind." },
    { name: "createdAt", type: "string", description: "Client-synthesized creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 170,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a copy of a board (and optionally its items/updates). Recoverable by deleting the new board.",
};
