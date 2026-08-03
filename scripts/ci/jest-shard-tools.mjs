/**
 * CI-JEST-SHARDING-1 — the machinery behind ci.yml's four-way Jest shard gate.
 *
 * Three subcommands, all exercised by tests/unit/pipeline/ci-workflow.test.ts:
 *
 *   inventory --sha <sha> --out <file>
 *     Runs Jest's OWN discovery (`--listTests --json`, same config as the real
 *     gate — no hand-maintained directory list) and writes the authoritative
 *     inventory for the exact SHA: { sha, count, files[] } with repo-relative,
 *     forward-slash, sorted paths. Environment-gated suites are files like any
 *     other and are always included.
 *
 *   extract --sha <sha> --shard <k/N> --exit <code> --raw <jest-json> --out <file>
 *     Reduces a shard's full `--json` output (authoritative: written by the
 *     jest process that actually executed the tests) to a small
 *     machine-verifiable result: counts, duration, exit status, and the exact
 *     test files the shard EXECUTED. Never rewrites failure into success —
 *     the recorded exit code is the jest process's own.
 *
 *   verify --inventory <file> --results <dir> --shards <N>
 *     The fail-closed aggregation gate. Exits non-zero unless EVERY check
 *     passes; a missing artifact, a duplicate, a missing or extra file, a
 *     count mismatch, a SHA mismatch, or any shard failure is a hard failure.
 *     Silence is never success: it prints an explicit PASS summary with the
 *     summed counts, and every failure names the exact offending files.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..", "..");

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) {
    if (fallback !== undefined) return fallback;
    fail(`missing required argument --${name}`);
  }
  return process.argv[i + 1];
}

function fail(message) {
  console.error(`SHARD-GATE FAIL — ${message}`);
  process.exit(1);
}

/** Absolute path (either separator) -> repo-relative forward-slash path. */
export function toRepoRelative(absPath, root = ROOT) {
  const normalizedRoot = root.split(sep).join("/").replace(/\/+$/, "");
  const normalized = String(absPath).split(sep).join("/").replace(/\r$/, "");
  const lower = normalized.toLowerCase();
  const rootLower = normalizedRoot.toLowerCase();
  if (!lower.startsWith(`${rootLower}/`)) {
    fail(`test path is outside the repository root: ${absPath}`);
  }
  return normalized.slice(normalizedRoot.length + 1);
}

function cmdInventory() {
  const sha = arg("sha");
  const out = arg("out");
  // Jest's own discovery, same config as the gate. Direct node invocation (not
  // `npm test`) so stdout is exactly the JSON array, no runner banner.
  const stdout = execFileSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/jest/bin/jest.js",
      "--listTests",
      "--json",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const files = JSON.parse(stdout).map((p) => toRepoRelative(p)).sort();
  if (files.length === 0) fail("jest discovery returned zero test files");
  const dupes = files.filter((f, i) => i > 0 && files[i - 1] === f);
  if (dupes.length > 0) fail(`discovery produced duplicates: ${dupes.join(", ")}`);
  writeFileSync(out, JSON.stringify({ sha, count: files.length, files }, null, 2));
  console.log(`inventory: ${files.length} test files at ${sha}`);
}

function cmdExtract() {
  const sha = arg("sha");
  const shard = arg("shard");
  const exitCode = Number(arg("exit"));
  const rawPath = arg("raw");
  const out = arg("out");
  if (!existsSync(rawPath)) {
    // The jest process died before writing its report (OOM, crash). Record an
    // explicit failure result so aggregation fails with a reason, not a
    // missing-artifact mystery.
    writeFileSync(
      out,
      JSON.stringify({ sha, shard, exit: exitCode || 1, crashed: true, files: [] }, null, 2),
    );
    console.error(`extract: no jest JSON at ${rawPath} — recorded crashed shard`);
    return;
  }
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const files = raw.testResults.map((r) => toRepoRelative(r.name)).sort();
  writeFileSync(
    out,
    JSON.stringify(
      {
        sha,
        shard,
        exit: exitCode,
        success: raw.success === true && exitCode === 0,
        totalSuites: raw.numTotalTestSuites,
        passedSuites: raw.numPassedTestSuites,
        failedSuites: raw.numFailedTestSuites,
        skippedSuites: raw.numPendingTestSuites,
        passedTests: raw.numPassedTests,
        failedTests: raw.numFailedTests,
        skippedTests: raw.numPendingTests,
        durationMs: Date.now() - raw.startTime,
        files,
      },
      null,
      2,
    ),
  );
  console.log(
    `extract shard ${shard}: exit=${exitCode} suites=${raw.numTotalTestSuites} files=${files.length}`,
  );
}

/**
 * Pure aggregation check — exported for direct testing. Returns a list of
 * violation strings; empty means the gate passes.
 */
export function verifyShardEquivalence(inventory, shardResults, shardCount) {
  const violations = [];
  if (shardResults.length !== shardCount) {
    violations.push(
      `expected ${shardCount} shard results, found ${shardResults.length} — a missing shard artifact fails the gate`,
    );
  }
  for (const r of shardResults) {
    if (r.sha !== inventory.sha) {
      violations.push(`shard ${r.shard} ran SHA ${r.sha}, inventory is ${inventory.sha}`);
    }
    if (r.crashed === true) {
      violations.push(`shard ${r.shard} crashed before reporting`);
    } else if (r.exit !== 0 || r.success !== true) {
      violations.push(`shard ${r.shard} did not pass (exit=${r.exit})`);
    }
  }

  const seen = new Map();
  for (const r of shardResults) {
    for (const f of r.files ?? []) {
      if (seen.has(f)) {
        violations.push(`duplicate: ${f} executed by shard ${seen.get(f)} AND shard ${r.shard}`);
      } else {
        seen.set(f, r.shard);
      }
    }
  }

  const inventorySet = new Set(inventory.files);
  for (const f of inventorySet) {
    if (!seen.has(f)) violations.push(`missing: ${f} is in the inventory but no shard executed it`);
  }
  for (const f of seen.keys()) {
    if (!inventorySet.has(f)) {
      violations.push(`extra: ${f} was executed but is not in the discovery inventory`);
    }
  }

  const executed = shardResults.reduce((n, r) => n + (r.totalSuites ?? 0), 0);
  if (executed !== inventory.count) {
    violations.push(
      `summed executed suites (${executed}) != discovered inventory (${inventory.count})`,
    );
  }
  return violations;
}

function cmdVerify() {
  const inventoryPath = arg("inventory");
  const resultsDir = arg("results");
  const shardCount = Number(arg("shards", "4"));
  if (!existsSync(inventoryPath)) fail(`inventory artifact missing: ${inventoryPath}`);
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

  const shardResults = [];
  for (let k = 1; k <= shardCount; k++) {
    const p = resolve(resultsDir, `shard-result-${k}.json`);
    if (!existsSync(p)) {
      fail(`shard artifact missing: shard-result-${k}.json — refusing to treat absence as success`);
    }
    shardResults.push(JSON.parse(readFileSync(p, "utf8")));
  }

  const violations = verifyShardEquivalence(inventory, shardResults, shardCount);
  if (violations.length > 0) {
    for (const v of violations) console.error(`SHARD-GATE FAIL — ${v}`);
    process.exit(1);
  }

  const sum = (key) => shardResults.reduce((n, r) => n + (r[key] ?? 0), 0);
  console.log(`SHARD-GATE PASS at ${inventory.sha}`);
  console.log(`  inventory suites:  ${inventory.count}`);
  console.log(`  executed suites:   ${sum("totalSuites")} across ${shardCount} shards (no dupes, none missing, none extra)`);
  console.log(`  passed suites:     ${sum("passedSuites")}`);
  console.log(`  skipped suites:    ${sum("skippedSuites")}`);
  console.log(`  passed tests:      ${sum("passedTests")}`);
  console.log(`  skipped tests:     ${sum("skippedTests")}`);
}

// Dispatch ONLY when executed directly (`node jest-shard-tools.mjs <cmd>`),
// never on import — tests import verifyShardEquivalence without side effects.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const command = process.argv[2];
  if (command === "inventory") cmdInventory();
  else if (command === "extract") cmdExtract();
  else if (command === "verify") cmdVerify();
  else fail(`unknown command: ${command ?? "(none)"} — expected inventory | extract | verify`);
}
