/**
 * Shared MCP (Model Context Protocol) CLIENT types — the wire shapes a V2 provider
 * uses to talk OUT to a remote MCP server over Streamable HTTP (JSON-RPC 2.0).
 *
 * V2 already ships an MCP *server* (`services/mcp/server.ts`, mcp.chainreact.app);
 * this module is the first MCP *client* — inaugural consumer is Eden
 * (`https://mcp.eden.so/mcp`, `docs/providers/eden/`). Kept provider-agnostic so any
 * future MCP-backed provider reuses it; Eden-specifics live in
 * `integrations/_shared/eden/`.
 *
 * Only the subset of MCP V2 needs is modeled: `initialize`, `tools/list`,
 * `tools/call`, `resources/list`, `prompts/list`. Fields not consumed are typed
 * loosely (`unknown`) rather than guessed — the exact Eden shapes are pinned during
 * the live catalog capture (see the plan doc).
 */

/** JSON-RPC 2.0 request id (we always use a monotonic number per client). */
export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** A JSON-RPC notification (no id → no response expected). */
export interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcResponse<TResult = unknown> {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly result?: TResult;
  readonly error?: JsonRpcError;
}

/** Result of `initialize`. `capabilities`/`serverInfo` are captured but not deeply typed. */
export interface McpInitializeResult {
  readonly protocolVersion: string;
  readonly capabilities?: Record<string, unknown>;
  readonly serverInfo?: { readonly name?: string; readonly version?: string };
  readonly instructions?: string;
}

/** One tool from `tools/list`. `inputSchema` is a JSON Schema object (kept as-is for pin/drift). */
export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpListToolsResult {
  readonly tools: readonly McpTool[];
  readonly nextCursor?: string;
}

/**
 * A single content block of a `tools/call` result. MCP defines several `type`s
 * (`text`, `image`, `audio`, `resource`, …); we surface the discriminant + the raw
 * block. Callers extract `text`/structured data via helpers — actions must NOT spread
 * raw blocks into workflow outputs (bounded-output rule).
 */
export interface McpContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly [k: string]: unknown;
}

/**
 * Result of `tools/call`. `isError: true` means the tool itself failed (the MCP way
 * to signal a failed tool call — distinct from a transport/JSON-RPC error).
 * `structuredContent` is the modern structured result; `content` is the block list.
 */
export interface McpCallToolResult {
  readonly content?: readonly McpContentBlock[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface McpListResourcesResult {
  readonly resources: readonly unknown[];
  readonly nextCursor?: string;
}

export interface McpListPromptsResult {
  readonly prompts: readonly unknown[];
  readonly nextCursor?: string;
}
