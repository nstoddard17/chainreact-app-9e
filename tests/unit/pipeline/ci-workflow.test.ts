/**
 * @jest-environment node
 *
 * CI-JEST-SHARDING-1 — contract tests for the sharded CI gate.
 *
 * Two halves:
 *   1. Textual invariants on .github/workflows/ci.yml (same pattern as
 *      workflow-safety.test.ts): the sharded shape, the fail-closed wiring,
 *      and the absences that keep CI honest (no exclusions, no retries, no
 *      secrets, no deployment).
 *   2. BEHAVIORAL fail-closed proofs of the aggregation verifier: the real
 *      scripts/ci/jest-shard-tools.mjs `verify` command is spawned against
 *      crafted artifacts and must reject every corruption class — a missing
 *      artifact, a duplicated / missing / extra test file, a failing shard,
 *      a SHA mismatch, and a count mismatch — and accept only the exact
 *      partition.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const TOOLS = resolve(ROOT, "scripts/ci/jest-shard-tools.mjs");

// Executable content only; full-line comments may mention banned words while
// documenting why they are banned.
const WF = (name: string) =>
  readFileSync(resolve(ROOT, ".github/workflows", name), "utf8")
    .split(/\r?\n/)
    .filter((l: string) => !/^\s*#/.test(l))
    .join("\n");

describe("ci.yml — four-way sharded gate, fail-closed aggregation", () => {
  const text = WF("ci.yml");

  it("runs four native jest shards with fail-fast disabled", () => {
    const jestJob = text.slice(text.indexOf("\n  jest:"), text.indexOf("\n  aggregate:"));
    expect(jestJob).toContain("fail-fast: false");
    expect(jestJob).toContain("shard: [1, 2, 3, 4]");
    // Native jest sharding through the SAME npm test entrypoint as the
    // unsharded gate — no bespoke splitter, no directory allowlist.
    expect(jestJob).toContain("npm test -- --shard=${{ matrix.shard }}/4");
  });

  it("keeps every static gate with its exact current command", () => {
    const staticJob = text.slice(text.indexOf("\n  static:"), text.indexOf("\n  discover:"));
    expect(staticJob).toContain("npx tsc --noEmit");
    expect(staticJob).toContain("npm run lint");
    expect(staticJob).toContain("npm run lint:structure");
    expect(staticJob).toContain("npm run lint:migrations");
  });

  it("derives the inventory from jest's own discovery, not a manual list", () => {
    const discoverJob = text.slice(text.indexOf("\n  discover:"), text.indexOf("\n  jest:"));
    expect(discoverJob).toContain("jest-shard-tools.mjs inventory");
    // No hand-maintained test-directory allowlist anywhere in the workflow.
    expect(text).not.toMatch(/--testPathPattern|testPathIgnorePatterns|--roots\b/);
  });

  it("aggregation always runs, consumes all artifacts, and is fail-closed", () => {
    const agg = text.slice(text.indexOf("\n  aggregate:"), text.indexOf("\n  ci-gate:"));
    expect(agg).toMatch(/needs:\s*\[discover, jest\]/);
    expect(agg).toContain("if: always()");
    expect(agg).toContain("jest-shard-tools.mjs verify");
    expect(agg).toContain("--shards 4");
  });

  it("the final gate requires static AND every shard AND aggregation", () => {
    const gate = text.slice(text.indexOf("\n  ci-gate:"));
    expect(gate).toMatch(/needs:\s*\[static, jest, aggregate\]/);
    expect(gate).toContain("if: always()");
    for (const dep of ["static", "jest", "aggregate"]) {
      expect(gate).toContain(`needs.${dep}.result }}" != "success"`);
    }
    expect(gate).toMatch(/exit 1/);
  });

  it("a failing jest exit code always fails the shard job (set +e is re-asserted)", () => {
    const jestJob = text.slice(text.indexOf("\n  jest:"), text.indexOf("\n  aggregate:"));
    expect(jestJob).toContain('if [ "${JEST_EXIT:-1}" != "0" ]; then');
    // The default is 1: an unset exit variable can never read as success.
    expect(jestJob).not.toContain("JEST_EXIT:-0");
  });

  it("introduces no retries and no failure masking", () => {
    expect(text).not.toMatch(/retry|retries|retryTimes/i);
    expect(text).not.toContain("continue-on-error");
  });

  it("caches transformed code only — never test results", () => {
    const jestJob = text.slice(text.indexOf("\n  jest:"), text.indexOf("\n  aggregate:"));
    expect(jestJob).toContain("path: .jest-cache");
    expect(jestJob).toContain("--cacheDirectory=.jest-cache");
    // The cache key invalidates on every relevant input.
    for (const input of [
      "package-lock.json",
      "jest.config.mjs",
      "tsconfig.json",
      "jest.setup.ts",
    ]) {
      expect(jestJob).toContain(input);
    }
    // The jest RESULT files must never sit inside a cached path: enumerate
    // EVERY actions/cache block and pin its path — the transform cache is the
    // one and only cache, so a future "cache the results" shortcut cannot
    // slip in as a second cache step. (Result/inventory files travel via
    // upload-artifact, which stores per-run evidence, never reusable state.)
    const cachePaths = [...text.matchAll(/uses: actions\/cache[\s\S]{0,200}?path: (\S+)/g)].map(
      (m) => m[1],
    );
    expect(cachePaths).toEqual([".jest-cache"]);
    const cacheBlocks = text.match(/uses: actions\/cache/g) ?? [];
    expect(cacheBlocks).toHaveLength(1);
  });

  it("changes no execution posture: no worker override, no added env, no raised timeout", () => {
    expect(text).not.toContain("--maxWorkers");
    expect(text).not.toMatch(/ALLOW_DB_INTEGRATION_TESTS|ALLOW_LIVE_PROVIDER_SMOKE/);
    for (const m of text.matchAll(/timeout-minutes: (\d+)/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(90);
    }
  });

  it("has no secrets, no environments, and no deployment behavior", () => {
    expect(text).not.toContain("secrets.");
    expect(text).not.toMatch(/\n\s+environment:/);
    expect(text).not.toMatch(/vercel|deploy to|db push|supabase\b/i);
  });
});

describe("jest-shard-tools verify — behavioral fail-closed proofs (real CLI)", () => {
  let dir: string;

  const SHA = "0123456789abcdef0123456789abcdef01234567";
  const FILES = [
    "tests/unit/a.test.ts",
    "tests/unit/b.test.ts",
    "tests/unit/c.test.ts",
    "tests/unit/d.test.ts",
  ];

  const inventory = (files: string[] = FILES, sha = SHA) => ({
    sha,
    count: files.length,
    files: [...files].sort(),
  });

  const shard = (
    k: number,
    files: string[],
    overrides: Record<string, unknown> = {},
  ) => ({
    sha: SHA,
    shard: `${k}/4`,
    exit: 0,
    success: true,
    totalSuites: files.length,
    passedSuites: files.length,
    failedSuites: 0,
    skippedSuites: 0,
    passedTests: files.length * 3,
    failedTests: 0,
    skippedTests: 0,
    durationMs: 1000,
    files: [...files].sort(),
    ...overrides,
  });

  /** Write artifacts and run the REAL verify CLI against them. */
  function runVerify(inv: unknown, shards: Array<Record<string, unknown> | null>) {
    writeFileSync(join(dir, "jest-inventory.json"), JSON.stringify(inv));
    shards.forEach((s, i) => {
      if (s !== null) {
        writeFileSync(join(dir, `shard-result-${i + 1}.json`), JSON.stringify(s));
      }
    });
    return spawnSync(
      process.execPath,
      [TOOLS, "verify", "--inventory", join(dir, "jest-inventory.json"), "--results", dir, "--shards", "4"],
      { encoding: "utf8" },
    );
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shard-verify-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES only the exact partition, and reports the summed counts", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      shard(4, [FILES[3]!]),
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("SHARD-GATE PASS");
    expect(r.stdout).toContain("executed suites:   4");
  });

  it("fails closed when a shard artifact is missing", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      null,
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("shard artifact missing");
  });

  it("fails when a test file was executed by two shards (duplicate)", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!, FILES[1]!]),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      shard(4, [FILES[3]!]),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("duplicate:");
  });

  it("fails when a discovered test file was executed by no shard (missing)", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      shard(4, []),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("missing:");
  });

  it("fails when a shard executed a file outside the inventory (extra)", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      shard(4, [FILES[3]!, "tests/unit/ghost.test.ts"]),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("extra:");
  });

  it("fails when any shard did not pass, even with a perfect partition", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!], { exit: 1, success: false }),
      shard(3, [FILES[2]!]),
      shard(4, [FILES[3]!]),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("did not pass");
  });

  it("fails when a shard ran a different SHA than the inventory", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!], { sha: "ffffffffffffffffffffffffffffffffffffffff" }),
      shard(3, [FILES[2]!]),
      shard(4, [FILES[3]!]),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("inventory is");
  });

  it("fails when summed executed suites disagree with the discovered count", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!], { totalSuites: 2 }),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      shard(4, [FILES[3]!]),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("summed executed suites");
  });

  it("fails when a shard crashed before reporting", () => {
    const r = runVerify(inventory(), [
      shard(1, [FILES[0]!]),
      shard(2, [FILES[1]!]),
      shard(3, [FILES[2]!]),
      { sha: SHA, shard: "4/4", exit: 1, crashed: true, files: [] },
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("crashed before reporting");
  });
});
