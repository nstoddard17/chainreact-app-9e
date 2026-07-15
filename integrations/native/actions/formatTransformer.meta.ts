import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:format_transformer`.
 *
 * Mirrors `formatTransformer.schema.ts`. `sourceFormat` defaults to
 * `"auto"` in the resolved-config schema; we surface that default in
 * the meta so the renderer pre-selects it.
 */
export const formatTransformerMeta: ActionMeta = {
  key: "native:format_transformer",
  provider: "native",
  type: "format_transformer",
  displayName: "Format Transformer",
  description:
    "Convert text between HTML, Markdown, Plain text, and Slack-flavored Markdown. Input up to 1 MiB.",
  category: "transform",
  requiresIntegration: false,
  fields: [
    {
      name: "content",
      label: "Content",
      description: "The text to transform. Up to 1 MiB.",
      type: "textarea",
      required: true,
    },
    {
      name: "sourceFormat",
      label: "Source Format",
      description: "What format the input text is in. Auto-detect usually gets this right — set it only if the result looks wrong.",
      type: "select",
      required: false,
      defaultValue: "auto",
      options: [
        { value: "auto", label: "Auto-detect" },
        { value: "html", label: "HTML" },
        { value: "markdown", label: "Markdown" },
        { value: "plain", label: "Plain text" },
      ],
    },
    {
      name: "targetFormat",
      label: "Target Format",
      description: "Format to convert the content into.",
      type: "select",
      required: true,
      options: [
        { value: "html", label: "HTML" },
        { value: "markdown", label: "Markdown" },
        { value: "plain", label: "Plain text" },
        { value: "slack_markdown", label: "Slack Markdown" },
      ],
    },
  ],
  outputs: [
    { name: "output", type: "string", description: "The transformed text." },
    { name: "sourceFormat", type: "string", description: "Detected or supplied source format." },
    { name: "targetFormat", type: "string", description: "The target format the output is in." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
