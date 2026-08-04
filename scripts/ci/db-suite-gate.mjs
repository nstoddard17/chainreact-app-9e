/**
 * DB-CI-COVERAGE-GAP-1 — the activation + anti-vacuity gate behind db-ci.yml's
 * database suite groups.
 *
 * The environment-gated database suites (`tests/integration/security`,
 * `tests/integration/migrations`, `tests/integration/billing`,
 * `tests/integration/accounts`) all resolve to `describe.skip` unless
 * ALLOW_DB_INTEGRATION_TESTS=true plus the Supabase connection values are
 * present. That makes "jest exited 0" a WORTHLESS signal on its own: a group
 * whose activation variables silently went missing skips every test and still
 * exits 0. This gate exists so absence can never read as success.
 *
 * Three subcommands:
 *
 *   preflight
 *     Asserts the activation variables are present AND that the Supabase URL is
 *     loopback, before any suite runs. Never prints a key value.
 *
 *   run --group <name> --min-suites <n> --out <file>
 *     Discovers the group's suite files with JEST'S OWN `--listTests` (so a new
 *     suite added to the group directory is covered automatically — no
 *     hand-maintained file list), runs them serially through the same
 *     `npm test` entrypoint, writes the machine-readable jest result, then
 *     verifies it. Exits with jest's own exit code when jest failed; exits 1
 *     when jest "passed" vacuously.
 *
 *   verify --group <name> --expected <file> --raw <jest-json> --exit <code> --out <file>
 *     The verification half of `run`, separately invocable (and unit-tested).
 *
 * Fail-closed rules (all enforced by `verifyGroupExecution`):
 *   - the jest result artifact must exist (a missing artifact is a failure,
 *     never an implicit pass);
 *   - jest's own exit code must be 0;
 *   - the group must discover at least `--min-suites` suite files — a
 *     discovery that collapses to zero cannot pass vacuously;
 *   - every DISCOVERED suite file must actually have been EXECUTED;
 *   - the group must not resolve entirely to skipped tests;
 *   - at least one test must have passed;
 *   - EVERY suite file must contribute at least one passing test, so a single
 *     suite whose extra gate (e.g. the anon key) went missing cannot hide
 *     behind its passing siblings;
 *   - no failed tests / failed suites.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..", "..");

/**
 * The suite groups db-ci runs, in execution order. Each group is a set of
 * DIRECTORIES; the suite files inside them are discovered by jest, never listed
 * here, so adding a suite to a group needs no change to this script.
 */
export const GROUPS = {
  security: ["tests/integration/security", "tests/integration/migrations"],
  billing: ["tests/integration/billing"],
  accounts: ["tests/integration/accounts"],
};

/** Activation variables every database suite group requires to run for real. */
const REQUIRED_ENV = [
  "ALLOW_DB_INTEGRATION_TESTS",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) {
    if (fallback !== undefined) return fallback;
    fail(`missing required argument --${name}`);
  }
  return process.argv[i + 1];
}

function fail(message) {
  console.error(`DB-SUITE-GATE FAIL — ${message}`);
  process.exit(1);
}

/** Absolute path (either separator) -> repo-relative forward-slash path. */
export function toRepoRelative(absPath, root = ROOT) {
  const normalizedRoot = root.split(sep).join("/").replace(/\/+$/, "");
  const normalized = String(absPath).split(sep).join("/").replace(/\r$/, "");
  if (!normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    fail(`test path is outside the repository root: ${absPath}`);
  }
  return normalized.slice(normalizedRoot.length + 1);
}

export function isLoopbackUrl(url) {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "0.0.0.0" || h === "::1";
  } catch {
    return false;
  }
}

/**
 * Pure activation check — exported for direct testing. Returns violation
 * strings; empty means the environment can genuinely activate the suites.
 * NEVER returns or logs a key value.
 */
export function verifyActivationEnv(env) {
  const violations = [];
  for (const key of REQUIRED_ENV) {
    if (!env[key]) violations.push(`activation variable ${key} is absent`);
  }
  if (env.ALLOW_DB_INTEGRATION_TESTS && env.ALLOW_DB_INTEGRATION_TESTS !== "true") {
    violations.push(
      `ALLOW_DB_INTEGRATION_TESTS must be the literal "true" (the suites compare it exactly)`,
    );
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (url && !isLoopbackUrl(url)) {
    // db-ci is loopback-only by design: a hosted project must never be reached.
    violations.push("NEXT_PUBLIC_SUPABASE_URL is not loopback — refusing to run against a hosted database");
  }
  return violations;
}

/**
 * Pure execution check — exported for direct testing. `expectedFiles` is jest's
 * OWN discovery for the group; `result` is the reduced jest run result.
 * Returns violation strings; empty means the group genuinely executed.
 */
export function verifyGroupExecution(group, expectedFiles, result, minSuites) {
  const violations = [];

  if (result === null || result === undefined) {
    return [`no jest result artifact for group "${group}" — absence is never success`];
  }

  if (expectedFiles.length < minSuites) {
    violations.push(
      `group "${group}" discovered ${expectedFiles.length} suite files, expected at least ${minSuites} — discovery collapsed`,
    );
  }

  if (result.crashed === true) {
    violations.push(`group "${group}" crashed before writing a jest result`);
  }
  if (result.exit !== 0) {
    violations.push(`group "${group}" jest exited ${result.exit}`);
  }
  if (result.success !== true) {
    violations.push(`group "${group}" jest did not report success`);
  }

  const executed = new Set(result.files ?? []);
  for (const f of expectedFiles) {
    if (!executed.has(f)) {
      violations.push(`group "${group}": discovered suite ${f} was NOT executed`);
    }
  }
  for (const f of executed) {
    if (!expectedFiles.includes(f)) {
      violations.push(`group "${group}": executed ${f}, which is not in the group's discovery`);
    }
  }

  if ((result.failedTests ?? 0) > 0 || (result.failedSuites ?? 0) > 0) {
    violations.push(
      `group "${group}" had ${result.failedSuites ?? 0} failed suites / ${result.failedTests ?? 0} failed tests`,
    );
  }

  const passed = result.passedTests ?? 0;
  const skipped = result.skippedTests ?? 0;
  if (passed < 1) {
    violations.push(`group "${group}" passed ZERO tests — an all-skipped group is not coverage`);
  }
  if (passed === 0 && skipped > 0) {
    violations.push(`group "${group}" resolved entirely to skipped tests`);
  }

  // Per-file: one suite silently de-activating (a missing anon key, say) must
  // not hide behind its passing siblings.
  for (const f of expectedFiles) {
    const perFile = (result.perFile ?? {})[f];
    if (!perFile) {
      if (executed.has(f)) violations.push(`group "${group}": no per-suite counts recorded for ${f}`);
      continue;
    }
    if ((perFile.passed ?? 0) < 1) {
      violations.push(
        `group "${group}": suite ${f} passed ZERO tests (${perFile.skipped ?? 0} skipped) — it did not activate`,
      );
    }
  }

  return violations;
}

/** Jest's own discovery for a group, as repo-relative sorted paths. */
function discoverGroupFiles(group) {
  const dirs = GROUPS[group];
  if (!dirs) fail(`unknown group "${group}" — expected one of ${Object.keys(GROUPS).join(" | ")}`);
  const stdout = execFileSync(
    process.execPath,
    ["--experimental-vm-modules", "node_modules/jest/bin/jest.js", "--listTests", "--json", ...dirs],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const files = JSON.parse(stdout).map((p) => toRepoRelative(p)).sort();
  if (files.length === 0) fail(`group "${group}" discovered zero suite files`);
  return files;
}

/** Reduce jest's full --json report to the small machine-verifiable result. */
export function reduceJestReport(raw, exitCode) {
  const perFile = {};
  for (const r of raw.testResults ?? []) {
    const rel = toRepoRelative(r.name);
    const assertions = r.assertionResults ?? [];
    perFile[rel] = {
      passed: assertions.filter((a) => a.status === "passed").length,
      failed: assertions.filter((a) => a.status === "failed").length,
      skipped: assertions.filter((a) => a.status === "pending" || a.status === "todo").length,
    };
  }
  return {
    exit: exitCode,
    success: raw.success === true && exitCode === 0,
    totalSuites: raw.numTotalTestSuites,
    passedSuites: raw.numPassedTestSuites,
    failedSuites: raw.numFailedTestSuites,
    skippedSuites: raw.numPendingTestSuites,
    totalTests: raw.numTotalTests,
    passedTests: raw.numPassedTests,
    failedTests: raw.numFailedTests,
    skippedTests: (raw.numPendingTests ?? 0) + (raw.numTodoTests ?? 0),
    files: Object.keys(perFile).sort(),
    perFile,
  };
}

function cmdPreflight() {
  const violations = verifyActivationEnv(process.env);
  if (violations.length > 0) {
    for (const v of violations) console.error(`DB-SUITE-GATE FAIL — ${v}`);
    process.exit(1);
  }
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  console.log(`DB-SUITE-GATE preflight PASS — activation variables present, Supabase host is loopback (${host}).`);
  console.log(`  groups to run: ${Object.keys(GROUPS).join(", ")}`);
}

function reportAndExit(group, expectedFiles, result, minSuites) {
  const violations = verifyGroupExecution(group, expectedFiles, result, minSuites);
  if (violations.length > 0) {
    for (const v of violations) console.error(`DB-SUITE-GATE FAIL — ${v}`);
    // Preserve jest's own failing code when jest is what failed.
    process.exit(result && result.exit ? result.exit : 1);
  }
  console.log(`DB-SUITE-GATE PASS — group "${group}"`);
  console.log(`  discovered suites: ${expectedFiles.length} (jest --listTests, min ${minSuites})`);
  console.log(`  executed suites:   ${result.totalSuites} (passed ${result.passedSuites}, failed ${result.failedSuites}, skipped ${result.skippedSuites})`);
  console.log(`  tests:             ${result.totalTests} total / ${result.passedTests} passed / ${result.failedTests} failed / ${result.skippedTests} skipped`);
  for (const f of expectedFiles) {
    const p = result.perFile[f];
    console.log(`    ${f} — ${p.passed} passed / ${p.failed} failed / ${p.skipped} skipped`);
  }
}

function cmdRun() {
  const group = arg("group");
  const minSuites = Number(arg("min-suites"));
  const out = arg("out");
  if (!Number.isInteger(minSuites) || minSuites < 1) fail("--min-suites must be a positive integer");

  const envViolations = verifyActivationEnv(process.env);
  if (envViolations.length > 0) {
    for (const v of envViolations) console.error(`DB-SUITE-GATE FAIL — ${v}`);
    process.exit(1);
  }

  const expectedFiles = discoverGroupFiles(group);
  console.log(`DB-SUITE-GATE — group "${group}": ${expectedFiles.length} discovered suite files`);

  const rawPath = resolve(ROOT, `jest-db-${group}-raw.json`);
  // Same entrypoint as every other jest run in this repo. Serial: the suites
  // share ONE database and several assert population-wide invariants.
  const jest = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "test",
      "--",
      "--runInBand",
      "--json",
      `--outputFile=${rawPath}`,
      ...GROUPS[group],
    ],
    { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
  );
  const exitCode = jest.status === null ? 1 : jest.status;
  console.log(`DB-SUITE-GATE — group "${group}": jest exited ${exitCode}`);

  let result;
  if (!existsSync(rawPath)) {
    result = { exit: exitCode || 1, crashed: true, files: [], perFile: {} };
  } else {
    result = reduceJestReport(JSON.parse(readFileSync(rawPath, "utf8")), exitCode);
  }
  writeFileSync(out, JSON.stringify({ group, minSuites, expectedFiles, ...result }, null, 2));

  reportAndExit(group, expectedFiles, result, minSuites);
}

function cmdVerify() {
  const group = arg("group");
  const minSuites = Number(arg("min-suites"));
  const expectedPath = arg("expected");
  const rawPath = arg("raw");
  const exitCode = Number(arg("exit"));
  const out = arg("out", "");

  if (!existsSync(expectedPath)) fail(`expected-files artifact missing: ${expectedPath}`);
  const expectedFiles = JSON.parse(readFileSync(expectedPath, "utf8"));

  let result;
  if (!existsSync(rawPath)) {
    result = { exit: exitCode || 1, crashed: true, files: [], perFile: {} };
  } else {
    result = reduceJestReport(JSON.parse(readFileSync(rawPath, "utf8")), exitCode);
  }
  if (out) writeFileSync(out, JSON.stringify({ group, minSuites, expectedFiles, ...result }, null, 2));

  reportAndExit(group, expectedFiles, result, minSuites);
}

// Dispatch ONLY when executed directly — tests import the pure helpers.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const command = process.argv[2];
  if (command === "preflight") cmdPreflight();
  else if (command === "run") cmdRun();
  else if (command === "verify") cmdVerify();
  else fail(`unknown command: ${command ?? "(none)"} — expected preflight | run | verify`);
}
