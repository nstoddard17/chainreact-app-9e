#!/usr/bin/env node
/**
 * billing_shadow_comparisons persistence smoke (Slice 4.COST-14D).
 *
 * Proves the COST-14C shadow ledger works end-to-end against a REAL Supabase:
 * the table exists, service_role can insert, the UNIQUE(workflow_run_id) upsert
 * is idempotent (first comparison wins), range reads return the mapped columns
 * the COST-14B aggregator needs, warning CODES persist while there is no place
 * for warning messages, and a row cleans up via user-cascade.
 *
 * ── DESTRUCTIVE ── creates + deletes one throwaway auth user (cascade cleanup).
 * OPT-IN + guarded so it never runs in CI or against an unintended database.
 *
 * Requirements (else SKIP, exit 0):
 *   ALLOW_DB_INTEGRATION_TESTS=true
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * The COST-14C migration must be applied to the target DB first.
 *
 * Run (bash):  ALLOW_DB_INTEGRATION_TESTS=true node --env-file=.env.local scripts/verify-billing-shadow-comparisons.mjs
 * Or:          npm run verify:shadow-comparisons   (provide env yourself)
 *
 * NEVER point this at production.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN_CMD =
  "ALLOW_DB_INTEGRATION_TESTS=true node --env-file=.env.local scripts/verify-billing-shadow-comparisons.mjs";

if (!ALLOW) {
  console.log(
    `SKIP: shadow-comparisons smoke not enabled (DESTRUCTIVE: creates/deletes an auth user).\n  ${RUN_CMD}`,
  );
  process.exit(0);
}
if (!URL || !SERVICE_KEY) {
  console.log(
    `SKIP: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (apply the COST-14C migration first).\n  ${RUN_CMD}`,
  );
  process.exit(0);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TABLE = "billing_shadow_comparisons";

let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    fail += 1;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

const createdUserIds = [];
async function createUser() {
  const email = `cost14d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@chainreact-shadow-harness.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

function row(userId, runId, over = {}) {
  return {
    user_id: userId,
    workflow_id: randomUUID(),
    workflow_run_id: runId,
    flat_charged_tasks: 1,
    estimated_tasks_per_run: 3,
    actual_billable_tasks: 2,
    proposed_reserved_tasks: 3,
    proposed_reconciled_tasks: 2,
    proposed_refunded_tasks: 1,
    delta_vs_flat: 1,
    would_have_reserved: true,
    would_have_had_enough_balance: false,
    warning_codes: ["BRANCHING_UPPER_BOUND"],
    policy_version: "v1",
    billing_mode: "shadow",
    ...over,
  };
}

async function upsert(r) {
  // Mirrors repositories/billingShadowComparisons.insertComparison.
  return admin.from(TABLE).upsert(r, {
    onConflict: "workflow_run_id",
    ignoreDuplicates: true,
  });
}

async function main() {
  console.log(`billing_shadow_comparisons smoke against ${URL}`);
  const userId = await createUser();
  const runId = randomUUID();

  // 1. table exists + service_role insert
  const ins = await upsert(row(userId, runId));
  assert(!ins.error, `service_role insert succeeds (table exists)${ins.error ? " — " + ins.error.message : ""}`);

  // 2. idempotent upsert: same run_id, different delta → first wins, one row
  const dup = await upsert(row(userId, runId, { delta_vs_flat: 99, proposed_reconciled_tasks: 99 }));
  assert(!dup.error, "duplicate workflow_run_id upsert returns no error (ignored)");
  const afterDup = await admin.from(TABLE).select("*").eq("workflow_run_id", runId);
  assert(!afterDup.error && (afterDup.data?.length ?? 0) === 1, "exactly one row for the run_id after duplicate");
  assert((afterDup.data?.[0]?.delta_vs_flat) === 1, "first comparison wins (delta_vs_flat stays 1, not 99)");

  // 3. range read returns the mapped columns the COST-14B aggregator needs
  const read = await admin
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 600_000).toISOString())
    .lte("created_at", new Date(Date.now() + 600_000).toISOString())
    .order("created_at", { ascending: false });
  assert(!read.error && (read.data?.length ?? 0) === 1, "range read returns the row");
  const r = read.data?.[0] ?? {};
  const requiredCols = [
    "flat_charged_tasks", "estimated_tasks_per_run", "actual_billable_tasks",
    "proposed_reserved_tasks", "proposed_reconciled_tasks", "proposed_refunded_tasks",
    "delta_vs_flat", "would_have_reserved", "would_have_had_enough_balance",
    "warning_codes", "policy_version", "billing_mode",
  ];
  assert(requiredCols.every((c) => c in r), "row has all columns the aggregator maps");

  // 4. warning codes persist; there is no place for warning messages
  assert(Array.isArray(r.warning_codes) && r.warning_codes[0] === "BRANCHING_UPPER_BOUND", "warning CODES persisted");
  assert(!("warning_messages" in r) && !("message" in r), "no warning-message column exists (codes only)");
  assert(r.billing_mode === "shadow", "billing_mode is 'shadow'");

  // 5. lightweight fold (proves persisted rows aggregate; full logic is unit-tested)
  const totalDelta = (read.data ?? []).reduce((n, x) => n + (x.delta_vs_flat ?? 0), 0);
  assert(totalDelta === 1, "persisted rows fold to a delta total (=1)");
}

async function cleanup() {
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  cleanup: failed to delete user ${id}: ${error.message}`);
  }
  // Verify cascade removed shadow rows for the deleted users.
  for (const id of createdUserIds) {
    const { data } = await admin.from(TABLE).select("id").eq("user_id", id);
    assert((data?.length ?? 0) === 0, `cascade cleanup left 0 shadow rows for user ${id.slice(0, 8)}…`);
  }
}

try {
  await main();
} catch (err) {
  fail += 1;
  failures.push(`fatal: ${err?.message ?? err}`);
  console.error(`\nFATAL: ${err?.message ?? err}`);
} finally {
  await cleanup();
}

console.log(`\n──────────────────────────────────────────`);
console.log(`shadow-comparisons smoke: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  console.error(`Failures:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("All billing_shadow_comparisons persistence checks passed.");
process.exit(0);
