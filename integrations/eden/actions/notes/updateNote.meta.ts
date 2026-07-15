import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:update_note` (EDEN-5). Write action — REPLACES the note body. */
export const edenUpdateNoteMeta: ActionMeta = {
  key: "eden:update_note",
  provider: "eden",
  type: "update_note",
  displayName: "Rewrite Note",
  description: "Replace an Eden note's entire Markdown content.",
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
      description: "The note to rewrite. Pick a workspace first, or paste a note id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:notes",
      dependsOn: "workspaceId",
      placeholder: "Select a note, or paste a note id",
    },
    {
      name: "content",
      label: "New content",
      description: "The Markdown that will REPLACE the note's current body.",
      type: "textarea",
      required: true,
      placeholder: "New note content…",
    },
  ],
  outputs: [{ name: "noteId", type: "string", description: "The updated note's id." }],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 42,
  riskLevel: "medium",
  riskDescription: "Overwrites the note's existing content.",
};
