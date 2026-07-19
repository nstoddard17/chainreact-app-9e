/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-11a — active_account_id column, live DB.
 * DESTRUCTIVE: creates + tears down throwaway auth users + their account graph.
 * OPT-IN, triple-guarded.
 *
 * Proves:
 *   - user_profiles.active_account_id exists, defaults NULL on signup, and accepts
 *     a uuid the row can be updated to.
 *   - The FK is ON DELETE SET NULL: deleting the referenced account nulls the
 *     pointer (self-heal → personal fallback) instead of dangling or blocking.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/migrations/user-profiles-active-account-id.dev.test.ts
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
const RUN = ALLOW && !!URL && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP 4.ACCOUNT-MODEL-11a active_account_id — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE).",
  );
}

describeDb("4.ACCOUNT-MODEL-11a — user_profiles.active_account_id (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  async function createUser(): Promise<string> {
    const { userId } = await createTrackedUser(admin, fixtures, "active-account-id");
    return userId;
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

  async function readActiveAccountId(userId: string): Promise<string | null> {
    const { data, error } = await admin
      .from("user_profiles")
      .select("active_account_id")
      .eq("id", userId)
      .single<{ active_account_id: string | null }>();
    if (error) throw new Error(`readActiveAccountId: ${error.message}`);
    return data?.active_account_id ?? null;
  }

  async function deleteAccount(accountId: string): Promise<void> {
    // account_billing has a RESTRICT FK → delete it first; memberships CASCADE.
    await admin.from("account_billing").delete().eq("account_id", accountId);
    const { error } = await admin.from("accounts").delete().eq("id", accountId);
    if (error) throw new Error(`deleteAccount: ${error.message}`);
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("exists, defaults NULL at signup, and accepts a uuid", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);

    // Fresh signup → no active account chosen yet.
    expect(await readActiveAccountId(userId)).toBeNull();

    // The column accepts an account id (self-pointer here; membership is a service
    // concern, not enforced by this FK).
    const { error } = await admin
      .from("user_profiles")
      .update({ active_account_id: accountId })
      .eq("id", userId);
    expect(error).toBeNull();
    expect(await readActiveAccountId(userId)).toBe(accountId);
  });

  it("ON DELETE SET NULL nulls the pointer when the referenced account is deleted", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);

    await admin
      .from("user_profiles")
      .update({ active_account_id: accountId })
      .eq("id", userId);
    expect(await readActiveAccountId(userId)).toBe(accountId);

    // Delete the referenced account → the FK SET NULL fires.
    await deleteAccount(accountId);

    expect(await readActiveAccountId(userId)).toBeNull();
  });
});
