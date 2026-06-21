/**
 * Public-MCP rollout flag (Slice 4.PUBLIC-MCP).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/apiKeys/flags.ts.
 *
 * Gates the PUBLIC MCP endpoint (`app/mcp/route.ts`). When OFF the endpoint is a
 * 404 BEFORE any token lookup — no oracle that the surface exists. Token
 * management (create/list/revoke) is NOT gated by this flag: owners can mint tokens
 * ahead of enabling the endpoint. Default OFF.
 */

export const PUBLIC_MCP_FLAG = "ENABLE_PUBLIC_MCP";

/** DEFAULT OFF. When false, the public MCP route is unreachable (404). */
export function isPublicMcpEnabled(): boolean {
  return process.env[PUBLIC_MCP_FLAG] === "true";
}
