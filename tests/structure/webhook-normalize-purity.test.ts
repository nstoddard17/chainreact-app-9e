/**
 * Structure invariant: webhook `normalize.ts` modules are PURE and produce a
 * DETERMINISTIC dedup key.
 *
 * Per docs/rules/webhook-receipt-routes.md §"normalize is pure: same input →
 * same output, no side effects" (line ~130). `normalize.ts` converts a parsed
 * provider event into the canonical `TriggerEvent`; it must be a pure
 * transformation so that:
 *   - it has no I/O / DB / network dependency (testable in isolation), and
 *   - the dispatcher's idempotency dedup — keyed on `(provider, eventId)` in
 *     services/triggers/dispatch.ts — actually works: a REPLAYED event must
 *     normalize to the SAME `eventId`, or the replay is treated as new and the
 *     workflow runs twice.
 *
 * This guard sweeps every `normalize.ts` under `integrations/` and enforces two
 * properties. It is the locally-provable half of the "live webhook delivery +
 * dedup" readiness item (the live signed-POST half is post-switch).
 *
 * IMPORTANT distinction (why `new Date()` is NOT blanket-banned): the
 * informational `occurredAt` field legitimately falls back to
 * `new Date().toISOString()` when a provider omits a timestamp (~18 files do
 * this). `occurredAt` is not the dedup key, so a "now" fallback there is fine.
 * The dedup key is `eventId` — THAT must never be derived from a clock/RNG.
 * Test 2 enforces the narrow, correctness-critical rule; Test 1 enforces the
 * general no-I/O purity that is already clean across the tree.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const INTEGRATIONS = join(ROOT, "integrations");

function collectNormalizeFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectNormalizeFiles(full));
    } else if (entry.name === "normalize.ts") {
      out.push(full);
    }
  }
  return out;
}

/** Strip line + block comments so doc-prose mentions don't trip the scans. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const rel = (f: string) => f.slice(ROOT.length + 1).replace(/\\/g, "/");

const FILES = (() => {
  try {
    statSync(INTEGRATIONS);
  } catch {
    return [];
  }
  return collectNormalizeFiles(INTEGRATIONS);
})();

describe("webhook normalize.ts purity + dedup-key determinism", () => {
  it("discovers normalize modules to scan (guard is not silently empty)", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  // ── Test 1: general purity — no I/O, no impure deps, no RNG/clock-via-Date.now ──
  it("no normalize module performs I/O or imports an impure layer", () => {
    const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
      { re: /\bawait\b/, why: "await (normalize must be synchronous/pure)" },
      { re: /\bfetch\s*\(/, why: "fetch( (no network in normalize)" },
      { re: /\bsupabase\b/, why: "supabase (no DB in normalize)" },
      { re: /from\s+['"]@\/(app|features|components|repositories|services|stores)(?:\/|['"])/, why: "import from an impure layer" },
      { re: /\bMath\.random\s*\(/, why: "Math.random (non-deterministic)" },
      { re: /\bDate\.now\s*\(/, why: "Date.now (non-deterministic clock read — derive ids from payload content instead)" },
      { re: /\bprocess\.env\b/, why: "process.env (environment-dependent output)" },
    ];
    const offenders: string[] = [];
    for (const file of FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const { re, why } of FORBIDDEN) {
        if (re.test(code)) offenders.push(`${rel(file)} — ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // ── Test 2: the dedup key (eventId) is deterministic ──
  // `occurredAt` may fall back to `new Date()`; `eventId` may NOT. Scan each
  // statement that assigns eventId and assert it does not read the clock/RNG.
  it("eventId is never derived from a clock or RNG (replay must dedup)", () => {
    // Matches `eventId = <expr>;`, `const eventId = <expr>;`, and object-literal
    // `eventId: <expr>,` — capturing the assigned expression up to its
    // terminator so a multi-token fallback is fully inspected.
    const ASSIGN_RE = /\beventId\s*[:=]\s*([^;,\n]+)/g;
    const offenders: string[] = [];
    for (const file of FILES) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const m of code.matchAll(ASSIGN_RE)) {
        const expr = m[1]!;
        if (/\bnew\s+Date\b|\bDate\.now\b|\bMath\.random\b/.test(expr)) {
          offenders.push(`${rel(file)} — eventId derived from clock/RNG: \`${expr.trim()}\``);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
