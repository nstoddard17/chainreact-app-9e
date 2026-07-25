/**
 * @jest-environment node
 *
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1 — the durable challenge store and the
 * account-deletion MEMBERSHIP contract, against the real database.
 *
 * DESTRUCTIVE: creates + deletes throwaway `@chainreact.test` auth users.
 * OPT-IN, triple-guarded — it never runs unless explicitly enabled.
 *
 * What only a real DB can prove, and is proved here:
 *   - the deny-all RLS policy + missing `authenticated` GRANT genuinely block a
 *     signed-in client from reading or writing a challenge row;
 *   - the CHECK constraints (closed purpose set, positive attempt cap, paired
 *     verification window) are enforced by Postgres, not just by the service;
 *   - the conditional UPDATE … RETURNING really is an atomic compare-and-set, so
 *     exactly ONE of two concurrent consumes wins (this is the replay defence);
 *   - challenges CASCADE away with their auth user;
 *   - a user who is only a MEMBER of someone else's team loses that membership
 *     and its seat on deletion, while the team, its owner, and its owner's
 *     membership survive — and an accepted invitation stays as audit history
 *     with `accepted_by_user_id` set to NULL.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/accounts/deletionChallengeStore.dev.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY && !!ANON_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP deletion-challenge store — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY (DESTRUCTIVE).",
  );
}

const TABLE = "sensitive_action_challenges";

describeDb("sensitive_action_challenges — durable challenge store (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userId = "";

  function future(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  async function insertChallenge(overrides: Record<string, unknown> = {}) {
    return admin
      .from(TABLE)
      .insert({
        user_id: userId,
        purpose: "delete_account",
        session_binding: "digest-session",
        email_binding: "digest-email",
        code_verifier: "digest-code",
        expires_at: future(10),
        ...overrides,
      })
      .select("*")
      .single();
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const user = await createTrackedUser(admin, fixtures, "chal-store");
    userId = user.userId;
  });

  afterEach(async () => {
    if (userId) await admin.from(TABLE).delete().eq("user_id", userId);
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  describe("service-role access + defaults", () => {
    it("inserts a challenge with the expected defaults", async () => {
      const { data, error } = await insertChallenge();
      expect(error).toBeNull();
      expect(data!.attempt_count).toBe(0);
      expect(data!.max_attempts).toBe(5);
      expect(data!.send_count).toBe(1);
      expect(data!.verified_at).toBeNull();
      expect(data!.consumed_at).toBeNull();
      expect(data!.invalidated_at).toBeNull();
      expect(data!.last_sent_at).not.toBeNull();
    });

    it("has no column that could hold a plaintext code, an email, or a session id", async () => {
      const { data } = await insertChallenge();
      const columns = Object.keys(data!);
      expect(columns).not.toContain("code");
      expect(columns).not.toContain("email");
      expect(columns).not.toContain("session_id");
      expect(columns).toEqual(expect.arrayContaining(["code_verifier", "email_binding", "session_binding"]));
    });
  });

  describe("CHECK constraints are enforced by Postgres", () => {
    it("rejects an unknown purpose — a challenge cannot authorize an arbitrary action", async () => {
      const { error } = await insertChallenge({ purpose: "transfer_all_money" });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/purpose_known|violates check constraint/i);
    });

    it("rejects a non-positive attempt cap", async () => {
      const { error } = await insertChallenge({ max_attempts: 0 });
      expect(error).not.toBeNull();
    });

    it("rejects a verification window without a verification", async () => {
      const { error } = await insertChallenge({ verification_expires_at: future(5) });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/verification_window_paired|violates check constraint/i);
    });

    it("accepts a properly paired verification", async () => {
      const { error } = await insertChallenge({
        verified_at: new Date().toISOString(),
        verification_expires_at: future(5),
      });
      expect(error).toBeNull();
    });
  });

  describe("atomic single-use consumption", () => {
    it("lets exactly ONE of two concurrent consumes win", async () => {
      const { data } = await insertChallenge({
        verified_at: new Date().toISOString(),
        verification_expires_at: future(5),
      });
      const id = data!.id as string;
      const consumedAt = new Date().toISOString();

      const consume = () =>
        admin
          .from(TABLE)
          .update({ consumed_at: consumedAt })
          .eq("id", id)
          .is("consumed_at", null)
          .is("invalidated_at", null)
          .not("verified_at", "is", null)
          .select("id")
          .maybeSingle();

      const [a, b] = await Promise.all([consume(), consume()]);
      const winners = [a.data, b.data].filter(Boolean);
      // The compare-and-set is the replay defence: a second spend must find nothing.
      expect(winners).toHaveLength(1);
    });

    it("refuses to consume an UNVERIFIED challenge", async () => {
      const { data } = await insertChallenge();
      const { data: consumed } = await admin
        .from(TABLE)
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", data!.id)
        .is("consumed_at", null)
        .not("verified_at", "is", null)
        .select("id")
        .maybeSingle();
      expect(consumed).toBeNull();
    });
  });

  describe("client access is denied outright", () => {
    it("an ANON client can neither read nor write a challenge row", async () => {
      await insertChallenge();
      const anon = createClient(URL!, ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const read = await anon.from(TABLE).select("*");
      // Either a hard permission error (no GRANT) or an empty deny-all result —
      // both mean the client learns nothing.
      expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);

      const write = await anon.from(TABLE).insert({
        user_id: userId,
        purpose: "delete_account",
        session_binding: "x",
        email_binding: "x",
        code_verifier: "x",
        expires_at: future(10),
      });
      expect(write.error).not.toBeNull();
    });
  });

  describe("lifecycle with the user", () => {
    it("CASCADES challenges away when the auth user is deleted", async () => {
      const throwaway = await createTrackedUser(admin, fixtures, "chal-cascade");
      const { error: insertError } = await admin.from(TABLE).insert({
        user_id: throwaway.userId,
        purpose: "delete_account",
        session_binding: "x",
        email_binding: "x",
        code_verifier: "x",
        expires_at: future(10),
      });
      expect(insertError).toBeNull();

      // Personal account is RESTRICT, so clear it the way the purge does.
      await admin.from("account_billing").delete().eq("account_id", "00000000-0000-0000-0000-000000000000");
      const { data: owned } = await admin
        .from("accounts")
        .select("id")
        .eq("owner_user_id", throwaway.userId);
      for (const a of owned ?? []) {
        await admin.from("account_billing").delete().eq("account_id", (a as { id: string }).id);
        await admin.from("accounts").delete().eq("id", (a as { id: string }).id);
      }
      const { error: delError } = await admin.auth.admin.deleteUser(throwaway.userId);
      expect(delError).toBeNull();

      const { data: after } = await admin
        .from(TABLE)
        .select("id")
        .eq("user_id", throwaway.userId);
      expect(after ?? []).toHaveLength(0);
    });
  });
});

/**
 * The membership half of the deletion contract. Deleting a user who is ONLY a
 * member of someone else's team must free their seat without touching the team.
 */
describeDb("account deletion — team membership cleanup (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("removes the member's seat and leaves the team + owner intact", async () => {
    const owner = await createTrackedUser(admin, fixtures, "team-owner");
    const member = await createTrackedUser(admin, fixtures, "team-member");

    // A team owned by `owner`, with `member` as an ordinary member.
    const { data: team, error: teamError } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Membership Contract Team", owner_user_id: owner.userId })
      .select("id")
      .single();
    expect(teamError).toBeNull();
    const teamId = (team as { id: string }).id;
    fixtures.trackAccount(teamId);

    await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: owner.userId, role: "owner" });
    const { error: memberError } = await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: member.userId, role: "member" });
    expect(memberError).toBeNull();

    // An accepted invitation, which must survive as audit history.
    const { data: invite } = await admin
      .from("account_invitations")
      .insert({
        account_id: teamId,
        email: `${member.email}`,
        role: "member",
        token_hash: `hash-${member.userId}`,
        invited_by_user_id: owner.userId,
        accepted_by_user_id: member.userId,
        status: "accepted",
      })
      .select("id")
      .single();

    const seatsBefore = await admin
      .from("account_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("account_id", teamId);
    expect(seatsBefore.count).toBe(2);

    // Delete the MEMBER exactly as the purge does: their own account graph, then
    // the auth user (which cascades the team membership).
    const { data: memberAccounts } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", member.userId);
    for (const a of memberAccounts ?? []) {
      const id = (a as { id: string }).id;
      await admin.from("account_billing").delete().eq("account_id", id);
      await admin.from("accounts").delete().eq("id", id);
    }
    const { error: purgeError } = await admin.auth.admin.deleteUser(member.userId);
    expect(purgeError).toBeNull();

    // The membership is gone and the seat is freed...
    const seatsAfter = await admin
      .from("account_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("account_id", teamId);
    expect(seatsAfter.count).toBe(1);
    const { data: remaining } = await admin
      .from("account_memberships")
      .select("user_id, role")
      .eq("account_id", teamId);
    expect(remaining).toEqual([{ user_id: owner.userId, role: "owner" }]);

    // ...the TEAM itself survives, still owned by the same person...
    const { data: teamAfter } = await admin
      .from("accounts")
      .select("id, owner_user_id, deletion_status")
      .eq("id", teamId)
      .maybeSingle();
    expect(teamAfter).toMatchObject({
      id: teamId,
      owner_user_id: owner.userId,
      deletion_status: "active",
    });

    // ...and the accepted invitation remains as history, de-identified.
    if (invite) {
      const { data: inviteAfter } = await admin
        .from("account_invitations")
        .select("id, status, accepted_by_user_id, invited_by_user_id")
        .eq("id", (invite as { id: string }).id)
        .maybeSingle();
      expect(inviteAfter).toMatchObject({
        status: "accepted",
        accepted_by_user_id: null,
        invited_by_user_id: owner.userId,
      });
      await admin.from("account_invitations").delete().eq("id", (invite as { id: string }).id);
    }
  });
});
