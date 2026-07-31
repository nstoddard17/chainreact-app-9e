import { z } from "zod";

/**
 * Task + AI-credit usage summary. Mirrors the display-safe
 * `AccountUsageSummary` produced by `core/billing/accountUsageSummary.ts`
 * (the `/api/account/usage` brain) — a web-repo parity test parses that
 * function's real output with this schema. `available: false` means the
 * dimension was unreadable and the client renders an honest "unavailable",
 * never fake zeros. No plan ids, no Stripe anything, no ledger rows.
 */
export const MobileUsageDimensionSchema = z.object({
  available: z.boolean(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  /** Whole-number percent, 0–100 clamped. */
  percentUsed: z.number().int().min(0).max(100),
  nearLimit: z.boolean(),
  overLimit: z.boolean(),
  resetsAt: z.string().nullable(),
});
export type MobileUsageDimension = z.infer<typeof MobileUsageDimensionSchema>;

export const MobileUsageSummarySchema = z.object({
  billingMode: z.enum(["standard", "internal_free"]),
  internalFree: z.boolean(),
  tasks: MobileUsageDimensionSchema,
  aiCredits: MobileUsageDimensionSchema,
});
export type MobileUsageSummary = z.infer<typeof MobileUsageSummarySchema>;
