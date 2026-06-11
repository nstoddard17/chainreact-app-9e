/**
 * Internal MCP server — stdio entry point.
 *
 * Local, internal developer tooling ONLY. Exposes curated read-only repo /
 * documentation / provider-metadata tools to an AI coding host (Claude Desktop,
 * Codex, etc.) over the MCP stdio transport.
 *
 * Run (after `npm run mcp:build`):
 *   node scripts/mcp/dist/server.js
 * or:
 *   npm run mcp:start
 *
 * It does NOT: serve users, touch production data, open a network port, read a
 * database, import any Supabase/service-role client, expose secrets/env/tokens,
 * or run any mutating command. See docs/runbooks/internal-mcp-server.md.
 *
 * Protocol diagnostics go to stderr only — stdout is reserved for the JSON-RPC
 * stream so the host's parser is never corrupted.
 */
import { buildRegistry } from "./tools";
import { handleRpc, SERVER_INFO, type JsonRpcRequest } from "./protocol";

function log(message: string): void {
  process.stderr.write(`[${SERVER_INFO.name}] ${message}\n`);
}

function send(response: unknown): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function main(): void {
  const registry = buildRegistry();
  log(
    `started — ${registry.list().length} tools: ${registry
      .list()
      .map((t) => t.name)
      .join(", ")}`,
  );

  let buffer = "";
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        void processLine(line, registry);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  process.stdin.on("end", () => {
    log("stdin closed — exiting.");
    process.exit(0);
  });
}

async function processLine(
  line: string,
  registry: ReturnType<typeof buildRegistry>,
): Promise<void> {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }
  try {
    const response = await handleRpc(req, registry);
    if (response) send(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`handler error: ${message}`);
    send({
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: { code: -32603, message: "Internal error" },
    });
  }
}

main();
