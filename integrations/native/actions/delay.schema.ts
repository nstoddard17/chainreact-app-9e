import { z } from "zod";

/**
 * Resolved-config schema for the native `delay` action.
 *
 * Per docs/rules/variable-resolver.md §"Engine pre-resolution (strict)":
 *   - The engine substitutes every `{{...}}` reference in config BEFORE
 *     dispatching the handler. The schema receives concrete values only.
 *   - The handler also re-parses with this schema for defense-in-depth.
 *
 * NPD-N6 (accepted): delay is **narrow scope only** in Phase 2.
 *   - `seconds` is required (Q11 — no silent default).
 *   - Integer 1..30 inclusive. No `unit` selector (V1 had minutes /
 *     hours / days). Unbounded / durable delay is deferred to Phase 6
 *     and requires pause/resume infrastructure (BullMQ / Inngest /
 *     equivalent) that V2 does not have today.
 *
 * The 30-second ceiling matches Vercel's default function execution
 * window. A workflow run that needs longer waits must compose multiple
 * scheduled triggers (Slice 2) or wait for the Phase 6 durable delay.
 */

export const DELAY_MAX_SECONDS = 30;

export const DelayConfigSchema = z
  .object({
    seconds: z.number().int().min(1).max(DELAY_MAX_SECONDS),
  })
  .strict();
export type DelayConfig = z.infer<typeof DelayConfigSchema>;
