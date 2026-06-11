#!/usr/bin/env node
/**
 * Internal MCP server — Streamable HTTP smoke test.
 *
 * Purpose: prove the BUILT HTTP server speaks the MCP Streamable HTTP subset
 * end-to-end over a real socket — `initialize` → `tools/list` → one read-only
 * `tools/call` — AND that an unauthenticated request is rejected with 401. This
 * is a bounded verification helper, not a tool: it spawns the fixed
 * `dist/httpServer.js`, binds loopback on an OS-assigned port, runs read-only,
 * mutates nothing, and adds no dependencies.
 *
 * Run:  npm run mcp:http:smoke   (builds first, then runs this)
 *
 * Exit code 0 = pass, 1 = fail.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "dist", "httpServer.js");
const TIMEOUT_MS = 20_000;
const TOKEN = randomBytes(24).toString("hex");

if (!existsSync(serverPath)) {
  console.error(`✖ Built HTTP server not found at ${serverPath}`);
  console.error("  Run `npm run mcp:build` first (or use `npm run mcp:http:smoke`).");
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    MCP_HTTP_TOKEN: TOKEN,
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0", // OS-assigned — avoids port collisions.
  },
});

let settled = false;
let stderrBuf = "";
const timer = setTimeout(() => finish(false, `timed out after ${TIMEOUT_MS}ms`), TIMEOUT_MS);

function finish(ok, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  if (ok) {
    console.log("✓ MCP HTTP smoke test PASSED");
    process.exit(0);
  } else {
    console.error(`✖ MCP HTTP smoke test FAILED: ${message}`);
    process.exit(1);
  }
}

child.on("error", (e) => finish(false, `failed to spawn server: ${e.message}`));
child.on("exit", (code) => {
  if (!settled) finish(false, `server exited early (code ${code}). stderr:\n${stderrBuf}`);
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderrBuf += chunk;
  if (stderrBuf.includes(TOKEN)) {
    return finish(false, "token leaked to stderr — redaction failed");
  }
  const m = /listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/.exec(stderrBuf);
  if (m && !settled) void runChecks(m[1]);
});

let started = false;
async function runChecks(endpoint) {
  if (started) return;
  started = true;
  try {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TOKEN}`,
    };

    // 1. Unauthorized (no bearer) must be rejected.
    const unauth = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }),
    });
    if (unauth.status !== 401) {
      return finish(false, `unauthenticated request returned ${unauth.status}, expected 401`);
    }
    const unauthText = await unauth.text();
    if (unauthText.includes(TOKEN)) {
      return finish(false, "401 body leaked the token");
    }

    // 2. initialize
    const initRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
    });
    if (initRes.status !== 200) return finish(false, `initialize returned ${initRes.status}`);
    const sessionId = initRes.headers.get("mcp-session-id");
    const init = await initRes.json();
    if (!init?.result?.serverInfo?.name) return finish(false, "initialize missing serverInfo.name");
    if (!sessionId) return finish(false, "initialize did not return an Mcp-Session-Id header");

    // 3. tools/list
    const listRes = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, "mcp-session-id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const list = await listRes.json();
    const tools = list?.result?.tools;
    if (!Array.isArray(tools) || tools.length === 0) return finish(false, "tools/list returned no tools");

    // 4. tools/call (read-only)
    const callRes = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, "mcp-session-id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_provider_manifests", arguments: {} } }),
    });
    const call = await callRes.json();
    const content = call?.result?.content;
    if (!Array.isArray(content) || content[0]?.type !== "text") {
      return finish(false, "tools/call did not return a text content envelope");
    }

    // 5. GET → 405 (no server-initiated SSE offered)
    const getRes = await fetch(endpoint, { method: "GET", headers: { ...headers, accept: "text/event-stream" } });
    if (getRes.status !== 405) return finish(false, `GET returned ${getRes.status}, expected 405`);

    console.log(`  endpoint: ${endpoint}`);
    console.log(`  serverInfo: ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);
    console.log(`  protocolVersion: ${init.result.protocolVersion}`);
    console.log(`  Mcp-Session-Id: ${sessionId.slice(0, 8)}…`);
    console.log(`  tools/list: ${tools.length} tools`);
    console.log(`  unauthenticated request correctly rejected (401)`);
    finish(true);
  } catch (e) {
    finish(false, `HTTP check error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
