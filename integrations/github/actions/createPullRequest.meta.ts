import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_pull_request`.
 *
 * Mirrors `createPullRequest.schema.ts`. `base` is optional — the
 * handler auto-detects the repo's default branch when blank (PR-G6).
 * The field description spells this out so authors know leaving it
 * blank is safe (no silent fallback to literal 'main').
 *
 * `head` accepts cross-repo notation `fork-owner:branch`.
 *
 * RESOLVERS-1: `head` / `base` are `github:branches` comboboxes
 * (dependsOn `repository`) with manual entry preserved — cross-repo
 * heads and beyond-the-page branches stay typeable.
 */
export const createPullRequestMeta: ActionMeta = {
  key: "github:create_pull_request",
  provider: "github",
  type: "create_pull_request",
  displayName: "Create Pull Request",
  description:
    "Open a pull request between two branches. Leave the base blank to auto-target the repository's default branch.",
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
      description: "Pull request title.",
      type: "text",
      required: true,
    },
    {
      name: "head",
      label: "Head Branch",
      description:
        "Branch with your changes. Pick from the repository's branches, or type a name — cross-repo notation ('fork-owner:branch') is also accepted.",
      type: "combobox",
      optionsSource: "github:branches",
      dependsOn: "repository",
      allowManualEntry: true,
      required: true,
      placeholder: "feature/widget",
    },
    {
      name: "base",
      label: "Base Branch",
      description:
        "Branch you want the changes merged into. When blank, auto-detected from the repository's default branch.",
      type: "combobox",
      optionsSource: "github:branches",
      dependsOn: "repository",
      allowManualEntry: true,
      required: false,
      placeholder: "main",
    },
    {
      name: "body",
      label: "Body",
      description: "Optional pull request description (Markdown).",
      type: "textarea",
      required: false,
    },
    {
      name: "draft",
      label: "Draft",
      description: "When true, opens the PR in draft state.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "pullRequestId", type: "number", description: "GitHub's internal PR id." },
    { name: "pullRequestNumber", type: "number", description: "Per-repository PR number (URL number)." },
    { name: "title", type: "string" },
    { name: "body", type: "string" },
    { name: "state", type: "string", description: "'open' or 'closed'." },
    { name: "draft", type: "boolean" },
    { name: "url", type: "string" },
    { name: "repository", type: "string" },
    { name: "head", type: "string", description: "Resolved head branch ref." },
    { name: "base", type: "string", description: "Resolved base branch ref (auto-detected default branch if input was blank)." },
    { name: "createdAt", type: "string" },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
