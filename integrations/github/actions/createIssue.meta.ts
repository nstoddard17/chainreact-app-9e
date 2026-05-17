import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_issue`.
 *
 * Mirrors `createIssue.schema.ts`. `labels` and `assignees` are
 * `string[]` in the resolved-config schema; we surface them as text
 * fields with a "comma-separated" description so the v1 renderer
 * (Slice 3.1) can do the CSV split at submit time. A richer tag-list
 * field type will land if/when authors hit friction.
 *
 * `repository` is plain text for v1 — a future Slice 3.4 GitHubConfig
 * wrapper may swap in a combobox backed by an `/api/integrations/github/data/repos`
 * endpoint. Until that ships, the text input matches V1's behavior.
 */
export const createIssueMeta: ActionMeta = {
  key: "github:create_issue",
  provider: "github",
  type: "create_issue",
  displayName: "Create Issue",
  description:
    "Open a new issue on a GitHub repository. Supports labels, assignees, and milestone targeting.",
  category: "developer",
  requiresIntegration: true,
  fields: [
    {
      name: "repository",
      label: "Repository",
      description: "Target repository in 'owner/repo' format (e.g. 'octocat/hello-world').",
      type: "text",
      required: true,
      placeholder: "octocat/hello-world",
    },
    {
      name: "title",
      label: "Title",
      description: "Issue title.",
      type: "text",
      required: true,
    },
    {
      name: "body",
      label: "Body",
      description: "Optional issue body (Markdown).",
      type: "textarea",
      required: false,
    },
    {
      name: "labels",
      label: "Labels",
      description: "Optional comma-separated list of label names to attach (e.g. 'bug, priority-high').",
      type: "text",
      required: false,
      placeholder: "bug, priority-high",
    },
    {
      name: "assignees",
      label: "Assignees",
      description: "Optional comma-separated list of GitHub usernames to assign (e.g. 'octocat, hubot').",
      type: "text",
      required: false,
      placeholder: "octocat, hubot",
    },
    {
      name: "milestone",
      label: "Milestone",
      description: "Optional numeric milestone id (NOT title — GitHub uses the id).",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true, step: 1 },
    },
  ],
  outputs: [
    { name: "issueId", type: "number", description: "GitHub's internal issue id." },
    { name: "issueNumber", type: "number", description: "Per-repository issue number (the one shown in the URL)." },
    { name: "title", type: "string" },
    { name: "body", type: "string" },
    { name: "state", type: "string", description: "'open' or 'closed'." },
    { name: "url", type: "string", description: "Web URL to the issue." },
    { name: "repository", type: "string", description: "Echoes the input repository." },
    { name: "labels", type: "array", description: "Label names attached to the issue." },
    { name: "assignees", type: "array", description: "GitHub usernames assigned to the issue." },
    { name: "createdAt", type: "string", description: "ISO timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
};
