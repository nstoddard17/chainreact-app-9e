/**
 * Internal MCP server — Streamable HTTP entry point (Stage 1.5).
 *
 * Local, internal developer tooling ONLY. A second transport onto the SAME
 * curated, read-only tool registry the stdio server exposes (`buildRegistry` +
 * `handleRpc`), so a ChatGPT Developer Mode custom connector — or any
 * Streamable-HTTP MCP client — can reach it. It adds NO tools, NO data access,
 * NO commands beyond what stdio already exposes.
 *
 * Run (after `npm run mcp:build`):
 *   MCP_HTTP_TOKEN=... node scripts/mcp/dist/httpServer.js
 * or:
 *   MCP_HTTP_TOKEN=... npm run mcp:http
 *
 * Security: REQUIRES a bearer token (env `MCP_HTTP_TOKEN`, never logged), binds
 * loopback by default, validates Origin, and routes every request through the
 * same redact-before-truncate egress as stdio. See
 * docs/runbooks/chatgpt-mcp-developer-mode.md.
 *
 * Diagnostics go to stderr only. This process writes NOTHING to stdout (unlike
 * the stdio server, whose stdout is the protocol stream); here the protocol
 * travels over HTTP, so stdout is simply unused.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildRegistry } from "./tools";
import { SERVER_INFO } from "./protocol";
import { handleHttpMcp } from "./http/handler";
import { loadHttpConfig, HttpConfigError, type HttpConfig } from "./http/config";
import { redactToken, type HeaderBag } from "./http/auth";

function log(token: string, message: string): void {
  process.stderr.write(`[${SERVER_INFO.name}:http] ${redactToken(message, token)}\n`);
}

function lowerHeaders(req: IncomingMessage): HeaderBag {
  const bag: HeaderBag = {};
  for (const [key, value] of Object.entries(req.headers)) {
    bag[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return bag;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        resolve(null); // signal "too large"
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", () => {
      if (!aborted) resolve("");
    });
  });
}

function makeRequestListener(config: HttpConfig) {
  const registry = buildRegistry();
  return async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const query: Record<string, string | undefined> = {};
      for (const [k, v] of url.searchParams.entries()) query[k] = v;

      const body = await readBody(req, config.maxBodyBytes);
      if (body === null) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Payload too large." } }));
        return;
      }

      const out = await handleHttpMcp(
        {
          method: (req.method ?? "GET").toUpperCase(),
          path: url.pathname,
          query,
          headers: lowerHeaders(req),
          body,
        },
        { registry, config },
      );
      res.writeHead(out.status, out.headers);
      res.end(out.body.length > 0 ? out.body : undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(config.token, `request error: ${message}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }));
    }
  };
}

function main(): void {
  let config: HttpConfig;
  try {
    config = loadHttpConfig();
  } catch (e) {
    // Token-free by construction (HttpConfigError never includes the token).
    const message = e instanceof HttpConfigError ? e.message : String(e);
    process.stderr.write(`[${SERVER_INFO.name}:http] cannot start: ${message}\n`);
    process.exit(1);
    return;
  }

  const server = createServer(makeRequestListener(config));
  server.listen(config.port, config.host, () => {
    const addr = server.address();
    const boundPort = addr && typeof addr === "object" ? addr.port : config.port;
    // This exact "listening on <url>" line is parsed by http-smoke.mjs.
    log(config.token, `listening on http://${config.host}:${boundPort}${config.path} (auth: bearer required)`);
    if (config.allowExternal) {
      log(config.token, "WARNING: bound a non-loopback interface (MCP_HTTP_ALLOW_EXTERNAL). The token is the only gate — keep it secret and prefer a tunnel.");
    }
    const tools = buildRegistry().list().length;
    log(config.token, `${tools} tools available over HTTP (same registry as stdio).`);
  });

  process.on("SIGINT", () => server.close(() => process.exit(0)));
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}

main();
