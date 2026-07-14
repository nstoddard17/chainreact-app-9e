/**
 * @jest-environment node
 *
 * Shared MCP client transport (integrations/_shared/mcp). Mocks ONLY the external
 * boundary — an injected `fetchImpl` standing in for the remote MCP server. Proves the
 * protocol handshake, discovery, typed tool invocation, error mapping, retry/idempotency
 * rules, timeout behavior, and that the bearer token / tool args never leak into errors.
 */

import {
  createMcpClient,
  McpAuthError,
  McpPermissionError,
  McpProtocolError,
  McpRateLimitError,
  McpToolNotFoundError,
  McpTransportError,
  readStructuredError,
  type FetchLike,
  type FetchLikeResponse,
} from "@/integrations/_shared/mcp";

const ENDPOINT = "https://mcp.eden.so/mcp";
const TOKEN = "eden_pat_super_secret_value_1234567890";

function jsonResponse(body: unknown, init: { status?: number; sessionId?: string; headers?: Record<string, string> } = {}): FetchLikeResponse {
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers ?? {}) };
  if (init.sessionId) headers["mcp-session-id"] = init.sessionId;
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** A fetch stub that returns the JSON-RPC result for whichever id it receives, per method. */
function scriptedFetch(handlers: Record<string, (id: number) => FetchLikeResponse>): { fetchImpl: FetchLike; calls: Array<{ headers: Record<string, string>; body: any }> } {
  const calls: Array<{ headers: Record<string, string>; body: any }> = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    const parsed = JSON.parse(init.body);
    calls.push({ headers: init.headers, body: parsed });
    // Notifications (no id) — ack with empty 202-like body.
    if (parsed.id === undefined) return jsonResponse("", { status: 202 });
    const handler = handlers[parsed.method];
    if (!handler) throw new Error(`unexpected method ${parsed.method}`);
    return handler(parsed.id);
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

function initHandler(id: number): FetchLikeResponse {
  return jsonResponse(
    { jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "eden", version: "1" } } },
    { sessionId: "sess-abc" },
  );
}

describe("McpClient — handshake", () => {
  it("initializes, negotiates protocol, sends initialized notification, and echoes the session id", async () => {
    const { fetchImpl, calls } = scriptedFetch({
      initialize: initHandler,
      "tools/list": (id) => jsonResponse({ jsonrpc: "2.0", id, result: { tools: [] } }),
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });

    const init = await client.initialize();
    expect(init.protocolVersion).toBe("2025-06-18");

    // A follow-up call must echo the captured session id header.
    await client.listTools();
    const toolsCall = calls.find((c) => c.body.method === "tools/list")!;
    expect(toolsCall.headers["mcp-session-id"]).toBe("sess-abc");

    // The `initialized` notification was sent (id-less).
    expect(calls.some((c) => c.body.method === "notifications/initialized" && c.body.id === undefined)).toBe(true);

    // Auth header carries the bearer token (on the wire only — never in errors; see below).
    expect(toolsCall.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("auto-initializes before the first tools/call", async () => {
    const { fetchImpl, calls } = scriptedFetch({
      initialize: initHandler,
      "tools/call": (id) => jsonResponse({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "ok" }] } }),
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    await client.callTool("eden_list_schedules", {}, { idempotent: true });
    expect(calls[0]!.body.method).toBe("initialize");
    expect(calls.some((c) => c.body.method === "tools/call")).toBe(true);
  });
});

describe("McpClient — discovery + invocation", () => {
  it("parses tools/list", async () => {
    const tools = [{ name: "eden_read_board", inputSchema: { type: "object", properties: { boardId: {} } } }];
    const { fetchImpl } = scriptedFetch({
      initialize: initHandler,
      "tools/list": (id) => jsonResponse({ jsonrpc: "2.0", id, result: { tools } }),
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    const res = await client.listTools();
    expect(res.tools).toHaveLength(1);
    expect(res.tools[0]!.name).toBe("eden_read_board");
  });

  it("returns the structured tool result on success and passes arguments through", async () => {
    const { fetchImpl, calls } = scriptedFetch({
      initialize: initHandler,
      "tools/call": (id) => jsonResponse({ jsonrpc: "2.0", id, result: { structuredContent: { ok: true, boards: [] } } }),
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    const res = await client.callTool("eden_read_board", { boardId: "b1" }, { idempotent: true });
    expect((res.structuredContent as any).ok).toBe(true);
    const call = calls.find((c) => c.body.method === "tools/call")!;
    expect(call.body.params).toEqual({ name: "eden_read_board", arguments: { boardId: "b1" } });
  });

  it("parses a text/event-stream (SSE) framed response", async () => {
    const sse = (id: number): FetchLikeResponse => {
      const payload = JSON.stringify({ jsonrpc: "2.0", id, result: { tools: [{ name: "eden_list_schedules", inputSchema: {} }] } });
      return jsonResponse(`event: message\ndata: ${payload}\n\n`, { headers: { "content-type": "text/event-stream" } });
    };
    const { fetchImpl } = scriptedFetch({ initialize: initHandler, "tools/list": sse });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    const res = await client.listTools();
    expect(res.tools[0]!.name).toBe("eden_list_schedules");
  });
});

describe("McpClient — error mapping", () => {
  async function callWith(handler: (id: number) => FetchLikeResponse) {
    const { fetchImpl } = scriptedFetch({ initialize: initHandler, "tools/call": handler });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    return client.callTool("eden_schedule_post", { text: "hi" });
  }

  it("HTTP 401 → McpAuthError (reconnect)", async () => {
    await expect(callWith((_id) => jsonResponse({ error: "unauthorized" }, { status: 401 }))).rejects.toBeInstanceOf(McpAuthError);
  });

  it("HTTP 429 → McpRateLimitError with retry-after", async () => {
    const err = await callWith((_id) => jsonResponse({}, { status: 429, headers: { "retry-after": "2" } })).catch((e) => e);
    expect(err).toBeInstanceOf(McpRateLimitError);
    expect((err as McpRateLimitError).retryAfterMs).toBe(2000);
  });

  it("HTTP 500 → McpTransportError (transient)", async () => {
    const err = await callWith((_id) => jsonResponse({}, { status: 500 })).catch((e) => e);
    expect(err).toBeInstanceOf(McpTransportError);
    expect((err as McpTransportError).status).toBe(500);
  });

  it("read-only token calling a write tool → McpPermissionError (structured isError result)", async () => {
    const err = await callWith((id) =>
      jsonResponse({ jsonrpc: "2.0", id, result: { isError: true, structuredContent: { ok: false, status: 403, message: "read-only token cannot schedule" } } }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(McpPermissionError);
    expect((err as McpPermissionError).tool).toBe("eden_schedule_post");
  });

  it("tool not-found in result → McpToolNotFoundError", async () => {
    const err = await callWith((id) =>
      jsonResponse({ jsonrpc: "2.0", id, result: { isError: true, structuredContent: { ok: false, status: 404, message: "unknown tool" } } }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(McpToolNotFoundError);
  });

  it("maps Eden's real error contract {status:'not-found', httpStatus:404} (text block) → McpToolNotFoundError", async () => {
    // Live Eden shape: isError result with a JSON text block; `status` is a STRING label,
    // `httpStatus` carries the numeric code.
    const edenErr = JSON.stringify({ ok: false, status: "not-found", message: "Board not found.", httpStatus: 404, tool: "eden_read_board" });
    const err = await callWith((id) =>
      jsonResponse({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: edenErr }] } }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(McpToolNotFoundError);
  });

  it("JSON-RPC invalid-params error → McpProtocolError", async () => {
    const err = await callWith((id) => jsonResponse({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params" } })).catch((e) => e);
    expect(err).toBeInstanceOf(McpProtocolError);
  });
});

describe("McpClient — retry & idempotency rules", () => {
  it("retries an idempotent read on a transient 500, then succeeds", async () => {
    let attempts = 0;
    const { fetchImpl } = scriptedFetch({
      initialize: initHandler,
      "tools/list": (id) => {
        attempts++;
        return attempts === 1 ? jsonResponse({}, { status: 500 }) : jsonResponse({ jsonrpc: "2.0", id, result: { tools: [] } });
      },
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    const res = await client.listTools();
    expect(res.tools).toEqual([]);
    expect(attempts).toBe(2);
  });

  it("NEVER retries a non-idempotent write on a transient 500", async () => {
    let attempts = 0;
    const { fetchImpl } = scriptedFetch({
      initialize: initHandler,
      "tools/call": (_id) => {
        attempts++;
        return jsonResponse({}, { status: 500 });
      },
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    await expect(client.callTool("eden_schedule_post", { text: "hi" })).rejects.toBeInstanceOf(McpTransportError);
    expect(attempts).toBe(1); // exactly one attempt — no silent re-send of a write
  });

  it("gives up after the retry cap on a persistent transient error", async () => {
    let attempts = 0;
    const { fetchImpl } = scriptedFetch({
      initialize: initHandler,
      "tools/list": (_id) => {
        attempts++;
        return jsonResponse({}, { status: 503 });
      },
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    await expect(client.listTools()).rejects.toBeInstanceOf(McpTransportError);
    expect(attempts).toBe(3); // 1 + MAX_RETRIES(2)
  });
});

describe("McpClient — timeout", () => {
  it("maps an aborted request to a transient transport error", async () => {
    const fetchImpl: FetchLike = async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep, timeoutMs: 5 });
    const err = await client.initialize().catch((e) => e);
    expect(err).toBeInstanceOf(McpTransportError);
    expect(String(err.message)).toContain("timed out");
  });
});

describe("McpClient — no secret / arg leakage", () => {
  it("never includes the bearer token or tool arguments in a thrown error message", async () => {
    const { fetchImpl } = scriptedFetch({
      initialize: initHandler,
      "tools/call": (id) =>
        jsonResponse({ jsonrpc: "2.0", id, result: { isError: true, structuredContent: { ok: false, status: 500, message: `boom ${TOKEN}` } } }),
    });
    const client = createMcpClient({ endpoint: ENDPOINT, accessToken: TOKEN, serverLabel: "Eden", fetchImpl, sleepImpl: noSleep });
    const err = await client.callTool("eden_schedule_post", { secretArg: TOKEN }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain(TOKEN); // token scrubbed even when echoed by the provider
    expect(err.message).not.toContain("secretArg");
  });
});

describe("readStructuredError", () => {
  it("reads status/message from structuredContent", () => {
    expect(readStructuredError({ structuredContent: { ok: false, status: 403, message: "denied" } })).toEqual({ status: 403, message: "denied" });
  });
  it("falls back to a JSON text block", () => {
    expect(readStructuredError({ content: [{ type: "text", text: '{"status":404,"message":"nope"}' }] })).toEqual({ status: 404, message: "nope" });
  });
  it("treats a non-JSON text block as a plain message", () => {
    expect(readStructuredError({ content: [{ type: "text", text: "plain error" }] })).toEqual({ message: "plain error" });
  });
});
