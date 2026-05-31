/**
 * @jest-environment node
 *
 * Static guard for the account_invitations migration (Slice 4.ACCOUNT-MODEL-15).
 * Reads the SQL (no DB) so CI proves: the table + token_hash (not raw) + role/
 * status CHECKs + partial-unique-pending index + owner/admin SELECT RLS +
 * the notification enum value + the service-role-only email-lookup function.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const sql = readFileSync(
  join(MIGRATIONS, "20260531000011_account_invitations.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");

describe("4.ACCOUNT-MODEL-15 — account_invitations (static guards)", () => {
  it("creates account_invitations with a FK to accounts ON DELETE CASCADE", () => {
    expect(code).toMatch(/CREATE\s+TABLE\s+public\.account_invitations/i);
    expect(code).toMatch(
      /account_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("stores a token_hash (UNIQUE) and never a raw token column", () => {
    expect(code).toMatch(/token_hash\s+text\s+NOT\s+NULL\s+UNIQUE/i);
    expect(code).not.toMatch(/\btoken\s+text\b/i); // no raw-token column
  });

  it("CHECK-locks role to admin|member and status to the 4-state lifecycle", () => {
    expect(code).toMatch(/role\s+text\s+NOT\s+NULL\s+CHECK\s*\(\s*role\s+IN\s*\(\s*'admin'\s*,\s*'member'\s*\)\s*\)/i);
    expect(code).toMatch(/status\s+IN\s*\(\s*'pending'\s*,\s*'accepted'\s*,\s*'expired'\s*,\s*'revoked'\s*\)/i);
    // owner is not invitable — the role CHECK itself must not include it.
    expect(code).not.toMatch(/CHECK\s*\(\s*role\s+IN\s*\([^)]*owner/i);
  });

  it("has a partial unique index for one pending invite per (account, email)", () => {
    expect(code).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[^;]*account_invitations[^;]*\(account_id,\s*lower\(email\)\)[^;]*WHERE\s+status\s*=\s*'pending'/i,
    );
  });

  it("enables RLS with an owner/admin SELECT policy + Data API grants", () => {
    expect(code).toMatch(/ALTER\s+TABLE\s+public\.account_invitations\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(code).toMatch(/CREATE\s+POLICY\s+account_invitations_select_owner_admin/i);
    expect(code).toMatch(/am\.role\s+IN\s*\(\s*'owner'\s*,\s*'admin'\s*\)/i);
    expect(code).toMatch(/GRANT\s+SELECT\s+ON\s+public\.account_invitations\s+TO\s+authenticated/i);
  });

  it("adds the account_invitation notification enum value", () => {
    expect(code).toMatch(
      /ALTER\s+TYPE\s+public\.notification_type\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'account_invitation'/i,
    );
  });

  it("defines find_user_id_by_email SECURITY DEFINER, EXECUTE to service_role only", () => {
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.find_user_id_by_email\(p_email\s+text\)/i);
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.find_user_id_by_email[^;]*FROM\s+public,\s*anon,\s*authenticated/i);
    expect(code).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.find_user_id_by_email[^;]*TO\s+service_role/i);
  });
});
