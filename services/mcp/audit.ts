import {
  insertMcpAuditServiceRole,
  type McpAuditInsert,
  type McpAuditOutcome,
} from "@/repositories/mcpRequestAudit";

/**
 * MCP request audit recorder (Slice 4.PUBLIC-MCP-2).
 *
 * Writes one durable `mcp_request_audit` row per public MCP request AND emits a
 * structured ops log line (the V2 console-audit convention). FAIL-OPEN: audit must
 * never break or delay the request — a DB failure is swallowed (logged), the
 * request proceeds. The caller should also not await this on the hot path beyond
 * what it needs.
 *
 * NO-LEAK: only identifiers + outcome + a short machine reason are passed through.
 * Tool arguments, tool results, raw tokens, hashes, and row content NEVER reach
 * here — the `McpAuditInsert` shape cannot carry them.
 */

export type { McpAuditOutcome };

export async function recordMcpAudit(input: McpAuditInsert): Promise<void> {
  // Structured ops log — ids/prefix/method/tool/outcome only. Never the raw token.
  console.info(
    JSON.stringify({
      event: "mcp.request",
      accountId: input.accountId,
      tokenId: input.tokenId,
      prefix: input.tokenPrefix,
      method: input.method,
      tool: input.tool,
      outcome: input.outcome,
      reason: input.reason,
    }),
  );

  try {
    await insertMcpAuditServiceRole(input);
  } catch (err) {
    // Fail-open: never let an audit-write failure surface to the client.
    console.warn(
      JSON.stringify({
        event: "mcp.audit_write_failed",
        accountId: input.accountId,
        method: input.method,
        message: err instanceof Error ? err.message : "unknown",
      }),
    );
  }
}
