import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_branch`.
 *
 * Mirrors `createBranch.schema.ts`. PR-G6 extension to branch creation:
 * leaving `sourceBranch` blank auto-detects the repo's default branch;
 * NO silent fallback to literal 'main' (V1 bug fix). Field description
 * surfaces this contract for authors.
 *
 * Branch-name validation is strict — the handler refuses leading '-',
 * leading/trailing '/', trailing '.lock', and '..' sequences. The meta
 * description summarizes the allowed character set; the schema is the
 * authoritative rejecter on save.
 */
export const createBranchMeta: ActionMeta = {
  key: "github:create_branch",
  provider: "github",
  type: "create_branch",
  displayName: "Create Branch",
  description:
    "Create a new branch from a source branch. Leave the source blank to branch from the repository's default branch.",
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
      name: "branchName",
      label: "Branch Name",
      description:
        "Name of the new branch. Letters, digits, '.', '_', '/', '-' only. No leading '-' or '/'; no trailing '/' or '.lock'; no '..'.",
      type: "text",
      required: true,
      placeholder: "feature/widget",
    },
    {
      name: "sourceBranch",
      label: "Source Branch",
      description:
        "Branch to branch off of. When blank, auto-detected from the repository's default branch.",
      type: "text",
      required: false,
      placeholder: "main",
    },
  ],
  outputs: [
    { name: "ref", type: "string", description: "Full git ref (e.g. 'refs/heads/feature/widget')." },
    { name: "branchName", type: "string", description: "Just the branch name without the refs/heads/ prefix." },
    { name: "sha", type: "string", description: "Commit SHA the new branch points at." },
    { name: "repository", type: "string" },
    { name: "sourceBranch", type: "string", description: "Resolved source branch (auto-detected if input was blank)." },
    { name: "url", type: "string", description: "Web URL to the branch." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
