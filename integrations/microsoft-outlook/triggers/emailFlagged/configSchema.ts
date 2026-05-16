import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook `email_flagged`
 * trigger's filter fields.
 *
 * Outlook Mail 2.3 Commit 3 — D-OM3 V1-parity. V1 ships ONE filter
 * field on this trigger: `folder` (optional).
 *
 * Field semantics:
 *   - `folder`: when set, activate routes subscription to
 *     /me/mailFolders/{folder}/messages. When absent, watches all
 *     folders via /me/messages.
 *
 * D-OM4 — V1-parity over-fire. No prior-state cache, no
 * unflagged-to-flagged transition detection. The receive route applies
 * a `flag.flagStatus === "flagged"` check; any message update that
 * leaves the message in a flagged state fires the trigger. Subject
 * edits / body updates on an already-flagged message will re-fire.
 *
 * Strict mode rejects unknown fields.
 */
export const EmailFlaggedTriggerFilterSchema = z
  .object({
    folder: z.string().min(1).optional(),
  })
  .strict();

export type EmailFlaggedTriggerFilter = z.infer<
  typeof EmailFlaggedTriggerFilterSchema
>;

export const EMAIL_FLAGGED_FILTER_FIELDS = ["folder"] as const;

export function extractEmailFlaggedFilterFields(
  config: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EMAIL_FLAGGED_FILTER_FIELDS) {
    const v = config[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
