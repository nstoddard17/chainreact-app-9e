/**
 * @jest-environment node
 *
 * Static guard for the team/org owner-invariants + transfer-RPC migration
 * (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-2 / TL-1). Reads the SQL (no DB) and
 * asserts the DB-level shape: a >=1-owner trigger (DELETE + UPDATE), an
 * owner_user_id consistency trigger, a SECURITY DEFINER transfer RPC granted to
 * service_role only, stable error prefixes, the personal invariant left intact,
 * and that this slice adds NO table / route / RLS-policy / data change.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const sql = readFileSync(
  join(MIGRATIONS, "20260604000001_account_owner_invariants_and_transfer_rpc.sql"),
  "utf8",
);
// Strip line comments so assertions match real statements, not the doc header.
const code = sql.replace(/--[^\n]*/g, "");

describe("TL-1 — team/org owner invariants + transfer RPC (static guards)", () => {
  it("defines the >=1-owner trigger function + BEFORE UPDATE OR DELETE trigger", () => {
    expect(code).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.account_memberships_enforce_team_owner_invariants\(\)/i,
    );
    expect(code).toMatch(
      /CREATE\s+TRIGGER\s+account_memberships_enforce_team_owner_invariants\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.account_memberships/i,
    );
  });

  it("allows teardown when the parent account is gone (FK cascade) or not active", () => {
    // The cascade-safety branch is what lets account purge / direct account
    // delete still cascade-remove the last owner membership.
    expect(code).toMatch(/v_type\s+IS\s+NULL/i);
    expect(code).toMatch(/v_deletion_status\s+IS\s+DISTINCT\s+FROM\s+'active'/i);
  });

  it("counts OTHER owners and refuses dropping the last one with a stable prefix", () => {
    expect(code).toMatch(/role\s*=\s*'owner'/i);
    expect(code).toMatch(/m\.user_id\s*<>\s*OLD\.user_id/i);
    expect(code).toMatch(/account_memberships_team_owner_invariant_violation/);
  });

  it("defines the owner_user_id consistency trigger (UPDATE only) with a stable prefix", () => {
    expect(code).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.accounts_enforce_owner_is_member\(\)/i,
    );
    expect(code).toMatch(
      /CREATE\s+TRIGGER\s+accounts_enforce_owner_is_member\s+BEFORE\s+UPDATE\s+ON\s+public\.accounts/i,
    );
    // Only acts when owner_user_id changes; requires an owner membership.
    expect(code).toMatch(/owner_user_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+OLD\.owner_user_id/i);
    expect(code).toMatch(/accounts_owner_consistency_violation/);
  });

  it("does NOT make the consistency trigger fire on INSERT (account is created before its membership)", () => {
    expect(code).not.toMatch(
      /CREATE\s+TRIGGER\s+accounts_enforce_owner_is_member\s+BEFORE\s+INSERT/i,
    );
  });

  it("defines transfer_account_ownership as SECURITY DEFINER with a fixed search_path", () => {
    expect(code).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.transfer_account_ownership\(\s*p_account_id\s+uuid,\s*p_current_owner_user_id\s+uuid,\s*p_target_user_id\s+uuid\s*\)/i,
    );
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("the RPC validates type/active/current-owner/target-membership before swapping", () => {
    expect(code).toMatch(/cannot transfer a personal account/i);
    expect(code).toMatch(/is not active/i);
    expect(code).toMatch(/current owner mismatch/i);
    expect(code).toMatch(/is not a member of account/i);
    // Atomic 3-step swap.
    expect(code).toMatch(/UPDATE\s+public\.account_memberships\s+SET\s+role\s*=\s*'owner'/i);
    expect(code).toMatch(/UPDATE\s+public\.accounts\s+SET\s+owner_user_id\s*=\s*p_target_user_id/i);
    expect(code).toMatch(/UPDATE\s+public\.account_memberships\s+SET\s+role\s*=\s*'admin'/i);
    // Serializes concurrent transfers.
    expect(code).toMatch(/FOR\s+UPDATE/i);
  });

  it("grants the transfer RPC to service_role only — never PUBLIC / anon / authenticated", () => {
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.transfer_account_ownership\(uuid,\s*uuid,\s*uuid\)\s+FROM\s+PUBLIC/i,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.transfer_account_ownership\(uuid,\s*uuid,\s*uuid\)\s+TO\s+service_role/i,
    );
    expect(code).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.transfer_account_ownership[^;]*TO[^;]*authenticated/i,
    );
    expect(code).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.transfer_account_ownership[^;]*TO[^;]*anon/i,
    );
  });

  it("leaves the personal-account invariant intact (does not drop/redefine it)", () => {
    expect(code).not.toMatch(/account_memberships_enforce_personal_invariants/);
    expect(code).not.toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+account_memberships_enforce_personal_invariants/i);
  });

  it("adds no table, no RLS policy, no FK/column change, and writes no data", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i);
    expect(code).not.toMatch(/ADD\s+COLUMN|DROP\s+COLUMN|ADD\s+CONSTRAINT|DROP\s+CONSTRAINT/i);
    expect(code).not.toMatch(/INSERT\s+INTO|DELETE\s+FROM\s+public\./i);
  });

  it("is idempotent — CREATE OR REPLACE + DROP TRIGGER IF EXISTS before each CREATE TRIGGER", () => {
    expect(code).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+account_memberships_enforce_team_owner_invariants/i);
    expect(code).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+accounts_enforce_owner_is_member/i);
  });
});
