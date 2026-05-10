import { z } from "zod";

/**
 * Resolved-config schema for the Excel get_workbooks action.
 *
 * Lists `.xlsx` workbooks under the user's drive root. Slice 15 ships
 * the simplest discovery path — drive root + mime-type filter.
 *
 * `top` is Graph's $top page-size (1..1000; default 200 server-side).
 */
export const GetWorkbooksConfigSchema = z
  .object({
    top: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export type GetWorkbooksConfig = z.infer<typeof GetWorkbooksConfigSchema>;
