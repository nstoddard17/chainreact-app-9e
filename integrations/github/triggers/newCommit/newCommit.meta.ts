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
      description:
        "Repository to watch. Pick from your accessible repositories, or type an `owner/repo` (e.g. `octocat/hello-world`).",
      type: "combobox",
      optionsSource: "github:repos",
      allowManualEntry: true,
      required: true,
      placeholder: "Search repos or type owner/repo",
    },
    {
      name: "branch",
      label: "Branch (optional)",
      description:
        "When set, only fire for pushes to this branch — pick from the repository's branches or type a name. When blank, fires for every push to any branch.",
      type: "combobox",
      optionsSource: "github:branches",
      dependsOn: "repository",
      allowManualEntry: true,
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
    {
      name: "pusher",
      type: "object",
      description: "GitHub pusher metadata (name, email). Marked sensitive — carries the pusher's email (PII); redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    { name: "sender", type: "object", description: "GitHub sender metadata (login, id, avatar_url, type, etc.)." },
    {
      name: "head_commit",
      type: "object",
      description: "Head commit shape: id, message, url, timestamp, author{...}, added/modified/removed[]. Marked sensitive — author objects carry committer email (PII); commit message can carry secrets accidentally pasted into messages; redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    {
      name: "commits",
      type: "array",
      description: "All commits included in the push (in order). Marked sensitive — per-row author emails (PII) + commit messages; redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
    { name: "body", type: "object", description: "Raw GitHub event body for fields not surfaced above.", sensitive: true  },
  ],
  displayOrder: 10,
};
