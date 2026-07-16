import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_issue`.
 *
 * Mirrors `createIssue.schema.ts`. `labels` and `assignees` are
 * `string[]` in the resolved-config schema and are surfaced as
 * `string-array` chip fields so the renderer commits a real `string[]`
 * (CONFIG-UX sweep G — the earlier text fields committed a comma
 * string that failed the runtime schema; no CSV split ever existed in
 * the submit/execution path).
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
      description:
        "Target repository. Pick from your accessible repositories, or type an `owner/repo` (e.g. `octocat/hello-world`).",
      type: "combobox",
      optionsSource: "github:repos",
      allowManualEntry: true,
      required: true,
      placeholder: "Search repos or type owner/repo",
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
      description: "Labels to put on the issue. Press Enter after each one.",
      type: "string-array",
      required: false,
      placeholder: "bug",
    },
    {
      name: "assignees",
      label: "Assignees",
      description: "GitHub usernames to assign to the issue. Press Enter after each one.",
      type: "string-array",
      required: false,
      placeholder: "octocat",
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
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
