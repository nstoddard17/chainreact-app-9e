/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-3 — static guards for the live-test authorization migration
 * (20260812000000) and its relationship to the session-table protections (20260811000000/1).
 *
 * The RPC's live BEHAVIOR (happy path, retry convergence, all five refusal outcomes) was
 * validated directly against the applied schema in rolled-back probes; these static guards keep
 * the migration corpus honest against future edits:
 *
 *   1. the function exists, is revoked from PUBLIC/anon/authenticated, and only service_role
 *      may execute it — a browser can never reach the authorization primitive;
 *   2. the queued-run INSERT inside the RPC writes EXACTLY the column set the canonical
 *      `createQueuedWorkflowRun` repository insert writes — the run it mints is
 *      indistinguishable from one the normal enqueue seam creates, so the unchanged processor
 *      + engine execute it (this is the "no second run construction" guarantee, enforced);
 *   3. the captured-event columns exist and the consumed⇒run pairing CHECK from the base
 *      migration is not weakened;
 *   4. the session table's deny-all RLS and revoked client grants are still in force across
 *      the migration corpus (nothing re-granted later).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8");

const rpcSql = read("20260812000000_live_test_capture_and_authorize.sql");
const baseSql = read("20260811000000_workflow_live_test_sessions.sql");
const revokeSql = read("20260811000001_revoke_default_privileges_live_test_sessions.sql");
const repoSource = readFileSync(
  resolve(process.cwd(), "repositories/workflowRunsQueue.ts"),
  "utf8",
);

describe("authorize_live_test_run — service-role-only surface", () => {
  it("defines the function and locks EXECUTE to service_role", () => {
    expect(rpcSql).toMatch(/CREATE OR REPLACE FUNCTION public\.authorize_live_test_run/);
    expect(rpcSql).toMatch(/REVOKE ALL ON FUNCTION public\.authorize_live_test_run[^;]+FROM PUBLIC/);
    expect(rpcSql).toMatch(/REVOKE ALL ON FUNCTION public\.authorize_live_test_run[^;]+FROM anon/);
    expect(rpcSql).toMatch(/REVOKE ALL ON FUNCTION public\.authorize_live_test_run[^;]+FROM authenticated/);
    expect(rpcSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.authorize_live_test_run[^;]+TO service_role/);
  });

  it("claims with FOR UPDATE and converges retries on the existing run", () => {
    expect(rpcSql).toMatch(/FOR UPDATE/);
    expect(rpcSql).toMatch(/already_authorized/);
    // Refusals are typed outcomes, not exceptions the app must parse.
    for (const outcome of ["not_found", "cancelled", "expired", "not_eligible", "missing_captured_event"]) {
      expect(rpcSql).toContain(`'${outcome}'`);
    }
  });

  it("consumes and pairs the run in the SAME statement set (status running + consumed_at + run id)", () => {
    const consume = rpcSql.slice(rpcSql.indexOf("UPDATE public.workflow_live_test_sessions"));
    expect(consume).toMatch(/status = 'running'/);
    expect(consume).toMatch(/consumed_at = now\(\)/);
    expect(consume).toMatch(/workflow_run_id = p_run_id/);
  });
});

describe("authorize_live_test_run — canonical run-row parity", () => {
  it("the RPC INSERT column set matches createQueuedWorkflowRun exactly", () => {
    // Repo side: the object keys of the canonical insert payload.
    const repoInsert = repoSource.slice(
      repoSource.indexOf('.from("workflow_runs").insert({'),
    );
    const repoBody = repoInsert.slice(0, repoInsert.indexOf("});"));
    const repoColumns = [...repoBody.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]!);
    expect(repoColumns.length).toBeGreaterThanOrEqual(15); // parse sanity

    // RPC side: the INSERT column list.
    const rpcInsert = rpcSql.slice(rpcSql.indexOf("INSERT INTO public.workflow_runs ("));
    const rpcColumnList = rpcInsert.slice(
      rpcInsert.indexOf("(") + 1,
      rpcInsert.indexOf(") VALUES"),
    );
    const rpcColumns = rpcColumnList
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    // `id` in SQL is `runId` in the repo input but `id:` in the payload object — both sides are
    // compared as the literal column names they write.
    expect([...rpcColumns].sort()).toEqual([...repoColumns].sort());
  });

  it("mints the run as a queued, is_test-labeled 'test' dispatch (the processor elevates from the session, not from any client value)", () => {
    expect(rpcSql).toMatch(/'queued'/);
    expect(rpcSql).toMatch(/true, 'test'/);
  });
});

describe("session-table protections — not weakened by later migrations", () => {
  it("captured_event / trigger_preview columns are added additively", () => {
    expect(rpcSql).toMatch(/ADD COLUMN IF NOT EXISTS captured_event jsonb/);
    expect(rpcSql).toMatch(/ADD COLUMN IF NOT EXISTS trigger_preview jsonb/);
    // Comment-stripped: the header's documented ROLLBACK legitimately names DROP statements.
    const code = rpcSql.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/DROP (POLICY|TABLE|COLUMN)/i);
    expect(code).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("the base deny-all policy and the consumed⇒run CHECK remain the corpus's contract", () => {
    expect(baseSql).toMatch(/FOR ALL USING \(false\) WITH CHECK \(false\)/);
    expect(baseSql).toMatch(/workflow_live_test_sessions_consumed_pairs_run/);
    expect(revokeSql).toMatch(/REVOKE ALL ON public\.workflow_live_test_sessions FROM authenticated/);
    // No later migration re-grants the table to a client role.
    expect(rpcSql).not.toMatch(/GRANT[^;]*workflow_live_test_sessions[^;]*TO (anon|authenticated)/);
  });
});
