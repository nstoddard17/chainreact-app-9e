import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:read_content` (EDEN-5). Read action — social post + optional transcript. */
export const edenReadContentMeta: ActionMeta = {
  key: "eden:read_content",
  provider: "eden",
  type: "read_content",
  displayName: "Read Social Post",
  description: "Read a social post by URL — content, metrics, and (optionally) its transcript.",
  category: "data",
  requiresIntegration: true,
  fields: [
    { name: "url", label: "Post URL", description: "The public URL of the post (YouTube, X, TikTok, etc.).", type: "text", required: true, placeholder: "https://…" },
    {
      name: "includeTranscript",
      label: "Include transcript",
      description: "Fetch the video/audio transcript when available (slower). Choose explicitly.",
      type: "boolean",
      required: true,
    },
    {
      name: "workspaceId",
      label: "Workspace",
      description: "Optional workspace context. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
  ],
  outputs: [
    { name: "status", type: "string", description: "Read status reported by Eden, or null.", nullable: true },
    { name: "platform", type: "string", description: "The post's platform, or null.", nullable: true },
    { name: "contentId", type: "string", description: "Eden's content id (UUID) for the post — usable with Save Post to Board.", nullable: true },
    {
      name: "post",
      type: "object",
      description: "Bounded post: { platform, contentType, contentUrl, title, body, publishedAt, durationSeconds, hashtags, language, metrics, transcript, transcriptStatus, creator }.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "low",
};
