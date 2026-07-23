// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import type { ActionHandler } from "@/services/execution/handlers/types";
import { executeMcpTool } from "@/integrations/_shared/mcp/executeTool";
import { CreateIssueConfigSchema } from "./createIssue.schema";
import { linearPinnedToolSchemas } from "./_pinned";

/**
 * `linear:create_issue` — Create Issue.
 * Validates the pre-resolved config against the strict schema, then calls
 * the provider through the shared executor with the certification-pinned
 * tool schema (drift is classified; breaking change fails closed) and the
 * bounded output spec.
 */
const pinned = linearPinnedToolSchemas["save_issue"]!;

export const createIssue: ActionHandler = async (input) => {
  const config = CreateIssueConfigSchema.parse(input.config);
  return executeMcpTool({
    provider: "linear",
    serverUrl: "https://mcp.linear.app/mcp",
    tool: "save_issue",
    accountId: input.accountId,
    args: config,
    pinnedSchema: pinned.inputSchema,
    pinnedSchemaHash: pinned.schemaHash,
    output: { kind: "text" },
    idempotent: false,
  });
};
