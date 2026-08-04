/**
 * @jest-environment node
 *
 * DB-CI-COVERAGE-GAP-1 — behavioral fail-closed proofs for the database suite
 * activation gate (scripts/ci/db-suite-gate.mjs).
 *
 * The suites this gate protects are `describe.skip` unless the activation
 * variables are set, so "jest exited 0" is not evidence that anything ran. The
 * whole point of the gate is that absence can never read as success.
 *
 * Every proof below spawns the REAL CLI against crafted artifacts and asserts
 * the real process exit code — same pattern as the shard-gate proofs in
 * ci-workflow.test.ts, and for the same reason: a gate that is only unit-tested
 * through its pure helpers can still be mis-wired at the process boundary.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const GATE = resolve(ROOT, "scripts/ci/db-suite-gate.mjs");

const LOOPBACK_ENV: Record<string, string> = {
  ALLOW_DB_INTEGRATION_TESTS: "true",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-throwaway-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-throwaway-value",
};

function runGate(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = { ...process.env, ...LOOPBACK_ENV };
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return spawnSync(process.execPath, [GATE, ...args], {
    encoding: "utf8",
    env: env as unknown as typeof process.env,
  });
}

/** A jest --json report shaped exactly like the real one, for crafted cases. */
function jestReport(
  suites: Array<{ file: string; passed: number; failed?: number; skipped?: number }>,
) {
  const testResults = suites.map((s) => ({
    name: resolve(ROOT, s.file),
    assertionResults: [
      ...Array.from({ length: s.passed }, () => ({ status: "passed" })),
      ...Array.from({ length: s.failed ?? 0 }, () => ({ status: "failed" })),
      ...Array.from({ length: s.skipped ?? 0 }, () => ({ status: "pending" })),
    ],
  }));
  const sum = (k: "passed" | "failed" | "skipped") =>
    suites.reduce((n, s) => n + (s[k] ?? 0), 0);
  return {
    success: sum("failed") === 0,
    numTotalTestSuites: suites.length,
    numPassedTestSuites: suites.filter((s) => s.passed > 0 && !(s.failed ?? 0)).length,
    numFailedTestSuites: suites.filter((s) => (s.failed ?? 0) > 0).length,
    numPendingTestSuites: suites.filter((s) => s.passed === 0 && (s.skipped ?? 0) > 0).length,
    numTotalTests: sum("passed") + sum("failed") + sum("skipped"),
    numPassedTests: sum("passed"),
    numFailedTests: sum("failed"),
    numPendingTests: sum("skipped"),
    testResults,
  };
}

describe("db-suite-gate — activation environment is fail-closed", () => {
  it("preflight PASSES on an activated loopback environment, printing no key value", () => {
    const r = runGate(["preflight"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("preflight PASS");
    // The three groups db-ci runs are the gate's own definition, not a
    // duplicated list in the workflow.
    expect(r.stdout).toContain("groups to run: security, billing, accounts");
    expect(r.stdout).not.toContain("service-throwaway-value");
    expect(r.stdout).not.toContain("anon-throwaway-value");
  });

  it.each([
    "ALLOW_DB_INTEGRATION_TESTS",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ])("preflight FAILS when %s is absent", (key) => {
    const r = runGate(["preflight"], { [key]: undefined });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`${key} is absent`);
  });

  it("preflight FAILS on a truthy-but-not-literal activation flag", () => {
    // The suites compare `=== "true"`, so "1" silently skips everything.
    const r = runGate(["preflight"], { ALLOW_DB_INTEGRATION_TESTS: "1" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('literal "true"');
  });

  it("preflight FAILS against a hosted Supabase URL — db-ci is loopback-only", () => {
    const r = runGate(["preflight"], { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing to run against a hosted database");
    expect(r.stderr).not.toContain("service-throwaway-value");
  });

  it("run REFUSES to execute a group when activation is incomplete", () => {
    // Belt and braces: the group runner re-checks, so a preflight that was
    // accidentally removed from the workflow cannot produce a vacuous pass.
    const r = runGate(["run", "--group", "billing", "--min-suites", "9", "--out", "unused.json"], {
      ALLOW_DB_INTEGRATION_TESTS: undefined,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("ALLOW_DB_INTEGRATION_TESTS is absent");
  });
});

describe("db-suite-gate — group execution is fail-closed", () => {
  let dir: string;
  const A = "tests/integration/billing/a.test.ts";
  const B = "tests/integration/billing/b.test.ts";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "db-suite-gate-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Write the crafted artifacts and run the REAL verify command. */
  function verify(
    expectedFiles: string[],
    report: unknown | null,
    { exit = 0, minSuites = 2 }: { exit?: number; minSuites?: number } = {},
  ) {
    const expectedPath = join(dir, "expected.json");
    writeFileSync(expectedPath, JSON.stringify(expectedFiles));
    const rawPath = join(dir, "raw.json");
    if (report !== null) writeFileSync(rawPath, JSON.stringify(report));
    return runGate([
      "verify",
      "--group", "billing",
      "--min-suites", String(minSuites),
      "--expected", expectedPath,
      "--raw", rawPath,
      "--exit", String(exit),
      "--out", join(dir, "result.json"),
    ]);
  }

  it("PASSES only a group that genuinely executed every discovered suite", () => {
    const r = verify([A, B], jestReport([
      { file: A, passed: 3 },
      { file: B, passed: 3 },
    ]));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DB-SUITE-GATE PASS — group "billing"');
    expect(r.stdout).toContain("6 passed");
  });

  it("FAILS when the jest result artifact is missing — absence is never success", () => {
    const r = verify([A, B], null);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("crashed before writing a jest result");
  });

  it("FAILS when every test skipped although jest exited 0", () => {
    const r = verify([A, B], jestReport([
      { file: A, passed: 0, skipped: 3 },
      { file: B, passed: 0, skipped: 3 },
    ]));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("passed ZERO tests");
    expect(r.stderr).toContain("resolved entirely to skipped tests");
  });

  it("FAILS when ONE suite silently de-activated behind passing siblings", () => {
    // The exact vacuity class this gate exists for: a suite with an extra gate
    // (the anon key) stops activating, and the group still exits 0.
    const r = verify([A, B], jestReport([
      { file: A, passed: 3 },
      { file: B, passed: 0, skipped: 3 },
    ]));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(`suite ${B} passed ZERO tests`);
  });

  it("FAILS when a discovered suite was never executed", () => {
    const r = verify([A, B], jestReport([{ file: A, passed: 3 }]));
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("was NOT executed");
  });

  it("FAILS when discovery collapsed below the group's minimum suite count", () => {
    const r = verify([A], jestReport([{ file: A, passed: 3 }]), { minSuites: 9 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("discovery collapsed");
  });

  it("FAILS when jest exited nonzero even with otherwise perfect counts", () => {
    const r = verify([A, B], jestReport([
      { file: A, passed: 3 },
      { file: B, passed: 3 },
    ]), { exit: 1 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("jest exited 1");
  });

  it("FAILS when any test failed, and preserves jest's own exit code", () => {
    const r = verify([A, B], jestReport([
      { file: A, passed: 3 },
      { file: B, passed: 2, failed: 1 },
    ]), { exit: 1 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("failed tests");
  });

  it("FAILS when a suite outside the group's discovery was executed", () => {
    const r = verify([A], jestReport([
      { file: A, passed: 3 },
      { file: B, passed: 3 },
    ]), { minSuites: 1 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("not in the group's discovery");
  });

  it("writes a machine-readable result artifact for the run", () => {
    verify([A, B], jestReport([
      { file: A, passed: 3 },
      { file: B, passed: 3 },
    ]));
    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    expect(result.group).toBe("billing");
    expect(result.expectedFiles).toEqual([A, B]);
    expect(result.passedTests).toBe(6);
    expect(result.skippedTests).toBe(0);
    expect(result.perFile[A].passed).toBe(3);
  });

  it("rejects an unknown subcommand rather than silently doing nothing", () => {
    const r = runGate(["definitely-not-a-command"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("unknown command");
  });
});

describe("db-suite-gate — group definitions match what db-ci wires", () => {
  const source = readFileSync(GATE, "utf8");

  it("maps each group to the real suite directories, with no hand-listed files", () => {
    for (const dir of [
      "tests/integration/security",
      "tests/integration/migrations",
      "tests/integration/billing",
      "tests/integration/accounts",
    ]) {
      expect(source).toContain(`"${dir}"`);
    }
    // Discovery is jest's own — a new suite in a group directory is covered
    // without editing this script.
    expect(source).toContain("--listTests");
    expect(source).not.toContain("--passWithNoTests");
  });

  it("runs the suites through the same npm test entrypoint, serially", () => {
    expect(source).toContain('"test",');
    expect(source).toContain("--runInBand");
  });
});
