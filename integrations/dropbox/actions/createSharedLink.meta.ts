import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `create_shared_link` ActionMeta — Slice 3.DROPBOX-4.
 *
 * folderPath (UI-scope `dropbox:folders`) → path (`dropbox:files`) cascade.
 * Reuses an existing shared link when Dropbox reports one already exists
 * (D-DB8). `sharedUrl` is a publicly-accessible access link — marked
 * sensitive.
 */
export const dropboxCreateSharedLinkMeta: ActionMeta = {
  key: "dropbox:create_shared_link",
  provider: "dropbox",
  type: "create_shared_link",
  displayName: "Create Shared Link",
  description:
    "Create a shared link for a Dropbox file or folder. If Dropbox already has a shared link for it, the existing link is reused. Shared links can expose access to the file/folder depending on Dropbox sharing settings.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderPath",
      label: "Folder (for file picker)",
      description:
        "Optional — pick a folder to populate the File picker below. Root-level files can't be listed here; type their path in the File field instead.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Pick a folder to browse",
    },
    {
      name: "path",
      label: "File",
      description:
        "Pick a file from the selected folder, or type a full Dropbox path. Root-level paths must be typed manually.",
      type: "combobox",
      optionsSource: "dropbox:files",
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
  ],
  outputs: [
    {
      name: "sharedUrl",
      type: "string",
      description: "Public shared link URL.",
      sensitive: true,
    },
    { name: "path", type: "string", description: "Dropbox path the link points to.", sensitive: true },
    { name: "id", type: "string", description: "Dropbox shared-link id (or null)." },
    { name: "linkExisted", type: "boolean", description: "True when an existing link was reused." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a link that can grant access to the file/folder depending on Dropbox sharing settings. Recoverable by revoking the link in Dropbox.",
};
