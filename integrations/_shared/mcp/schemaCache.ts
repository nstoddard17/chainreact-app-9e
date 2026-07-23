/**
 * Short-lived live-tools cache for the MCP executor (CS-4 MCP-DRIFT).
 *
 * CS-3's executor ran `tools/list` on EVERY action to check drift — correct but
 * a per-execution round-trip. This in-process cache holds a server's live
 * `tools/list` for a short TTL (default 5 min), keyed by (provider, serverUrl),
 * so a busy workflow re-uses one fetch across many steps.
 *
 * Safety is NOT reduced: drift CLASSIFICATION still runs on every execution
 * (it's pure and reads the cached live schema vs the certified pin). The cache
 * only removes the network fetch; a breaking change is still refused on every
 * call within the window, and the window bounds how stale the live view can be
 * (a brand-new vendor break is caught within one TTL).
 *
 * Single-flight: concurrent misses for the same key share ONE in-flight fetch,
 * so a burst of steps never stampedes the server.
 *
 * `now` is injectable for deterministic TTL tests; production uses `Date.now()`
 * (ordinary runtime code — the Date.now ban applies only to workflow scripts).
 */

import type { McpTool } from "./types";

export const DEFAULT_SCHEMA_CACHE_TTL_MS = 5 * 60_000; // 5 minutes (plan: 5–10 min)

interface CacheEntry {
  readonly tools: readonly McpTool[];
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<readonly McpTool[]>>();

let hits = 0;
let misses = 0;

export interface GetLiveToolsInput {
  readonly provider: string;
  readonly serverUrl: string;
  /** Fetch the live `tools/list` on a miss. Called at most once per TTL/key. */
  readonly fetch: () => Promise<readonly McpTool[]>;
  readonly ttlMs?: number;
  /** Injectable clock (tests). Defaults to `Date.now()`. */
  readonly now?: number;
}

export interface GetLiveToolsResult {
  readonly tools: readonly McpTool[];
  /** True when served without a network fetch (fresh entry OR shared in-flight). */
  readonly fromCache: boolean;
}

function keyFor(provider: string, serverUrl: string): string {
  return `${provider}|${serverUrl}`;
}

export async function getLiveTools(input: GetLiveToolsInput): Promise<GetLiveToolsResult> {
  const key = keyFor(input.provider, input.serverUrl);
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_SCHEMA_CACHE_TTL_MS;

  const entry = cache.get(key);
  if (entry && now < entry.expiresAt) {
    hits++;
    return { tools: entry.tools, fromCache: true };
  }

  // Coalesce concurrent misses onto one fetch.
  const existing = inFlight.get(key);
  if (existing) {
    hits++;
    return { tools: await existing, fromCache: true };
  }

  misses++;
  const promise = (async () => input.fetch())();
  inFlight.set(key, promise);
  try {
    const tools = await promise;
    cache.set(key, { tools, expiresAt: now + ttlMs });
    return { tools, fromCache: false };
  } finally {
    inFlight.delete(key);
  }
}

/** Drop a single provider/server entry (e.g. after a re-certification deploy). */
export function invalidateSchemaCache(provider: string, serverUrl: string): void {
  cache.delete(keyFor(provider, serverUrl));
}

/** Clear everything — test isolation + a global reset hook. */
export function clearSchemaCache(): void {
  cache.clear();
  inFlight.clear();
  hits = 0;
  misses = 0;
}

/** Hit/miss counters + current size — for the perf harness and tests. */
export function schemaCacheStats(): { hits: number; misses: number; size: number } {
  return { hits, misses, size: cache.size };
}
