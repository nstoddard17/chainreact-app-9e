import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook `new_email` trigger's
 * filter fields.
 *
 * Outlook Mail 2.3 Commit 2 — D-OM3 V1-parity filter expansion. Slice 6
 * shipped `new_email` with zero filter config; 2.3 ports all 5 V1 filters:
 *
 *   - `folder` (subscription-resource routing — handled in activate.ts)
 *   - `from` (receive-time exact-match on sender)
 *   - `subject` (receive-time, gated by `subjectExactMatch`)
 *   - `subjectExactMatch` (default true — V1 default preserved)
 *   - `hasAttachment` (enum, default "any" — V1 default preserved)
 *   - `importance` (enum, default "any" — V1 default preserved)
 *
 * This schema operates on the FILTER SUBSET of `trigger_resources.config`,
 * not the full config row. The caller (receive.ts) extracts the filter
 * keys before parsing so subscription state (`subscriptionId`,
 * `clientState`, `resource`, `expiresAt`, `type`) doesn't conflict with
 * strict-mode rejection.
 *
 * V1 defaults preserved per D-OM3:
 *   - `subjectExactMatch: true` — exact (case-insensitive) match by default.
 *   - `hasAttachment: "any"` — no attachment filtering by default.
 *   - `importance: "any"` — no importance filtering by default.
 *
 * Slice 6 zero-filter workflows: every filter field has a default OR is
 * `.optional()`, so an empty object parses cleanly. Backward compatible.
 *
 * Strict mode rejects unknown fields — keeps drift visible at parse time
 * if someone accidentally extends the trigger config with a typo.
 */
export const NewEmailTriggerFilterSchema = z
  .object({
    /** Optional. When set, activate routes subscription to /me/mailFolders/{folder}/messages. */
    folder: z.string().min(1).optional(),
    /** Optional. Receive-time exact-match on `email.from?.emailAddress?.address`. */
    from: z.string().min(1).optional(),
    /** Optional. Receive-time match against `email.subject`. */
    subject: z.string().optional(),
    /**
     * When true (V1 default), `subject` is matched case-insensitively
     * for exact equality. When false, substring (case-insensitive).
     */
    subjectExactMatch: z.boolean().default(true),
    /** "any" → no filter; "yes" → require attachment; "no" → require no attachment. */
    hasAttachment: z.enum(["any", "yes", "no"]).default("any"),
    /** "any" → no filter; otherwise require matching importance level. */
    importance: z
      .enum(["any", "high", "normal", "low"])
      .default("any"),
  })
  .strict();

export type NewEmailTriggerFilter = z.infer<
  typeof NewEmailTriggerFilterSchema
>;

/**
 * Filter-only field allowlist — used by receive.ts to extract only the
 * filter subset of a trigger row's `config` object before schema parse.
 * Subscription state keys (`subscriptionId`, `clientState`, etc.) live
 * in the same record but are NOT filter inputs.
 */
export const NEW_EMAIL_FILTER_FIELDS = [
  "folder",
  "from",
  "subject",
  "subjectExactMatch",
  "hasAttachment",
  "importance",
] as const;

/**
 * Extract the filter subset from a full trigger config record so the
 * strict schema's unknown-keys check doesn't trip on subscription state.
 *
 * Returns a fresh object; undefined values are dropped so Zod's defaults
 * fire correctly (Zod treats `undefined` as "missing" for default
 * application, but explicitly-passed `undefined` still triggers
 * .optional() — both paths converge here).
 */
export function extractNewEmailFilterFields(
  config: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of NEW_EMAIL_FILTER_FIELDS) {
    const v = config[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
