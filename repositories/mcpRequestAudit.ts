import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { createClient } from "@/utils/supabase/server";

/**
 * Repository for `mcp_request_audit` (Slice 4.PUBLIC-MCP-2).
 *
 * Append-only audit trail for the public MCP server. Writes are service-role (the
 * public route has no user session). Reads go through the SSR-cookie client and are
 * RLS-gated to account members (display-only fields).
 *
 * NO-LEAK INVARIANT: this layer only ever writes IDENTIFIERS + OUTCOMES. The insert
 * shape has no field for tool arguments, tool results, tokens, hashes, or row
 * content — the schema simply cannot hold them.
 */

export type McpAuditOutcome =
  | "ok"
  | "denied"
  | "not_found"
  | "rate_limited"
  | "error"
  | "unauthorized";

export interface McpAuditInsert {
  accountId: string;
  /** Nullable: an unauthorized request has no resolved token. */
  tokenId: string | null;
  /** Non-secret prefix snapshot; null when unauthorized. */
  tokenPrefix: string | null;
  method: string;
  /** Tool name for tools/call; null otherwise. */
  tool: string | null;
  outcome: McpAuditOutcome;
  /** Short, non-secret machine reason. Never a raw error / token / row content. */
  reason: string | null;
}

export interface McpAuditRecord {
  id: string;
  accountId: string;
  tokenId: string | null;
  tokenPrefix: string | null;
  method: string;
  tool: string | null;
  outcome: McpAuditOutcome;
  reason: string | null;
  createdAt: string;
}

interface McpAuditRow {
  id: string;
  account_id: string;
  token_id: string | null;
  token_prefix: string | null;
  method: string;
  tool: string | null;
  outcome: McpAuditOutcome;
  reason: string | null;
  created_at: string;
}

function rowToRecord(row: McpAuditRow): McpAuditRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    tokenId: row.token_id,
    tokenPrefix: row.token_prefix,
    method: row.method,
    tool: row.tool,
    outcome: row.outcome,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

/** Service-role insert of one audit row. */
export async function insertMcpAuditServiceRole(input: McpAuditInsert): Promise<void> {
  const supabase = getServiceRoleClient(
    `mcp_request_audit: insert ${input.accountId}/${input.method}`,
  );
  const { error } = await supabase.from("mcp_request_audit").insert({
    account_id: input.accountId,
    token_id: input.tokenId,
    token_prefix: input.tokenPrefix,
    method: input.method,
    tool: input.tool,
    outcome: input.outcome,
    reason: input.reason,
  });
  if (error) {
    throw new Error(`mcp_request_audit.insertMcpAuditServiceRole failed: ${error.message}`);
  }
}

export interface ListMcpAuditOptions {
  /** Defaults to 50, capped at 200. */
  limit?: number;
}

/**
 * List an account's recent MCP audit rows, newest first. RLS-gated to account
 * members via the SSR-cookie client — the caller must already be authenticated as a
 * member (the management route gates owner/admin upstream).
 */
export async function listMcpAuditByAccount(
  accountId: string,
  opts: ListMcpAuditOptions = {},
): Promise<readonly McpAuditRecord[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 50, 200);
  const { data, error } = await supabase
    .from("mcp_request_audit")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`mcp_request_audit.listMcpAuditByAccount failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as McpAuditRow));
}
