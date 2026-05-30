/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-3 — RLS smoke for `account_memberships`.
 *
 * Per the slice plan at docs/slices/phase-4/account-model-foundation-plan.md §10:
 * a user sees only their own membership row at this slice (Phase D will
 * broaden to "same-account membership EXISTS").
 *
 * DESTRUCTIVE: creates and deletes throwaway auth users. OPT-IN via
 * ALLOW_DB_INTEGRATION_TESTS=true + NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP account_memberships RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_memberships RLS — Slice 4.ACCOUNT-MODEL-3", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
  }> = [];

  async function createTestUser(label: string): Promise<{
    userId: string;
    email: string;
    password: string;
  }> {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `am-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email, password };
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

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    sessions.push({ ...a, accountId: await readPersonalAccountId(a.userId) });
    sessions.push({ ...b, accountId: await readPersonalAccountId(b.userId) });
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

  it("SELECT: user A sees their own membership row", async () => {
    const a = sessions[0]!;
    const supa = await sessionClient(a.email, a.password);
    const { data, error } = await supa
      .from("account_memberships")
      .select("account_id, user_id, role")
      .eq("user_id", a.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.account_id).toBe(a.accountId);
    expect(data![0]!.role).toBe("owner");
  });

  it("SELECT: user A does NOT see user B's membership row", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supa = await sessionClient(a.email, a.password);
    const { data, error } = await supa
      .from("account_memberships")
      .select("account_id, user_id")
      .eq("user_id", b.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("SELECT: anon client sees nothing", async () => {
    const a = sessions[0]!;
    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon
      .from("account_memberships")
      .select("user_id")
      .eq("user_id", a.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
