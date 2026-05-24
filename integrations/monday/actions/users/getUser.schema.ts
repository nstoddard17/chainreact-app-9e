import { z } from "zod";

/**
 * Resolved-config schema for the Monday `get_user` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field name preserved:
 *   - `userId` (required) — the Monday user id to fetch.
 */
export const GetUserConfigSchema = z
  .object({
    userId: z
      .string({ required_error: "userId is required." })
      .min(1, "userId is required."),
  })
  .strict();

export type GetUserConfig = z.infer<typeof GetUserConfigSchema>;
