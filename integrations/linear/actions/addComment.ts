// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import type { ActionHandler } from "@/services/execution/handlers/types";
import { executeMcpTool } from "@/integrations/_shared/mcp/executeTool";
import { AddCommentConfigSchema } from "./addComment.schema";

/**
 * `linear:add_comment` — Add Comment.
 * Validates the pre-resolved config against the strict schema, then calls
 * the provider through the shared executor with the certification-pinned
 * tool schema hash (drift fails closed) and the bounded output spec.
 */
export const addComment: ActionHandler = async (input) => {
  const config = AddCommentConfigSchema.parse(input.config);
  return executeMcpTool({
    provider: "linear",
    serverUrl: "https://mcp.linear.app/mcp",
    tool: "save_comment",
    accountId: input.accountId,
    args: config,
    pinnedSchemaHash: "29db7173131cd75c0fc5a71c7cbf0b36f817ca42ac51bb2237ff0f03a9c4a8f7",
    output: { kind: "text" },
  });
};
