/**
 * Internal MCP server — pure HTTP → JSON-RPC bridge (Stage 1.5).
 *
 * This is the transport-agnostic core of the HTTP front door. It takes a parsed
 * request (method, path, headers, query, body string) and returns a plain
 * `{ status, headers, body }` result — it performs NO socket I/O, so it is
 * directly unit-testable. The actual `node:http` wiring lives in
 * `../httpServer.ts` and is a thin adapter over this function.
 *
 * Reuse, not fork: every JSON-RPC method (`initialize`, `tools/list`,
 * `tools/call`, `ping`, notifications) is handled by the SAME `handleRpc` the
 * stdio server uses, against the SAME `buildRegistry()` tool set. The
 * redact-before-truncate egress guarantee therefore applies identically here —
 * it lives inside `handleRpc`.
 *
 * Wire shape (MCP Streamable HTTP, 2025-06-18):
 *   - POST a JSON-RPC *request*  → 200 `application/json` with one response object.
 *   - POST a JSON-RPC *notification* (no id) → 202 Accepted, empty body.
 *   - `initialize` response carries an `Mcp-Session-Id` header.
 *   - GET → 405 (no server-initiated SSE stream offered).
 *   - DELETE → 200 (stateless: nothing to tear down).
 *   - Missing/invalid token → 401. Bad Origin → 403. Bad JSON → 400.
 * We answer requests with `application/json`; SSE is optional in the spec and
 * unnecessary for these synchronous, non-streaming tools.
 */
import { randomUUID } from "node:crypto";
import { handleRpc, type JsonRpcRequest } from "../protocol";
import type { ToolRegistry } from "../registry";
import { type HeaderBag, isAuthorized, isOriginAllowed } from "./auth";
import type { HttpConfig } from "./config";

export interface HttpRequestInput {
  /** Upper-case HTTP method (GET, POST, DELETE, ...). */
  method: string;
  /** URL pathname (no query string). */
  path: string;
  /** Parsed query params. */
  query: Record<string, string | undefined>;
  /** Lower-cased header bag. */
  headers: HeaderBag;
  /** Raw request body (decoded UTF-8). */
  body: string;
}

export interface HttpResponseOutput {
  status: number;
  headers: Record<string, string>;
  /** Serialized response body. Empty string ⇒ no body written. */
  body: string;
}

export interface HttpHandlerDeps {
  registry: ToolRegistry;
  config: HttpConfig;
  /** Session-id factory (injectable for deterministic tests). */
  makeSessionId?: () => string;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

function errorResponse(
  status: number,
  id: string | number | null,
  code: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): HttpResponseOutput {
  return {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: jsonRpcError(id, code, message),
  };
}

/**
 * Handle one HTTP request against the MCP core. Pure: no I/O, no globals beyond
 * the injected deps and a UUID factory.
 */
export async function handleHttpMcp(
  input: HttpRequestInput,
  deps: HttpHandlerDeps,
): Promise<HttpResponseOutput> {
  const { config } = deps;

  // 1. Route by path first — only the single MCP endpoint exists.
  if (input.path !== config.path) {
    return errorResponse(404, null, -32601, "Not found.");
  }

  // 2. Origin (DNS-rebinding defense) before anything else touches the body.
  if (!isOriginAllowed(input.headers, config)) {
    return errorResponse(403, null, -32001, "Origin not allowed.");
  }

  // 3. Auth gate. 401 body intentionally carries no token and no detail.
  if (!isAuthorized(input.headers, input.query, config)) {
    return errorResponse(401, null, -32001, "Unauthorized.", {
      "www-authenticate": 'Bearer realm="chainreact-mcp"',
    });
  }

  // 4. Method routing.
  switch (input.method) {
    case "POST":
      return handlePost(input, deps);
    case "GET":
      // We do not offer a server-initiated SSE stream at this endpoint.
      return errorResponse(405, null, -32601, "Method Not Allowed.", { allow: "POST, DELETE" });
    case "DELETE":
      // Stateless server: acknowledge session teardown with nothing to do.
      return { status: 200, headers: {}, body: "" };
    case "OPTIONS":
      return { status: 204, headers: { allow: "POST, DELETE" }, body: "" };
    default:
      return errorResponse(405, null, -32601, "Method Not Allowed.", { allow: "POST, DELETE" });
  }
}

async function handlePost(
  input: HttpRequestInput,
  deps: HttpHandlerDeps,
): Promise<HttpResponseOutput> {
  // Parse the JSON-RPC body. Arrays (batches) are unsupported, matching stdio.
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return errorResponse(400, null, -32700, "Parse error.");
  }
  if (Array.isArray(parsed)) {
    return errorResponse(400, null, -32600, "Batched requests are not supported.");
  }
  if (!parsed || typeof parsed !== "object") {
    return errorResponse(400, null, -32600, "Invalid JSON-RPC message.");
  }

  const req = parsed as JsonRpcRequest;
  const response = await handleRpc(req, deps.registry);

  // Notification (no id) → handleRpc returns null → 202 Accepted, empty body.
  if (response === null) {
    return { status: 202, headers: {}, body: "" };
  }

  // Attach a session id on the initialize response (Streamable HTTP session
  // management). The server is stateless, so the id is informational — later
  // requests are accepted with or without it.
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (req.method === "initialize") {
    const makeId = deps.makeSessionId ?? randomUUID;
    headers["mcp-session-id"] = makeId();
  }

  return { status: 200, headers, body: JSON.stringify(response) };
}
