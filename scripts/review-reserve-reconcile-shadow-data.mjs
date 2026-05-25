#!/usr/bin/env node
/**
 * Reserve/Reconcile SHADOW data review (Slice 4.COST-14E).
 *
 * READ-ONLY ad-hoc owner/ops view of the persisted `billing_shadow_comparisons`
 * ledger (COST-14C). Folds the rows in a time range into the same summary the
 * COST-15 cutover decision needs: flat-vs-proposed totals + delta distribution +
 * estimate/actual variance + insufficient-balance signal + warning breakdown.
 *
 * The aggregation here MIRRORS the canonical PURE aggregator at
 * services/analytics/reserveReconcileShadowStats.ts (COST-14B). That TS module
 * is canonical for in-app / SSR aggregation; this script is the ops-CLI mirror
 * (a .mjs cannot import the TS aggregator without a build step) — same precedent
 * as scripts/verify-billing-shadow-comparisons.mjs mirroring the repository.
 * The integration harness
 * (tests/integration/billing/reserveReconcileShadowCollection.test.ts) exercises
 * the REAL aggregator; keep this in sync if COST-14B changes.
 *
 * NON-DESTRUCTIVE: reads only. It never writes, never creates/deletes users,
 * and NEVER touches a balance or a reserve/reconcile RPC.
 *
 * Requirements (else SKIP, exit 0):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service-role: cross-user owner read, bypasses RLS)
 *
 * Args (optional):
 *   --from=<ISO>   inclusive lower bound on created_at (default: 30 days ago)
 *   --to=<ISO>     inclusive upper bound on created_at (default: now)
 *   --limit=<n>    cap rows scanned (default: 5000)
 *   --top=<n>      how many top movers to list (default: 10)
 *
 * Run (bash):  node --env-file=.env.local scripts/review-reserve-reconcile-shadow-data.mjs
 * Or:          npm run review:shadow-comparisons   (provide env yourself)
 *
 * NEVER point this at production unless you intend to read production data.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN_CMD =
  "node --env-file=.env.local scripts/review-reserve-reconcile-shadow-data.mjs";

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

const FROM = arg("from", new Date(Date.now() - 30 * 24 * 3600_000).toISOString());
const TO = arg("to", new Date().toISOString());
const LIMIT = Number(arg("limit", "5000"));
const TOP = Number(arg("top", "10"));

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function bump(rec, key) {
  if (!key) return;
  rec[key] = (rec[key] ?? 0) + 1;
}

async function main() {
  console.log(`billing_shadow_comparisons review against ${URL}`);
  console.log(`range: ${FROM} … ${TO}  (limit ${LIMIT})\n`);

  const { data, error } = await admin
    .from("billing_shadow_comparisons")
    .select("*")
    .gte("created_at", FROM)
    .lte("created_at", TO)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`range read failed: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("No shadow comparisons in range. Nothing to aggregate.");
    console.log(
      "(Enable ENABLE_RESERVE_RECONCILE_SHADOW=true in a dev/test env and run real workflows to collect data.)",
    );
    return;
  }

  // ── Top-level roll-up (mirrors summarizeShadowComparisons). ──────────────
  const summary = {
    total: rows.length,
    flatTotalCharged: 0,
    proposedTotalCharged: 0,
    totalDelta: 0,
    averageDelta: 0,
    higherThanFlatCount: 0,
    lowerThanFlatCount: 0,
    sameAsFlatCount: 0,
    totalEstimatedTasks: 0,
    totalActualBillableTasks: 0,
    estimateVsActualVariance: 0,
    proposedRefundsTotal: 0,
    insufficientBalanceCount: 0,
    byWarningCode: {},
    byPolicyVersion: {},
  };

  // ── Per-workflow grouping (mirrors groupShadowByWorkflow). ───────────────
  const byWf = {};

  for (const r of rows) {
    summary.flatTotalCharged += r.flat_charged_tasks;
    summary.proposedTotalCharged += r.proposed_reconciled_tasks;
    summary.totalDelta += r.delta_vs_flat;
    if (r.delta_vs_flat > 0) summary.higherThanFlatCount += 1;
    else if (r.delta_vs_flat < 0) summary.lowerThanFlatCount += 1;
    else summary.sameAsFlatCount += 1;
    summary.totalEstimatedTasks += r.estimated_tasks_per_run;
    summary.totalActualBillableTasks += r.actual_billable_tasks;
    summary.proposedRefundsTotal += r.proposed_refunded_tasks;
    if (r.would_have_had_enough_balance === false) summary.insufficientBalanceCount += 1;
    for (const code of r.warning_codes ?? []) bump(summary.byWarningCode, code);
    bump(summary.byPolicyVersion, r.policy_version);

    const stat = (byWf[r.workflow_id] ??= {
      count: 0,
      flatTotal: 0,
      proposedTotal: 0,
      totalDelta: 0,
      insufficientBalanceCount: 0,
    });
    stat.count += 1;
    stat.flatTotal += r.flat_charged_tasks;
    stat.proposedTotal += r.proposed_reconciled_tasks;
    stat.totalDelta += r.delta_vs_flat;
    if (r.would_have_had_enough_balance === false) stat.insufficientBalanceCount += 1;
  }
  summary.averageDelta = summary.total === 0 ? 0 : summary.totalDelta / summary.total;
  summary.estimateVsActualVariance =
    summary.totalEstimatedTasks - summary.totalActualBillableTasks;

  const ranked = Object.entries(byWf).map(([workflowId, st]) => ({ workflowId, ...st }));
  const topPositive = ranked
    .filter((r) => r.totalDelta > 0)
    .sort((a, b) => b.totalDelta - a.totalDelta || a.workflowId.localeCompare(b.workflowId))
    .slice(0, TOP);
  const topNegative = ranked
    .filter((r) => r.totalDelta < 0)
    .sort((a, b) => a.totalDelta - b.totalDelta || a.workflowId.localeCompare(b.workflowId))
    .slice(0, TOP);
  const recurringInsufficient = ranked
    .filter((r) => r.insufficientBalanceCount > 0)
    .sort(
      (a, b) =>
        b.insufficientBalanceCount - a.insufficientBalanceCount ||
        a.workflowId.localeCompare(b.workflowId),
    )
    .slice(0, TOP);

  // ── Report ───────────────────────────────────────────────────────────────
  console.log("── Summary ──────────────────────────────────────────────");
  console.log(`  comparisons:               ${summary.total}`);
  console.log(`  flat total charged:        ${summary.flatTotalCharged}`);
  console.log(`  proposed total charged:    ${summary.proposedTotalCharged}`);
  console.log(`  total delta (proposed−flat): ${summary.totalDelta}`);
  console.log(`  average delta:             ${summary.averageDelta.toFixed(4)}`);
  console.log(`  higher / lower / same:     ${summary.higherThanFlatCount} / ${summary.lowerThanFlatCount} / ${summary.sameAsFlatCount}`);
  console.log(`  total estimated tasks:     ${summary.totalEstimatedTasks}`);
  console.log(`  total actual billable:     ${summary.totalActualBillableTasks}`);
  console.log(`  estimate−actual variance:  ${summary.estimateVsActualVariance}`);
  console.log(`  proposed refunds total:    ${summary.proposedRefundsTotal}`);
  console.log(`  insufficient-balance rows: ${summary.insufficientBalanceCount}`);
  console.log(`  warning codes:             ${JSON.stringify(summary.byWarningCode)}`);
  console.log(`  policy versions:           ${JSON.stringify(summary.byPolicyVersion)}`);

  console.log("\n── Top positive-delta workflows (proposed > flat) ───────");
  if (topPositive.length === 0) console.log("  (none)");
  for (const r of topPositive) {
    console.log(`  ${r.workflowId}  Δ+${r.totalDelta}  (runs ${r.count})`);
  }

  console.log("\n── Top negative-delta workflows (proposed < flat) ───────");
  if (topNegative.length === 0) console.log("  (none)");
  for (const r of topNegative) {
    console.log(`  ${r.workflowId}  Δ${r.totalDelta}  (runs ${r.count})`);
  }

  console.log("\n── Recurring insufficient-balance workflows ─────────────");
  if (recurringInsufficient.length === 0) console.log("  (none)");
  for (const r of recurringInsufficient) {
    console.log(`  ${r.workflowId}  insufficient ${r.insufficientBalanceCount}/${r.count} runs`);
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nFATAL: ${err?.message ?? err}`);
    process.exit(1);
  });
