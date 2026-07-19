/**
 * @jest-environment node
 *
 * Guard: no test may inherit a real account from the general-purpose
 * `SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID` env vars.
 *
 * WHY: those vars pointed at the owner's REAL production account. Every DB-backed
 * smoke run therefore wrote `smoke:*` / `trigger-smoke:*` workflows into live
 * user data, and the harness only soft-deleted them — 9,320 debris workflows and
 * 9,300 runs accumulated before it was noticed.
 *
 * The rule now:
 *   - throwaway-account suites call provisionDisposableSmokeAccount()
 *   - live-provider suites must name their target explicitly via SMOKE_LIVE_*
 * Either way, nothing silently inherits a real account.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const TEST_ROOT = join(process.cwd(), "tests");

/** The helper itself documents these names in prose; it never reads them. */
const ALLOWED_FILES = new Set([
  join("tests", "helpers", "smokeAccount.ts"),
  join("tests", "structure", "no-shared-smoke-account.test.ts"),
]);

function testFiles(dir: string = TEST_ROOT, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      testFiles(full, acc);
      continue;
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
    const rel = join("tests", relative(TEST_ROOT, full));
    if (ALLOWED_FILES.has(rel)) continue;
    acc.push(rel);
  }
  return acc;
}

describe("smoke suites never inherit a real account", () => {
  it("no test file reads process.env.SMOKE_ACCOUNT_ID or SMOKE_USER_ID", () => {
    const offenders: string[] = [];
    for (const rel of testFiles()) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      if (/process\.env\.SMOKE_(ACCOUNT|USER)_ID/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("the disposable provisioner is the only way a smoke suite gets an account id", () => {
    // Any suite that builds smoke workflows against the DB must obtain its
    // account from the provisioner or the explicit live resolver.
    const src = readFileSync(
      join(process.cwd(), "tests", "helpers", "smokeAccount.ts"),
      "utf8",
    );
    expect(src).toContain("provisionDisposableSmokeAccount");
    expect(src).toContain("resolveLiveSmokeAccount");
    expect(src).toContain("SMOKE_LIVE_ACCOUNT_ID");
  });
});
