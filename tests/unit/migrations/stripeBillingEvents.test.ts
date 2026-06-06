/**
 * @jest-environment node
 *
 * Static guard for the Stripe billing webhook dedup table migration
 * (Slice 4.BILLING-PLAN-METADATA-5 / CS-4). Reads the SQL (no DB): service-role-only
 * system table, event_id PRIMARY KEY, RLS + deny-all policy, NO authenticated/anon grant.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260613000000_stripe_billing_events.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("CS-4 — stripe_billing_events migration (static guards)", () => {
  it("creates public.stripe_billing_events with event_id as PRIMARY KEY", () => {
    expect(code).toMatch(/CREATE\s+TABLE\s+public\.stripe_billing_events/i);
    expect(code).toMatch(/event_id\s+text\s+PRIMARY\s+KEY/i);
  });

  it("has the safe columns (event_type, account_id, processed_at) and no payload column", () => {
    expect(code).toMatch(/event_type\s+text\s+NOT\s+NULL/i);
    expect(code).toMatch(/account_id\s+uuid/i);
    expect(code).toMatch(/processed_at\s+timestamptz/i);
    // No raw payload / email / secret columns.
    expect(code).not.toMatch(/payload|raw_event|email|secret|card/i);
  });

  it("account_id has NO foreign key (informational, must not block the dedup insert)", () => {
    expect(code).not.toMatch(/account_id[\s\S]*REFERENCES/i);
  });

  it("enables RLS and a deny-all client policy (service-role-only)", () => {
    expect(code).toMatch(/ALTER\s+TABLE\s+public\.stripe_billing_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(code).toMatch(/CREATE\s+POLICY\s+\S+\s+ON\s+public\.stripe_billing_events\s+FOR\s+ALL\s+USING\s*\(\s*false\s*\)\s+WITH\s+CHECK\s*\(\s*false\s*\)/i);
  });

  it("grants the table to service_role only — nothing to authenticated/anon", () => {
    expect(code).toMatch(/GRANT[\s\S]*ON\s+public\.stripe_billing_events\s+TO\s+service_role/i);
    expect(code).not.toMatch(/GRANT[\s\S]*ON\s+public\.stripe_billing_events\s+TO\s+authenticated/i);
    expect(code).not.toMatch(/GRANT[\s\S]*ON\s+public\.stripe_billing_events\s+TO\s+anon/i);
  });

  it("declares the system-table opt-out comment", () => {
    expect(sql).toMatch(/--\s*system-table:\s*stripe_billing_events/i);
  });
});
