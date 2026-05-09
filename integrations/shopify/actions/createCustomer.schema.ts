import { z } from "zod";

/**
 * `create_customer` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/createCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createCustomer.ts).
 *
 * Q11 — `send_welcome_email` REQUIRED with NO default. V1 defaulted
 * to `false` ([V1 shopify/index.ts:1387](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L1387)) — even though
 * the false default is the safer choice, the workflow author still
 * shouldn't be guessing about a customer-facing email. Slice 12 fix
 * during port: explicit choice required.
 *
 * Maps to Shopify's REST `customer.send_email_welcome` field at the
 * wire layer. The schema-side name `send_welcome_email` matches V1's
 * manifest field name; the wrapper does the rename to the wire shape.
 */
export const CreateCustomerConfigSchema = z
  .object({
    email: z.string().email(),
    /** Q11 consent gate — required. */
    send_welcome_email: z.boolean(),
    first_name: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    tags: z.string().min(1).optional(),
  })
  .strict();

export type CreateCustomerConfig = z.infer<typeof CreateCustomerConfigSchema>;
