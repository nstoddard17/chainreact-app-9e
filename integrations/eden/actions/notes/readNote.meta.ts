import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:read_note` (EDEN-5). Read action. */
export const edenReadNoteMeta: ActionMeta = {
  key: "eden:read_note",
  provider: "eden",
  type: "read_note",
  displayName: "Read Note",
  description: "Read an Eden note's Markdown content by its id.",
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
      description: "The note to read. Pick a workspace first, or paste a note id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:notes",
      dependsOn: "workspaceId",
      placeholder: "Select a note, or paste a note id",
    },
  ],
  outputs: [
    { name: "noteId", type: "string", description: "The note's id." },
    { name: "title", type: "string", description: "Note title, or null.", nullable: true },
    { name: "markdown", type: "string", description: "The note's Markdown body.", sensitive: true },
    { name: "accessMode", type: "string", description: "Eden access mode for the note, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "low",
};
