/**
 * @jest-environment node
 *
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A — the atomicity contract, proved
 * against REAL Postgres.
 *
 * DESTRUCTIVE: creates + deletes throwaway `@chainreact.test` auth users.
 * OPT-IN, triple-guarded.
 *
 * A mock cannot prove a transaction. These tests call the real
 * `schedule_account_deletion` RPC and assert the properties only the database can
 * actually provide:
 *
 *   - eligibility refusal (owned Team/Business) rolls the challenge consumption
 *     back — the code is still usable afterwards;
 *   - a failing durable write (forced by a constraint violation inside the
 *     transaction) rolls the consumption back too;
 *   - two CONCURRENT final submissions produce exactly ONE transition, ONE audit
 *     row, and ONE consumption;
 *   - a successful call consumes exactly once and a replay finds nothing;
 *   - the account is never left scheduled while the challenge is still reusable;
 *   - the challenge is never left consumed while no transition exists.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/accounts/deletionAuthorizationAtomicity.dev.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
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
const RUN = ALLOW && !!URL && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP deletion-authorization atomicity — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE).",
  );
}

const CHALLENGES = "sensitive_action_challenges";
const SESSION_BINDING = "atomicity-session-digest";
const EMAIL_BINDING = "atomicity-email-digest";

describeDb("schedule_account_deletion — transactional atomicity (dev DB)", () => {
  jest.setTimeout(180_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  function iso(offsetMs: number): string {
    return new Date(Date.now() + offsetMs).toISOString();
  }

  /** A fresh user whose personal account is active, plus a verified challenge. */
  async function seedUserWithVerifiedChallenge(prefix: string): Promise<{
    userId: string;
    accountId: string;
    challengeId: string;
  }> {
    const user = await createTrackedUser(admin, fixtures, prefix);
    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", user.userId)
      .eq("type", "personal")
      .single();
    if (accountError || !account) {
      throw new Error(`personal account not found: ${accountError?.message}`);
    }

    const challengeId = randomUUID();
    const { error } = await admin.from(CHALLENGES).insert({
      id: challengeId,
      user_id: user.userId,
      purpose: "delete_account",
      session_binding: SESSION_BINDING,
      email_binding: EMAIL_BINDING,
      code_verifier: "verifier-digest",
      expires_at: iso(10 * 60_000),
      verified_at: new Date().toISOString(),
      verification_expires_at: iso(5 * 60_000),
    });
    if (error) throw new Error(`seed challenge failed: ${error.message}`);

    return { userId: user.userId, accountId: (account as { id: string }).id, challengeId };
  }

  function callRpc(input: {
    accountId: string;
    userId: string;
    challengeId: string | null;
    requestedAt?: string;
    sessionBinding?: string;
    emailBinding?: string;
  }) {
    return admin
      .rpc("schedule_account_deletion", {
        p_account_id: input.accountId,
        p_requested_by_user_id: input.userId,
        p_requested_at: input.requestedAt ?? new Date().toISOString(),
        p_purge_after: iso(30 * 24 * 60 * 60_000),
        p_challenge_id: input.challengeId,
        p_challenge_user_id: input.challengeId ? input.userId : null,
        p_challenge_purpose: input.challengeId ? "delete_account" : null,
        p_challenge_session_binding: input.challengeId
          ? (input.sessionBinding ?? SESSION_BINDING)
          : null,
        p_challenge_email_binding: input.challengeId
          ? (input.emailBinding ?? EMAIL_BINDING)
          : null,
      } satisfies RpcArgs<"schedule_account_deletion">)
      .single<{
        out_outcome: string;
        out_account_id: string | null;
        out_deletion_status: string | null;
        out_purge_after: string | null;
      }>();
  }

  async function challengeRow(challengeId: string) {
    const { data } = await admin
      .from(CHALLENGES)
      .select("consumed_at, invalidated_at, verified_at")
      .eq("id", challengeId)
      .maybeSingle<{ consumed_at: string | null }>();
    return data;
  }

  async function accountRow(accountId: string) {
    const { data } = await admin
      .from("accounts")
      .select("deletion_status, deletion_requested_at, purge_after")
      .eq("id", accountId)
      .maybeSingle<{ deletion_status: string }>();
    return data;
  }

  async function auditRowCount(accountId: string): Promise<number> {
    const { count } = await admin
      .from("account_deletions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);
    return count ?? 0;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    // Deletion audit rows have no FK, so they outlive the account by design —
    // clear this suite's own rows before the shared teardown.
    for (const accountId of fixtures.accountIds) {
      await admin.from("account_deletions").delete().eq("account_id", accountId);
    }
    const { data: owned } = await admin
      .from("accounts")
      .select("id")
      .in("owner_user_id", [...fixtures.userIds]);
    for (const a of owned ?? []) {
      await admin.from("account_deletions").delete().eq("account_id", (a as { id: string }).id);
    }
    await cleanupFixtures(admin, fixtures);
  });

  it("HAPPY PATH: consumes exactly once, freezes, and writes exactly one audit row", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-ok");

    const { data, error } = await callRpc({ accountId, userId, challengeId });
    expect(error).toBeNull();
    expect(data!.out_outcome).toBe("scheduled");

    expect((await challengeRow(challengeId))!.consumed_at).not.toBeNull();
    expect((await accountRow(accountId))!.deletion_status).toBe("pending_deletion");
    expect(await auditRowCount(accountId)).toBe(1);
  });

  it("REPLAY: a second call with the spent challenge schedules nothing more", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-replay");
    await callRpc({ accountId, userId, challengeId });

    const { data } = await callRpc({ accountId, userId, challengeId });
    // The account is already pending, so the RPC short-circuits before the
    // consume — either way, no second transition and no second audit row.
    expect(data!.out_outcome).toBe("already_pending");
    expect(await auditRowCount(accountId)).toBe(1);
  });

  it("CONCURRENCY: two simultaneous submissions produce ONE transition and ONE audit row", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-race");

    const [a, b] = await Promise.all([
      callRpc({ accountId, userId, challengeId }),
      callRpc({ accountId, userId, challengeId }),
    ]);

    const outcomes = [a.data!.out_outcome, b.data!.out_outcome].sort();
    // The FOR UPDATE lock serializes them: exactly one schedules, the other sees
    // the committed state.
    expect(outcomes).toEqual(["already_pending", "scheduled"]);
    expect(await auditRowCount(accountId)).toBe(1);
    expect((await accountRow(accountId))!.deletion_status).toBe("pending_deletion");
    expect((await challengeRow(challengeId))!.consumed_at).not.toBeNull();
  });

  it("ELIGIBILITY REFUSAL rolls the consumption back — the code stays usable", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-owned");

    // Give the user a Team they own: the in-transaction guard must now refuse.
    const { data: team, error: teamError } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Atomicity Guard Team", owner_user_id: userId })
      .select("id")
      .single();
    expect(teamError).toBeNull();
    const teamId = (team as { id: string }).id;
    fixtures.trackAccount(teamId);
    await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: userId, role: "owner" });

    const { data } = await callRpc({ accountId, userId, challengeId });
    expect(data!.out_outcome).toBe("owned_accounts_block");

    // THE POINT OF 1A: the refusal did not burn the user's code.
    expect((await challengeRow(challengeId))!.consumed_at).toBeNull();
    expect((await accountRow(accountId))!.deletion_status).toBe("active");
    expect(await auditRowCount(accountId)).toBe(0);

    // ...and once the blocker is resolved, the SAME code still works.
    await admin.from("account_memberships").delete().eq("account_id", teamId);
    await admin.from("account_billing").delete().eq("account_id", teamId);
    await admin.from("accounts").delete().eq("id", teamId);

    const { data: retry } = await callRpc({ accountId, userId, challengeId });
    expect(retry!.out_outcome).toBe("scheduled");
    expect((await challengeRow(challengeId))!.consumed_at).not.toBeNull();
  });

  it("DURABLE-WRITE FAILURE rolls the consumption back (nothing half-applied)", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-rollback");

    // Force the transition to fail INSIDE the transaction, after the consume:
    // `account_deletions.purge_after` is NOT NULL, so a null purge date aborts the
    // INSERT — which must take the already-executed consume down with it.
    const { error } = await admin.rpc("schedule_account_deletion", {
      p_account_id: accountId,
      p_requested_by_user_id: userId,
      p_requested_at: new Date().toISOString(),
      p_purge_after: null,
      p_challenge_id: challengeId,
      p_challenge_user_id: userId,
      p_challenge_purpose: "delete_account",
      p_challenge_session_binding: SESSION_BINDING,
      p_challenge_email_binding: EMAIL_BINDING,
    } satisfies RpcArgs<"schedule_account_deletion">);
    expect(error).not.toBeNull();

    // Challenge NOT consumed, account NOT scheduled, no audit row: one outcome.
    expect((await challengeRow(challengeId))!.consumed_at).toBeNull();
    expect((await accountRow(accountId))!.deletion_status).toBe("active");
    expect(await auditRowCount(accountId)).toBe(0);
  });

  it("BINDING MISMATCH consumes nothing and schedules nothing", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-binding");

    const { data } = await callRpc({
      accountId,
      userId,
      challengeId,
      sessionBinding: "a-different-session-digest",
    });
    expect(data!.out_outcome).toBe("no_authorization");

    expect((await challengeRow(challengeId))!.consumed_at).toBeNull();
    expect((await accountRow(accountId))!.deletion_status).toBe("active");
    expect(await auditRowCount(accountId)).toBe(0);
  });

  it("UNVERIFIED / EXPIRED authorizations are refused without any write", async () => {
    const { userId, accountId, challengeId } = await seedUserWithVerifiedChallenge("atomic-unverified");
    await admin
      .from(CHALLENGES)
      .update({ verified_at: null, verification_expires_at: null })
      .eq("id", challengeId);

    const { data } = await callRpc({ accountId, userId, challengeId });
    expect(data!.out_outcome).toBe("no_authorization");
    expect((await accountRow(accountId))!.deletion_status).toBe("active");

    // ...and an expired verification window behaves identically.
    await admin
      .from(CHALLENGES)
      .update({
        verified_at: iso(-10 * 60_000),
        verification_expires_at: iso(-5 * 60_000),
      })
      .eq("id", challengeId);
    const { data: expired } = await callRpc({ accountId, userId, challengeId });
    expect(expired!.out_outcome).toBe("no_authorization");
    expect((await challengeRow(challengeId))!.consumed_at).toBeNull();
    expect(await auditRowCount(accountId)).toBe(0);
  });

  it("NEVER leaves the pairing broken in either direction", async () => {
    // Sweep the suite's own fixtures: for every account, `scheduled` implies an
    // audit row, and a consumed challenge implies a scheduled account.
    const userIds = [...fixtures.userIds];
    const { data: accounts } = await admin
      .from("accounts")
      .select("id, owner_user_id, deletion_status")
      .in("owner_user_id", userIds)
      .eq("type", "personal");

    for (const a of (accounts ?? []) as Array<{
      id: string;
      owner_user_id: string;
      deletion_status: string;
    }>) {
      const audits = await auditRowCount(a.id);
      const { data: consumed } = await admin
        .from(CHALLENGES)
        .select("id")
        .eq("user_id", a.owner_user_id)
        .not("consumed_at", "is", null);
      const consumedCount = (consumed ?? []).length;

      if (a.deletion_status === "pending_deletion") {
        expect(audits).toBe(1);
      } else {
        // Not scheduled ⇒ nothing may have been permanently consumed for it.
        expect(audits).toBe(0);
        expect(consumedCount).toBe(0);
      }
    }
  });

  it("is service-role only — an ANON caller cannot execute it", async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) return;
    const anon = createClient(URL!, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anon.rpc("schedule_account_deletion", {
      p_account_id: randomUUID(),
      p_requested_by_user_id: randomUUID(),
      p_requested_at: new Date().toISOString(),
      p_purge_after: iso(1000),
      p_challenge_id: null,
      p_challenge_user_id: null,
      p_challenge_purpose: null,
      p_challenge_session_binding: null,
      p_challenge_email_binding: null,
    } satisfies RpcArgs<"schedule_account_deletion">);
    expect(error).not.toBeNull();
  });
});
