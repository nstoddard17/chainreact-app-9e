import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:append_to_note` (EDEN-5). Write action. */
export const edenAppendToNoteMeta: ActionMeta = {
  key: "eden:append_to_note",
  provider: "eden",
  type: "append_to_note",
  displayName: "Append to Note",
  description: "Append Markdown content to the end of an Eden note.",
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
      description: "The note to append to. Pick a workspace first, or paste a note id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:notes",
      allowManualEntry: true,
      dependsOn: "workspaceId",
      placeholder: "Select a note, or paste a note id",
    },
    {
      name: "content",
      label: "Content to append",
      description: "Markdown appended to the end of the note.",
      type: "textarea",
      required: true,
      placeholder: "Add to the note…",
    },
  ],
  outputs: [{ name: "noteId", type: "string", description: "The updated note's id." }],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 41,
  riskLevel: "low",
};
