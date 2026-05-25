import { z } from "zod";

/**
 * `find_payment_intent` action schema.
 *
 * Stripe 2.1 Commit 5 — direct id lookup only.
 *
 * V1 (`lib/workflows/actions/stripe/findPaymentIntent.ts`) hits
 * `GET /v1/payment_intents/{id}` with no list / search fallback.
 * V2 mirrors that surface — no list-by-customer in V1 (parity-stripe
 * M6 row: "Single-id lookup only; no list-by-customer in V1").
 *
 * Returns `{ found: false, paymentIntent: null }` on 404 — does NOT
 * throw NotFoundError. Same "find" semantic as `find_customer` /
 * `find_subscription`.
 *
 * V1 patterns deliberately NOT ported (parity-stripe §8):
 *   - **Raw `expand` passthrough:** V1 doesn't have it; V2 rejects.
 *   - **`search` / `list` fields:** V1 only does direct id lookup;
 *     V2 schema rejects unknown fields via `.strict()`.
 */
export const FindPaymentIntentConfigSchema = z
  .object({
    paymentIntentId: z.string().min(1, "paymentIntentId is required"),
  })
  .strict();

export type FindPaymentIntentConfig = z.infer<typeof FindPaymentIntentConfigSchema>;
