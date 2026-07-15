import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:set_first_comment` (EDEN-6). Reversible pre-publish automation. */
export const edenSetFirstCommentMeta: ActionMeta = {
  key: "eden:set_first_comment",
  provider: "eden",
  type: "set_first_comment",
  displayName: "Set First Comment",
  description:
    "Attach (or clear) the auto first-comment Eden posts right after a draft/scheduled post publishes — e.g. a 'link in bio' or source. Optionally hold it until a like threshold or a fixed delay.",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    {
      name: "postId",
      label: "Scheduled post",
      description: "The draft or scheduled post to attach the first comment to. Pick from your queue, or paste a post id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:scheduled_posts",
      allowManualEntry: true,
      placeholder: "Select a post, or paste a post id",
    },
    {
      name: "comment",
      label: "First comment",
      description: "The comment text posted right after publish. Leave empty to remove an existing first comment.",
      type: "textarea",
      required: false,
      placeholder: "Link in bio 👇",
    },
    {
      name: "afterLikes",
      label: "Post after likes",
      description: "Optional. Hold the comment until the post reaches this many likes. Cannot be combined with a delay.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true },
      placeholder: "50",
    },
    {
      name: "delayMinutes",
      label: "Delay (minutes)",
      description: "Optional. Wait this many minutes after publish before posting the comment. Cannot be combined with a like threshold.",
      type: "number",
      required: false,
      numeric: { min: 0, integer: true },
      placeholder: "5",
    },
  ],
  outputs: [
    { name: "postId", type: "string", description: "The post the first comment was set on." },
    { name: "status", type: "string", description: "Provider status of the post, or null.", nullable: true },
    { name: "hasFirstComment", type: "boolean", description: "True when a comment was set, false when cleared." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 46,
  riskLevel: "medium",
  riskDescription: "Sets recipient-visible follow-up content on a post. Reversible while the post has not published.",
};
