import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:list_folders` —
 * Slice 4.OUTLOOK-READ-1. Mirrors `listFolders.schema.ts` (no input fields).
 * Read action (low risk).
 *
 * Returns top-level mail folder id/displayName only — no message content,
 * no counts. Folder names are structural mailbox metadata (Inbox / Sent /
 * user folders), so `folders` is NOT marked sensitive (mirrors the
 * structural-output precedent). Required scope: `Mail.Read`.
 */
export const outlookListFoldersMeta: ActionMeta = {
  key: "microsoft-outlook:list_folders",
  provider: "microsoft-outlook",
  type: "list_folders",
  displayName: "List Folders",
  description:
    "List the top-level mail folders on the connected Outlook mailbox (id + display name). Read-only — returns folder metadata only, no messages. Requires the Mail.Read scope.",
  category: "email",
  requiresIntegration: true,
  fields: [],
  outputs: [
    {
      name: "folders",
      type: "array",
      description:
        "Top-level mail folders — each entry is { id, displayName } (displayName may be null).",
    },
    { name: "count", type: "number", description: "folders.length convenience scalar." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads the mailbox folder list — no provider-side mutation, no message content.",
};
