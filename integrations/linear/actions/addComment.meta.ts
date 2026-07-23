// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder-facing metadata for `linear:add_comment`. */
export const addCommentMeta: ActionMeta = {
  key: "linear:add_comment",
  provider: "linear",
  type: "add_comment",
  displayName: "Add Comment",
  description: "Add a Markdown comment to a Linear issue (by ID or identifier, e.g. LIN-123). Reply to an existing thread via the Advanced parent comment field.",
  category: "developer",
  requiresIntegration: true,
  fields: [
    {
      name: "issueId",
      label: "Issue",
      description: "Issue ID or identifier (e.g., LIN-123) (provide exactly one parent)",
      type: "text",
      required: true,
    },
    {
      name: "parentId",
      label: "Parent comment",
      description: "Reply under an existing comment (comment ID). Leave empty for a top-level comment.",
      type: "text",
      required: false,
      advanced: true,
    },
    {
      name: "body",
      label: "Body",
      description: "Content as Markdown. Do not escape the string — use literal newlines and special characters, not escape sequences. To mention a user, use @displayName (e.g., @johndoe)",
      type: "textarea",
      required: true,
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "The new comment's unique ID.",
    },
    {
      name: "body",
      type: "string",
      description: "The comment text (Markdown).",
    },
    {
      name: "createdAt",
      type: "string",
      description: "When the comment was created (ISO-8601 UTC).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
};
