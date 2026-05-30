import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fetchFileBytes } from "@/core/files/fetchFileBytes";
import { getFileRefSizeGuidance } from "@/core/files/limits";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { photosUpload } from "@/integrations/_shared/facebook/api/photosUpload";
import { FacebookUploadConfigError } from "@/integrations/_shared/facebook/errors";
import { buildWorkflowFilesStorageAdapter } from "@/integrations/_shared/facebook/storageAdapter";
import { UploadPhotoConfigSchema } from "./uploadPhoto.schema";

/**
 * Facebook `upload_photo` — Slice 3.FACEBOOK-2 (FileRef consumer).
 *
 * Resolves the `photo` FileRef to bytes via `fetchFileBytes`, then
 * multipart-uploads to `POST /{pageId}/photos`. Same consumer pattern as
 * `dropbox:upload_file` / `monday:add_file`:
 *   - `v2_storage` — bytes via the Supabase storage adapter.
 *   - `signed_url` — bytes via `fetchFileBytes`'s plain fetch.
 *   - `provider_url` — REJECTED (V2 has no cross-provider bearer fetch).
 * Bytes are fetched ONCE outside refresh-and-retry; only the upload retries
 * on 401. Medium risk. Output: metadata only — never bytes.
 */
export const uploadPhoto: ActionHandler = async (input) => {
  const config = UploadPhotoConfigSchema.parse(input.config);

  if (config.photo.kind === "provider_url") {
    throw new FacebookUploadConfigError(
      "provider_url_unsupported",
      "Facebook upload_photo does not support FileRef(kind=provider_url).",
      "Stage bytes first via a download/staging action (e.g. dropbox:download_file, gmail:get_attachment) which yields a FileRef(kind=v2_storage), then pass that ref to upload_photo.",
    );
  }

  const storage =
    config.photo.kind === "v2_storage"
      ? buildWorkflowFilesStorageAdapter(
          `facebook:upload_photo run=${input.runId} node=${input.nodeId}`,
        )
      : undefined;

  const fetched = await fetchFileBytes(config.photo, { storage });

  const guidance = getFileRefSizeGuidance("facebook");
  if (fetched.sizeBytes > guidance) {
    console.warn(
      JSON.stringify({
        event: "facebook.upload_photo.size_exceeds_guidance",
        runId: input.runId,
        nodeId: input.nodeId,
        actualSize: fetched.sizeBytes,
        guidance,
      }),
    );
  }

  const providerAccountId =
    input.triggerEvent.provider === "facebook"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "facebook",
    providerAccountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId: config.pageId,
      });
      return photosUpload({
        pageAccessToken,
        pageId: config.pageId,
        bytes: fetched.bytes,
        filename: fetched.name,
        contentType: fetched.mimeType,
        ...(config.caption !== undefined && { caption: config.caption }),
        published: config.published,
      });
    },
  });

  return {
    output: {
      photoId: result.id,
      postId: result.post_id ?? null,
      pageId: config.pageId,
      published: config.published,
    },
  };
};
