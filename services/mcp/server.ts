import { hasMcpScope } from "@/core/mcp/scopes";
import { getMcpTool, MCP_TOOLS, type McpToolContext } from "./tools/registry";
import type { McpAuditOutcome } from "@/repositories/mcpRequestAudit";

/**
 * Public MCP JSON-RPC dispatcher (Slice 4.PUBLIC-MCP-7).
 *
 * Zero-dependency JSON-RPC 2.0 / MCP message handling for the customer-facing
 * server — mirrors the wire shape of the internal dev server (scripts/mcp/protocol)
 * but dispatches against the SEPARATE public tool registry and an AUTHENTICATED,
 * account-scoped context. Every call is already token-verified + membership-checked
 * + rate-limited by the route before reaching here.
 *
 * Methods: `initialize`, `ping`, `notifications/*`, `tools/list`, `tools/call`.
 *   - `tools/list` advertises ONLY the tools the token's scopes permit.
 *   - `tools/call` enforces the tool's required scope BEFORE dispatch; a scope or
 *     ownership failure is returned as an MCP tool error (`isError: true`), not a
 *     transport error — the standard MCP way to signal a failed tool call.
 *
 * Returns the JSON-RPC response (or null for notifications) plus a bounded audit
 * descriptor the route persists. NO raw token, secret, args, or result content ever
 * appears in the audit descriptor.
 */

export const MCP_SERVER_INFO = {
  name: "chainreact",
  version: "1.0.0",
} as const;

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpAuditDescriptor {
  method: string;
  tool: string | null;
  outcome: McpAuditOutcome;
  reason: string | null;
}

export interface McpRpcOutcome {
  /** The JSON-RPC response, or null for a notification (no reply). */
  response: JsonRpcResponse | null;
  /** A bounded audit row to persist, or null when the method is not worth auditing. */
  audit: McpAuditDescriptor | null;
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** An MCP tool-level error result (transport stays 200; `isError` signals failure). */
function toolError(id: string | number | null, message: string): JsonRpcResponse {
  return ok(id, { content: [{ type: "text", text: `Error: ${message}` }], isError: true });
}

/** A successful MCP tool result — JSON in a text block + structuredContent. */
function toolSuccess(id: string | number | null, data: unknown): JsonRpcResponse {
  return ok(id, {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false,
  });
}

export async function handleMcpRpc(
  req: JsonRpcRequest,
  ctx: McpToolContext,
): Promise<McpRpcOutcome> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;
  const method = req.method ?? "";

  switch (method) {
    case "initialize": {
      const requested =
        (typeof req.params?.protocolVersion === "string" && req.params.protocolVersion) ||
        DEFAULT_PROTOCOL_VERSION;
      return {
        response: ok(id, {
          protocolVersion: requested,
          capabilities: { tools: {} },
          serverInfo: MCP_SERVER_INFO,
        }),
        audit: { method, tool: null, outcome: "ok", reason: null },
      };
    }

    case "notifications/initialized":
      return { response: null, audit: null };

    case "ping":
      // Liveness probe — answered, not audited (noise).
      return { response: ok(id, {}), audit: null };

    case "tools/list": {
      // Advertise only the tools the token's scopes permit.
      const tools = MCP_TOOLS.filter((t) => hasMcpScope(ctx.scopes, t.requiredScope)).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return {
        response: ok(id, { tools }),
        audit: { method, tool: null, outcome: "ok", reason: null },
      };
    }

    case "tools/call": {
      const name = typeof req.params?.name === "string" ? req.params.name : undefined;
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      if (!name) {
        return {
          response: rpcError(id, -32602, "tools/call requires a 'name'."),
          audit: { method, tool: null, outcome: "error", reason: "missing_tool_name" },
        };
      }

      const tool = getMcpTool(name);
      if (!tool) {
        // Unknown tool → tool-level not-found (no enumeration of the real set beyond
        // tools/list, which is already scope-filtered).
        return {
          response: toolError(id, "Unknown tool."),
          audit: { method, tool: name, outcome: "not_found", reason: "unknown_tool" },
        };
      }

      // Scope gate BEFORE dispatch — the token must hold the tool's required scope.
      if (!hasMcpScope(ctx.scopes, tool.requiredScope)) {
        return {
          response: toolError(id, `This token lacks the required scope: ${tool.requiredScope}.`),
          audit: { method, tool: name, outcome: "denied", reason: "insufficient_scope" },
        };
      }

      try {
        const result = await tool.handler(ctx, args);
        if (!result.ok) {
          const message = result.reason === "not_found" ? "Not found." : "Invalid arguments.";
          const outcome: McpAuditOutcome =
            result.reason === "not_found" ? "not_found" : "error";
          return {
            response: toolError(id, message),
            audit: { method, tool: name, outcome, reason: result.reason },
          };
        }
        return {
          response: toolSuccess(id, result.data),
          audit: { method, tool: name, outcome: "ok", reason: null },
        };
      } catch (err) {
        // Never leak the underlying error to the client (could carry DB/provider text).
        console.warn(
          JSON.stringify({
            event: "mcp.tool_exception",
            tool: name,
            accountId: ctx.accountId,
            message: err instanceof Error ? err.message : "unknown",
          }),
        );
        return {
          response: toolError(id, "Internal error."),
          audit: { method, tool: name, outcome: "error", reason: "handler_exception" },
        };
      }
    }

    default:
      if (isNotification) return { response: null, audit: null };
      return {
        response: rpcError(id, -32601, `Method not found: ${method}`),
        audit: null,
      };
  }
}
