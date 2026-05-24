import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:get_temporary_link` —
 * Slice 3.DROPBOX-2. Returns an auth-free ~4h download URL wrapped as a
 * FileRef(kind=signed_url).
 */
export const GetTemporaryLinkConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
  })
  .strict();

export type GetTemporaryLinkConfig = z.infer<
  typeof GetTemporaryLinkConfigSchema
>;
