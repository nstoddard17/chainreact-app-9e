import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:get_profile` —
 * Slice 4.OUTLOOK-READ-1. Mirrors `getProfile.schema.ts` (no input fields).
 * Read action (low risk).
 *
 * Returns the connected mailbox's own identity. `mail` / `userPrincipalName`
 * / `displayName` are PII (the account's own address/name) and are marked
 * sensitive so the run-detail API + variable picker redact them (token
 * wiring still works). `id` is the Azure object GUID (structural). No
 * message content. Required scope: `Mail.Read`.
 */
export const outlookGetProfileMeta: ActionMeta = {
  key: "microsoft-outlook:get_profile",
  provider: "microsoft-outlook",
  type: "get_profile",
  displayName: "Get Profile",
  description:
    "Read the connected Outlook mailbox profile: account email, user principal name, display name, and Azure object id. Read-only — no message content. Requires the Mail.Read scope.",
  category: "email",
  requiresIntegration: true,
  fields: [],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "Immutable Azure AD object id of the account (or null).",
    },
    {
      name: "mail",
      type: "string",
      description: "The account's primary email address (or null for unprovisioned consumer mailboxes).",
      sensitive: true,
    },
    {
      name: "userPrincipalName",
      type: "string",
      description: "The account's sign-in identifier / UPN (or null).",
      sensitive: true,
    },
    {
      name: "displayName",
      type: "string",
      description: "The account holder's display name (or null).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads the mailbox profile (own identity) — no provider-side mutation, no message content.",
};
