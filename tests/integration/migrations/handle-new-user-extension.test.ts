/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-3 — handle_new_user signup-trigger extension.
 *
 * Per docs/slices/phase-4/account-model-foundation-plan.md §7+§10:
 *   Creating a new user via supabase.auth.admin.createUser produces exactly
 *   one personal account + one owner membership atomically, and the
 *   pre-existing user_profiles + user_billing rows are still created
 *   (regression check that the trigger extension didn't break the prior
 *   inserts).
 *
 * DESTRUCTIVE: creates a throwaway auth user. OPT-IN.
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
    "SKIP handle_new_user extension — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("handle_new_user extension — Slice 4.ACCOUNT-MODEL-3", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("supabase.auth.admin.createUser produces one personal account + one owner membership atomically", async () => {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `signup-trigger-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    expect(created.user?.id).toBeTruthy();
    const userId = created.user!.id;
    createdUserIds.push(userId);

    const { data: accounts, error: aErr } = await admin
      .from("accounts")
      .select("id, type, name, owner_user_id")
      .eq("owner_user_id", userId);
    expect(aErr).toBeNull();
    expect(accounts).toHaveLength(1);
    expect(accounts![0]!.type).toBe("personal");
    expect(accounts![0]!.name).toBe("Personal");

    const { data: memberships, error: mErr } = await admin
      .from("account_memberships")
      .select("account_id, user_id, role")
      .eq("user_id", userId);
    expect(mErr).toBeNull();
    expect(memberships).toHaveLength(1);
    expect(memberships![0]!.account_id).toBe(accounts![0]!.id);
    expect(memberships![0]!.role).toBe("owner");
  });

  it("pre-existing user_profiles + user_billing rows are still created (non-regression)", async () => {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `signup-trigger-existing-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    const userId = created.user!.id;
    createdUserIds.push(userId);

    const { data: profile, error: pErr } = await admin
      .from("user_profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle<{ id: string }>();
    expect(pErr).toBeNull();
    expect(profile?.id).toBe(userId);

    const { data: billing, error: bErr } = await admin
      .from("user_billing")
      .select("user_id, tasks_limit, tasks_used")
      .eq("user_id", userId)
      .maybeSingle<{ user_id: string; tasks_limit: number; tasks_used: number }>();
    expect(bErr).toBeNull();
    expect(billing?.user_id).toBe(userId);
    expect(billing?.tasks_used).toBe(0);
  });
});
