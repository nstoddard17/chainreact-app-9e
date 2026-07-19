/**
 * @jest-environment node
 *
 * 5.ONBOARD-4 — collaboration_onboarding_states RLS/GRANT surface.
 *
 * Sibling of user-onboarding-states-rls.test.ts, plus the one property that
 * table does not have: PER-TRACK isolation.
 *
 * Proves:
 *   - a user SELECTs only their OWN rows, and only while a member of that
 *     account (membership predicate: a removed member's rows disappear)
 *   - another user / another account / anon → nothing, no error leak
 *   - `authenticated` has NO write path (INSERT/UPDATE/DELETE → denied), so
 *     `completed_at` can never be forged client-side
 *   - the owner/admin/member rows for the SAME (user, account) are independent:
 *     completing one track leaves the others untouched
 *   - the `track` CHECK rejects an unknown track
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
    "SKIP collaboration_onboarding_states RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const TABLE = "collaboration_onboarding_states";

describeDb("collaboration_onboarding_states RLS — 5.ONBOARD-4", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  let a: { userId: string; email: string; password: string };
  let b: { userId: string; email: string; password: string };
  let teamAccountId: string;
  let otherTeamId: string;

  async function mkUser(label: string) {
    const { userId, email, password } = await createTrackedUser(
      admin,
      fixtures,
      `collab-rls-${label}`,
    );
    return { userId, email, password };
  }

  async function sessionClient(email: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  async function mkTeam(ownerUserId: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name, owner_user_id: ownerUserId })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`mkTeam: ${error?.message ?? "no row"}`);
    fixtures.trackAccount(data.id);
    return data.id;
  }

  async function seed(userId: string, accountId: string, track: string) {
    const { error } = await admin
      .from(TABLE)
      .upsert(
        { user_id: userId, account_id: accountId, track },
        { onConflict: "user_id,account_id,track" },
      );
    if (error) throw new Error(`seed(${track}): ${error.message}`);
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    a = await mkUser("a");
    b = await mkUser("b");

    teamAccountId = await mkTeam(a.userId, "Collab RLS Team");
    otherTeamId = await mkTeam(b.userId, "Collab RLS Other Team");

    const { error: memErr } = await admin.from("account_memberships").insert([
      { account_id: teamAccountId, user_id: a.userId, role: "owner" },
      { account_id: teamAccountId, user_id: b.userId, role: "member" },
      { account_id: otherTeamId, user_id: b.userId, role: "owner" },
    ]);
    if (memErr) throw new Error(`seed memberships: ${memErr.message}`);

    // A has all three tracks in the same account — the isolation fixture.
    await seed(a.userId, teamAccountId, "team_owner");
    await seed(a.userId, teamAccountId, "team_admin");
    await seed(a.userId, teamAccountId, "team_member");
    await seed(b.userId, teamAccountId, "team_member");
    await seed(b.userId, otherTeamId, "team_owner");
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("a user reads their own rows in an account they belong to", async () => {
    const c = await sessionClient(a.email);
    const { data, error } = await c
      .from(TABLE)
      .select("user_id, track")
      .eq("account_id", teamAccountId);
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data!.every((r) => (r as { user_id: string }).user_id === a.userId)).toBe(
      true,
    );
    await c.auth.signOut();
  });

  it("a user cannot read a CO-MEMBER's rows in the shared account", async () => {
    // B is a genuine member of the same account — membership alone must not
    // expose another member's onboarding progress.
    const c = await sessionClient(a.email);
    const { data, error } = await c.from(TABLE).select("*").eq("user_id", b.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    await c.auth.signOut();
  });

  it("a user cannot read their own rows in an account they do NOT belong to", async () => {
    const c = await sessionClient(a.email);
    const { data, error } = await c.from(TABLE).select("*").eq("account_id", otherTeamId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    await c.auth.signOut();
  });

  it("anon gets nothing — denied at the GRANT layer (42501), before RLS", async () => {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await c.from(TABLE).select("*");
    // The migration's REVOKE means anon is denied by privilege rather than
    // filtered to zero rows by RLS — a strictly stronger posture.
    if (error) {
      expect(error.code).toBe("42501");
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it("authenticated INSERT is denied — completion cannot be forged", async () => {
    const c = await sessionClient(a.email);
    const { error } = await c.from(TABLE).insert({
      user_id: a.userId,
      account_id: teamAccountId,
      track: "team_owner",
      completed_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    await c.auth.signOut();
  });

  it("authenticated UPDATE of one's own row is denied — completed_at unreachable", async () => {
    const c = await sessionClient(a.email);
    const { data, error } = await c
      .from(TABLE)
      .update({ completed_at: new Date().toISOString(), minimized: true })
      .eq("user_id", a.userId)
      .eq("account_id", teamAccountId)
      .eq("track", "team_owner")
      .select("*");
    if (error === null) {
      expect(data).toHaveLength(0);
    } else {
      expect(error).not.toBeNull();
    }
    const { data: after } = await admin
      .from(TABLE)
      .select("completed_at, minimized")
      .eq("user_id", a.userId)
      .eq("account_id", teamAccountId)
      .eq("track", "team_owner")
      .single<{ completed_at: string | null; minimized: boolean }>();
    expect(after?.completed_at).toBeNull();
    expect(after?.minimized).toBe(false);
    await c.auth.signOut();
  });

  it("authenticated DELETE is denied", async () => {
    const c = await sessionClient(a.email);
    const { error } = await c
      .from(TABLE)
      .delete()
      .eq("user_id", a.userId)
      .eq("account_id", teamAccountId);
    if (error === null) {
      const { count } = await admin
        .from(TABLE)
        .select("*", { count: "exact", head: true })
        .eq("user_id", a.userId)
        .eq("account_id", teamAccountId);
      expect(count).toBe(3);
    } else {
      expect(error).not.toBeNull();
    }
    await c.auth.signOut();
  });

  it("PROGRESS IS ISOLATED PER TRACK — completing one leaves the others untouched", async () => {
    // The structural guarantee behind "do not store all role variants under one
    // ambiguous completion record": a demotion must not corrupt owner history.
    const { error } = await admin
      .from(TABLE)
      .update({ completed_at: new Date().toISOString() })
      .eq("user_id", a.userId)
      .eq("account_id", teamAccountId)
      .eq("track", "team_owner");
    expect(error).toBeNull();

    const { data } = await admin
      .from(TABLE)
      .select("track, completed_at")
      .eq("user_id", a.userId)
      .eq("account_id", teamAccountId);
    const byTrack = Object.fromEntries(
      (data ?? []).map((r) => [
        (r as { track: string }).track,
        (r as { completed_at: string | null }).completed_at,
      ]),
    );
    expect(byTrack.team_owner).not.toBeNull();
    expect(byTrack.team_admin).toBeNull();
    expect(byTrack.team_member).toBeNull();
  });

  it("rejects an unknown track at the CHECK constraint", async () => {
    const { error } = await admin.from(TABLE).insert({
      user_id: a.userId,
      account_id: teamAccountId,
      track: "team_superuser",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/track/i);
  });

  it("a REMOVED member no longer sees their rows in that account", async () => {
    const c = await sessionClient(b.email);
    const before = await c.from(TABLE).select("track").eq("account_id", teamAccountId);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(1);

    const { error: rmErr } = await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", teamAccountId)
      .eq("user_id", b.userId);
    expect(rmErr).toBeNull();

    const after = await c.from(TABLE).select("track").eq("account_id", teamAccountId);
    expect(after.error).toBeNull();
    expect(after.data).toHaveLength(0);

    // The row still EXISTS as history — it is only invisible to them.
    const { count } = await admin
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("user_id", b.userId)
      .eq("account_id", teamAccountId);
    expect(count).toBe(1);
    await c.auth.signOut();
  });
});
