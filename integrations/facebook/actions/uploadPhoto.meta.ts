import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `upload_photo` ActionMeta — Slice 3.FACEBOOK-4. FileRef consumer.
 *
 * `photo` is a FileRef input (provider_url FileRefs are rejected at runtime —
 * stage bytes first). Uploads to the Page's default photo album; an album
 * picker is NOT wired because the FACEBOOK-2 runtime schema has no `albumId`
 * field (album select/create is a deferred follow-up). Field names mirror
 * the runtime schema exactly.
 */
export const facebookUploadPhotoMeta: ActionMeta = {
  key: "facebook:upload_photo",
  provider: "facebook",
  type: "upload_photo",
  displayName: "Upload Photo",
  description:
    "Upload a photo to a Facebook Page. Source is a FileRef from an upstream download/staging action. FileRef(kind=provider_url) is not supported — stage bytes first (e.g. gmail:get_attachment, dropbox:download_file).",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page to upload the photo to.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "photo",
      label: "Photo",
      description:
        "Upstream FileRef to upload. Insert a {{nodeId.file}} token from a producer (download/staging) action.",
      type: "file",
      required: true,
      placeholder: "Paste a {{...}} FileRef token",
    },
    {
      name: "caption",
      label: "Caption",
      description: "Optional caption for the photo.",
      type: "textarea",
      required: false,
      placeholder: "Add a caption…",
    },
    {
      name: "published",
      label: "Publish to timeline",
      description: "When on, the photo is posted to the Page timeline. When off, it's uploaded but unpublished.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
  ],
  outputs: [
    { name: "photoId", type: "string", description: "Id of the uploaded photo." },
    { name: "postId", type: "string", description: "Id of the associated Page post, or null when unpublished." },
    { name: "pageId", type: "string", description: "Id of the Page." },
    { name: "published", type: "boolean", description: "Whether the photo was published to the timeline." },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Uploads media to a Facebook Page (public when published). Recoverable by deleting the photo.",
};
