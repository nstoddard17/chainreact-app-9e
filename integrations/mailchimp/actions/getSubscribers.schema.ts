import { z } from "zod";

/**
 * `get_subscribers` action schema — Mailchimp 2.1 Commit 1.
 *
 * Single-page list-read for an audience's members. V1 reference:
 * [`lib/workflows/actions/mailchimp/getSubscribers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getSubscribers.ts).
 *
 * V2 adds:
 *   - Strict schema (V1 was untyped at runtime).
 *   - Bounded query-param allowlist — no arbitrary keys reach Mailchimp.
 *   - Bounded output (per-subscriber projection, totalItems + nextOffset).
 *   - No silent defaults beyond `count: 50` (Mailchimp clamps that at 100).
 *
 * Per Mailchimp 2.1 audit §11 + §12 R3: **single-page list only.** Workflow
 * authors compose pagination via `offset` + the `nextOffset` output field.
 * No auto-pagination — matches the audit's accepted scope.
 *
 * Sort-field allowlist matches Mailchimp's documented sortable fields for
 * `/lists/{id}/members`. Off-allowlist values are rejected — the wrapper
 * itself is pass-through but the schema is the choke point.
 */
export const GetSubscribersConfigSchema = z
  .object({
    listId: z.string().min(1, "listId is required"),
    /**
     * Filter by member status. Mirrors Mailchimp's enum. Omit to return
     * all statuses.
     */
    status: z
      .enum([
        "subscribed",
        "unsubscribed",
        "cleaned",
        "pending",
        "transactional",
        "archived",
      ])
      .optional(),
    /**
     * Page size. Defaults to 50. Mailchimp's hard cap is 1000; the
     * V2 wrapper clamps at 100 to keep payloads predictable.
     */
    count: z.number().int().min(1).max(100).optional(),
    /** Pagination offset — 0-based. */
    offset: z.number().int().min(0).optional(),
    /** ISO-8601 — members last changed AFTER this timestamp. */
    sinceLastChanged: z
      .string()
      .min(1)
      .optional(),
    /** ISO-8601 — members last changed BEFORE this timestamp. */
    beforeLastChanged: z
      .string()
      .min(1)
      .optional(),
    /**
     * Sort field — Mailchimp's documented members-sortable fields.
     * Off-allowlist values rejected at parse time.
     */
    sortField: z
      .enum(["timestamp_opt", "timestamp_signup", "last_changed"])
      .optional(),
    sortDir: z.enum(["ASC", "DESC"]).optional(),
  })
  .strict();

export type GetSubscribersConfig = z.infer<typeof GetSubscribersConfigSchema>;
