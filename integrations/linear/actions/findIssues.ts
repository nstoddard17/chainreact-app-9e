// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import type { ActionHandler } from "@/services/execution/handlers/types";
import { executeMcpTool } from "@/integrations/_shared/mcp/executeTool";
import { FindIssuesConfigSchema } from "./findIssues.schema";

/**
 * `linear:find_issues` — Find Issues.
 * Validates the pre-resolved config against the strict schema, then calls
 * the provider through the shared executor with the certification-pinned
 * tool schema hash (drift fails closed) and the bounded output spec.
 */
export const findIssues: ActionHandler = async (input) => {
  const config = FindIssuesConfigSchema.parse(input.config);
  return executeMcpTool({
    provider: "linear",
    serverUrl: "https://mcp.linear.app/mcp",
    tool: "list_issues",
    accountId: input.accountId,
    args: config,
    pinnedSchemaHash: "0140aeb2aa7575b1b2f6dbbaff9303b9a9d21ef6e9ed6e6ede06b367be25874f",
    output: { kind: "text" },
  });
};
