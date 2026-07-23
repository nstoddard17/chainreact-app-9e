/**
 * Shared, typed MCP CLIENT over Streamable HTTP (JSON-RPC 2.0).
 *
 * The single seam a V2 provider uses to talk to a remote MCP server (Eden first —
 * `https://mcp.eden.so/mcp`). Provider action wrappers call `callTool`; they never
 * hand-write JSON-RPC. Auth is a decrypted bearer token supplied per client instance;
 * the token is NEVER logged, thrown, or echoed.
 *
 * Transport notes (Streamable HTTP):
 *   - Every request is an HTTP POST of one JSON-RPC message to the endpoint.
 *   - The server may answer with `application/json` (one response) OR `text/event-stream`
 *     (SSE) — we parse both and extract the single response for our request id.
 *   - `initialize` may return an `Mcp-Session-Id` header; if so we echo it on every
 *     subsequent request. We also send `MCP-Protocol-Version`.
 *
 * Live-verification TODOs (resolved during the Eden live catalog capture — no token yet):
 *   - Confirm Eden's SSE framing + whether a session id header is issued.
 *   - Confirm Eden's structured error contract fields (`{ ok, status, message }`) so
 *     `mapToolResultError` maps permission/not-found precisely.
 * The typed surface + error mapping + retry/idempotency rules below are protocol-stable
 * and unit-tested against a mocked fetch boundary.
 */

import {
  McpAuthError,
  McpError,
  McpPermissionError,
  McpProtocolError,
  McpRateLimitError,
  McpToolNotFoundError,
  McpTransportError,
} from "./errors";
import { scrubSecrets } from "./sanitize";
import type {
  JsonRpcResponse,
  McpCallToolResult,
  McpInitializeResult,
  McpListPromptsResult,
  McpListResourcesResult,
  McpListToolsResult,
} from "./types";

/** MCP protocol version V2 advertises. Negotiated down by the server on initialize. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2; // idempotent reads only
const RETRY_BASE_DELAY_MS = 250;

/** Minimal fetch surface the client needs — injectable so tests mock only this boundary. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FetchLikeResponse>;

export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface McpClientOptions {
  /** Full MCP endpoint, e.g. `https://mcp.eden.so/mcp`. */
  readonly endpoint: string;
  /** Decrypted bearer token (e.g. `eden_pat_…`). Never logged. */
  readonly accessToken: string;
  /** Human-safe label for errors/logs (e.g. "Eden"). NEVER the token. */
  readonly serverLabel: string;
  /** Per-request timeout. Default 30s. */
  readonly timeoutMs?: number;
  /**
   * Optional ceiling on a single response body's size (bytes). When set, a
   * response whose `content-length` header OR decoded text exceeds it fails
   * with `McpProtocolError` instead of loading an unbounded blob into memory.
   * Default: unbounded (existing consumers unaffected). The shared executor
   * sets a bound so MCP-catalog outputs stay bounded from day one.
   */
  readonly maxResponseBytes?: number;
  /** Injected fetch (defaults to global fetch). */
  readonly fetchImpl?: FetchLike;
  /** Injected sleep (tests pass a no-op to avoid real backoff waits). */
  readonly sleepImpl?: (ms: number) => Promise<void>;
}

export interface CallToolOptions {
  /**
   * Retry-safety switch. `false` (default) → NEVER auto-retried, even on a transient
   * error (the rule for non-idempotent writes). Set `true` ONLY for idempotent reads,
   * or for a write that carries a preserved idempotency key AND whose retry behavior has
   * been certified against the provider.
   */
  readonly idempotent?: boolean;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class McpClient {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly serverLabel: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number | null;
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private nextId = 1;
  private sessionId: string | null = null;
  private negotiatedProtocol: string = MCP_PROTOCOL_VERSION;
  private initialized = false;

  constructor(opts: McpClientOptions) {
    this.endpoint = opts.endpoint;
    this.accessToken = opts.accessToken;
    this.serverLabel = opts.serverLabel;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = opts.maxResponseBytes ?? null;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.sleepImpl = opts.sleepImpl ?? defaultSleep;
  }

  /** Perform the MCP handshake once. Idempotent — a second call is a no-op. */
  async initialize(): Promise<McpInitializeResult> {
    const result = await this.rpc<McpInitializeResult>(
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "ChainReact", version: "2" },
      },
      { idempotent: true },
    );
    if (result && typeof result.protocolVersion === "string") {
      this.negotiatedProtocol = result.protocolVersion;
    }
    // Fire-and-forget the `initialized` notification (best-effort; never blocks).
    await this.notify("notifications/initialized").catch(() => {});
    this.initialized = true;
    return result;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  async listTools(cursor?: string): Promise<McpListToolsResult> {
    await this.ensureInitialized();
    const params = cursor ? { cursor } : {};
    const result = await this.rpc<McpListToolsResult>("tools/list", params, { idempotent: true });
    if (!result || !Array.isArray(result.tools)) {
      throw new McpProtocolError(this.serverLabel, "tools/list returned no tools array");
    }
    return result;
  }

  async listResources(cursor?: string): Promise<McpListResourcesResult> {
    await this.ensureInitialized();
    const params = cursor ? { cursor } : {};
    return this.rpc<McpListResourcesResult>("resources/list", params, { idempotent: true });
  }

  async listPrompts(cursor?: string): Promise<McpListPromptsResult> {
    await this.ensureInitialized();
    const params = cursor ? { cursor } : {};
    return this.rpc<McpListPromptsResult>("prompts/list", params, { idempotent: true });
  }

  /**
   * Invoke a tool. Maps a tool-level failure (`isError`, or a structured
   * `{ ok:false, status, message }`) to a typed error the engine can classify. Writes
   * pass `idempotent:false` (default) so a transient failure is surfaced, never silently
   * re-sent.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: CallToolOptions = {},
  ): Promise<McpCallToolResult> {
    await this.ensureInitialized();
    const result = await this.rpc<McpCallToolResult>(
      "tools/call",
      { name, arguments: args },
      { idempotent: opts.idempotent ?? false },
    );
    if (result && result.isError === true) {
      throw this.mapToolResultError(name, result);
    }
    return result;
  }

  // --- internals -----------------------------------------------------------------

  private async notify(method: string): Promise<void> {
    const body = JSON.stringify({ jsonrpc: "2.0", method });
    await this.httpPost(body); // no id → server returns nothing meaningful; ignore
  }

  private async rpc<T>(
    method: string,
    params: Record<string, unknown>,
    opts: { idempotent: boolean },
  ): Promise<T> {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    let attempt = 0;
    // Only idempotent calls are ever retried; non-idempotent writes get exactly one try.
    const maxAttempts = opts.idempotent ? MAX_RETRIES + 1 : 1;
    for (;;) {
      attempt++;
      try {
        const raw = await this.httpPost(body);
        const message = this.extractResponse(raw, id);
        if (message.error) throw this.mapRpcError(message.error);
        return message.result as T;
      } catch (err) {
        const isRetryable = err instanceof McpError && err.retryable;
        if (isRetryable && attempt < maxAttempts) {
          const backoff =
            err instanceof McpRateLimitError && typeof err.retryAfterMs === "number"
              ? err.retryAfterMs
              : RETRY_BASE_DELAY_MS * attempt;
          await this.sleepImpl(backoff);
          continue;
        }
        throw err;
      }
    }
  }

  /** POST one JSON-RPC body; return the raw response text. Maps HTTP-level failures. */
  private async httpPost(body: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.accessToken}`,
      "mcp-protocol-version": this.negotiatedProtocol,
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    let res: FetchLikeResponse;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", headers, body, signal: controller.signal });
    } catch (err) {
      // Abort (timeout) or network failure → transient transport error.
      const detail = err instanceof Error && err.name === "AbortError" ? "request timed out" : "network error";
      throw new McpTransportError(this.serverLabel, detail);
    } finally {
      clearTimeout(timer);
    }

    // Capture a session id issued on initialize so later requests are correlated.
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (!res.ok) throw this.mapHttpStatus(res.status, res.headers);

    // Bounded response size (opt-in). Reject an over-size body — the advertised
    // content-length first (cheap, before reading), then the decoded text.
    if (this.maxResponseBytes !== null) {
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > this.maxResponseBytes) {
        throw new McpProtocolError(this.serverLabel, "response exceeded the size limit");
      }
    }
    const text = await res.text();
    if (this.maxResponseBytes !== null && text.length > this.maxResponseBytes) {
      throw new McpProtocolError(this.serverLabel, "response exceeded the size limit");
    }
    return text;
  }

  /** Parse `application/json` or `text/event-stream` and return the JSON-RPC response for `id`. */
  private extractResponse(raw: string, id: number): JsonRpcResponse {
    const trimmed = raw.trimStart();
    // SSE framing: lines like `data: {json}`. Concatenate data payloads and parse each.
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      const dataChunks = raw
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter((l) => l.length > 0 && l !== "[DONE]");
      for (const chunk of dataChunks) {
        const parsed = this.tryParseResponseFor(chunk, id);
        if (parsed) return parsed;
      }
      throw new McpProtocolError(this.serverLabel, "no JSON-RPC response found in event stream");
    }
    const parsed = this.tryParseResponseFor(raw, id);
    if (!parsed) throw new McpProtocolError(this.serverLabel, "response did not match the request id");
    return parsed;
  }

  private tryParseResponseFor(text: string, id: number): JsonRpcResponse | null {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    const messages = Array.isArray(json) ? json : [json];
    for (const m of messages) {
      if (m && typeof m === "object" && (m as JsonRpcResponse).jsonrpc === "2.0" && (m as JsonRpcResponse).id === id) {
        return m as JsonRpcResponse;
      }
    }
    return null;
  }

  private mapHttpStatus(status: number, headers: { get(n: string): string | null }): McpError {
    if (status === 401) return new McpAuthError(this.serverLabel);
    if (status === 403) return new McpAuthError(this.serverLabel); // auth-level 403 → reconnect
    if (status === 429) {
      const retryAfter = headers.get("retry-after");
      const ms = retryAfter ? Number(retryAfter) * 1000 : undefined;
      return new McpRateLimitError(this.serverLabel, Number.isFinite(ms) ? ms : undefined);
    }
    if (status >= 500) return new McpTransportError(this.serverLabel, `server ${status}`, status);
    return new McpTransportError(this.serverLabel, `unexpected status ${status}`, status);
  }

  /** Map a JSON-RPC error object (transport level) to a typed error. */
  private mapRpcError(error: { code: number; message: string }): McpError {
    const msg = scrubSecrets(error.message ?? "");
    // JSON-RPC "Method not found" (-32601) → the server doesn't expose it.
    if (error.code === -32601) return new McpToolNotFoundError(this.serverLabel, "(method)");
    // JSON-RPC "Invalid params" (-32602) → non-transient protocol error.
    if (error.code === -32602) return new McpProtocolError(this.serverLabel, `invalid params: ${msg}`);
    return new McpProtocolError(this.serverLabel, msg || `rpc error ${error.code}`);
  }

  /**
   * Map a tool-level failure (`isError:true`) to a typed error. Eden signals failures as
   * a structured `{ ok:false, status, message }` in the result content; we read status +
   * message to distinguish permission / not-found / transient. Message is scrubbed.
   */
  private mapToolResultError(tool: string, result: McpCallToolResult): McpError {
    const { status, message } = readStructuredError(result);
    const safeMsg = scrubSecrets(message ?? "");
    const lower = safeMsg.toLowerCase();

    if (status === 401 || status === 403 || lower.includes("permission") || lower.includes("read-only") || lower.includes("read only")) {
      return new McpPermissionError(this.serverLabel, tool);
    }
    if (status === 404 || lower.includes("not found") || lower.includes("unknown tool")) {
      return new McpToolNotFoundError(this.serverLabel, tool);
    }
    if (status === 429 || lower.includes("rate limit")) {
      return new McpRateLimitError(this.serverLabel);
    }
    if (typeof status === "number" && status >= 500) {
      return new McpTransportError(this.serverLabel, `tool ${status}`, status);
    }
    // Unknown tool failure → surface as a non-retryable protocol/tool error (never spread content).
    return new McpProtocolError(this.serverLabel, safeMsg ? `tool "${tool}" failed: ${safeMsg}` : `tool "${tool}" failed`);
  }
}

/**
 * Pull `{ status, message }` out of a tool result's structured content / text blocks.
 * Tolerant of both `structuredContent: { ok:false, status, message }` and a JSON string
 * in the first text block. Never returns arbitrary content — only the two safe fields.
 */
export function readStructuredError(result: McpCallToolResult): { status?: number; message?: string } {
  const fromObj = (obj: unknown): { status?: number; message?: string } => {
    if (!obj || typeof obj !== "object") return {};
    const o = obj as Record<string, unknown>;
    const out: { status?: number; message?: string } = {};
    // Eden's structured error is `{ ok:false, status:"not-found", httpStatus:404, message }`
    // — `status` is a STRING label, `httpStatus` is the numeric code. Prefer httpStatus;
    // fall back to a numeric `status` (other MCP servers may use that shape).
    if (typeof o.httpStatus === "number") out.status = o.httpStatus;
    else if (typeof o.status === "number") out.status = o.status;
    if (typeof o.message === "string") out.message = o.message;
    return out;
  };

  const structured = fromObj(result.structuredContent);
  if (structured.status !== undefined || structured.message !== undefined) return structured;

  const firstText = result.content?.find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (firstText) {
    try {
      return fromObj(JSON.parse(firstText));
    } catch {
      return { message: firstText };
    }
  }
  return {};
}

/** Factory mirroring the repo's `create*` convention. */
export function createMcpClient(opts: McpClientOptions): McpClient {
  return new McpClient(opts);
}
