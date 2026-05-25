import { z } from "zod";

/**
 * `create_custom_event` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/createEvent.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createEvent.ts).
 *
 * Track a custom event for a subscriber — used to drive Mailchimp
 * Automations / Customer Journeys. Mailchimp docs require:
 *   - `event_name` — lowercase, no spaces, ≤30 characters.
 *   - `properties` — flat string/string map (no nested objects).
 *
 * V2 enforces both at the schema layer:
 *   - `event_name` regex `/^[a-z][a-z0-9_]{0,29}$/` (starts with
 *     lowercase letter, then lowercase letters / digits / underscores,
 *     1-30 chars total).
 *   - `properties` typed as `z.record(z.string(), z.string())`.
 *
 * `occurred_at` is optional — Mailchimp defaults to "now" when
 * omitted. ISO-8601 format is required when supplied.
 *
 * Schema is strict — unknown fields throw.
 */
export const CreateCustomEventConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    event_name: z
      .string()
      .min(1)
      .max(30)
      .regex(
        /^[a-z][a-z0-9_]{0,29}$/,
        "Mailchimp event_name must be lowercase letters / digits / underscores, 1-30 chars, starting with a letter.",
      ),
    properties: z.record(z.string(), z.string()).optional(),
    occurred_at: z
      .string()
      .datetime({ offset: true, message: "occurred_at must be ISO-8601 datetime." })
      .optional(),
    is_syncing: z.boolean().optional(),
  })
  .strict();

export type CreateCustomEventConfig = z.infer<typeof CreateCustomEventConfigSchema>;
