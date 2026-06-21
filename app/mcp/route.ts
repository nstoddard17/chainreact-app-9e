import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isPublicMcpEnabled } from "@/services/mcp/flags";
import { verifyMcpToken } from "@/services/mcp/verify";
import { rateLimitMcpRequest } from "@/services/mcp/rateLimit";
import { handleMcpRpc, type JsonRpcRequest } from "@/services/mcp/server";
import { recordMcpAudit } from "@/services/mcp/audit";
import { touchMcpTokenLastUsedServiceRole } from "@/repositories/accountMcpTokens";

/**
 * PUBLIC customer-facing MCP server — `https://mcp.chainreact.app/mcp`
 * (Slice 4.PUBLIC-MCP-8).
 *
 * The single entry point a customer's MCP-compatible LLM client connects to with a
 * ChainReact-issued bearer token (`Authorization: Bearer crmcp_…`). This is a
 * PRODUCT API surface — NOT the internal developer MCP (scripts/mcp), whose repo /
 * shell / diagnostics tools are never reachable here. Auth is the MCP token ALONE:
 * no Supabase cookie session, no active-account state.
 *
 * Wire shape (MCP Streamable HTTP):
 *   - POST a JSON-RPC request  → 200 application/json with one response object.
 *   - POST a JSON-RPC notification (no id) → 202 Accepted, empty body.
 *   - GET → 405 (no server-initiated SSE stream offered).
 *   - OPTIONS → 204.
 *
 * Per-request gate (every step fails CLOSED + OPAQUE — failures collapse to a
 * generic 401/404 with no oracle):
 *   1. Flag gate            → 404 if OFF (no token lookup; the surface is dark).
 *   2. verifyMcpToken       → token valid + not revoked + not expired + the minter
 *                             is STILL an account member (rules a/b/c). Any failure
 *                             → opaque 401.
 *   3. rate limit           → 429 + Retry-After (per token / per account).
 *   4. handleMcpRpc         → scope gate per tool (rule e) + account ownership
 *                             cross-check per resource (rule d), all inside the
 *                             dispatcher. Returns a safe, serialized result.
 *   5. audit                → one durable row per request (ids/outcome only).
 *   6. last_used_at         → best-effort, swallowed.
 *
 * No OAuth/integration token is read, returned, or decrypted. No raw token or
 * token_hash appears in any response or log.
 */

const BODY_BYTES_CAP = 64 * 1024;
const JSON_HEADERS = { "content-type": "application/json" } as const;

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: extraHeaders },
  );
}

/** Opaque 401 — every auth failure mode collapses here (no existence/active oracle). */
function unauthorized(): NextResponse {
  return jsonRpcError(null, -32001, "Unauthorized.", 401, {
    "www-authenticate": 'Bearer realm="chainreact-mcp"',
  });
}

/** Generic 404 — the dark-flag and not-found cases look identical. */
function notFound(): NextResponse {
  return jsonRpcError(null, -32601, "Not found.", 404);
}

export async function POST(request: Request): Promise<Response> {
  // 1. Feature flag — OFF → 404 BEFORE any token lookup (no oracle the surface exists).
  if (!isPublicMcpEnabled()) return notFound();

  // 2. Token auth (no session). Opaque 401 on every failure reason.
  const verified = await verifyMcpToken(request.headers.get("authorization"));
  if (!verified.ok) {
    console.info(JSON.stringify({ event: "mcp.auth_failed", reason: verified.reason }));
    return unauthorized();
  }

  // 3. Durable rate limit (per token / per account), BEFORE any body parse or tool
  //    dispatch. A denial returns 429 + Retry-After and reads no data.
  const rl = await rateLimitMcpRequest({
    tokenId: verified.tokenId,
    accountId: verified.accountId,
  });
  if (!rl.allowed) {
    await recordMcpAudit({
      accountId: verified.accountId,
      tokenId: verified.tokenId,
      tokenPrefix: verified.prefix,
      method: "*",
      tool: null,
      outcome: "rate_limited",
      reason: "rate_limited",
    });
    const headers: Record<string, string> = {};
    if (rl.retryAfterSeconds != null) headers["retry-after"] = String(rl.retryAfterSeconds);
    return jsonRpcError(null, -32002, "Rate limit exceeded.", 429, headers);
  }

  // 4. Body — JSON-RPC request, capped. Arrays (batches) unsupported (matches stdio).
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > BODY_BYTES_CAP) {
    return jsonRpcError(null, -32600, "Payload too large.", 413);
  }
  let parsed: unknown;
  try {
    const text = await request.text();
    if (text.length > BODY_BYTES_CAP) return jsonRpcError(null, -32600, "Payload too large.", 413);
    parsed = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return jsonRpcError(null, -32700, "Parse error.", 400);
  }
  if (Array.isArray(parsed)) {
    return jsonRpcError(null, -32600, "Batched requests are not supported.", 400);
  }
  if (!parsed || typeof parsed !== "object") {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC message.", 400);
  }

  const rpcReq = parsed as JsonRpcRequest;

  // 5. Dispatch against the public tool registry with the verified, account-scoped
  //    context. Scope + ownership checks live inside the dispatcher.
  const { response, audit } = await handleMcpRpc(rpcReq, {
    accountId: verified.accountId,
    userId: verified.userId,
    scopes: verified.scopes,
  });

  // 6. Audit (durable + structured log), best-effort. Never blocks the response on a
  //    failed write (the recorder is fail-open).
  if (audit) {
    await recordMcpAudit({
      accountId: verified.accountId,
      tokenId: verified.tokenId,
      tokenPrefix: verified.prefix,
      method: audit.method,
      tool: audit.tool,
      outcome: audit.outcome,
      reason: audit.reason,
    });
  }

  // 7. last_used_at — best-effort, throttled in SQL, errors swallowed.
  try {
    await touchMcpTokenLastUsedServiceRole({ tokenId: verified.tokenId });
  } catch {
    // intentionally ignored
  }

  // Notification (no id) → 202 Accepted, empty body.
  if (response === null) {
    return new NextResponse(null, { status: 202 });
  }

  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (rpcReq.method === "initialize") {
    // Streamable HTTP session id (informational — the server is stateless).
    headers["mcp-session-id"] = randomUUID();
  }
  return new NextResponse(JSON.stringify(response), { status: 200, headers });
}

export function GET(): Response {
  // No server-initiated SSE stream at this endpoint.
  return jsonRpcError(null, -32601, "Method Not Allowed.", 405, { allow: "POST" });
}

export function OPTIONS(): Response {
  return new NextResponse(null, { status: 204, headers: { allow: "POST" } });
}
