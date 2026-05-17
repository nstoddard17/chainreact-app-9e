import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `github:create_gist`.
 *
 * Mirrors `createGist.schema.ts`. `isPublic` is REQUIRED with no
 * default — public gists are world-readable and search-indexed. The
 * schema enforces this; the meta marks the field required and the
 * description spells out the visibility consequence so authors don't
 * miss it.
 *
 * Multi-file gists are deferred — this action only supports a single
 * `filename` + `content` pair.
 */
export const createGistMeta: ActionMeta = {
  key: "github:create_gist",
  provider: "github",
  type: "create_gist",
  displayName: "Create Gist",
  description:
    "Create a single-file GitHub gist. Public gists are world-readable and search-indexed — choose visibility explicitly.",
  category: "developer",
  requiresIntegration: true,
  fields: [
    {
      name: "filename",
      label: "Filename",
      description: "Letters, digits, '.', '_', '-' only. Single-file gists only.",
      type: "text",
      required: true,
      placeholder: "snippet.ts",
    },
    {
      name: "content",
      label: "Content",
      description: "Body of the gist file.",
      type: "textarea",
      required: true,
    },
    {
      name: "description",
      label: "Description",
      description: "Optional gist description.",
      type: "text",
      required: false,
    },
    {
      name: "isPublic",
      label: "Public",
      description:
        "Required. When true, the gist is world-readable and search-indexed. When false, the gist is secret (URL-known-only).",
      type: "boolean",
      required: true,
    },
  ],
  outputs: [
    { name: "gistId", type: "string", description: "Gist id (hex)." },
    { name: "url", type: "string", description: "Web URL to the gist." },
    { name: "description", type: "string" },
    { name: "public", type: "boolean" },
    { name: "files", type: "array", description: "Filenames in the gist." },
    { name: "createdAt", type: "string" },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
};
