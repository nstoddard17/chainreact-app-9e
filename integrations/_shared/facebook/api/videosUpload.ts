import { graphMultipart } from "./_request";

/**
 * Facebook `POST /{pageId}/videos` — Slice 3.FACEBOOK-2. SIMPLE
 * (non-resumable) multipart upload of video bytes (the `source` field) —
 * suitable for typical short videos. Large/long videos require Graph's
 * chunked `upload_session` flow, which is DEFERRED (FACEBOOK-N); the
 * advisory `FILE_REF_SIZE_GUIDANCE.facebook` bound + Graph's own cap apply.
 * Uses a Page access token.
 */
export interface FacebookVideoResult {
  id: string;
}

export async function videosUpload(input: {
  pageAccessToken: string;
  pageId: string;
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  title?: string;
  description?: string;
  published?: boolean;
}): Promise<FacebookVideoResult> {
  const fields: Record<string, string | undefined> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.description !== undefined) fields.description = input.description;
  if (input.published !== undefined) fields.published = String(input.published);
  return graphMultipart<FacebookVideoResult>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}/videos`,
    fields,
    file: {
      fieldName: "source",
      bytes: input.bytes,
      filename: input.filename,
      contentType: input.contentType,
    },
  });
}
