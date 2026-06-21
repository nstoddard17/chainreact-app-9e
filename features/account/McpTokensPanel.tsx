/**
 * Compatibility re-export (PUBLIC-MCP UI cleanup slice).
 *
 * The MCP-token panel was split into focused components under `./mcp/`. This file
 * preserves the original import path (`@/features/account/McpTokensPanel`) used by
 * `DeveloperSection` and the tests — no behavior change.
 */
export {
  McpTokensPanel,
  type McpTokensPanelProps,
} from "./mcp/McpTokensPanel";
