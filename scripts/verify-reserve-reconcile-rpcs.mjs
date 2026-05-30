#!/usr/bin/env node
/**
 * Reserve/Reconcile RPC DB integration harness (Slice 4.COST-12B).
 *
 * Proves the COST-12 billing RPCs + constraints behave correctly against a
 * REAL Postgres/Supabase database — the jest suite only mocks the repo
 * wrappers. Verifies: reserve (success / insufficient / zero / idempotent),
 * reconcile (exact / under / over / idempotent), release (+ idempotent), the
 * expiry sweep, non-negativity invariants, service-role-only grants, the
 * task_usage_events partial unique indexes, and that the flat
 * deduct_tasks_if_available still works.
 *
 * ── DESTRUCTIVE ── it creates and deletes real auth users (cleaned up via
 * cascade). It is OPT-IN and triple-guarded so it can never run in CI or
 * against a database you didn't explicitly point it at.
 *
 * Requirements (all must be present, or the script SKIPS with exit 0):
 *   ALLOW_DB_INTEGRATION_TESTS=true   explicit opt-in
 *   NEXT_PUBLIC_SUPABASE_URL          target project URL
 *   SUPABASE_SERVICE_ROLE_KEY         service-role key (admin + RLS bypass)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     (optional) enables the grant-rejection check
 *
 * The COST-12 migration (20260525000002_reserve_reconcile_billing.sql) MUST be
 * applied to the target DB first.
 *
 * Run (PowerShell):
 *   $env:ALLOW_DB_INTEGRATION_TESTS="true"; node --env-file=.env.local scripts/verify-reserve-reconcile-rpcs.mjs
 * Run (bash):
 *   ALLOW_DB_INTEGRATION_TESTS=true node --env-file=.env.local scripts/verify-reserve-reconcile-rpcs.mjs
 * Or via npm (provide env yourself):
 *   npm run verify:reserve-reconcile
 *
 * NEVER point this at production unless you have explicitly decided that is
 * safe — it creates/deletes auth users in whatever project the env points to.
 */

import { createClient } from "@supabase/supabase-js";

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const RUN_CMD =
  "ALLOW_DB_INTEGRATION_TESTS=true node --env-file=.env.local scripts/verify-reserve-reconcile-rpcs.mjs";

if (!ALLOW) {
  console.log(
    `SKIP: reserve/reconcile DB harness not enabled.\n` +
      `  Set ALLOW_DB_INTEGRATION_TESTS=true to run (DESTRUCTIVE: creates/deletes auth users).\n` +
      `  ${RUN_CMD}`,
  );
  process.exit(0);
}
if (!URL || !SERVICE_KEY) {
  console.log(
    `SKIP: missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n` +
      `  Provide them (e.g. via --env-file=.env.local) and ensure the COST-12 migration is applied.\n` +
      `  ${RUN_CMD}`,
  );
  process.exit(0);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── tiny assertion framework ────────────────────────────────────────────────
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
function eq(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected ${expected}, got ${actual})`);
}
async function section(name, fn) {
  console.log(`\n# ${name}`);
  try {
    await fn();
  } catch (err) {
    fail += 1;
    failures.push(`${name}: threw ${err?.message ?? err}`);
    console.error(`  ✗ ${name} threw: ${err?.message ?? err}`);
  }
}

// ── seed/read helpers (service-role bypasses RLS) ────────────────────────────
const createdUserIds = [];

async function createUser() {
  const email = `cost12b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@chainreact-rpc-harness.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}
async function setBilling(userId, { limit, used, reserved }) {
  const { error } = await admin
    .from("user_billing")
    .upsert(
      { user_id: userId, tasks_limit: limit, tasks_used: used, tasks_reserved: reserved },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`setBilling: ${error.message}`);
}
async function getBilling(userId) {
  const { data, error } = await admin
    .from("user_billing")
    .select("tasks_used, tasks_reserved, tasks_limit")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`getBilling: ${error.message}`);
  return data;
}
async function createWorkflow(userId) {
  const { data, error } = await admin
    .from("workflows")
    .insert({ user_id: userId, name: "COST-12B harness wf" })
    .select("id")
    .single();
  if (error) throw new Error(`createWorkflow: ${error.message}`);
  return data.id;
}
async function createRun(workflowId, userId, extra = {}) {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("workflow_runs")
    .insert({
      workflow_id: workflowId,
      user_id: userId,
      status: "succeeded",
      trigger_node_id: "trigger-1",
      trigger_event: {},
      started_at: nowIso,
      finished_at: nowIso,
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createRun: ${error.message}`);
  return data.id;
}
async function getRun(runId) {
  const { data, error } = await admin
    .from("workflow_runs")
    .select("billing_status, reserved_task_cost, reconciled_task_cost")
    .eq("id", runId)
    .single();
  if (error) throw new Error(`getRun: ${error.message}`);
  return data;
}
const rpc = (fn, params) => admin.rpc(fn, params);

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Reserve/Reconcile RPC harness against ${URL}`);
  const userId = await createUser();
  const workflowId = await createWorkflow(userId);

  await section("1. reserve success", async () => {
    await setBilling(userId, { limit: 10, used: 2, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    const { data } = await rpc("reserve_tasks_if_available", {
      p_user_id: userId, p_amount: 3, p_run_id: runId, p_expires_at: null,
    });
    eq(data.ok, true, "reserve ok");
    const b = await getBilling(userId);
    eq(b.tasks_reserved, 3, "tasks_reserved = 3");
    eq(b.tasks_used, 2, "tasks_used unchanged = 2");
    const r = await getRun(runId);
    eq(r.billing_status, "reserved", "billing_status reserved");
    eq(r.reserved_task_cost, 3, "reserved_task_cost = 3");
  });

  await section("2. reserve insufficient balance", async () => {
    await setBilling(userId, { limit: 10, used: 8, reserved: 1 }); // available 1
    const runId = await createRun(workflowId, userId);
    const { data } = await rpc("reserve_tasks_if_available", {
      p_user_id: userId, p_amount: 3, p_run_id: runId, p_expires_at: null,
    });
    eq(data.ok, false, "reserve refused");
    eq(data.reason, "insufficient_tasks", "reason insufficient_tasks");
    const b = await getBilling(userId);
    eq(b.tasks_reserved, 1, "tasks_reserved unchanged = 1");
    eq(b.tasks_used, 8, "tasks_used unchanged = 8");
    assert(b.tasks_reserved >= 0 && b.tasks_used >= 0, "counters non-negative");
    const r = await getRun(runId);
    eq(r.billing_status, "failed", "billing_status failed");
  });

  await section("3. reserve amount 0", async () => {
    await setBilling(userId, { limit: 10, used: 2, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    const { data } = await rpc("reserve_tasks_if_available", {
      p_user_id: userId, p_amount: 0, p_run_id: runId, p_expires_at: null,
    });
    eq(data.ok, true, "reserve 0 ok");
    const b = await getBilling(userId);
    eq(b.tasks_reserved, 0, "tasks_reserved stays 0");
    const r = await getRun(runId);
    eq(r.billing_status, "reserved", "billing_status reserved");
    eq(r.reserved_task_cost, 0, "reserved_task_cost = 0");
  });

  await section("4. reserve idempotency", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 4, p_run_id: runId, p_expires_at: null });
    const { data } = await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 4, p_run_id: runId, p_expires_at: null });
    eq(data.ok, true, "second reserve ok (idempotent)");
    eq(data.reason, "already_reserved", "reason already_reserved");
    const b = await getBilling(userId);
    eq(b.tasks_reserved, 4, "tasks_reserved not doubled = 4");
  });

  await section("5. reconcile exact", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 3, p_run_id: runId, p_expires_at: null });
    const { data } = await rpc("reconcile_task_reservation", { p_user_id: userId, p_run_id: runId, p_actual: 3 });
    eq(data.ok, true, "reconcile ok");
    eq(data.charged, 3, "charged = 3");
    eq(data.refunded, 0, "refunded = 0");
    const b = await getBilling(userId);
    eq(b.tasks_used, 3, "tasks_used += 3");
    eq(b.tasks_reserved, 0, "tasks_reserved back to 0");
    const r = await getRun(runId);
    eq(r.billing_status, "reconciled", "billing_status reconciled");
    eq(r.reconciled_task_cost, 3, "reconciled_task_cost = 3");
  });

  await section("6. reconcile under reserve", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 5, p_run_id: runId, p_expires_at: null });
    const { data } = await rpc("reconcile_task_reservation", { p_user_id: userId, p_run_id: runId, p_actual: 2 });
    eq(data.charged, 2, "charged = 2");
    eq(data.refunded, 3, "refunded = 3");
    const b = await getBilling(userId);
    eq(b.tasks_used, 2, "tasks_used += 2");
    eq(b.tasks_reserved, 0, "tasks_reserved fully released to 0");
  });

  await section("7. reconcile over reserve (clamp)", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 3, p_run_id: runId, p_expires_at: null });
    const { data } = await rpc("reconcile_task_reservation", { p_user_id: userId, p_run_id: runId, p_actual: 5 });
    eq(data.reason, "reconcile_over_reserve", "reason reconcile_over_reserve");
    eq(data.charged, 3, "charge clamped to reserved 3");
    const b = await getBilling(userId);
    eq(b.tasks_used, 3, "tasks_used += 3 (clamped)");
    eq(b.tasks_reserved, 0, "tasks_reserved = 0");
  });

  await section("8. reconcile idempotency", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 3, p_run_id: runId, p_expires_at: null });
    await rpc("reconcile_task_reservation", { p_user_id: userId, p_run_id: runId, p_actual: 3 });
    const { data } = await rpc("reconcile_task_reservation", { p_user_id: userId, p_run_id: runId, p_actual: 3 });
    eq(data.ok, true, "second reconcile ok (idempotent)");
    eq(data.reason, "already_reconciled", "reason already_reconciled");
    const b = await getBilling(userId);
    eq(b.tasks_used, 3, "tasks_used not double-charged = 3");
    eq(b.tasks_reserved, 0, "tasks_reserved = 0");
  });

  await section("9. release reservation", async () => {
    await setBilling(userId, { limit: 10, used: 1, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 4, p_run_id: runId, p_expires_at: null });
    const { data } = await rpc("release_task_reservation", { p_user_id: userId, p_run_id: runId });
    eq(data.ok, true, "release ok");
    eq(data.released, 4, "released = 4");
    const b = await getBilling(userId);
    eq(b.tasks_reserved, 0, "tasks_reserved back to 0");
    eq(b.tasks_used, 1, "tasks_used unchanged = 1");
    const r = await getRun(runId);
    eq(r.billing_status, "released", "billing_status released");
  });

  await section("10. release idempotency", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 2, p_run_id: runId, p_expires_at: null });
    await rpc("release_task_reservation", { p_user_id: userId, p_run_id: runId });
    const { data } = await rpc("release_task_reservation", { p_user_id: userId, p_run_id: runId });
    eq(data.ok, true, "second release ok (idempotent)");
    eq(data.reason, "already_released", "reason already_released");
    const b = await getBilling(userId);
    eq(b.tasks_reserved, 0, "tasks_reserved not negative, = 0");
  });

  await section("11. expiry sweep", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 5 }); // 2 expired + 3 active held
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const expiredRun = await createRun(workflowId, userId, {
      billing_status: "reserved", reserved_task_cost: 2, reservation_id: workflowId, reservation_expires_at: past,
    });
    const activeRun = await createRun(workflowId, userId, {
      billing_status: "reserved", reserved_task_cost: 3, reservation_id: workflowId, reservation_expires_at: future,
    });
    const { data } = await rpc("release_expired_reservations", { p_now: new Date().toISOString() });
    eq(data.released_count, 1, "released_count = 1");
    eq(data.released_tasks, 2, "released_tasks = 2");
    eq((await getRun(expiredRun)).billing_status, "released", "expired run released");
    eq((await getRun(activeRun)).billing_status, "reserved", "active run still reserved");
    eq((await getBilling(userId)).tasks_reserved, 3, "tasks_reserved 5 - 2 = 3");
    const { data: again } = await rpc("release_expired_reservations", { p_now: new Date().toISOString() });
    eq(again.released_count, 0, "second sweep is a no-op");
  });

  await section("12. non-negative invariant after release of NULL-cost run", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const runId = await createRun(workflowId, userId); // no billing_status
    const { data } = await rpc("release_task_reservation", { p_user_id: userId, p_run_id: runId });
    eq(data.ok, true, "release of non-reserved run ok");
    eq(data.reason, "nothing_to_release", "reason nothing_to_release");
    const b = await getBilling(userId);
    assert(b.tasks_reserved >= 0, "tasks_reserved >= 0");
    eq(b.tasks_reserved, 0, "tasks_reserved still 0");
  });

  await section("13. service-role-only grants", async () => {
    if (!ANON_KEY) {
      console.log("  - skipped (NEXT_PUBLIC_SUPABASE_ANON_KEY not set); grant verified by migration REVOKE/GRANT");
      return;
    }
    const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.rpc("reserve_tasks_if_available", {
      p_user_id: userId, p_amount: 1, p_run_id: workflowId, p_expires_at: null,
    });
    assert(!!error, "anon execution of reserve_tasks_if_available is rejected");
  });

  await section("14. task_usage_events partial unique indexes", async () => {
    const runId = await createRun(workflowId, userId);
    const base = { user_id: userId, workflow_run_id: runId, cost_policy_version: "v1" };
    // run-level dup (node_id null, same event_type) → rejected
    const r1 = await admin.from("task_usage_events").insert({ ...base, event_type: "run_estimate_recorded" });
    assert(!r1.error, "first run-level event inserts");
    const r2 = await admin.from("task_usage_events").insert({ ...base, event_type: "run_estimate_recorded" });
    assert(!!r2.error, "duplicate run-level event rejected");
    // node-level dup (same node_id) → rejected; different node allowed
    const n1 = await admin.from("task_usage_events").insert({ ...base, event_type: "node_task_charged", node_id: "n1" });
    assert(!n1.error, "first node-level event inserts");
    const n2 = await admin.from("task_usage_events").insert({ ...base, event_type: "node_task_charged", node_id: "n1" });
    assert(!!n2.error, "duplicate node-level event rejected");
    const n3 = await admin.from("task_usage_events").insert({ ...base, event_type: "node_task_charged", node_id: "n2" });
    assert(!n3.error, "different node_id allowed");
    // runless event (workflow_run_id null) twice → NOT blocked by these indexes
    const p1 = await admin.from("task_usage_events").insert({ user_id: userId, workflow_run_id: null, event_type: "internal_poll_cost_recorded", cost_policy_version: "v1" });
    const p2 = await admin.from("task_usage_events").insert({ user_id: userId, workflow_run_id: null, event_type: "internal_poll_cost_recorded", cost_policy_version: "v1" });
    assert(!p1.error && !p2.error, "runless poll events not blocked");
  });

  await section("15. flat deduct_tasks_if_available still works", async () => {
    await setBilling(userId, { limit: 10, used: 0, reserved: 0 });
    const { data } = await rpc("deduct_tasks_if_available", { p_user_id: userId, p_amount: 1 });
    eq(data.ok, true, "deduct ok");
    eq(data.used, 1, "tasks_used = 1 after flat deduct");
  });
}

// ── run + cleanup ────────────────────────────────────────────────────────────
async function cleanup() {
  // Slice 4.ACCOUNT-MODEL-3: accounts.owner_user_id is ON DELETE RESTRICT,
  // so explicitly clear account_memberships + accounts before auth.admin.deleteUser.
  for (const id of createdUserIds) {
    await admin.from("account_memberships").delete().eq("user_id", id);
    await admin.from("accounts").delete().eq("owner_user_id", id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  cleanup: failed to delete user ${id}: ${error.message}`);
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
console.log(`Reserve/Reconcile harness: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  console.error(`Failures:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("All reserve/reconcile RPC assertions passed.");
process.exit(0);
