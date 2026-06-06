/**
 * @jest-environment node
 *
 * Slice 4.API-KEYS-AUDIT-2 — gated DB proof that API-key create/revoke audit
 * notifications PERSIST once the `notification_type` enum migration
 * (20260610000000) is applied. Before the migration the insert fails on the unknown
 * enum value and is swallowed (no row); after it, a real notification row exists.
 *
 * Exercises the REAL management service (createApiKey / revokeApiKey) → the audit
 * helper → notificationsRepo.create against the dev DB, then reads back via the
 * service-role admin client and asserts the row is present and carries NO secret.
 *
 * DESTRUCTIVE: creates a throwaway auth user + account + key + notifications.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createApiKey, revokeApiKey } from "@/services/apiKeys/management";

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
    "SKIP api-key audit notifications — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).",
  );
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  metadata: Record<string, unknown>;
}

describeDb("API-key audit notifications persist — AUDIT-2", () => {
  let admin: SupabaseClient;
  let userId = "";
  let accountId = "";
  let keyId = "";
  let keyPrefix = "";
  let rawKey = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `api-key-audit-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    userId = data.user.id;
    const { data: acct, error: acctErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (acctErr || !acct) throw new Error(`personalAccount: ${acctErr?.message ?? "no row"}`);
    accountId = acct.id;
  });

  afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("notifications").delete().eq("user_id", userId);
    await admin.from("account_billing").delete().eq("account_id", accountId);
    await admin.from("account_memberships").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("owner_user_id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`cleanup: failed to delete user ${userId}: ${error.message}`);
  });

  it("createApiKey persists an api_key_created notice with safe fields only", async () => {
    const res = await createApiKey({
      accountId,
      createdByUserId: userId,
      name: "AUDIT-2 probe",
      scopes: ["workflows:trigger"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    keyId = res.key.id;
    keyPrefix = res.key.prefix;
    rawKey = res.rawKey;

    const { data, error } = await admin
      .from("notifications")
      .select("id, type, title, metadata")
      .eq("user_id", userId)
      .eq("type", "api_key_created");
    expect(error).toBeNull();
    const rows = (data ?? []) as NotificationRow[];
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.title).toContain("AUDIT-2 probe");
    expect(row.metadata.prefix).toBe(keyPrefix);
    expect(row.metadata.keyId).toBe(keyId);
    // No-leak: the persisted row carries no raw key / hash.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(rawKey);
    expect(serialized).not.toMatch(/key_?hash/i);
  });

  it("revokeApiKey persists an api_key_revoked notice on first transition", async () => {
    const r = await revokeApiKey({ accountId, keyId, actorUserId: userId });
    expect(r).toEqual({ ok: true, alreadyRevoked: false });

    const { data, error } = await admin
      .from("notifications")
      .select("id, type, title, metadata")
      .eq("user_id", userId)
      .eq("type", "api_key_revoked");
    expect(error).toBeNull();
    const rows = (data ?? []) as NotificationRow[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.metadata.prefix).toBe(keyPrefix);
    expect(JSON.stringify(rows[0])).not.toMatch(/key_?hash/i);
  });
});
