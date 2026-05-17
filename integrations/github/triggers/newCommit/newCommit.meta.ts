import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `github:new_commit`.
 *
 * Webhook-activated trigger. Activation creates one repo webhook
 * subscribed to GitHub's `push` event. Workflow author configures the
 * `repository` and an optional `branch` filter. Activation requires
 * `GITHUB_WEBHOOK_SECRET` (server env) — that's an infra concern, not
 * a builder-field concern.
 *
 * `payloadShape` mirrors the canonical `TriggerEvent` payload built by
 * `integrations/github/triggers/newCommit/normalize.ts`. The variable
 * picker (Slice 3.7) surfaces these as upstream fields for downstream
 * nodes (e.g. `{{trigger.payload.head_commit.message}}`).
 */
export const newCommitTriggerMeta: TriggerMeta = {
  key: "github:new_commit",
  provider: "github",
  type: "new_commit",
  displayName: "New Commit",
  description:
    "Fires when a push lands on the configured repository. Optionally filter to a single branch. Backed by a GitHub repo webhook subscribed to the push event.",
  category: "developer",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "repository",
      label: "Repository",
      description: "Repository to watch, in 'owner/repo' format.",
      type: "text",
      required: true,
      placeholder: "octocat/hello-world",
    },
    {
      name: "branch",
      label: "Branch (optional)",
      description: "When set, only fire for pushes to this branch. When blank, fires for every push to any branch.",
      type: "text",
      required: false,
      placeholder: "main",
    },
  ],
  payloadShape: [
    { name: "eventName", type: "string", description: "GitHub event name (e.g. 'push')." },
    { name: "deliveryId", type: "string", description: "X-GitHub-Delivery UUID; null on legacy paths." },
    { name: "hookId", type: "string", description: "GitHub webhook resource id; null when absent." },
    { name: "repository", type: "string", description: "'owner/repo' of the source repository." },
    { name: "owner", type: "string", description: "Repository owner login." },
    { name: "branch", type: "string", description: "Branch the push landed on (refs/heads/ prefix stripped)." },
    { name: "ref", type: "string", description: "Raw GitHub ref (e.g. 'refs/heads/main' or 'refs/tags/v1')." },
    { name: "before", type: "string", description: "Pre-push commit SHA." },
    { name: "after", type: "string", description: "Post-push commit SHA." },
    { name: "pusher", type: "object", description: "GitHub pusher metadata (name, email)." },
    { name: "sender", type: "object", description: "GitHub sender metadata (login, id, avatar_url, type, etc.)." },
    {
      name: "head_commit",
      type: "object",
      description: "Head commit shape: id, message, url, timestamp, author{...}, added/modified/removed[].",
    },
    { name: "commits", type: "array", description: "All commits included in the push (in order)." },
    { name: "body", type: "object", description: "Raw GitHub event body for fields not surfaced above." },
  ],
  displayOrder: 10,
};
