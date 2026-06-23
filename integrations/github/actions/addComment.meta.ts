import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:add_comment`.
 *
 * Mirrors `addComment.schema.ts`. Single action covers both issue and
 * pull-request comments — GitHub's comment API treats PRs as issues
 * for the comment endpoint. Description spells this out so authors
 * don't go looking for a separate `add_pr_comment` action.
 *
 * The schema accepts `issueNumber` as a number OR numeric string
 * (Zod `coerce.number()`). The renderer surfaces a `number` input;
 * variable references that resolve to strings still pass through the
 * coercion at handler dispatch.
 */
export const addCommentMeta: ActionMeta = {
  key: "github:add_comment",
  provider: "github",
  type: "add_comment",
  displayName: "Add Comment",
  description:
    "Add a comment to an issue or pull request. The same endpoint covers both — pass an issue number OR a PR number.",
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
      name: "issueNumber",
      label: "Issue or PR Number",
      description: "The per-repository number of the issue or pull request (the integer shown in the URL).",
      type: "number",
      required: true,
      numeric: { min: 1, integer: true, step: 1 },
    },
    {
      name: "body",
      label: "Body",
      description: "Comment body (Markdown).",
      type: "textarea",
      required: true,
    },
  ],
  outputs: [
    { name: "commentId", type: "number", description: "GitHub's internal comment id." },
    { name: "url", type: "string", description: "Web URL to the comment." },
    { name: "body", type: "string" },
    { name: "repository", type: "string" },
    { name: "issueNumber", type: "number" },
    { name: "createdAt", type: "string" },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
