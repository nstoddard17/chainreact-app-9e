import { z } from "zod";

/**
 * `find_customer` action schema.
 *
 * XOR — exactly one of `customerId` or `email` is required.
 * Stripe's lookup-by-id is direct (`GET /v1/customers/{id}`); lookup
 * by email uses the list endpoint with `?email=...&limit=1` filter.
 *
 * V1 has both code paths (`findCustomer.ts:42-101`); V2 mirrors the
 * shape but enforces XOR at the schema layer (Q11 — no surprise
 * "both supplied — which wins?" semantics; surfacing the conflict
 * loudly at validation time).
 *
 * Returns `{ found: false, customer: null }` on no match — does NOT
 * throw NotFoundError. "Find" is semantically allowed-to-return-zero;
 * mirrors Slice 10 Airtable's `find_record` and Notion's findFirst
 * pattern.
 */
export const FindCustomerConfigSchema = z
  .object({
    customerId: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.customerId) !== Boolean(v.email),
    {
      message: "Provide exactly one of customerId or email.",
    },
  );

export type FindCustomerConfig = z.infer<typeof FindCustomerConfigSchema>;
