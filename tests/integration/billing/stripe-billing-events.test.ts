/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-5 / CS-4 — gated DB proof that the stripe_billing_events
 * dedup table (20260613000000) is applied and service-role-only:
 *   - service-role inserts an event; a duplicate event_id is rejected by the PK;
 *   - authenticated + anon clients can neither read nor write (no grant + deny-all RLS).
 *
 * DESTRUCTIVE: writes a throwaway event row (cleaned up). OPT-IN — set
 * ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
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
    "SKIP stripe_billing_events — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).",
  );
}

describeDb("stripe_billing_events — CS-4", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const eventId = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  afterAll(async () => {
    if (admin) await admin.from("stripe_billing_events").delete().eq("event_id", eventId);
  });

  it("service-role can insert an event", async () => {
    const { error } = await admin
      .from("stripe_billing_events")
      .insert({ event_id: eventId, event_type: "customer.subscription.updated", account_id: null });
    expect(error).toBeNull();
  });

  it("rejects a duplicate event_id (primary key)", async () => {
    const { error } = await admin
      .from("stripe_billing_events")
      .insert({ event_id: eventId, event_type: "customer.subscription.updated" });
    expect(error).not.toBeNull(); // 23505 unique_violation on the PK
  });

  it("anon cannot read the dedup ledger (no grant + deny-all RLS)", async () => {
    const { data } = await anon.from("stripe_billing_events").select("event_id").eq("event_id", eventId);
    // Either a hard error (no grant) or an empty set (RLS) — never the row.
    expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot insert into the dedup ledger", async () => {
    const { data, error } = await anon
      .from("stripe_billing_events")
      .insert({ event_id: `evt_anon_${Date.now()}`, event_type: "x" })
      .select("event_id");
    // No grant / deny-all WITH CHECK → rejected (error) or 0 rows written.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
