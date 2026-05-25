import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `delete_post` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * The one high-risk destructive action in the Facebook surface:
 * isDestructive + requiresConfirmation + riskLevel high. `pageId` → `postId`
 * cascade. Structural-only output (no deleted content echoed). Field names
 * mirror the FACEBOOK-2 runtime schema.
 */
export const facebookDeletePostMeta: ActionMeta = {
  key: "facebook:delete_post",
  provider: "facebook",
  type: "delete_post",
  displayName: "Delete Post",
  description:
    "Delete a Facebook Page post. This is permanent — ChainReact has no restore action. Double-check the selected post.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page that owns the post.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "postId",
      label: "Post",
      description:
        "The post to delete. Pick a Page first to load its recent posts. This deletes the post — confirm it carefully.",
      type: "combobox",
      optionsSource: "facebook:posts",
      dependsOn: "pageId",
      required: true,
      placeholder: "Select a post",
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "Always true on success." },
    { name: "deletedPostId", type: "string", description: "Id of the deleted post (echo of input)." },
    { name: "deletedAt", type: "string", description: "Client-synthesized deletion timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Deletes a Facebook Page post. ChainReact has no restore action — this is permanent. Confirm the selected post carefully.",
};
