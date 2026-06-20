import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:list_labels` — Slice 4.GMAIL-READ-1.
 * Mirrors `listLabels.schema.ts` (no input fields). Read action (low risk).
 *
 * Returns label id/name/type only — no message content. Label names are
 * structural mailbox metadata (INBOX / SENT / user labels), not message PII,
 * so `labels` is NOT marked sensitive (mirrors structural-output precedent).
 *
 * Required scope: `gmail.readonly`.
 */
export const listLabelsMeta: ActionMeta = {
  key: "gmail:list_labels",
  provider: "gmail",
  type: "list_labels",
  displayName: "List Labels",
  description:
    "List all Gmail labels on the connected mailbox (id, name, system/user type). Read-only — returns label metadata only, no message content. Requires the gmail.readonly scope.",
  category: "email",
  requiresIntegration: true,
  fields: [],
  outputs: [
    {
      name: "labels",
      type: "array",
      description:
        "Every label on the mailbox — each entry is { id, name, type } where type is 'system' | 'user' | null.",
    },
    { name: "count", type: "number", description: "labels.length convenience scalar." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Reads the mailbox label list — no provider-side mutation, no message content.",
};
