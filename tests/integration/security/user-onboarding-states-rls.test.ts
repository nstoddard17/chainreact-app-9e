/**
 * @jest-environment node
 *
 * 5.ONBOARD-1 Batch 1 — user_onboarding_states RLS/GRANT surface.
 *
 * Proves:
 *   - a user SELECTs only their OWN row, and only while a member of that account
 *     (membership predicate: a removed member's row disappears from their view)
 *   - another user / another account / anon → zero rows, no error leak
 *   - `authenticated` has NO write path (INSERT/UPDATE/DELETE → privilege error,
 *     so completed_at / completion_workflow_id can never be forged client-side)
 *   - service_role bypasses (the approved repository path)
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + rows. OPT-IN.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";

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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP user_onboarding_states RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("user_onboarding_states RLS — 5.ONBOARD-1", () => {
  let admin: SupabaseClient;
  // Shared teardown (tests/helpers/dbFixtureCleanup.ts) tracks every synthetic
  // user + account so afterAll tears them down in RESTRICT-safe order.
  const fixtures = createFixtureTracker();

  let a: { userId: string; email: string; password: string; accountId: string };
  let b: { userId: string; email: string; password: string; accountId: string };
  let teamAccountId: string;

  async function createTestUser(label: string) {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `onb-rls-${label}`);
    return { userId, email, password };
  }

  async function personalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`personalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  // CAPTCHA is enforced on password sign-in for this project, so sessions are
  // established via a service-role email link instead (see dbSessionClient).
  // The resulting session is ordinary — RLS still applies exactly as in prod.
  async function sessionClient(email: string, _password: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  async function seedState(userId: string, accountId: string): Promise<void> {
    const { error } = await admin
      .from("user_onboarding_states")
      .upsert(
        { user_id: userId, account_id: accountId },
        { onConflict: "user_id,account_id" },
      );
    if (error) throw new Error(`seedState: ${error.message}`);
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ua = await createTestUser("a");
    const ub = await createTestUser("b");
    a = { ...ua, accountId: await personalAccountId(ua.userId) };
    b = { ...ub, accountId: await personalAccountId(ub.userId) };
    await seedState(a.userId, a.accountId);
    await seedState(b.userId, b.accountId);

    // Team account owned by A with B as a member — for the removed-member case.
    const { data: team, error: teamErr } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Onboarding RLS Team", owner_user_id: a.userId })
      .select("id")
      .single<{ id: string }>();
    if (teamErr || !team) throw new Error(`seed team: ${teamErr?.message ?? "no row"}`);
    teamAccountId = team.id;
    fixtures.trackAccount(team.id);
    const { error: memErr } = await admin.from("account_memberships").insert([
      { account_id: team.id, user_id: a.userId, role: "owner" },
      { account_id: team.id, user_id: b.userId, role: "member" },
    ]);
    if (memErr) throw new Error(`seed memberships: ${memErr.message}`);
    await seedState(b.userId, teamAccountId);
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("a user reads their own row in their own account", async () => {
    const c = await sessionClient(a.email, a.password);
    const { data, error } = await c
      .from("user_onboarding_states")
      .select("user_id, account_id")
      .eq("account_id", a.accountId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.user_id).toBe(a.userId);
    await c.auth.signOut();
  });

  it("a user cannot read another user's row — zero rows, no error leak", async () => {
    const c = await sessionClient(a.email, a.password);
    const { data, error } = await c
      .from("user_onboarding_states")
      .select("*")
      .eq("user_id", b.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    await c.auth.signOut();
  });

  it("a user cannot read rows for a foreign account", async () => {
    const c = await sessionClient(a.email, a.password);
    const { data, error } = await c
      .from("user_onboarding_states")
      .select("*")
      .eq("account_id", b.accountId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    await c.auth.signOut();
  });

  it("anon gets nothing — blocked at the GRANT layer (42501), before RLS", async () => {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await c.from("user_onboarding_states").select("*");
    // 20260725000000 revoked the default-privilege grants, so anon is denied by
    // privilege rather than filtered to zero rows by RLS — a strictly stronger
    // posture. Accept either shape, but require that NO data comes back.
    if (error) {
      expect(error.code).toBe("42501");
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it("authenticated INSERT is denied (no write grant — completion cannot be forged)", async () => {
    const c = await sessionClient(a.email, a.password);
    const { error } = await c.from("user_onboarding_states").insert({
      user_id: a.userId,
      account_id: a.accountId,
      completed_at: new Date().toISOString(),
      completion_workflow_name: "forged provenance",
    });
    expect(error).not.toBeNull();
    await c.auth.signOut();
  });

  it("authenticated UPDATE of one's own row is denied (completed_at / completion_workflow_id / completion_workflow_name unreachable)", async () => {
    const c = await sessionClient(a.email, a.password);
    const { data, error } = await c
      .from("user_onboarding_states")
      .update({
        completed_at: new Date().toISOString(),
        completion_workflow_name: "forged provenance",
        minimized: true,
      })
      .eq("user_id", a.userId)
      .eq("account_id", a.accountId)
      .select("*");
    // Either a privilege error (preferred) or silently zero rows — both prove
    // the client cannot write. It must NOT succeed with a returned row.
    if (error === null) {
      expect(data).toHaveLength(0);
    } else {
      expect(error).not.toBeNull();
    }
    const { data: after } = await admin
      .from("user_onboarding_states")
      .select("completed_at, completion_workflow_name, minimized")
      .eq("user_id", a.userId)
      .eq("account_id", a.accountId)
      .single<{
        completed_at: string | null;
        completion_workflow_name: string | null;
        minimized: boolean;
      }>();
    expect(after?.completed_at).toBeNull();
    expect(after?.completion_workflow_name).toBeNull();
    expect(after?.minimized).toBe(false);
    await c.auth.signOut();
  });

  it("a member sees their row in a team account; a REMOVED member no longer does", async () => {
    const c = await sessionClient(b.email, b.password);
    const before = await c
      .from("user_onboarding_states")
      .select("account_id")
      .eq("account_id", teamAccountId);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(1);

    const { error: rmErr } = await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", teamAccountId)
      .eq("user_id", b.userId);
    expect(rmErr).toBeNull();

    const after = await c
      .from("user_onboarding_states")
      .select("account_id")
      .eq("account_id", teamAccountId);
    expect(after.error).toBeNull();
    expect(after.data).toHaveLength(0);
    await c.auth.signOut();
  });

  it("PROVENANCE: deleting the completion workflow nulls the FK but PRESERVES the name snapshot", async () => {
    // Seed a workflow, latch completion against it (service-role, as the app
    // does), then hard-delete the workflow and prove the snapshot survives.
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({
        account_id: a.accountId,
        created_by_user_id: a.userId,
        name: "Provenance probe workflow",
      })
      .select("id")
      .single<{ id: string }>();
    expect(wfErr).toBeNull();

    const { error: latchErr } = await admin
      .from("user_onboarding_states")
      .update({
        completed_at: new Date().toISOString(),
        completion_workflow_id: wf!.id,
        completion_workflow_name: "Provenance probe workflow",
      })
      .eq("user_id", a.userId)
      .eq("account_id", a.accountId)
      .is("completed_at", null);
    expect(latchErr).toBeNull();

    const { error: delErr } = await admin.from("workflows").delete().eq("id", wf!.id);
    expect(delErr).toBeNull();

    const { data: after } = await admin
      .from("user_onboarding_states")
      .select("completed_at, completion_workflow_id, completion_workflow_name")
      .eq("user_id", a.userId)
      .eq("account_id", a.accountId)
      .single<{
        completed_at: string | null;
        completion_workflow_id: string | null;
        completion_workflow_name: string | null;
      }>();
    // FK cleared by ON DELETE SET NULL…
    expect(after?.completion_workflow_id).toBeNull();
    // …but the completion fact AND the historical name remain.
    expect(after?.completed_at).not.toBeNull();
    expect(after?.completion_workflow_name).toBe("Provenance probe workflow");
  });

  it("service_role sees and writes everything (the approved repository path)", async () => {
    const { data, error } = await admin
      .from("user_onboarding_states")
      .select("*")
      .in("user_id", [a.userId, b.userId]);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);

    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("user_onboarding_states")
      .update({ minimized: true })
      .eq("user_id", a.userId)
      .eq("account_id", a.accountId)
      .is("completed_at", null);
    expect(updErr).toBeNull();
    // reset
    await admin
      .from("user_onboarding_states")
      .update({ minimized: false })
      .eq("user_id", a.userId)
      .eq("account_id", a.accountId);
    void now;
  });
});
