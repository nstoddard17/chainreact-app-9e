/**
 * @jest-environment node
 *
 * ANALYTICS-FLEXIBILITY-CS-1 — gated DB proof for the `analytics_runs_aggregate`
 * RPC (migration 20260801000000):
 *   - two accounts with overlapping time windows stay ISOLATED,
 *   - aggregates match hand-computed fixtures (counts, duration sum/count),
 *   - test runs are excluded by default and included via p_include_tests,
 *   - status / trigger-source / workflow filters and day-bucketed series work,
 *   - the [from, to) window is inclusive-start / EXCLUSIVE-end,
 *   - categorical results are bounded by p_limit,
 *   - service_role-only EXECUTE — authenticated and anon are DENIED,
 *   - the result shape carries ONLY aggregate columns (no payload fields),
 *   - unbounded per-workflow series (no id list) is REJECTED in SQL.
 *
 * DESTRUCTIVE / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with URL + ANON + SERVICE key.
 * Mirrors tests/integration/security/workflow-run-stats-account.test.ts.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import { requireTables } from "@/tests/helpers/dbPreflight";
import type { RpcArgs } from "@/types/rpc";

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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY && !!ANON_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP analytics_runs_aggregate RPC — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const FROM = "2026-07-10T00:00:00.000Z";
const TO = "2026-07-13T00:00:00.000Z";

interface RpcRow {
  bucket_start: string | null;
  group_key: string | null;
  runs: number;
  succeeded: number;
  failed: number;
  dur_sum_ms: number;
  dur_count: number;
}

describeDb("analytics_runs_aggregate — ANALYTICS-FLEXIBILITY-CS-1", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userA = { id: "", email: "", accountId: "" };
  let userB = { id: "", email: "", accountId: "" };
  let wfA1 = "";
  let wfA2 = "";
  let wfB1 = "";

  async function makeUser(tag: string) {
    const { userId, email } = await createTrackedUser(admin, fixtures, `anq-${tag}`);
    const { data: pa } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    return { id: userId, email, accountId: pa!.id };
  }

  async function seedWorkflow(accountId: string, createdBy: string, name: string) {
    const { data, error } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: createdBy, name })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function seedRun(opts: {
    workflowId: string;
    accountId: string;
    status: "succeeded" | "failed";
    startedAt: string;
    durMs: number | null;
    triggeredBy?: string;
    isTest?: boolean;
  }) {
    const finished =
      opts.durMs === null
        ? null
        : new Date(Date.parse(opts.startedAt) + opts.durMs).toISOString();
    const { error } = await admin.from("workflow_runs").insert({
      workflow_id: opts.workflowId,
      account_id: opts.accountId,
      status: opts.status,
      trigger_node_id: "t1",
      trigger_event: {},
      started_at: opts.startedAt,
      finished_at: finished,
      is_test: opts.isTest ?? false,
      triggered_by: opts.triggeredBy ?? "manual",
    });
    if (error) throw new Error(`seedRun: ${error.message}`);
  }

  function rpc(params: Record<string, unknown>) {
    return admin.rpc("analytics_runs_aggregate", {
      p_account_id: userA.accountId,
      p_from: FROM,
      p_to: TO,
      p_dimension: null,
      p_grain: null,
      p_series_by: null,
      p_workflow_ids: null,
      p_statuses: null,
      p_trigger_sources: null,
      p_include_tests: false,
      p_limit: null,
      ...params,
    } satisfies RpcArgs<"analytics_runs_aggregate">);
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await requireTables(admin, ["workflow_runs", "workflows"]);
    // Fail fast (not vacuous-green) if the migration hasn't been applied.
    const probe = await admin.rpc("analytics_runs_aggregate", {
      p_account_id: "00000000-0000-4000-8000-000000000000",
      p_from: FROM,
      p_to: TO,
    } satisfies RpcArgs<"analytics_runs_aggregate">);
    if (probe.error?.message.includes("Could not find the function")) {
      throw new Error(
        "analytics_runs_aggregate missing — apply migration 20260801000000 (npm run db:push).",
      );
    }

    userA = await makeUser("a");
    userB = await makeUser("b");
    wfA1 = await seedWorkflow(userA.accountId, userA.id, "A1 invoices");
    wfA2 = await seedWorkflow(userA.accountId, userA.id, "A2 sync");
    wfB1 = await seedWorkflow(userB.accountId, userB.id, "B1 other");

    // ── Account A fixture (hand-computed expectations below) ────────────────
    // wfA1: 4 real runs (3 succeeded / 1 failed), all finished.
    await seedRun({ workflowId: wfA1, accountId: userA.accountId, status: "succeeded", startedAt: "2026-07-10T10:00:00.000Z", durMs: 2000, triggeredBy: "manual" }); // a1
    await seedRun({ workflowId: wfA1, accountId: userA.accountId, status: "succeeded", startedAt: "2026-07-10T12:00:00.000Z", durMs: 300, triggeredBy: "webhook" }); // a9
    await seedRun({ workflowId: wfA1, accountId: userA.accountId, status: "succeeded", startedAt: "2026-07-11T10:00:00.000Z", durMs: 4000, triggeredBy: "webhook" }); // a2
    await seedRun({ workflowId: wfA1, accountId: userA.accountId, status: "failed", startedAt: "2026-07-11T11:00:00.000Z", durMs: 10000, triggeredBy: "manual" }); // a3
    // Test run — excluded unless p_include_tests.
    await seedRun({ workflowId: wfA1, accountId: userA.accountId, status: "succeeded", startedAt: "2026-07-11T12:00:00.000Z", durMs: 1000, triggeredBy: "test", isTest: true }); // a4
    // wfA2: 3 real in-window runs (incl. one unfinished + the from-boundary).
    await seedRun({ workflowId: wfA2, accountId: userA.accountId, status: "succeeded", startedAt: "2026-07-12T10:00:00.000Z", durMs: 1000, triggeredBy: "scheduled" }); // a5
    await seedRun({ workflowId: wfA2, accountId: userA.accountId, status: "failed", startedAt: "2026-07-12T11:00:00.000Z", durMs: null, triggeredBy: "webhook" }); // a6 unfinished
    await seedRun({ workflowId: wfA2, accountId: userA.accountId, status: "succeeded", startedAt: FROM, durMs: 500, triggeredBy: "manual" }); // a7 — from-boundary, INCLUDED
    await seedRun({ workflowId: wfA2, accountId: userA.accountId, status: "succeeded", startedAt: TO, durMs: 100, triggeredBy: "manual" }); // a8 — to-boundary, EXCLUDED

    // ── Account B — overlapping window, must never bleed into A ─────────────
    await seedRun({ workflowId: wfB1, accountId: userB.accountId, status: "succeeded", startedAt: "2026-07-11T10:30:00.000Z", durMs: 700 });
    await seedRun({ workflowId: wfB1, accountId: userB.accountId, status: "failed", startedAt: "2026-07-11T10:45:00.000Z", durMs: 900 });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("KPI aggregate matches hand-computed values; [from, to) boundaries hold", async () => {
    const r = await rpc({});
    expect(r.error).toBeNull();
    const rows = (r.data ?? []) as RpcRow[];
    expect(rows).toHaveLength(1);
    const k = rows[0]!;
    // a1,a9,a2,a3 (wfA1) + a5,a6,a7 (wfA2). a4 test excluded, a8 at `to` excluded.
    expect(Number(k.runs)).toBe(7);
    expect(Number(k.succeeded)).toBe(5);
    expect(Number(k.failed)).toBe(2);
    // 2000+300+4000+10000 + 1000+500 (a6 unfinished contributes nothing).
    expect(Number(k.dur_sum_ms)).toBe(17800);
    expect(Number(k.dur_count)).toBe(6);
  });

  it("two accounts with overlapping windows stay isolated", async () => {
    const a = await rpc({});
    const b = await rpc({ p_account_id: userB.accountId });
    expect(Number((a.data as RpcRow[])[0]!.runs)).toBe(7);
    const bRow = (b.data as RpcRow[])[0]!;
    expect(Number(bRow.runs)).toBe(2);
    expect(Number(bRow.dur_sum_ms)).toBe(1600);
  });

  it("test runs are excluded by default and included via p_include_tests", async () => {
    const withTests = await rpc({ p_include_tests: true });
    const k = (withTests.data as RpcRow[])[0]!;
    expect(Number(k.runs)).toBe(8);
    expect(Number(k.succeeded)).toBe(6);
    expect(Number(k.dur_sum_ms)).toBe(18800);
  });

  it("status / trigger-source / workflow filters narrow correctly", async () => {
    const failed = await rpc({ p_statuses: ["failed"] });
    const f = (failed.data as RpcRow[])[0]!;
    expect(Number(f.runs)).toBe(2);
    expect(Number(f.succeeded)).toBe(0);
    expect(Number(f.dur_count)).toBe(1); // a6 is unfinished

    const manual = await rpc({ p_trigger_sources: ["manual"] });
    const m = (manual.data as RpcRow[])[0]!;
    expect(Number(m.runs)).toBe(3); // a1, a3, a7
    expect(Number(m.dur_sum_ms)).toBe(12500);

    const onlyA2 = await rpc({ p_workflow_ids: [wfA2] });
    expect(Number((onlyA2.data as RpcRow[])[0]!.runs)).toBe(3);
  });

  it("day-bucketed series by workflow: exact ids → exact per-bucket groups", async () => {
    const r = await rpc({
      p_dimension: "time",
      p_grain: "day",
      p_series_by: "workflow",
      p_workflow_ids: [wfA1, wfA2],
    });
    expect(r.error).toBeNull();
    const rows = (r.data ?? []) as RpcRow[];
    const key = (row: RpcRow) =>
      `${row.group_key}|${new Date(Date.parse(row.bucket_start!)).toISOString().slice(0, 10)}`;
    const byKey = new Map(rows.map((row) => [key(row), Number(row.runs)]));
    expect(byKey.get(`${wfA1}|2026-07-10`)).toBe(2); // a1, a9
    expect(byKey.get(`${wfA1}|2026-07-11`)).toBe(2); // a2, a3
    expect(byKey.get(`${wfA2}|2026-07-10`)).toBe(1); // a7 boundary
    expect(byKey.get(`${wfA2}|2026-07-12`)).toBe(2); // a5, a6
    expect(rows.every((row) => row.group_key === wfA1 || row.group_key === wfA2)).toBe(true);
  });

  it("categorical workflow dimension is bounded by p_limit (top by runs)", async () => {
    const r = await rpc({ p_dimension: "workflow", p_limit: 1 });
    expect(r.error).toBeNull();
    const rows = (r.data ?? []) as RpcRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group_key).toBe(wfA1); // 4 runs > wfA2's 3
    expect(Number(rows[0]!.runs)).toBe(4);
  });

  it("series by workflow WITHOUT an id list is rejected in SQL (unbounded fan-out guard)", async () => {
    const r = await rpc({ p_dimension: "time", p_grain: "day", p_series_by: "workflow" });
    expect(r.error).not.toBeNull();
    expect(r.error!.message).toContain("requires p_workflow_ids");
  });

  it("the result shape carries ONLY aggregate columns — no payload fields", async () => {
    const r = await rpc({});
    const k = (r.data as Record<string, unknown>[])[0]!;
    expect(Object.keys(k).sort()).toEqual(
      ["bucket_start", "dur_count", "dur_sum_ms", "failed", "group_key", "runs", "succeeded"].sort(),
    );
  });

  it("authenticated and anon roles CANNOT execute the RPC (service_role only)", async () => {
    const session = await signedInClient({
      url: URL!,
      anonKey: ANON_KEY!,
      admin,
      email: userA.email,
    });
    const asUser = await session.rpc("analytics_runs_aggregate", {
      p_account_id: userA.accountId,
      p_from: FROM,
      p_to: TO,
    } satisfies RpcArgs<"analytics_runs_aggregate">);
    expect(asUser.error).not.toBeNull();
    expect(asUser.error!.code === "42501" || asUser.status === 401 || asUser.status === 403).toBe(true);

    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const asAnon = await anon.rpc("analytics_runs_aggregate", {
      p_account_id: userA.accountId,
      p_from: FROM,
      p_to: TO,
    } satisfies RpcArgs<"analytics_runs_aggregate">);
    expect(asAnon.error).not.toBeNull();
  });
});
