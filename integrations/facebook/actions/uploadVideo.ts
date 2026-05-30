import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fetchFileBytes } from "@/core/files/fetchFileBytes";
import { getFileRefSizeGuidance } from "@/core/files/limits";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { videosUpload } from "@/integrations/_shared/facebook/api/videosUpload";
import { FacebookUploadConfigError } from "@/integrations/_shared/facebook/errors";
import { buildWorkflowFilesStorageAdapter } from "@/integrations/_shared/facebook/storageAdapter";
import { UploadVideoConfigSchema } from "./uploadVideo.schema";

/**
 * Facebook `upload_video` — Slice 3.FACEBOOK-2 (FileRef consumer).
 *
 * Resolves the `video` FileRef to bytes, then SIMPLE (non-resumable)
 * multipart upload to `POST /{pageId}/videos`. Large/long videos need
 * Graph's chunked `upload_session` flow (DEFERRED — FACEBOOK-N); the
 * `FILE_REF_SIZE_GUIDANCE.facebook` advisory + Graph's own cap bound this.
 * Same FileRef arms as `upload_photo` (`provider_url` rejected). Medium
 * risk. Output: metadata only — never bytes.
 */
export const uploadVideo: ActionHandler = async (input) => {
  const config = UploadVideoConfigSchema.parse(input.config);

  if (config.video.kind === "provider_url") {
    throw new FacebookUploadConfigError(
      "provider_url_unsupported",
      "Facebook upload_video does not support FileRef(kind=provider_url).",
      "Stage bytes first via a download/staging action which yields a FileRef(kind=v2_storage), then pass that ref to upload_video.",
    );
  }

  const storage =
    config.video.kind === "v2_storage"
      ? buildWorkflowFilesStorageAdapter(
          `facebook:upload_video run=${input.runId} node=${input.nodeId}`,
        )
      : undefined;

  const fetched = await fetchFileBytes(config.video, { storage });

  const guidance = getFileRefSizeGuidance("facebook");
  if (fetched.sizeBytes > guidance) {
    console.warn(
      JSON.stringify({
        event: "facebook.upload_video.size_exceeds_guidance",
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
      return videosUpload({
        pageAccessToken,
        pageId: config.pageId,
        bytes: fetched.bytes,
        filename: fetched.name,
        contentType: fetched.mimeType,
        ...(config.title !== undefined && { title: config.title }),
        ...(config.description !== undefined && { description: config.description }),
        published: config.published,
      });
    },
  });

  return {
    output: {
      videoId: result.id,
      pageId: config.pageId,
      published: config.published,
    },
  };
};
