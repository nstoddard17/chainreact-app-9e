import { z } from "zod";

/**
 * Resolved-config schema for `dropbox:create_shared_link` —
 * Slice 3.DROPBOX-2. Creates a shared link for `path`; reuses the
 * existing link on conflict (D-DB8).
 */
export const CreateSharedLinkConfigSchema = z
  .object({
    path: z.string().min(1, "path is required."),
  })
  .strict();

export type CreateSharedLinkConfig = z.infer<
  typeof CreateSharedLinkConfigSchema
>;
