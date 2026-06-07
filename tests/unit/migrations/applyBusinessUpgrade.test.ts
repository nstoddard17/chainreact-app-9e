/**
 * @jest-environment node
 *
 * Static guard for the atomic Team → Business upgrade RPC migration
 * (Slice 4.BILLING-BUSINESS-UPGRADE-2 / BU-1). Reads the SQL (no DB): the RPC exists,
 * is SECURITY DEFINER with a fixed search_path, service-role-only, updates BOTH
 * accounts.type and account_billing, is team-guarded + frozen-rejecting, and adds no
 * table / no client grant / no member-or-owner mutation.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260614000000_apply_business_upgrade.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("BU-1 — apply_business_upgrade migration (static guards)", () => {
  it("defines the RPC as SECURITY DEFINER with a fixed search_path", () => {
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.apply_business_upgrade/i);
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("is service-role only — revoked from public/anon/authenticated, granted service_role", () => {
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.apply_business_upgrade[\s\S]*FROM\s+public,\s*anon,\s*authenticated/i,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.apply_business_upgrade[\s\S]*TO\s+service_role/i,
    );
    expect(code).not.toMatch(/GRANT\s+EXECUTE[\s\S]*apply_business_upgrade[\s\S]*TO\s+authenticated/i);
    expect(code).not.toMatch(/GRANT\s+EXECUTE[\s\S]*apply_business_upgrade[\s\S]*TO\s+anon/i);
  });

  it("updates BOTH accounts.type (→organization) and account_billing.plan (→business)", () => {
    expect(code).toMatch(/UPDATE\s+public\.accounts[\s\S]*SET\s+type\s*=\s*'organization'/i);
    expect(code).toMatch(/UPDATE\s+public\.account_billing[\s\S]*plan\s*=\s*'business'/i);
  });

  it("is team-guarded and frozen-rejecting (no escalation of arbitrary accounts)", () => {
    expect(code).toMatch(/type\s*=\s*'team'/i); // the UPDATE guard
    expect(code).toMatch(/<>\s*'team'/i); // not_upgradeable for non-team
    expect(code).toMatch(/pending_deletion/i);
    expect(code).toMatch(/account_frozen/i);
  });

  it("is idempotent — no-op when already organization", () => {
    expect(code).toMatch(/already_upgraded/i);
  });

  it("sets the Stripe attachment + tasks_limit from a caller-provided arg (no hardcoded cap)", () => {
    expect(code).toMatch(/tasks_limit\s*=\s*p_tasks_limit/i);
    expect(code).toMatch(/stripe_subscription_id\s*=\s*p_stripe_subscription_id/i);
    expect(code).toMatch(/stripe_customer_id\s*=\s*p_stripe_customer_id/i);
  });

  it("does NOT create a table, touch members/owner, or add a client write policy", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/CREATE\s+POLICY/i);
    expect(code).not.toMatch(/account_memberships/i);
    expect(code).not.toMatch(/owner_user_id\s*=/i);
  });
});
