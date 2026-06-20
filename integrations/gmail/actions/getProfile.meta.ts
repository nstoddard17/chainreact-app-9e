import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:get_profile` — Slice 4.GMAIL-READ-1.
 * Mirrors `getProfile.schema.ts` (no input fields). Read action (low risk).
 *
 * Returns the connected mailbox's own email + total counts + historyId.
 * `emailAddress` is the account's own address (PII) and is marked sensitive
 * so the run-detail API + variable picker redact it (token wiring still
 * works). No message content.
 *
 * Required scope: `gmail.readonly`.
 */
export const getProfileMeta: ActionMeta = {
  key: "gmail:get_profile",
  provider: "gmail",
  type: "get_profile",
  displayName: "Get Profile",
  description:
    "Read the connected Gmail mailbox profile: account email address, total message count, total thread count, and current historyId. Read-only — no message content. Requires the gmail.readonly scope.",
  category: "email",
  requiresIntegration: true,
  fields: [],
  outputs: [
    {
      name: "emailAddress",
      type: "string",
      description: "The connected mailbox's own email address.",
      sensitive: true,
    },
    { name: "messagesTotal", type: "number", description: "Total number of messages in the mailbox." },
    { name: "threadsTotal", type: "number", description: "Total number of threads in the mailbox." },
    {
      name: "historyId",
      type: "string",
      description: "Current mailbox historyId (opaque cursor for incremental sync).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 150,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads the mailbox profile (own email + counts) — no provider-side mutation, no message content.",
};
