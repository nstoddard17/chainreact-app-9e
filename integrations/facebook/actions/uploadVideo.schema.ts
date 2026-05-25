import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";

/**
 * Resolved-config schema for `facebook:upload_video` — Slice 3.FACEBOOK-2.
 * FileRef CONSUMER — `video` bytes are uploaded multipart (simple, non-
 * resumable upload). Replaces V1's `videoFile` Supabase-bucket id.
 */
export const UploadVideoConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    video: FileRefSchema,
    title: z.string().optional(),
    description: z.string().optional(),
    published: z.boolean().default(true),
  })
  .strict();

export type UploadVideoConfig = z.infer<typeof UploadVideoConfigSchema>;
