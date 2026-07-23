// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import type { ActionHandler } from "@/services/execution/handlers/types";
import { executeMcpTool } from "@/integrations/_shared/mcp/executeTool";
import { UpdateIssueConfigSchema } from "./updateIssue.schema";

/**
 * `linear:update_issue` — Update Issue.
 * Validates the pre-resolved config against the strict schema, then calls
 * the provider through the shared executor with the certification-pinned
 * tool schema hash (drift fails closed) and the bounded output spec.
 */
export const updateIssue: ActionHandler = async (input) => {
  const config = UpdateIssueConfigSchema.parse(input.config);
  return executeMcpTool({
    provider: "linear",
    serverUrl: "https://mcp.linear.app/mcp",
    tool: "save_issue",
    accountId: input.accountId,
    args: config,
    pinnedSchemaHash: "57b5444fda895fee62ed0e08ccaaa1e9a438071edc5227f6fe7429fee6c04628",
    output: { kind: "text" },
    idempotent: false,
  });
};
