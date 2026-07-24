import { createServer } from "node:net";
import { execFileSync } from "node:child_process";

/**
 * 5.DUAL-BUILDER-1 CS-7G — deterministic per-run loopback port reservation for the
 * E2E mock lifecycle.
 *
 * CS-7F used a FIXED mock-Hermes port (9890). Two overlapping runs — or a stray
 * process left on that port — collided. CS-7G reserves a fresh loopback port PER RUN
 * so no two runs share one mock server, and so a second concurrent run either gets
 * its own port or fails immediately with a clear message (never silently shares).
 *
 * Two entry points, one purpose:
 *   - `reserveLoopbackPortSync()` runs at `playwright.config.ts` LOAD time (before the
 *     dev-server env is interpolated), so the resolved port can be baked into the app
 *     process's `CHAINREACT_AI_GATEWAY_URL` AND read by `global-setup` — both agree on
 *     one port. It must be synchronous (the config export is synchronous), so it shells
 *     out to a tiny Node child that binds an ephemeral 127.0.0.1 port and prints it.
 *   - `findFreeLoopbackPort()` is the async form used by the mock server (`port: 0`
 *     handling) and by the lifecycle tests.
 *
 * SAFETY: binds 127.0.0.1 ONLY (never a routable interface); the child fully exits so
 * the reserving socket is released before the caller re-binds. A small TOCTOU window
 * remains (standard for get-a-free-port); `global-setup` re-binds and fails LOUD on
 * `EADDRINUSE` rather than silently continuing.
 */

/** Async: bind an ephemeral loopback port, read it, release it, return it. Never throws synchronously. */
export function findFreeLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        server.close(() => reject(new Error("[e2e] could not resolve an ephemeral loopback port")));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

/** The child program that reserves + prints one free loopback port, then exits. */
const RESERVE_CHILD_SOURCE = [
  "const net=require('node:net');",
  "const s=net.createServer();",
  "s.on('error',()=>process.exit(2));",
  "s.listen(0,'127.0.0.1',()=>{const a=s.address();const p=(a&&typeof a!=='string')?a.port:0;s.close(()=>{process.stdout.write(String(p));process.exit(p>0?0:3);});});",
].join("");

/**
 * Sync: reserve one free loopback port for this run (config-load time). Spawns a short-lived
 * Node child (via `process.execPath`, so it never depends on `node` being on PATH) that binds
 * an ephemeral 127.0.0.1 port and prints it. Throws with a clear message if reservation fails.
 */
export function reserveLoopbackPortSync(): number {
  const out = execFileSync(process.execPath, ["-e", RESERVE_CHILD_SOURCE], {
    encoding: "utf8",
    timeout: 5_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const port = Number.parseInt(out.trim(), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`[e2e] failed to reserve a free loopback port (got "${out.trim()}")`);
  }
  return port;
}

/**
 * Resolve the per-run mock-Hermes port for BOTH the config-load env interpolation and
 * `global-setup`. Reads `MOCK_HERMES_PORT` when the operator pinned one (or a prior call
 * already resolved it), else reserves a fresh loopback port and records it on the env so
 * every later reader (the dev-server env, global-setup) sees the SAME value.
 *
 * Idempotent within a process: the first call reserves + stores; later calls return the
 * stored value. This is what "passes the resolved URL to the application process" hinges on.
 */
export function resolveMockHermesPort(env: Record<string, string | undefined> = process.env): number {
  const existing = env.MOCK_HERMES_PORT;
  if (existing) {
    const parsed = Number.parseInt(existing, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) return parsed;
  }
  const port = reserveLoopbackPortSync();
  env.MOCK_HERMES_PORT = String(port);
  return port;
}

/** Build the loopback gateway URL the app process must point at for a resolved mock port. */
export function mockHermesGatewayUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
