import { z } from "zod";

/** Config schema for `quickbooks:get_customer` — QUICKBOOKS-1. */
export const GetCustomerConfigSchema = z
  .object({
    customerId: z.string().min(1).max(64),
  })
  .strict();
export type GetCustomerConfig = z.infer<typeof GetCustomerConfigSchema>;
