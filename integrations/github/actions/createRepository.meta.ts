import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_repository`.
 *
 * Mirrors `createRepository.schema.ts`. Per the schema docstring, V2
 * deliberately does NOT default `private` or `auto_init` at the schema
 * layer. `private` is REQUIRED in the meta with NO defaultValue
 * (CONFIG-UX sweep G, Q11 spirit): repository visibility is a
 * world-visible switch, so the author must choose explicitly instead
 * of riding GitHub's silent public default. The runtime schema keeps
 * it optional (existing runs unaffected); pre-existing saved configs
 * without `private` surface as needs-setup in the builder.
 *
 * `gitignore_template` / `license_template` are comboboxes seeded with
 * the template names already documented in this repo (schema/meta
 * examples), with `allowManualEntry` so any other GitHub catalog name
 * still works. A resolver backed by GitHub's `/gitignore/templates`
 * and `/licenses` endpoints may replace the static seeds later.
 */
export const createRepositoryMeta: ActionMeta = {
  key: "github:create_repository",
  provider: "github",
  type: "create_repository",
  displayName: "Create Repository",
  description:
    "Create a new GitHub repository under the authenticated user's account. Does NOT default to private — set `private` explicitly.",
  category: "developer",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Name",
      description: "Repository name. Letters, digits, '.', '_', '-' only. 1–100 characters.",
      type: "text",
      required: true,
      placeholder: "my-new-repo",
    },
    {
      name: "description",
      label: "Description",
      description: "Optional repository description.",
      type: "text",
      required: false,
    },
    {
      name: "private",
      label: "Private",
      description: "Choose who can see the repository: on = only invited collaborators, off = public to everyone.",
      type: "boolean",
      required: true,
    },
    {
      name: "auto_init",
      label: "Auto-initialize",
      description: "When true, GitHub creates an initial commit with an empty README so the repo is immediately clonable.",
      type: "boolean",
      required: false,
    },
    {
      name: "gitignore_template",
      label: "Gitignore Template",
      description:
        "Start the repo with a .gitignore for a language. Pick one, or type any GitHub template name (case-sensitive).",
      type: "combobox",
      required: false,
      options: [
        { value: "Node", label: "Node" },
        { value: "Python", label: "Python" },
        { value: "Go", label: "Go" },
      ],
      allowManualEntry: true,
      placeholder: "Node",
    },
    {
      name: "license_template",
      label: "License Template",
      description:
        "Start the repo with a license. Pick one, or type any license keyword GitHub supports.",
      type: "combobox",
      required: false,
      options: [
        { value: "mit", label: "MIT" },
        { value: "apache-2.0", label: "Apache 2.0" },
      ],
      allowManualEntry: true,
      placeholder: "mit",
    },
    {
      name: "homepage",
      label: "Homepage URL",
      description: "Optional homepage URL for the repository.",
      type: "text",
      required: false,
      placeholder: "https://example.com",
    },
  ],
  outputs: [
    { name: "repositoryId", type: "number", description: "GitHub's internal repo id." },
    { name: "name", type: "string", description: "Final repository name (server-side may normalize)." },
    { name: "fullName", type: "string", description: "'owner/name' identifier." },
    { name: "description", type: "string" },
    { name: "private", type: "boolean" },
    { name: "url", type: "string", description: "Web URL." },
    { name: "cloneUrl", type: "string", description: "HTTPS clone URL." },
    { name: "sshUrl", type: "string", description: "SSH clone URL." },
    { name: "defaultBranch", type: "string", description: "GitHub-assigned default branch name (e.g. 'main')." },
    { name: "homepage", type: "string" },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a new GitHub repository — visible to org and harder to remove than a branch or issue.",
};
