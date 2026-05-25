import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `create_board` ActionMeta — Slice 3.MONDAY-6.
 *
 * `boardKind` is a required static enum (no hidden visibility default —
 * Q11). No workspace picker: the runtime has no workspaceId (boards land
 * in the connected account's default workspace).
 */
export const mondayCreateBoardMeta: ActionMeta = {
  key: "monday:create_board",
  provider: "monday",
  type: "create_board",
  displayName: "Create Board",
  description:
    "Create a new Monday board. Board kind controls workspace-wide visibility and must be chosen explicitly.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardName",
      label: "Board name",
      type: "text",
      required: true,
      placeholder: "Q4 Roadmap",
    },
    {
      name: "boardKind",
      label: "Board kind",
      description:
        "public = visible to the whole workspace; private = invite-only; share = shareable board. No default — choose explicitly.",
      type: "select",
      required: true,
      options: [
        { value: "public", label: "Public (visible to the workspace)" },
        { value: "private", label: "Private (invite-only)" },
        { value: "share", label: "Shareable" },
      ],
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      required: false,
      placeholder: "What this board is for…",
    },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "New board id." },
    { name: "boardName", type: "string", description: "Board name.", sensitive: true },
    { name: "description", type: "string", description: "Board description.", sensitive: true },
    { name: "boardKind", type: "string", description: "Resolved board kind." },
    { name: "createdAt", type: "string", description: "Client-synthesized creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 160,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new board and sets its workspace-wide visibility. Recoverable by deleting the board in Monday.",
};
