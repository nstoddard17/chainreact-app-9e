/**
 * @jest-environment node
 *
 * Action smoke harness — FULL workflow-run mode against a real dev DB (gated).
 *
 * Drives the native fixture through the SAME manual run-now path the app uses:
 * persist a {native:manual.run -> native:format_transformer} draft workflow,
 * enqueueRun (engine TEST MODE — native logic handlers execute for real, every
 * external/destructive handler is blocked), wait for the engine, then read the
 * persisted `workflow_runs` row and assert it reached a terminal state.
 *
 * SAFETY:
 *   - Test mode means NO real provider calls (testModeGate blocks all external
 *     actions). The native transform is pure.
 *   - Connected-provider fixtures SKIP (their env is unset) before any workflow
 *     is created.
 *   - Temporary workflows are soft-deleted (state='deleted', named `smoke:`).
 *
 * Requirements (else the suite SKIPs — never fails in CI):
 *   ALLOW_DB_INTEGRATION_TESTS=true
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-loaded from
 *   .env.local if present)
 *   SMOKE_ACCOUNT_ID + SMOKE_USER_ID — a real account/user on the dev DB that
 *   the smoke workflow is created under (the user must be a member of the account).
 *
 * Run (bash):
 *   ALLOW_DB_INTEGRATION_TESTS=true SMOKE_ACCOUNT_ID=... SMOKE_USER_ID=... \
 *     npx jest tests/integration/smoke-actions/run-all.workflow.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runActionSmokeWorkflowMode } from "@/tests/smoke-actions/harness";
import { makeRealWorkflowRunDeps } from "@/tests/smoke-actions/workflowRunDeps";
import { renderExecutionHuman } from "@/scripts/chainreact/smoke/core";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCOUNT_ID = process.env.SMOKE_ACCOUNT_ID;
const USER_ID = process.env.SMOKE_USER_ID;
const RUN = ALLOW && !!URL && !!SERVICE_KEY && !!ACCOUNT_ID && !!USER_ID;

const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP action-smoke workflow-mode dev harness — set ALLOW_DB_INTEGRATION_TESTS=true with " +
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SMOKE_ACCOUNT_ID + SMOKE_USER_ID " +
      "(creates + soft-deletes a throwaway workflow on the dev DB).",
  );
}

describeDb("action smoke: full workflow-run mode (real dev DB)", () => {
  const supabase = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = makeRealWorkflowRunDeps({
    supabase,
    accountId: ACCOUNT_ID as string,
    userId: USER_ID as string,
    newUuid: randomUUID,
  });

  it("runs the native fixture end-to-end through manual run-now and reaches a terminal persisted state", async () => {
    const report = await runActionSmokeWorkflowMode(
      ALL_SMOKE_FIXTURES,
      { includeDestructive: false, terminalReadAttempts: 5 },
      deps,
    );
    if (!report.ok) {
      console.error(renderExecutionHuman(report));
    }
    expect(report.mode).toBe("workflow");
    // No FAIL across the set (native PASSes; connected fixtures SKIP).
    expect(report.totals.fail).toBe(0);

    const native = report.results.find(
      (r) => r.provider === "native" && r.action === "format_transformer",
    );
    expect(native?.outcome).toBe("pass");
    expect(native?.runId).toBeTruthy();
    expect(native?.workflowId).toBeTruthy();
  }, 30_000);

  it("skips connected-provider fixtures before creating a workflow when their env is unset", async () => {
    const prev = process.env.SMOKE_SLACK_CONNECTED;
    delete process.env.SMOKE_SLACK_CONNECTED;
    try {
      const report = await runActionSmokeWorkflowMode(
        ALL_SMOKE_FIXTURES,
        { includeDestructive: false },
        deps,
      );
      const slack = report.results.filter((r) => r.provider === "slack");
      expect(slack.length).toBeGreaterThan(0);
      expect(slack.every((r) => r.outcome === "skip" && r.workflowId == null)).toBe(true);
    } finally {
      if (prev !== undefined) process.env.SMOKE_SLACK_CONNECTED = prev;
    }
  }, 30_000);
});
