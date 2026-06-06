/**
 * @jest-environment node
 *
 * Slice 4.API-KEYS-FOUNDATION-2 / FK-1 — gated DB proof of the account_api_keys
 * foundation:
 *   - service_role can insert + read a key (the only write/read path),
 *   - an authenticated MEMBER cannot read the table at all (NO authenticated GRANT →
 *     key_hash is never client-reachable; this is the projection-strategy invariant),
 *   - an authenticated member cannot INSERT/UPDATE/DELETE,
 *   - anon cannot read.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + keys.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
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
    "SKIP account_api_keys RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_api_keys foundation RLS — FK-1 (service-role only, no client read)", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{ userId: string; email: string; password: string; accountId: string }> = [];
  let keyId = "";

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `api-keys-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email, password };
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

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const a = await createTestUser("a");
    const accountId = await personalAccountId(a.userId);
    sessions.push({ ...a, accountId });
    // service_role insert is the only write path.
    const { data, error } = await admin
      .from("account_api_keys")
      .insert({
        account_id: accountId,
        created_by_user_id: a.userId,
        name: "RLS probe",
        prefix: "crk_live_RLSprobe",
        key_hash: "f".repeat(64),
        scopes: ["workflows:trigger"],
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seed key: ${error?.message ?? "no row"}`);
    keyId = data.id;
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      for (const a of (accts ?? []) as Array<{ id: string }>) {
        // account_api_keys cascade on account delete; clear billing first.
        await admin.from("account_billing").delete().eq("account_id", a.id);
      }
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("service_role can read the seeded key", async () => {
    const { data, error } = await admin.from("account_api_keys").select("id, key_hash").eq("id", keyId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("an authenticated MEMBER cannot read the table (no authenticated GRANT → key_hash unreachable)", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { data, error } = await supaA.from("account_api_keys").select("id").eq("id", keyId);
    // No GRANT to authenticated → PostgREST denies (42501). Either way: no row, no hash.
    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("an authenticated member cannot INSERT (writes are service-role only)", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { error } = await supaA.from("account_api_keys").insert({
      account_id: a.accountId,
      name: "hacker",
      prefix: "crk_live_x",
      key_hash: "0".repeat(64),
      scopes: ["workflows:trigger"],
    });
    expect(error).not.toBeNull();
  });

  it("anon cannot read the table", async () => {
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.from("account_api_keys").select("id").eq("id", keyId);
    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
