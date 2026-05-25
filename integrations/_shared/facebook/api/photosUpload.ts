import { graphMultipart } from "./_request";

/**
 * Facebook `POST /{pageId}/photos` — Slice 3.FACEBOOK-2. Multipart upload
 * of photo bytes (the `source` field). `published=true` posts it to the
 * Page timeline. Uses a Page access token. Returns the photo id (+ the
 * created `post_id` when published).
 */
export interface FacebookPhotoResult {
  id: string;
  post_id?: string;
}

export async function photosUpload(input: {
  pageAccessToken: string;
  pageId: string;
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  caption?: string;
  published?: boolean;
}): Promise<FacebookPhotoResult> {
  const fields: Record<string, string | undefined> = {};
  if (input.caption !== undefined) fields.caption = input.caption;
  if (input.published !== undefined) fields.published = String(input.published);
  return graphMultipart<FacebookPhotoResult>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}/photos`,
    fields,
    file: {
      fieldName: "source",
      bytes: input.bytes,
      filename: input.filename,
      contentType: input.contentType,
    },
  });
}
