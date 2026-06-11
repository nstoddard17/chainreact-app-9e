/**
 * Stage-1.5 guards for the internal MCP server's HTTP (Streamable HTTP)
 * transport. The HTTP front door is a SECOND transport onto the SAME tool
 * registry + `handleRpc` core, so every Stage-1 security boundary must hold
 * identically when a request arrives over HTTP:
 *   - a bearer token is required (401 without it; token never echoed),
 *   - Origin is validated,
 *   - path traversal through `tools/call` is still rejected,
 *   - the redact-before-truncate egress still applies,
 *   - the wire shape matches the spec (200 JSON for requests, 202 for
 *     notifications, session id on initialize, 405 for GET).
 *
 * These call the pure `handleHttpMcp` handler directly — no socket — so the
 * assertions are deterministic. The socket wiring is covered by the
 * `mcp:http:smoke` end-to-end check.
 */
import {
  handleHttpMcp,
  type HttpRequestInput,
} from "@/scripts/mcp/http/handler";
import type { HttpConfig } from "@/scripts/mcp/http/config";
import { loadHttpConfig, HttpConfigError } from "@/scripts/mcp/http/config";
import { redactToken, isAuthorized, safeEqual } from "@/scripts/mcp/http/auth";
import { buildRegistry } from "@/scripts/mcp/tools";
import { ToolRegistry } from "@/scripts/mcp/registry";

const TOKEN = "test-token-0123456789abcdef";

const CONFIG: HttpConfig = {
  token: TOKEN,
  host: "127.0.0.1",
  port: 8765,
  path: "/mcp",
  allowExternal: false,
  allowedOrigins: [],
  maxBodyBytes: 1024 * 1024,
};

function req(overrides: Partial<HttpRequestInput>): HttpRequestInput {
  return {
    method: "POST",
    path: "/mcp",
    query: {},
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: "",
    ...overrides,
  };
}

function rpc(method: string, params?: Record<string, unknown>, id: number | string | null = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

describe("MCP HTTP transport — config", () => {
  it("requires a token and refuses to start without one", () => {
    expect(() => loadHttpConfig({})).toThrow(HttpConfigError);
  });

  it("rejects a too-short token", () => {
    expect(() => loadHttpConfig({ MCP_HTTP_TOKEN: "short" })).toThrow(HttpConfigError);
  });

  it("refuses a non-loopback bind without explicit opt-in", () => {
    expect(() =>
      loadHttpConfig({ MCP_HTTP_TOKEN: "x".repeat(20), MCP_HTTP_HOST: "0.0.0.0" }),
    ).toThrow(HttpConfigError);
  });

  it("allows a non-loopback bind when MCP_HTTP_ALLOW_EXTERNAL is set", () => {
    const cfg = loadHttpConfig({
      MCP_HTTP_TOKEN: "x".repeat(20),
      MCP_HTTP_HOST: "0.0.0.0",
      MCP_HTTP_ALLOW_EXTERNAL: "1",
    });
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.allowExternal).toBe(true);
  });

  it("defaults to loopback and /mcp", () => {
    const cfg = loadHttpConfig({ MCP_HTTP_TOKEN: "x".repeat(20) });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.path).toBe("/mcp");
  });

  it("never includes the token in a config error message", () => {
    try {
      loadHttpConfig({ MCP_HTTP_TOKEN: "" });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("MCP_HTTP_TOKEN=");
    }
  });
});

describe("MCP HTTP transport — auth", () => {
  it("compares tokens in constant time and accepts an exact match", () => {
    expect(safeEqual(TOKEN, TOKEN)).toBe(true);
    expect(safeEqual(TOKEN, `${TOKEN}x`)).toBe(false);
    expect(safeEqual("a", "b")).toBe(false);
  });

  it("authorizes a bearer header and a ?key= fallback", () => {
    expect(isAuthorized({ authorization: `Bearer ${TOKEN}` }, {}, CONFIG)).toBe(true);
    expect(isAuthorized({}, { key: TOKEN }, CONFIG)).toBe(true);
    expect(isAuthorized({}, { token: TOKEN }, CONFIG)).toBe(true);
    expect(isAuthorized({}, {}, CONFIG)).toBe(false);
    expect(isAuthorized({ authorization: "Bearer wrong" }, {}, CONFIG)).toBe(false);
  });

  it("redacts the configured token from any outbound string", () => {
    const leaked = `boom failed with token ${TOKEN} in context`;
    const safe = redactToken(leaked, TOKEN);
    expect(safe).not.toContain(TOKEN);
    expect(safe).toContain("[REDACTED:mcp-token]");
  });
});

describe("MCP HTTP transport — wire shape", () => {
  const deps = { registry: buildRegistry(), config: CONFIG, makeSessionId: () => "fixed-session-id" };

  it("rejects an unauthenticated request with 401 and no token in the body", async () => {
    const res = await handleHttpMcp(
      req({ headers: { "content-type": "application/json" }, body: rpc("tools/list") }),
      deps,
    );
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("Bearer");
    expect(res.body).not.toContain(TOKEN);
  });

  it("returns 200 + Mcp-Session-Id and echoes protocolVersion on initialize", async () => {
    const res = await handleHttpMcp(
      req({ body: rpc("initialize", { protocolVersion: "2025-06-18" }) }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["mcp-session-id"]).toBe("fixed-session-id");
    const parsed = JSON.parse(res.body);
    expect(parsed.result.protocolVersion).toBe("2025-06-18");
    expect(parsed.result.serverInfo.name).toBeTruthy();
  });

  it("lists tools over HTTP", async () => {
    const res = await handleHttpMcp(req({ body: rpc("tools/list") }), deps);
    expect(res.status).toBe(200);
    const tools = JSON.parse(res.body).result.tools as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["list_provider_manifests", "get_project_memory"]),
    );
  });

  it("calls a read-only tool over HTTP", async () => {
    const res = await handleHttpMcp(
      req({ body: rpc("tools/call", { name: "list_provider_manifests", arguments: {} }) }),
      deps,
    );
    expect(res.status).toBe(200);
    const content = JSON.parse(res.body).result.content as { type: string; text: string }[];
    expect(content[0]?.type).toBe("text");
  });

  it("answers a notification (no id) with 202 and an empty body", async () => {
    const res = await handleHttpMcp(
      req({ body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }),
      deps,
    );
    expect(res.status).toBe(202);
    expect(res.body).toBe("");
  });

  it("returns 405 for GET (no server-initiated SSE offered)", async () => {
    const res = await handleHttpMcp(req({ method: "GET", body: "" }), deps);
    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toContain("POST");
  });

  it("returns 200 for DELETE (stateless session teardown)", async () => {
    const res = await handleHttpMcp(req({ method: "DELETE", body: "" }), deps);
    expect(res.status).toBe(200);
  });

  it("404s any path other than the MCP endpoint", async () => {
    const res = await handleHttpMcp(req({ path: "/admin", body: rpc("tools/list") }), deps);
    expect(res.status).toBe(404);
  });

  it("rejects a present-but-disallowed Origin with 403", async () => {
    const res = await handleHttpMcp(
      req({ headers: { authorization: `Bearer ${TOKEN}`, origin: "https://evil.example" }, body: rpc("tools/list") }),
      deps,
    );
    expect(res.status).toBe(403);
  });

  it("returns a JSON-RPC parse error (400) for a malformed body", async () => {
    const res = await handleHttpMcp(req({ body: "{not json" }), deps);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe(-32700);
  });

  it("rejects JSON-RPC batch arrays (400)", async () => {
    const res = await handleHttpMcp(req({ body: "[]" }), deps);
    expect(res.status).toBe(400);
  });
});

describe("MCP HTTP transport — Stage-1 security still holds over HTTP", () => {
  const deps = { registry: buildRegistry(), config: CONFIG };

  it("still rejects path traversal through a tools/call (no file escape)", async () => {
    const res = await handleHttpMcp(
      req({ body: rpc("tools/call", { name: "read_rule_doc", arguments: { name: "../../../etc/passwd" } }) }),
      deps,
    );
    expect(res.status).toBe(200);
    const result = JSON.parse(res.body).result;
    expect(result.isError).toBe(true);
    // The error names the basename it tried (passwd.md) and never escaped to /etc.
    expect(JSON.stringify(result)).not.toContain("root:");
  });

  it("still redacts secrets in tool output delivered over HTTP", async () => {
    // Assembled at runtime — no full literal Slack-bot-token string in source
    // (avoids secret-scanning false positives) while still proving HTTP-egress redaction.
    const slackToken = ["xoxb", "123456789012", "abcdEFGHijklMNOP"].join("-");
    const registry = new ToolRegistry();
    registry.register({
      name: "probe_secret_emitter",
      description: "test-only tool that returns a credential-shaped string",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: () => `leak ${slackToken} end`,
    });
    const res = await handleHttpMcp(
      req({ body: rpc("tools/call", { name: "probe_secret_emitter", arguments: {} }) }),
      { registry, config: CONFIG },
    );
    expect(res.body).not.toContain(slackToken);
    expect(res.body).toContain("[REDACTED:slack-token]");
  });

  it("still truncates oversized tool output delivered over HTTP", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "probe_big_output",
      description: "test-only tool that returns a very large string",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: () => "x".repeat(250_000),
    });
    const res = await handleHttpMcp(
      req({ body: rpc("tools/call", { name: "probe_big_output", arguments: {} }) }),
      { registry, config: CONFIG },
    );
    const text = JSON.parse(res.body).result.content[0].text as string;
    expect(text).toContain("truncated");
    expect(text.length).toBeLessThan(250_000);
  });
});
