import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_repository`.
 *
 * Mirrors `createRepository.schema.ts`. Per the schema docstring, V2
 * deliberately does NOT default `private` or `auto_init` — authors
 * must opt in. The meta surfaces both as optional booleans with no
 * `defaultValue` so the renderer doesn't fake a default.
 *
 * `gitignore_template` and `license_template` have well-known enum
 * values (e.g. 'Node', 'Python' / 'mit', 'apache-2.0') but enumerating
 * them in the meta would risk drift from GitHub's catalog. Text input
 * for v1; a Slice 3.4 wrapper may add comboboxes backed by GitHub's
 * `/gitignore/templates` and `/licenses` endpoints later.
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
      description: "When true, the repository is only visible to invited collaborators. GitHub defaults to public when omitted.",
      type: "boolean",
      required: false,
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
      description: "Optional gitignore template name (e.g. 'Node', 'Python', 'Go'). Case-sensitive.",
      type: "text",
      required: false,
      placeholder: "Node",
    },
    {
      name: "license_template",
      label: "License Template",
      description: "Optional SPDX license keyword (e.g. 'mit', 'apache-2.0').",
      type: "text",
      required: false,
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
};
