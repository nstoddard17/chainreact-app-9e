/**
 * @jest-environment node
 *
 * Short-TTL live-tools cache (CS-4 MCP-DRIFT). Proves cache hit/miss, TTL
 * expiry, per-key isolation, single-flight coalescing, and the hit/miss stats
 * the perf harness reads.
 */
import {
  getLiveTools,
  clearSchemaCache,
  invalidateSchemaCache,
  schemaCacheStats,
  DEFAULT_SCHEMA_CACHE_TTL_MS,
} from "@/integrations/_shared/mcp/schemaCache";
import type { McpTool } from "@/integrations/_shared/mcp";

const TOOLS: readonly McpTool[] = [{ name: "save_issue", description: "", inputSchema: {} }];

function counter() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    fetch: async () => {
      calls++;
      return TOOLS;
    },
  };
}

beforeEach(() => clearSchemaCache());

it("first call misses (fetches); second within TTL hits (no fetch)", async () => {
  const c = counter();
  const a = await getLiveTools({ provider: "linear", serverUrl: "u", fetch: c.fetch, now: 0 });
  const b = await getLiveTools({ provider: "linear", serverUrl: "u", fetch: c.fetch, now: 1000 });
  expect(a.fromCache).toBe(false);
  expect(b.fromCache).toBe(true);
  expect(c.calls).toBe(1);
  expect(schemaCacheStats()).toMatchObject({ hits: 1, misses: 1 });
});

it("re-fetches after the TTL expires", async () => {
  const c = counter();
  await getLiveTools({ provider: "linear", serverUrl: "u", fetch: c.fetch, ttlMs: 1000, now: 0 });
  const expired = await getLiveTools({ provider: "linear", serverUrl: "u", fetch: c.fetch, ttlMs: 1000, now: 1500 });
  expect(expired.fromCache).toBe(false);
  expect(c.calls).toBe(2);
});

it("caches per (provider, server) — different servers don't collide", async () => {
  const c1 = counter();
  const c2 = counter();
  await getLiveTools({ provider: "linear", serverUrl: "u1", fetch: c1.fetch, now: 0 });
  await getLiveTools({ provider: "linear", serverUrl: "u2", fetch: c2.fetch, now: 0 });
  expect(c1.calls).toBe(1);
  expect(c2.calls).toBe(1);
  expect(schemaCacheStats().size).toBe(2);
});

it("single-flight: concurrent misses share ONE fetch", async () => {
  let calls = 0;
  let release: (v: readonly McpTool[]) => void = () => {};
  const gate = new Promise<readonly McpTool[]>((r) => (release = r));
  const fetch = async () => {
    calls++;
    return gate;
  };
  const p1 = getLiveTools({ provider: "linear", serverUrl: "u", fetch, now: 0 });
  const p2 = getLiveTools({ provider: "linear", serverUrl: "u", fetch, now: 0 });
  release(TOOLS);
  const [a, b] = await Promise.all([p1, p2]);
  expect(calls).toBe(1); // coalesced
  expect(a.tools).toEqual(TOOLS);
  expect(b.tools).toEqual(TOOLS);
});

it("invalidate drops a single entry; clear resets everything", async () => {
  const c = counter();
  await getLiveTools({ provider: "linear", serverUrl: "u", fetch: c.fetch, now: 0 });
  invalidateSchemaCache("linear", "u");
  await getLiveTools({ provider: "linear", serverUrl: "u", fetch: c.fetch, now: 1 });
  expect(c.calls).toBe(2); // invalidation forced a re-fetch
  clearSchemaCache();
  expect(schemaCacheStats()).toEqual({ hits: 0, misses: 0, size: 0 });
});

it("default TTL is in the 5–10 minute band", () => {
  expect(DEFAULT_SCHEMA_CACHE_TTL_MS).toBeGreaterThanOrEqual(5 * 60_000);
  expect(DEFAULT_SCHEMA_CACHE_TTL_MS).toBeLessThanOrEqual(10 * 60_000);
});
