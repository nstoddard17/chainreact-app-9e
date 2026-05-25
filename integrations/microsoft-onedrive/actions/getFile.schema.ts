import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive get_file action.
 *
 * Returns DriveItem metadata + Graph's short-lived downloadUrl. Slice
 * 8 does NOT proxy the download body through the engine — workflow
 * authors who need the bytes consume the downloadUrl in a follow-up
 * node before the URL expires (~1h).
 *
 * `itemId` is required — Slice 8 does NOT silently fall back to "the
 * root" when the field is empty (V1 has that fallback in
 * findItemById; V2 makes the contract explicit).
 */
export const GetFileConfigSchema = z
  .object({
    itemId: z.string().min(1, "itemId is required."),
  })
  .strict();

export type GetFileConfig = z.infer<typeof GetFileConfigSchema>;
