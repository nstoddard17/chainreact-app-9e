import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `trello:create_board` — Slice 4.TRELLO-META-3.
 * Mirrors `createBoard.schema.ts`. Write action.
 *
 * **Risk: medium (Marcus decision).** `visibility` is an EXPLICIT required
 * select with NO default (Q11 — V1's hidden "private" default is gone), so
 * a `public` board is always a deliberate author choice. A public board is
 * mild data egress, but it stays medium (not destructive / no confirmation)
 * because the choice is explicit and the board is recoverable (closeable).
 * The `public` risk is surfaced as inline helper/warning text on the
 * visibility field rather than a field-level conditional confirmation
 * (which the contract doesn't model yet). `desc` echoes user Markdown →
 * sensitive. No card cascade (no board context to pick from — this CREATES
 * the board).
 */
export const trelloCreateBoardMeta: ActionMeta = {
  key: "trello:create_board",
  provider: "trello",
  type: "create_board",
  displayName: "Create Board",
  description: "Create a new Trello board.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Board Name",
      description: "The board title.",
      type: "text",
      required: true,
      placeholder: "e.g. Q3 Launch",
    },
    {
      name: "visibility",
      label: "Visibility",
      description:
        "Who can see the board. Private = board members only. Workspace = anyone in your Trello workspace. ⚠ Public = anyone with the URL, including people outside your workspace — only choose Public if the board is meant to be shared externally.",
      type: "select",
      required: true,
      options: [
        {
          value: "private",
          label: "Private",
          description: "Board members only.",
        },
        {
          value: "workspace",
          label: "Workspace",
          description: "Anyone in the linked Trello workspace.",
        },
        {
          value: "public",
          label: "Public",
          description: "Anyone with the URL — visible outside the workspace.",
        },
      ],
    },
    {
      name: "desc",
      label: "Description",
      description: "Optional Markdown board description.",
      type: "textarea",
      required: false,
    },
    {
      name: "defaultLists",
      label: "Create Default Lists",
      description:
        'When on, Trello seeds the board with "To Do / Doing / Done" lists.',
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "The new board id." },
    { name: "name", type: "string", description: "The board title." },
    {
      name: "desc",
      type: "string",
      description: "The board description (user-entered Markdown).",
      sensitive: true,
    },
    { name: "url", type: "string", description: "Full board URL." },
    { name: "shortUrl", type: "string", description: "Short board URL." },
    { name: "closed", type: "boolean", description: "Archived flag." },
    {
      name: "idOrganization",
      type: "string",
      description: "Linked workspace id (or null).",
    },
    {
      name: "visibility",
      type: "string",
      description: "The board's visibility: private | workspace | public.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 80,
  riskLevel: "medium",
  riskDescription:
    "Creates a board (recoverable — close the board to undo). Public visibility exposes the board outside the workspace.",
};
