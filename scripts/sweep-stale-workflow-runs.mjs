#!/usr/bin/env node
/**
 * Stale 'running' workflow-run sweep — ops CLI (Slice 4.COST-15F).
 *
 * Marks workflow_runs rows stuck in status='running' (engine crashed between
 * create-at-start and finalize) as failed once they pass a staleness cutoff.
 * Lifecycle cleanup ONLY: never touches billing_status / reserved /
 * reconciled / reservation_* fields, never deducts/refunds tasks, writes no
 * task_usage_events. Separate from release_expired_reservations (billing holds).
 *
 * This mirrors services/execution/staleWorkflowRunSweep.ts + the
 * EXECUTION_INTERRUPTED humanization in core/errors/humanizeActionError.ts.
 * That TS service is canonical (and unit-tested); a .mjs can't import it, so
 * the UPDATE + failure payload are mirrored here for ad-hoc/cron-less ops use
 * (same precedent as scripts/verify-*.mjs mirroring repositories). Keep in sync.
 *
 * ── DESTRUCTIVE (writes) ── OPT-IN + guarded so it never runs unintentionally.
 *
 * Requirements (else SKIP, exit 0):
 *   ALLOW_STALE_RUN_SWEEP=true
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Args (optional):
 *   --older-than-minutes=<n>   staleness threshold (default 60)
 *   --limit=<n>                cap rows swept this run (default: all)
 *   --dry-run                  report what WOULD be swept; make no changes
 *
 * Run (bash):
 *   ALLOW_STALE_RUN_SWEEP=true node --env-file=.env.local scripts/sweep-stale-workflow-runs.mjs --older-than-minutes=60
 *
 * NEVER point this at production unless Marcus has explicitly authorized it.
 */

import { createClient } from "@supabase/supabase-js";

const ALLOW = process.env.ALLOW_STALE_RUN_SWEEP === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN_CMD =
  "ALLOW_STALE_RUN_SWEEP=true node --env-file=.env.local scripts/sweep-stale-workflow-runs.mjs";

if (!ALLOW) {
  console.log(
    `SKIP: stale-running-run sweep not enabled (DESTRUCTIVE: writes to workflow_runs).\n  ${RUN_CMD}`,
  );
  process.exit(0);
}
if (!URL || !SERVICE_KEY) {
  console.log(
    `SKIP: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n  ${RUN_CMD}`,
  );
  process.exit(0);
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const DRY_RUN = process.argv.includes("--dry-run");
const OLDER_THAN_MIN = Number(arg("older-than-minutes", "60"));
const LIMIT = arg("limit", undefined);

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = new Date();
const cutoff = new Date(now.getTime() - OLDER_THAN_MIN * 60_000).toISOString();
const message = `Run interrupted: still 'running' with no finish ${OLDER_THAN_MIN}+ minutes after it started — the engine process likely restarted mid-execution.`;
// Mirrors humanizeActionError({ code: "EXECUTION_INTERRUPTED" }).
const fatalError = { code: "EXECUTION_INTERRUPTED", message };
const errorClassification = {
  title: "Run interrupted",
  description: message,
  hint: "Re-run the workflow; if this keeps happening, check engine/deploy health.",
  severity: "error",
};

async function main() {
  console.log(`stale-running-run sweep against ${URL}`);
  console.log(`cutoff: started_at < ${cutoff} (older than ${OLDER_THAN_MIN} min)${LIMIT ? `, limit ${LIMIT}` : ""}`);

  // Identify candidates (also the dry-run output).
  let sel = admin
    .from("workflow_runs")
    .select("id, started_at")
    .eq("status", "running")
    .is("finished_at", null)
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true });
  if (LIMIT) sel = sel.limit(Number(LIMIT));
  const { data: candidates, error: selErr } = await sel;
  if (selErr) throw new Error(`candidate select failed: ${selErr.message}`);

  const ids = (candidates ?? []).map((r) => r.id);
  console.log(`stale running rows found: ${ids.length}`);
  if (ids.length === 0) {
    console.log("Nothing to sweep.");
    return;
  }
  if (DRY_RUN) {
    console.log("DRY RUN — no changes. Would mark failed:");
    for (const r of candidates) console.log(`  ${r.id}  (started ${r.started_at})`);
    return;
  }

  // Update scoped to the candidate ids, re-applying the predicate (race-safe).
  const { data, error } = await admin
    .from("workflow_runs")
    .update({
      status: "failed",
      finished_at: now.toISOString(),
      fatal_error: fatalError,
      error_classification: errorClassification,
    })
    .in("id", ids)
    .eq("status", "running")
    .is("finished_at", null)
    .lt("started_at", cutoff)
    .select("id");
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log(`swept ${data?.length ?? 0} stale running run(s) to failed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nFATAL: ${err?.message ?? err}`);
    process.exit(1);
  });
