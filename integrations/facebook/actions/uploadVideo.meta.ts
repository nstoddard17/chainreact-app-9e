import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `upload_video` ActionMeta — Slice 3.FACEBOOK-4. FileRef consumer.
 *
 * `video` is a FileRef input uploaded in a single (non-resumable) request,
 * so very large videos may not be supported. provider_url FileRefs are
 * rejected at runtime (stage bytes first). Field names mirror the FACEBOOK-2
 * runtime schema exactly.
 */
export const facebookUploadVideoMeta: ActionMeta = {
  key: "facebook:upload_video",
  provider: "facebook",
  type: "upload_video",
  displayName: "Upload Video",
  description:
    "Upload a video to a Facebook Page. Source is a FileRef from an upstream download/staging action; the video is uploaded in a single request, so very large files may not be supported. FileRef(kind=provider_url) is not supported — stage bytes first.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page to upload the video to.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "video",
      label: "Video",
      description:
        "Upstream FileRef to upload. Insert a {{nodeId.file}} token from a producer (download/staging) action.",
      type: "file",
      required: true,
      placeholder: "Paste a {{...}} FileRef token",
    },
    {
      name: "title",
      label: "Title",
      description: "Optional title for the video.",
      type: "text",
      required: false,
      placeholder: "Video title",
    },
    {
      name: "description",
      label: "Description",
      description: "Optional description for the video.",
      type: "textarea",
      required: false,
      placeholder: "Add a description…",
    },
    {
      name: "published",
      label: "Publish to timeline",
      description: "When on, the video is posted to the Page timeline. When off, it's uploaded but unpublished.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
  ],
  outputs: [
    { name: "videoId", type: "string", description: "Id of the uploaded video." },
    { name: "pageId", type: "string", description: "Id of the Page." },
    { name: "published", type: "boolean", description: "Whether the video was published to the timeline." },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Uploads media to a Facebook Page (public when published). Recoverable by deleting the video.",
};
