/**
 * @jest-environment node
 *
 * SUPABASE-ENV-PIPELINE-1 — textual safety invariants on the pipeline
 * workflows. Same pattern as the migration text tests: the YAML files are the
 * deployed artifact, so holding their text to the contract catches a
 * regression at PR time, before any run exists.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The bans target EXECUTABLE workflow content; full-line YAML comments may
// name the banned operations while documenting why they are banned.
const WF = (name: string) =>
  readFileSync(resolve(__dirname, "../../../.github/workflows", name), "utf8")
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

describe("promote-production.yml — production is forward-only and approval-gated", () => {
  const text = WF("promote-production.yml");

  it("never seeds production", () => {
    expect(text).not.toContain("--include-seed");
  });

  it("never resets any database", () => {
    expect(text).not.toMatch(/db\s+reset/);
  });

  it("never invokes migration repair", () => {
    expect(text).not.toMatch(/migration\s+repair/);
  });

  it("is manual-dispatch only (no push/pull_request trigger)", () => {
    const onBlock = text.slice(text.indexOf("\non:"), text.indexOf("\njobs:"));
    expect(onBlock).toContain("workflow_dispatch");
    expect(onBlock).not.toMatch(/\n\s{2}push:/);
    expect(onBlock).not.toMatch(/\n\s{2}pull_request:/);
  });

  it("gates every credentialed job on the production GitHub Environment", () => {
    // Each job that can see production secrets must declare environment: production.
    const credentialedJobs = text.split(/\n {2}[a-z-]+:\n/).filter((j) => j.includes("secrets.SUPABASE_PROD") || j.includes("secrets.VERCEL_TOKEN") || j.includes("secrets.PROD_SMOKE"));
    expect(credentialedJobs.length).toBeGreaterThan(0);
    for (const job of credentialedJobs) {
      expect(job).toContain("environment: production");
    }
  });

  it("requires the exact-SHA development certification before anything else", () => {
    expect(text).toContain("dev-certification-${{ steps.resolve.outputs.sha }}");
    expect(text).toContain("A different SHA is never promoted");
  });

  it("deploys the app only after the database migration job", () => {
    const deployJob = text.slice(text.indexOf("\n  deploy-app:"), text.indexOf("\n  smoke:"));
    expect(deployJob).toMatch(/needs:.*migrate-production/);
  });

  it("dry-runs before applying", () => {
    expect(text.indexOf("--dry-run")).toBeGreaterThan(-1);
    expect(text.indexOf("--dry-run")).toBeLessThan(text.indexOf("Apply pending forward migrations"));
  });

  it("has a destructive-migration backup gate", () => {
    expect(text).toContain("backup_confirmed");
    expect(text).toMatch(/backup_confirmed[^\n]*!=\s*"true"/);
  });

  it("never echoes a secret expression", () => {
    for (const line of text.split("\n")) {
      if (/\becho\b/.test(line)) {
        expect(line).not.toContain("secrets.");
      }
    }
  });
});

describe("deploy-development.yml — DB gate before app, dev environment only", () => {
  const text = WF("deploy-development.yml");

  it("uses the development GitHub Environment for credentialed jobs", () => {
    expect(text).toContain("environment: development");
    expect(text).not.toContain("environment: production");
  });

  it("never references production secrets", () => {
    expect(text).not.toContain("SUPABASE_PROD");
    expect(text).not.toContain("PROD_SMOKE");
  });

  it("requires the database-ci gate for the same SHA", () => {
    expect(text).toContain("uses: ./.github/workflows/db-ci.yml");
  });

  it("blocks app deployment on the database jobs", () => {
    const deployJob = text.slice(text.indexOf("\n  deploy-app:"), text.indexOf("\n  smoke:"));
    expect(deployJob).toMatch(/needs:.*migrate-development/);
  });

  it("applies migrations only through the guarded db:push:dev path", () => {
    expect(text).toContain("npm run db:push:dev");
    expect(text).toContain("CHAINREACT_DB_TARGET: development");
  });

  // V2-DEV-BRANCH-ATTRIBUTION-1 — the CLI derives the branch from git and
  // ignores VERCEL_GIT_COMMIT_REF when git metadata exists; without a real
  // v2-dev branch in the runner clone, the branch-scoped Preview env (dev
  // Supabase trio!) silently fails to attach and the app builds with the
  // generic (production) values.
  it("materializes the v2-dev branch before deploying and verifies attribution after", () => {
    expect(text).toContain("git checkout -B v2-dev");
    expect(text).toMatch(/Verify branch attribution/);
    expect(text).toMatch(/githubCommitRef[\s\S]{0,400}?!= "v2-dev"[\s\S]{0,400}?exit 1/);
    // The attribution gate must sit between deploy and alias so a mis-scoped
    // build is never aliased to the stable dev hostname.
    const deployIdx = text.indexOf("Deploy to Vercel");
    const verifyIdx = text.indexOf("Verify branch attribution");
    const aliasIdx = text.indexOf("Alias stable dev hostname");
    expect(deployIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(deployIdx);
    expect(aliasIdx).toBeGreaterThan(verifyIdx);
  });

  it("verifies the requested SHA is a real full commit", () => {
    expect(text).toContain("git cat-file -e");
    expect(text).toMatch(/\[0-9a-f\]\{40\}/);
  });

  it("never seeds through the deploy lane", () => {
    expect(text).not.toContain("--include-seed");
  });

  // V2-DEV-SMOKE-PROTECTION-BYPASS-1 — the Preview lane keeps Vercel
  // Authentication enabled; smoke passes it via the environment-scoped
  // Protection Bypass secret, failing closed when it is absent.
  it("smoke reads the bypass ONLY from the environment-scoped secret", () => {
    expect(text).toContain("VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}");
    // Both consuming steps live in the smoke job, which is environment-gated.
    const smokeJob = text.slice(text.indexOf("\n  smoke:"), text.indexOf("\n  certify:"));
    expect(smokeJob).toContain("environment: development");
    expect(smokeJob.match(/VERCEL_AUTOMATION_BYPASS_SECRET/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("readiness probe sends the supported bypass header and fails closed without the secret", () => {
    expect(text).toContain('-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"');
    expect(text).toMatch(/if \[ -z "\$VERCEL_AUTOMATION_BYPASS_SECRET" \]; then[\s\S]{0,800}?exit 1/);
  });

  it("never echoes the bypass secret", () => {
    for (const line of text.split("\n")) {
      if (/\becho\b/.test(line)) {
        expect(line).not.toContain("$VERCEL_AUTOMATION_BYPASS_SECRET");
      }
    }
  });

  it("never echoes a secret expression", () => {
    for (const line of text.split("\n")) {
      if (/\becho\b/.test(line)) {
        expect(line).not.toContain("secrets.");
      }
    }
  });
});

describe("db-ci.yml — loopback-only, zero cloud credentials", () => {
  const text = WF("db-ci.yml");
  const raw = readFileSync(
    resolve(__dirname, "../../../.github/workflows/db-ci.yml"),
    "utf8",
  );

  it("uses no repository or environment secrets at all", () => {
    expect(text).not.toContain("secrets.");
    expect(text).not.toMatch(/environment:\s*(development|production)/);
  });

  it("proves reset-from-zero, seed load, lint, type drift, and RLS suites", () => {
    expect(text).toContain("npm run supabase:test:reset");
    expect(text).toContain("npm run lint:migrations");
    expect(text).toContain("npm run db:types:check");
    expect(text).toContain("ALLOW_DB_INTEGRATION_TESTS=true");
    expect(text).toContain("tests/integration/security");
  });

  it("asserts the stack is loopback before running suites", () => {
    expect(text).toContain("http://127.0.0.1");
    expect(text).toContain("expected loopback");
  });

  it("fails PRs that MODIFY an existing migration (forward-only)", () => {
    expect(text).toContain("--diff-filter=M");
    expect(text).toContain("supabase/migrations");
  });

  it("stops the stack even on failure", () => {
    expect(text).toContain("if: always()");
    expect(text).toContain("npm run supabase:test:stop");
  });

  // ── DB-CI-COVERAGE-GAP-1 ────────────────────────────────────────────────
  // The billing + account database suites existed but NO workflow activated
  // them, so they provided zero CI protection. These contracts keep them wired
  // and keep the wiring honest.

  it("invokes all three database suite groups through the gate", () => {
    for (const group of ["security", "billing", "accounts"]) {
      expect(text).toContain(`db-suite-gate.mjs run --group ${group}`);
    }
  });

  it("runs the billing and account groups AFTER the local stack is started", () => {
    const startIdx = text.indexOf("npm run supabase:test:start");
    expect(startIdx).toBeGreaterThan(-1);
    for (const group of ["security", "billing", "accounts"]) {
      expect(text.indexOf(`--group ${group}`)).toBeGreaterThan(startIdx);
    }
    // The RLS group owns population-wide invariants, so it runs first, on the
    // untouched post-reset state.
    expect(text.indexOf("--group security")).toBeLessThan(text.indexOf("--group billing"));
    expect(text.indexOf("--group billing")).toBeLessThan(text.indexOf("--group accounts"));
  });

  it("explicitly enables the activation gates and preflights them fail-closed", () => {
    expect(text).toContain('echo "ALLOW_DB_INTEGRATION_TESTS=true" >> "$GITHUB_ENV"');
    expect(text).toContain("db-suite-gate.mjs preflight");
    // The preflight must sit BEFORE any suite group runs.
    expect(text.indexOf("db-suite-gate.mjs preflight")).toBeLessThan(
      text.indexOf("db-suite-gate.mjs run"),
    );
  });

  it("requires a minimum discovered suite count per group (zero-executed fails closed)", () => {
    expect(text).toMatch(/--group security --min-suites \d+/);
    expect(text).toMatch(/--group billing --min-suites 9\b/);
    expect(text).toMatch(/--group accounts --min-suites 5\b/);
  });

  it("keeps the existing migration, RLS and schema verification required", () => {
    // Every pre-existing gate is still an unconditional step (no `if:` guard
    // other than the pull-request-only forward-only check, no soft-failure).
    for (const step of [
      "npm run lint:migrations",
      "npm run supabase:test:start",
      "npm run supabase:test:reset",
      "npm run db:types:check",
    ]) {
      expect(text).toContain(step);
    }
    expect(text).toContain("tests/integration/migrations");
  });

  it("triggers on database-relevant service and repository changes", () => {
    // Directory-scoped, so a NEW database-touching service is covered without
    // anyone remembering to extend a list.
    for (const p of [
      '"repositories/**"',
      '"services/**"',
      '"core/**"',
      '"supabase/**"',
      '"tests/integration/security/**"',
      '"tests/integration/billing/**"',
      '"tests/integration/accounts/**"',
      '"tests/helpers/**"',
      '"scripts/ci/db-suite-gate.mjs"',
      '"package.json"',
      '"jest.config.mjs"',
      '".github/workflows/db-ci.yml"',
    ]) {
      expect(text).toContain(p);
    }
  });

  it("does NOT trigger on documentation-only changes", () => {
    expect(text).not.toMatch(/- "docs\//);
    expect(text).not.toMatch(/- "\*\*\/\*\.md"/);
  });

  it("keeps the pull_request and push path filters identical", () => {
    // GitHub Actions has no YAML anchors, so the list is duplicated; drift
    // between the two would silently un-protect one of the lanes.
    const pathLists = [...raw.matchAll(/paths:\n((?:\s+- "[^"]+"\n)+)/g)].map((m) =>
      m[1]!
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    );
    expect(pathLists).toHaveLength(2);
    expect(pathLists[0]).toEqual(pathLists[1]);
    expect(pathLists[0]!.length).toBeGreaterThan(20);
  });

  // ── RPC-SIGNATURE-DRIFT-GUARD-1 ─────────────────────────────────────────
  // A migration can change an RPC signature while its TypeScript callers stay
  // stale; that is how apply_business_upgrade's tests silently degraded into
  // "PostgREST could not find the function". The guard runs against the
  // migrated local catalog, early enough to fail fast.

  it("runs the RPC signature guard", () => {
    expect(text).toContain("rpc-signature-guard.mjs run");
  });

  it("runs the guard AFTER the database reset and BEFORE the suite groups", () => {
    const resetIdx = text.indexOf("npm run supabase:test:reset");
    const guardIdx = text.indexOf("rpc-signature-guard.mjs run");
    expect(resetIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(resetIdx);
    for (const group of ["security", "billing", "accounts"]) {
      expect(guardIdx).toBeLessThan(text.indexOf(`--group ${group}`));
    }
  });

  it("keeps the guard on the loopback stack — no connection string, no hosted project", () => {
    const guardStep = text.slice(
      text.lastIndexOf("- name:", text.indexOf("rpc-signature-guard.mjs run")),
      text.indexOf("rpc-signature-guard.mjs run") + 60,
    );
    expect(guardStep).not.toMatch(/postgres:\/\/|postgresql:\/\/|supabase\.co|--linked|--db-url/);
    expect(guardStep).not.toContain("secrets.");
  });

  it("triggers db-ci when the guard, its manifest, or the RPC type contract changes", () => {
    for (const p of [
      '"scripts/ci/rpc-signature-guard.mjs"',
      '"scripts/ci/rpc-dynamic-callers.json"',
      '"types/rpc.ts"',
      '"types/database.types.ts"',
    ]) {
      expect(text).toContain(p);
    }
  });

  it("introduces no retries, no failure masking, and no pass-with-no-tests", () => {
    expect(text).not.toContain("continue-on-error");
    expect(text).not.toContain("--passWithNoTests");
    expect(text).not.toMatch(/retry|retries|retryTimes/i);
    expect(text).not.toMatch(/--testPathIgnorePatterns|\.skip\b|--onlyFailures/);
  });

  it("never contacts a hosted development or production database", () => {
    expect(text).not.toMatch(/supabase\.co|supabase\.in/);
    expect(text).not.toContain("CHAINREACT_DB_TARGET");
    expect(text).not.toContain("db:push");
    expect(text).not.toContain("--linked");
  });

  it("cleans up and preserves diagnostics even when the suites fail", () => {
    const stopIdx = text.indexOf("npm run supabase:test:stop");
    const stopBlock = text.slice(text.lastIndexOf("- name:", stopIdx), stopIdx);
    expect(stopBlock).toContain("if: always()");
    // The result artifacts are uploaded even on failure — the evidence of WHY
    // a group failed must survive the cleanup step.
    const uploadIdx = text.indexOf("upload-artifact");
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(text.slice(text.lastIndexOf("- name:", uploadIdx), uploadIdx)).toContain("if: always()");
  });

  it("never echoes a secret expression or a stack key value", () => {
    for (const line of text.split("\n")) {
      if (/\becho\b/.test(line)) {
        expect(line).not.toContain("secrets.");
        expect(line).not.toMatch(/echo "\$v"|echo \$v\b/);
      }
    }
    // The throwaway loopback keys are masked before they reach the log.
    expect(text).toContain("::add-mask::$v");
  });
});
