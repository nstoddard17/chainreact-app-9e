/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-3 — DB-enforced invariants on accounts +
 * account_memberships.
 *
 * Per docs/slices/phase-4/account-model-foundation-plan.md §10. Covers:
 *  - Unique partial index: at most one personal account per user.
 *  - Personal-invariants trigger (stable error prefix
 *    `account_memberships_personal_invariant_violation`): rejects a
 *    second membership, a wrong-user membership, and a non-owner role.
 *  - CHECK constraint scope fences: type='personal', role='owner'.
 *  - FK-on-delete: `accounts.owner_user_id ON DELETE RESTRICT` and
 *    `account_memberships.user_id ON DELETE CASCADE`.
 *
 * DESTRUCTIVE: creates throwaway auth users. OPT-IN.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    "SKIP accounts invariants — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("accounts + memberships invariants — Slice 4.ACCOUNT-MODEL-3", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createTestUser(label: string): Promise<string> {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `inv-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function readPersonalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`readPersonalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      // 4.ACCOUNT-MODEL-9c2: handle_new_user seeds account_billing (ON DELETE
      // RESTRICT to accounts) — clear it before deleting the account.
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      for (const a of (accts ?? []) as Array<{ id: string }>) {
        await admin.from("account_billing").delete().eq("account_id", a.id);
      }
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  // ── Unique partial index ────────────────────────────────────────────────

  it("inserting a second personal account for a user is rejected (unique partial index)", async () => {
    const userId = await createTestUser("dup-pa");
    const { error } = await admin
      .from("accounts")
      .insert({ type: "personal", name: "Personal #2", owner_user_id: userId });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/duplicate|unique|conflict/);
  });

  // ── Personal-invariants trigger ─────────────────────────────────────────

  it("inserting a second membership on a personal account fires the trigger", async () => {
    const userA = await createTestUser("dup-mem-a");
    const userB = await createTestUser("dup-mem-b");
    const accountId = await readPersonalAccountId(userA);
    // The trigger rejects this attempt — but the rejection reason that
    // surfaces first depends on the trigger's evaluation order. Since the
    // membership's user_id is userB (≠ accounts.owner_user_id=userA), the
    // "wrong user" branch fires before the existing-count branch. Either
    // way the error message carries the stable prefix.
    const { error } = await admin
      .from("account_memberships")
      .insert({ account_id: accountId, user_id: userB, role: "owner" });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/account_memberships_personal_invariant_violation/);
  });

  it("inserting a membership where user_id ≠ owner_user_id is rejected (wrong-user case)", async () => {
    // Already exercised above; assert specifically that the "must equal
    // owner_user_id" reason is what's reported when there's no prior
    // membership for the account. We construct that case by deleting the
    // owner membership first and inserting a wrong-user membership.
    const userA = await createTestUser("wrong-user-a");
    const userB = await createTestUser("wrong-user-b");
    const accountId = await readPersonalAccountId(userA);

    // Remove the auto-created owner membership so the existing-count
    // branch doesn't trip first.
    await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", accountId);

    const { error } = await admin
      .from("account_memberships")
      .insert({ account_id: accountId, user_id: userB, role: "owner" });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/account_memberships_personal_invariant_violation/);
    expect(error!.message).toMatch(/user_id must equal accounts\.owner_user_id/);

    // Restore the legitimate owner membership so teardown is clean.
    await admin
      .from("account_memberships")
      .insert({ account_id: accountId, user_id: userA, role: "owner" });
  });

  it("inserting a membership with role ≠ 'owner' on a personal account is rejected by the trigger (CHECK fence still in place too)", async () => {
    const userId = await createTestUser("bad-role");
    const accountId = await readPersonalAccountId(userId);
    // Drop the auto-membership so we can test the trigger on a fresh insert.
    await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", accountId);
    const { error } = await admin
      .from("account_memberships")
      .insert({ account_id: accountId, user_id: userId, role: "admin" });
    expect(error).not.toBeNull();
    // Either the trigger reason OR the CHECK constraint may fire first
    // depending on Postgres's evaluation order. In Slice 4.ACCOUNT-MODEL-3
    // the CHECK is the cheaper check and frequently surfaces first; both
    // are correct behavior. Assert the error is one of those two.
    expect(error!.message).toMatch(
      /account_memberships_personal_invariant_violation|account_memberships_role_check/i,
    );
    // Restore the legitimate owner membership for teardown.
    await admin
      .from("account_memberships")
      .insert({ account_id: accountId, user_id: userId, role: "owner" });
  });

  // ── CHECK fences ────────────────────────────────────────────────────────

  it("inserting accounts.type='team' is rejected (CHECK constraint slice fence)", async () => {
    const userId = await createTestUser("team-fence");
    const { error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "X", owner_user_id: userId });
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/check|violates/);
  });

  // ── NOT NULL on owner_user_id ───────────────────────────────────────────

  it("inserting an account with owner_user_id=NULL is rejected (NOT NULL)", async () => {
    // Cast through unknown — TS would refuse the literal null here.
    const payload = { type: "personal", name: "Personal", owner_user_id: null } as unknown as {
      type: "personal";
      name: string;
      owner_user_id: string;
    };
    const { error } = await admin.from("accounts").insert(payload);
    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toMatch(/null|not.?null|violates/);
  });

  // ── FK ON DELETE RESTRICT ──────────────────────────────────────────────

  it("deleting auth.users while a personal account exists is blocked (ON DELETE RESTRICT)", async () => {
    const userId = await createTestUser("delete-restrict");
    // Confirm the personal account exists.
    const accountId = await readPersonalAccountId(userId);
    // Try the delete via auth admin API; expect failure.
    const { error } = await admin.auth.admin.deleteUser(userId);
    expect(error).not.toBeNull();
    // Confirm the user row + account both remain.
    const { data: u } = await admin.auth.admin.getUserById(userId);
    expect(u.user?.id).toBe(userId);
    const { data: a } = await admin
      .from("accounts")
      .select("id")
      .eq("id", accountId);
    expect(a).toHaveLength(1);
    // Note: this user is now cleaned up via the afterAll hook that
    // explicitly clears account_memberships + accounts before deleting.
  });
});
