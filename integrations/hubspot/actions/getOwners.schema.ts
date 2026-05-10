import { z } from "zod";

/**
 * `get_owners` action schema — Slice 13 Batch 2.
 *
 * Optional: `limit` (1-100), `email` (server-side exact filter),
 * `after` (cursor). All three may be omitted for "first 100 owners,
 * no filter."
 */
export const GetOwnersConfigSchema = z
  .object({
    limit: z.number().int().positive().max(100).optional(),
    email: z.string().email().optional(),
    after: z.string().min(1).optional(),
  })
  .strict();

export type GetOwnersConfig = z.infer<typeof GetOwnersConfigSchema>;
