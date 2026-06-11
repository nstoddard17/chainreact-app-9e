#!/usr/bin/env node
/**
 * Internal MCP server — stdio smoke test.
 *
 * Purpose: prove the BUILT server speaks the MCP stdio subset end-to-end —
 * `initialize`, `tools/list`, and one read-only `tools/call` — and that stdout
 * carries only JSON-RPC. This is a bounded verification helper, not a tool: it
 * spawns the fixed `dist/server.js` with no arguments, runs read-only, mutates
 * nothing, and adds no dependencies.
 *
 * Run:  npm run mcp:smoke   (builds first, then runs this)
 * Or:   node scripts/mcp/dist/server.js  must exist, then `node scripts/mcp/smoke.mjs`.
 *
 * Exit code 0 = pass, 1 = fail.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "dist", "server.js");
const TIMEOUT_MS = 20_000;

if (!existsSync(serverPath)) {
  console.error(`✖ Built server not found at ${serverPath}`);
  console.error("  Run `npm run mcp:build` first (or use `npm run mcp:smoke`).");
  process.exit(1);
}

const requests = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_provider_manifests", arguments: {} } },
];

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "inherit"], // stderr (server logs) inherited, not parsed
});

let out = "";
const byId = new Map();
let settled = false;

const timer = setTimeout(() => finish(false, `timed out after ${TIMEOUT_MS}ms`), TIMEOUT_MS);

function finish(ok, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try {
    child.stdin.end();
    child.kill();
  } catch {
    /* ignore */
  }
  if (ok) {
    console.log("✓ MCP smoke test PASSED");
    process.exit(0);
  } else {
    console.error(`✖ MCP smoke test FAILED: ${message}`);
    process.exit(1);
  }
}

child.on("error", (e) => finish(false, `failed to spawn server: ${e.message}`));

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  out += chunk;
  let nl = out.indexOf("\n");
  while (nl !== -1) {
    const line = out.slice(0, nl).trim();
    out = out.slice(nl + 1);
    if (line) {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return finish(false, `non-JSON line on stdout: ${line.slice(0, 120)}`);
      }
      byId.set(msg.id, msg);
    }
    nl = out.indexOf("\n");
  }
  if (byId.has(1) && byId.has(2) && byId.has(3)) validate();
});

function validate() {
  const r1 = byId.get(1);
  const r2 = byId.get(2);
  const r3 = byId.get(3);

  const serverName = r1?.result?.serverInfo?.name;
  if (!serverName) return finish(false, "initialize missing serverInfo.name");

  const tools = r2?.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    return finish(false, "tools/list returned no tools");
  }

  const content = r3?.result?.content;
  if (!Array.isArray(content) || content[0]?.type !== "text") {
    return finish(false, "tools/call did not return a text content envelope");
  }

  console.log(`  serverInfo: ${serverName} v${r1.result.serverInfo.version}`);
  console.log(`  protocolVersion: ${r1.result.protocolVersion}`);
  console.log(`  tools/list: ${tools.length} tools`);
  console.log(`  tools/call list_provider_manifests: ${content[0].text.split("\n")[0]}`);
  finish(true);
}

// Drive the protocol: write all three requests, then close stdin so the server
// finishes and exits once it has emitted the responses.
child.stdin.write(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
