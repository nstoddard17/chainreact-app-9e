/**
 * @jest-environment node
 *
 * Ops-alerts END-TO-END verification harness (Phase 8b · CS-2), direct-seed.
 *
 * Proves the REAL ops-alert pipeline works end to end against the real dev/test
 * schema, for all six launch alert categories:
 *   stuck runs · queue backlog · provider failure rate · oauth refresh failures ·
 *   billing webhook failures · cron failures
 *
 * For each category it DIRECT-SEEDS a genuinely breaching signal into the real
 * tables the readers read (`workflow_runs`, `integrations`, `ops_signal_events`),
 * then runs the REAL `evaluateOpsAlerts(buildDefaultDeps(now))` — not duplicated
 * rule logic. Delivery is asserted via an INJECTED recording sink on the existing
 * `deps.deliver` seam, so NO external Slack/Discord webhook is ever called and no
 * network request leaves the process. Cron isolation uses the injectable
 * `deps.monitoredCrons` (one synthetic smoke cron) so the nine real monitored crons
 * are not evaluated. Thresholds are pinned to `DEFAULT_OPS_ALERT_THRESHOLDS` so the
 * seed magnitudes are deterministic regardless of any `OPS_ALERT_*` env overrides.
 *
 * Pipeline proven, in order, on one seeded set:
 *   1. FIRE    — first evaluate: each category opens exactly one alert + delivers once.
 *   2. DEDUPE  — second evaluate (same now, signals still present, within cooldown):
 *                zero new deliveries for our keys, occurrence bumped, no new open row.
 *   3. RESOLVE — clear the signals, third evaluate: our open alerts flip to resolved.
 *   4. CLEANUP — delete every seeded row + our alert rows; assert 0 leaked.
 *
 * DIRECT-SEED CONTRACT: no production code changed. Reuses the existing evaluator,
 * readers, repositories, and the `deps.deliver` / `deps.monitoredCrons` /
 * `deps.thresholds` injection points. Assumes a clean-enough dev test DB (no other
 * live breaching conditions for the global-keyed categories) — the same baseline
 * assumption the trigger-smoke / RLS dev tests make. A pre-clean of our alert keys +
 * a fail-fast precondition keep it self-healing.
 *
 * GATED: runs ONLY with ALLOW_DB_INTEGRATION_TESTS=true + Supabase env (the suite
 * provisions a throwaway smoke account per run). It also needs the two ops migrations
 * (`ops_signal_events`, `ops_alert_events`) + the durable-queue migration applied to
 * the target DB; if they are not, seeding/eval fails loudly (never a false pass).
 *
 * Run:
 *   ALLOW_DB_INTEGRATION_TESTS=true npm run smoke:ops-alerts
 *   or:
 *   ALLOW_DB_INTEGRATION_TESTS=true \
 *     npx jest tests/integration/observability/ops-alerts.evaluator.dev.test.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildDefaultDeps,
  evaluateOpsAlerts,
  type OpsAlertEvaluatorDeps,
} from "@/services/observability/opsAlertEvaluator";
import { DEFAULT_OPS_ALERT_THRESHOLDS } from "@/core/observability/alertThresholds";
import type { OpsAlertCandidate } from "@/contracts/opsAlert";
import { cleanupFixtures, createFixtureTracker } from "@/tests/helpers/dbFixtureCleanup";
import { provisionDisposableSmokeAccount } from "@/tests/helpers/smokeAccount";

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

const ALLOW_DB = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// NOTE: SMOKE_ACCOUNT_ID / SMOKE_USER_ID are deliberately NOT read here.
// They pointed at a real owner account, so every run wrote `ops-alerts-smoke:*`
// workflows into production data that the harness then only SOFT-deleted. This
// suite now provisions a throwaway account per run and hard-deletes it in afterAll.

const RUN = ALLOW_DB && !!URL && !!SERVICE_KEY;
const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP ops-alerts evaluator e2e — needs ALLOW_DB_INTEGRATION_TESTS=true + " +
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (provisions a throwaway smoke " +
      "account per run, and the ops + durable-queue migrations applied). " +
      "No external webhook is ever called.",
  );
}

const minutesAgo = (nowMs: number, m: number): string => new Date(nowMs - m * 60_000).toISOString();

describeLive("ops-alerts evaluator: end-to-end fire -> deliver -> dedupe -> resolve (real schema, direct-seed)", () => {
  const admin: SupabaseClient = createClient(URL as string, SERVICE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Provisioned in beforeAll so nothing is seeded under a real account.
  const fixtures = createFixtureTracker();
  let account = "";
  let user = "";

  // Deterministic per-run markers so seeds + alert keys never collide with real data.
  const token = randomUUID().slice(0, 8);
  const PROVIDER = `crsmoke_prov_${token}`;
  const OAUTH_PROVIDER = `crsmoke_oauth_${token}`;
  const CRON_NAME = `crsmoke-cron-${token}`;
  const nowMs = Date.parse(new Date().toISOString());
  const nowIso = new Date(nowMs).toISOString();

  const KEYS = {
    stuck: "stuck_runs",
    queue: "queue_backlog",
    provider: `provider_failure_rate:${PROVIDER}`,
    oauth: `oauth_refresh_failures:${OAUTH_PROVIDER}`,
    billingSig: "billing_webhook_failures:signature",
    billingProc: "billing_webhook_failures:processing",
    cron: `cron_failures:${CRON_NAME}`,
  };
  const ALL_KEYS = Object.values(KEYS);
  // Provider/oauth/cron keys are UNIQUELY namespaced by our token, so they can never
  // collide with a real breach — these are the keys we assert delivery on strictly.
  const UNIQUE_KEYS = [KEYS.provider, KEYS.oauth, KEYS.cron];

  // Cleanup ledgers (delete-by-id at teardown; delete is idempotent).
  const seededRunIds: string[] = [];
  const seededIntegrationIds: string[] = [];
  const seededSignalIds: string[] = [];
  let workflowId: string | null = null;

  async function insertRun(row: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin
      .from("workflow_runs")
      .insert({
        workflow_id: workflowId,
        account_id: account,
        triggered_by_user_id: user,
        trigger_node_id: "smoke-node",
        trigger_event: { smoke: token },
        steps: [],
        ...row,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seed workflow_runs failed: ${error?.message ?? "no row"}`);
    seededRunIds.push(data.id);
    return data.id;
  }

  async function insertSignal(row: {
    kind: "cron_run" | "billing_webhook_failure";
    source: string;
    outcome: "ok" | "failed";
    detail_code: string | null;
    created_at: string;
  }): Promise<string> {
    const { data, error } = await admin
      .from("ops_signal_events")
      .insert(row)
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seed ops_signal_events failed: ${error?.message ?? "no row"}`);
    seededSignalIds.push(data.id);
    return data.id;
  }

  function buildDeps(recordInto: OpsAlertCandidate[]): OpsAlertEvaluatorDeps {
    const deps = buildDefaultDeps(nowIso);
    // Pin thresholds so seed magnitudes are deterministic regardless of env overrides.
    deps.thresholds = { ...DEFAULT_OPS_ALERT_THRESHOLDS };
    // Only evaluate our synthetic cron so the nine real monitored crons don't fire.
    deps.monitoredCrons = [{ name: CRON_NAME, expectedIntervalMinutes: 5 }];
    // Injected recording sink — asserts delivery WITHOUT any external webhook call.
    deps.deliver = async (candidate: OpsAlertCandidate) => {
      recordInto.push(candidate);
      return { logged: true, webhookDelivered: null };
    };
    return deps;
  }

  async function openAlertsForOurKeys(): Promise<
    { dedupe_key: string; status: string; occurrence_count: number }[]
  > {
    const { data, error } = await admin
      .from("ops_alert_events")
      .select("dedupe_key, status, occurrence_count")
      .in("dedupe_key", ALL_KEYS);
    if (error) throw new Error(`read ops_alert_events failed: ${error.message}`);
    return (data ?? []) as { dedupe_key: string; status: string; occurrence_count: number }[];
  }

  beforeAll(async () => {
    // Throwaway account FIRST — every seed below is scoped to it.
    ({ accountId: account, userId: user } = await provisionDisposableSmokeAccount(admin, fixtures));

    // Pre-clean any stale alert rows for OUR keys so the FIRE step starts fresh
    // (dev DB self-heal; only touches our own dedupe keys, never unrelated alerts).
    await admin.from("ops_alert_events").delete().in("dedupe_key", ALL_KEYS);

    // 1) Smoke workflow whose definition maps node "smoke-node" -> our unique provider.
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({
        account_id: account,
        created_by_user_id: user,
        name: `ops-alerts-smoke:${token}`,
        state: "active",
        draft_definition: { nodes: [{ id: "smoke-node", provider: PROVIDER, type: "noop" }], edges: [] },
      })
      .select("id")
      .single<{ id: string }>();
    if (wfErr || !wf) throw new Error(`seed workflow failed: ${wfErr?.message ?? "no row"}`);
    workflowId = wf.id;

    // 2) Stuck runs: >= 3 running rows older than the 15m warn cutoff, not finalized.
    for (let i = 0; i < 3; i += 1) {
      await insertRun({ status: "running", started_at: minutesAgo(nowMs, 20), finished_at: null });
    }
    // 3) Queue backlog: one queued row older than the 10m oldest-age threshold. The
    //    reader ages by created_at (not started_at), so backdate created_at too.
    await insertRun({
      status: "queued",
      started_at: minutesAgo(nowMs, 15),
      finished_at: null,
      created_at: minutesAgo(nowMs, 15),
    });
    // 4) Provider failure rate: one succeeded run whose steps are 25 failed attempts on
    //    "smoke-node" -> 25 attempts / 100% failure for our unique provider (>= 20 vol, > 50%).
    await insertRun({
      status: "succeeded",
      started_at: minutesAgo(nowMs, 6),
      finished_at: minutesAgo(nowMs, 5),
      created_at: minutesAgo(nowMs, 5),
      steps: Array.from({ length: 25 }, () => ({ nodeId: "smoke-node", status: "failed" })),
    });
    // 5) OAuth refresh failures: >= 5 integrations for our unique provider newly needs-reconnect.
    for (let i = 0; i < 5; i += 1) {
      const { data, error } = await admin
        .from("integrations")
        .insert({
          account_id: account,
          connected_by_user_id: user,
          provider: OAUTH_PROVIDER,
          provider_account_id: `${token}-${i}`,
          access_token_encrypted: "crsmoke-encrypted-placeholder",
          scopes: [],
          needs_reconnect_at: minutesAgo(nowMs, 30),
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) throw new Error(`seed integrations failed: ${error?.message ?? "no row"}`);
      seededIntegrationIds.push(data.id);
    }
    // 6) Billing webhook failures: >= 5 invalid_signature in 10m (sig critical) => also >= 3 total (processing).
    for (let i = 0; i < 5; i += 1) {
      await insertSignal({
        kind: "billing_webhook_failure",
        source: "stripe_billing",
        outcome: "failed",
        detail_code: "invalid_signature",
        created_at: minutesAgo(nowMs, 5),
      });
    }
    // 7) Cron failures: one explicit failed heartbeat for our synthetic cron (no ok -> also missing-run).
    await insertSignal({
      kind: "cron_run",
      source: CRON_NAME,
      outcome: "failed",
      detail_code: "http_500",
      created_at: minutesAgo(nowMs, 1),
    });
  }, 60_000);

  afterAll(async () => {
    // Delete every seeded row + our alert rows by id/key. Delete is idempotent.
    if (seededRunIds.length) await admin.from("workflow_runs").delete().in("id", seededRunIds);
    if (seededIntegrationIds.length) await admin.from("integrations").delete().in("id", seededIntegrationIds);
    if (seededSignalIds.length) await admin.from("ops_signal_events").delete().in("id", seededSignalIds);
    await admin.from("ops_alert_events").delete().in("dedupe_key", ALL_KEYS);
    if (workflowId) await admin.from("workflows").delete().eq("id", workflowId);
    // Hard-deletes the throwaway account and everything created under it. Throws
    // if anything survives, so a leak fails the suite instead of accumulating.
    await cleanupFixtures(admin, fixtures);
  }, 60_000);

  it("FIRE: first evaluate opens one alert per category and delivers each once", async () => {
    // Precondition: a clean slate for our keys (pre-clean in beforeAll guarantees it).
    const before = await openAlertsForOurKeys();
    expect(before.filter((a) => a.status === "open")).toHaveLength(0);

    const delivered: OpsAlertCandidate[] = [];
    const summary = await evaluateOpsAlerts(buildDeps(delivered));

    // Every one of our 7 dedupe keys is now an OPEN alert (real evaluator + readers).
    const open = (await openAlertsForOurKeys()).filter((a) => a.status === "open");
    const openKeys = new Set(open.map((a) => a.dedupe_key));
    for (const key of ALL_KEYS) expect(openKeys.has(key)).toBe(true);

    // Delivery was invoked (injected sink) for each of our keys — no external webhook.
    const deliveredKeys = new Set(delivered.map((c) => c.dedupeKey));
    for (const key of ALL_KEYS) expect(deliveredKeys.has(key)).toBe(true);

    // Severity spot-checks that prove the real rules ran (not stubbed):
    const bySeverity = new Map(delivered.map((c) => [c.dedupeKey, c.severity]));
    expect(bySeverity.get(KEYS.provider)).toBe("critical"); // 100% > 80%
    expect(bySeverity.get(KEYS.billingSig)).toBe("critical"); // signature burst
    expect(bySeverity.get(KEYS.cron)).toBe("critical"); // failing AND missing

    // The evaluator's own summary counts reflect real work (fired >= our 7).
    expect(summary.fired).toBeGreaterThanOrEqual(ALL_KEYS.length);
    expect(summary.delivered).toBeGreaterThanOrEqual(ALL_KEYS.length);
  }, 120_000);

  it("DEDUPE: a second evaluate within cooldown suppresses delivery and bumps occurrence", async () => {
    const occBefore = new Map(
      (await openAlertsForOurKeys())
        .filter((a) => a.status === "open")
        .map((a) => [a.dedupe_key, a.occurrence_count]),
    );

    const delivered: OpsAlertCandidate[] = [];
    await evaluateOpsAlerts(buildDeps(delivered));

    // No NEW delivery for any of our keys (within the 60m cooldown of the FIRE tick).
    const deliveredKeys = new Set(delivered.map((c) => c.dedupeKey));
    for (const key of ALL_KEYS) expect(deliveredKeys.has(key)).toBe(false);

    // Still exactly one open row per key, occurrence incremented (no duplicate spam).
    const open = (await openAlertsForOurKeys()).filter((a) => a.status === "open");
    const openKeys = open.map((a) => a.dedupe_key);
    for (const key of ALL_KEYS) {
      expect(openKeys.filter((k) => k === key)).toHaveLength(1);
      const occ = open.find((a) => a.dedupe_key === key)!.occurrence_count;
      expect(occ).toBeGreaterThan(occBefore.get(key) ?? 0);
    }
  }, 120_000);

  it("RESOLVE: clearing the signals resolves our open alerts on the next evaluate", async () => {
    // Clear each breaching signal (mutate in place; rows deleted at teardown).
    // stuck + queue: finalize the running/queued runs.
    await admin
      .from("workflow_runs")
      .update({ status: "succeeded", finished_at: nowIso })
      .in("id", seededRunIds)
      .in("status", ["running", "queued"]);
    // provider: empty the failed-steps run so it contributes no attempts.
    await admin.from("workflow_runs").update({ steps: [] }).in("id", seededRunIds);
    // oauth: clear needs_reconnect on our integrations.
    await admin.from("integrations").update({ needs_reconnect_at: null }).in("id", seededIntegrationIds);
    // billing: remove our failure signals from the window.
    await admin.from("ops_signal_events").delete().in("id", seededSignalIds);
    // cron: a fresh OK heartbeat (newest) clears both explicit-fail and missing-run.
    await insertSignal({
      kind: "cron_run",
      source: CRON_NAME,
      outcome: "ok",
      detail_code: null,
      created_at: nowIso,
    });

    const delivered: OpsAlertCandidate[] = [];
    await evaluateOpsAlerts(buildDeps(delivered));

    // All of our alerts are now resolved (no open rows remain for our keys).
    const rows = await openAlertsForOurKeys();
    const stillOpen = rows.filter((a) => a.status === "open").map((a) => a.dedupe_key);
    expect(stillOpen).toHaveLength(0);
    for (const key of ALL_KEYS) {
      expect(rows.some((a) => a.dedupe_key === key && a.status === "resolved")).toBe(true);
    }
    // No re-delivery of a cleared condition.
    const deliveredKeys = new Set(delivered.map((c) => c.dedupeKey));
    for (const key of UNIQUE_KEYS) expect(deliveredKeys.has(key)).toBe(false);
  }, 120_000);

  it("CLEANUP: all seeded rows + alert rows are removed (0 leaked)", async () => {
    // Perform the teardown deletes here too so the assertions below run against the
    // final state (afterAll is a belt-and-suspenders repeat; delete is idempotent).
    if (seededRunIds.length) await admin.from("workflow_runs").delete().in("id", seededRunIds);
    if (seededIntegrationIds.length) await admin.from("integrations").delete().in("id", seededIntegrationIds);
    if (seededSignalIds.length) await admin.from("ops_signal_events").delete().in("id", seededSignalIds);
    await admin.from("ops_alert_events").delete().in("dedupe_key", ALL_KEYS);
    if (workflowId) await admin.from("workflows").delete().eq("id", workflowId);

    // Prove 0 leaked: nothing remains under our workflow / provider / signal ids / keys.
    const runs = await admin.from("workflow_runs").select("id", { count: "exact", head: true }).eq("workflow_id", workflowId);
    expect(runs.count ?? 0).toBe(0);
    const ints = await admin.from("integrations").select("id", { count: "exact", head: true }).eq("provider", OAUTH_PROVIDER);
    expect(ints.count ?? 0).toBe(0);
    const sigs = seededSignalIds.length
      ? await admin.from("ops_signal_events").select("id", { count: "exact", head: true }).in("id", seededSignalIds)
      : { count: 0 };
    expect(sigs.count ?? 0).toBe(0);
    const alerts = await admin.from("ops_alert_events").select("id", { count: "exact", head: true }).in("dedupe_key", ALL_KEYS);
    expect(alerts.count ?? 0).toBe(0);
    const wfs = await admin.from("workflows").select("id", { count: "exact", head: true }).eq("id", workflowId);
    expect(wfs.count ?? 0).toBe(0);
  }, 120_000);
});
