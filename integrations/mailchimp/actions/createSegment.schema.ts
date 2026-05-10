import { z } from "zod";

/**
 * `create_segment` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/createSegment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createSegment.ts).
 *
 * Two segment types exposed in Batch 1:
 *
 *   - `'static'` — manually-curated list of email members. Seed with
 *     `static_segment: ["a@b.com", ...]`. Empty array is allowed
 *     (creates an empty static segment).
 *   - `'saved'` — rule-based. Requires `conditions: [...]` plus
 *     `match: 'any' | 'all'` (default 'any' per Mailchimp).
 *
 * `mode` is REQUIRED (no default) — segments are not undo-able and
 * the wire shape differs significantly between the two modes; a
 * silent default would hide an important decision.
 *
 * For `static`, `static_emails` is optional (empty static segments
 * are legal). For `saved`, `conditions` is REQUIRED.
 *
 * Mailchimp's condition DSL is provider-specific (field/op/value).
 * V2 forwards verbatim — no cross-provider normalization. Each
 * condition entry must have `field` (string), `op` (string), and
 * `value` (string).
 *
 * Schema is strict — unknown fields throw.
 */

const ConditionSchema = z
  .object({
    field: z.string().min(1),
    op: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

const StaticModeSchema = z
  .object({
    audience_id: z.string().min(1),
    name: z.string().min(1),
    mode: z.literal("static"),
    static_emails: z.array(z.string().email()).optional(),
  })
  .strict();

const SavedModeSchema = z
  .object({
    audience_id: z.string().min(1),
    name: z.string().min(1),
    mode: z.literal("saved"),
    conditions: z.array(ConditionSchema).min(1),
    match: z.enum(["any", "all"]).optional(),
  })
  .strict();

export const CreateSegmentConfigSchema = z.discriminatedUnion("mode", [
  StaticModeSchema,
  SavedModeSchema,
]);

export type CreateSegmentConfig = z.infer<typeof CreateSegmentConfigSchema>;
