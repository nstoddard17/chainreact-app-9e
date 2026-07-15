import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:rename_note` (EDEN-5). Write action. */
export const edenRenameNoteMeta: ActionMeta = {
  key: "eden:rename_note",
  provider: "eden",
  type: "rename_note",
  displayName: "Rename Note",
  description: "Change an Eden note's title.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace that owns the note. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "itemId",
      label: "Note",
      description: "The note to rename. Pick a workspace first, or paste a note id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:notes",
      dependsOn: "workspaceId",
      placeholder: "Select a note, or paste a note id",
    },
    { name: "title", label: "New title", description: "The new note title.", type: "text", required: true, placeholder: "Note title" },
  ],
  outputs: [
    { name: "noteId", type: "string", description: "The renamed note's id." },
    { name: "title", type: "string", description: "Provider-confirmed new title, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 43,
  riskLevel: "low",
};
