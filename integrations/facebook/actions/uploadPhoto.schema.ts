import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for `facebook:upload_photo` — Slice 3.FACEBOOK-2.
 * FileRef CONSUMER — `photo` is a FileRef whose bytes are uploaded
 * multipart to the Page. `published` (default true) posts it to the Page
 * timeline. Replaces V1's `photoFile` Supabase-bucket id.
 */
export const UploadPhotoConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    photo: FileRefSchema,
    caption: z.string().optional(),
    published: z.boolean().default(true),
  })
  .strict();

export type UploadPhotoConfig = z.infer<typeof UploadPhotoConfigSchema>;
