/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-9b — account_billing RLS.
 *
 * account_billing is read-gated by account membership (the canonical
 * membership-join predicate); writes are service-role / RPC only (no
 * user-facing write policy). Proves:
 *   - member A reads their account's billing row;
 *   - non-member B does not; anon does not;
 *   - service-role bypasses RLS and reads both;
 *   - a member cannot UPDATE their own counters (no write policy → 0 rows).
 *
 * DESTRUCTIVE: creates throwaway auth users. OPT-IN.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import { requireTables } from "@/tests/helpers/dbPreflight";

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
    "SKIP account_billing RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_billing RLS — Slice 4.ACCOUNT-MODEL-9b", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  const sessions: Array<{ userId: string; email: string; password: string; accountId: string }> = [];

  async function createTestUser(label: string) {
    return createTrackedUser(admin, fixtures, `acct-billing-rls-${label}`);
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

  async function sessionClient(email: string, _password: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["account_billing"]);
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    // 4.ACCOUNT-MODEL-9c2: handle_new_user seeds account_billing on signup, so
    // each personal account already has its billing row to read.
    sessions.push({ ...a, accountId: aAccount });
    sessions.push({ ...b, accountId: bAccount });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("member A reads their account_billing row; non-member B does not; anon does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("account_billing")
      .select("account_id")
      .eq("account_id", a.accountId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB.from("account_billing").select("account_id").eq("account_id", a.accountId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonOnA, error: anonErr } = await anon
      .from("account_billing")
      .select("account_id")
      .eq("account_id", a.accountId);
    // anon has NO grant on account_billing, so PostgREST denies with 42501 and
    // `data` is null rather than an empty array — a STRONGER outcome than the
    // original `toHaveLength(0)` expected. Assert the property (anon obtains no
    // billing row) while accepting either shape.
    if (anonErr) {
      expect(anonErr.code).toBe("42501");
    }
    expect(anonOnA ?? []).toHaveLength(0);
  });

  it("a member cannot UPDATE their own counters (no write policy → 0 rows affected)", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { data, error } = await supaA
      .from("account_billing")
      .update({ tasks_used: 0, tasks_limit: 999999 })
      .eq("account_id", a.accountId)
      .select("account_id");
    // Two valid denial shapes, same invariant (member mutates nothing):
    //   - clean replayed schema (explicit grants only): UPDATE has no grant at
    //     all → PostgREST denies with 42501,
    //   - legacy default-privilege environments (pre-2026 auto-grants): the
    //     grant exists but RLS has no write policy → no error, 0 rows.
    // Same accept-either-shape pattern as the anon test above.
    if (error) {
      expect(error.code).toBe("42501");
    }
    expect(data ?? []).toHaveLength(0);

    const { data: srv } = await admin
      .from("account_billing")
      .select("tasks_limit")
      .eq("account_id", a.accountId)
      .single<{ tasks_limit: number }>();
    expect(srv!.tasks_limit).not.toBe(999999); // counters untouched by the member UPDATE
  });

  it("service-role bypasses RLS and reads both accounts' billing rows", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data, error } = await admin
      .from("account_billing")
      .select("account_id")
      .in("account_id", [a.accountId, b.accountId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
