/**
 * @jest-environment node
 *
 * Static guard for the atomic Business → Team downgrade RPC migration
 * (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1). Reads the SQL (no DB): the RPC
 * exists, is SECURITY DEFINER with a fixed search_path, service-role-only, updates BOTH
 * accounts.type (→team) and account_billing.plan (→team), is organization-guarded +
 * frozen-rejecting, idempotent (already_team), has NO over-cap/member/folder refusal, leaves the
 * Stripe attachment untouched, and adds no table / no client grant / no member-or-owner mutation.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260615000000_apply_business_downgrade.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("CS-BD-1 — apply_business_downgrade migration (static guards)", () => {
  it("defines the RPC as SECURITY DEFINER with a fixed search_path", () => {
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.apply_business_downgrade/i);
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("is service-role only — revoked from public/anon/authenticated, granted service_role", () => {
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.apply_business_downgrade[\s\S]*FROM\s+public,\s*anon,\s*authenticated/i,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.apply_business_downgrade[\s\S]*TO\s+service_role/i,
    );
    expect(code).not.toMatch(/GRANT\s+EXECUTE[\s\S]*apply_business_downgrade[\s\S]*TO\s+authenticated/i);
    expect(code).not.toMatch(/GRANT\s+EXECUTE[\s\S]*apply_business_downgrade[\s\S]*TO\s+anon/i);
  });

  it("updates BOTH accounts.type (→team) and account_billing.plan (→team)", () => {
    expect(code).toMatch(/UPDATE\s+public\.accounts[\s\S]*SET\s+type\s*=\s*'team'/i);
    expect(code).toMatch(/UPDATE\s+public\.account_billing[\s\S]*plan\s*=\s*'team'/i);
  });

  it("is organization-guarded and frozen-rejecting (no demotion of arbitrary accounts)", () => {
    expect(code).toMatch(/type\s*=\s*'organization'/i); // the UPDATE guard
    expect(code).toMatch(/<>\s*'organization'/i); // not_downgradeable for non-organization
    expect(code).toMatch(/pending_deletion/i);
    expect(code).toMatch(/account_frozen/i);
  });

  it("is idempotent — no-op when already team", () => {
    expect(code).toMatch(/already_team/i);
  });

  it("sets tasks_limit from a caller-provided arg (no hardcoded cap)", () => {
    expect(code).toMatch(/tasks_limit\s*=\s*p_tasks_limit/i);
  });

  it("has NO over-cap / member / folder refusal (downgrade simplifies, it does not block)", () => {
    expect(code).not.toMatch(/over_cap/i);
  });

  it("leaves the Stripe attachment columns untouched (customer kept for the portal)", () => {
    expect(code).not.toMatch(/stripe_customer_id\s*=/i);
    expect(code).not.toMatch(/stripe_subscription_id\s*=/i);
  });

  it("does NOT create a table, touch members/owner/folders, or add a client write policy", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/CREATE\s+POLICY/i);
    expect(code).not.toMatch(/account_memberships/i);
    expect(code).not.toMatch(/workflow_folders/i);
    expect(code).not.toMatch(/owner_user_id\s*=/i);
  });
});
