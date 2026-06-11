/**
 * Internal MCP server — minimal JSON-RPC 2.0 / MCP message handling.
 *
 * Zero-dependency implementation of the small slice of MCP the developer tools
 * need: `initialize`, `tools/list`, `tools/call`, `ping`. Transport is
 * newline-delimited JSON-RPC over stdio (per the MCP stdio transport: one JSON
 * message per line, no embedded newlines).
 */
import { LIMITS } from "./config";
import type { ToolRegistry } from "./registry";
import { redactSecrets } from "./security/redact";
import { truncateOutput } from "./security/truncate";

export const SERVER_INFO = {
  name: "chainreact-v2-internal-dev",
  version: "0.1.0",
} as const;

const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Handle a single parsed JSON-RPC request. Returns the response, or `null` for
 * notifications (requests without an id) that need no reply.
 */
export async function handleRpc(
  req: JsonRpcRequest,
  registry: ToolRegistry,
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case "initialize": {
      const requested = (req.params?.protocolVersion as string) || DEFAULT_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    case "notifications/initialized":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: registry.list().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = req.params?.name as string | undefined;
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      if (!name) return err(id, -32602, "tools/call requires a 'name'.");
      const tool = registry.get(name);
      if (!tool) return err(id, -32601, `Unknown tool: ${name}`);
      try {
        const text = await tool.handler(args);
        // Egress guarantee: redact BEFORE truncating. Order matters — truncating
        // first could split a credential so its tail (the part the regex needs
        // to match) is cut, leaving the head un-redacted. Redacting the full
        // string first, then bounding length, can never leak a partial secret.
        // Per-read redaction in lib/files.ts is defense-in-depth; this is the
        // single point every tool's output must pass through.
        const safe = truncateOutput(
          redactSecrets(String(text)),
          LIMITS.maxOutputChars,
        );
        return ok(id, { content: [{ type: "text", text: safe }] });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return ok(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      if (isNotification) return null;
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}
