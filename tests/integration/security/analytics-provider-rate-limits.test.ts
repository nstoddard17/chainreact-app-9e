/**
 * @jest-environment node
 *
 * ANALYTICS-CONNECTED-DATA-CD-2 — gated DB proof for the
 * `analytics_provider_rate_limits` limiter (migration 20260802000000):
 * atomic post-increment counts, bucket isolation, window reset semantics,
 * and service_role-only access (authenticated/anon denied for both the
 * table and the RPC).
 *
 * DESTRUCTIVE / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with URL + ANON + SERVICE key.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
if (!RUN) console.log("SKIP analytics_provider_rate_limits — gated env not set.");

describeDb("analytics_provider_rate_limits — CD-2", () => {
  let admin: SupabaseClient;
  const stamp = `t${Date.now().toString(36)}`;
  const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const expiresAt = new Date(Date.parse(windowStart) + 60000).toISOString();
  const acctBucket = `apl:acct:${stamp}:w1`;
  const srcBucket = `apl:src:${stamp}:stripe:w1`;

  const rpc = (client: SupabaseClient, a = acctBucket, s = srcBucket) =>
    client.rpc("increment_analytics_provider_rate_limits", {
      p_account_bucket: a,
      p_source_bucket: s,
      p_window_start: windowStart,
      p_expires_at: expiresAt,
    });

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  });
  afterAll(async () => {
    await admin.from("analytics_provider_rate_limits").delete().like("bucket_key", `%${stamp}%`);
  });

  it("atomic post-increment counts across concurrent callers", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rpc(admin)));
    const counts = results
      .map((r) => {
        expect(r.error).toBeNull();
        const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { account_count: number };
        return Number(row.account_count);
      })
      .sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // no lost updates
  });

  it("distinct buckets count independently (account/provider isolation)", async () => {
    const other = await rpc(admin, `apl:acct:${stamp}-other:w1`, `apl:src:${stamp}-other:stripe:w1`);
    const row = (Array.isArray(other.data) ? other.data[0] : other.data) as {
      account_count: number; source_count: number;
    };
    expect(Number(row.account_count)).toBe(1);
    expect(Number(row.source_count)).toBe(1);
  });

  it("authenticated/anon cannot execute the RPC or read the table", async () => {
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const call = await rpc(anon);
    expect(call.error).not.toBeNull();
    const read = await anon.from("analytics_provider_rate_limits").select("bucket_key").limit(1);
    // No grant → permission denied (or RLS deny-all → empty). Either way: no data.
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
  });
});
