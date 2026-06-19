/**
 * @jest-environment node
 *
 * Static guard for the database-linter hardening migration
 * (4.SECURITY-LINTER-HARDENING-1). Reads the SQL (no DB) and asserts:
 *   (A) search_path is pinned on the five flagged functions,
 *   (B) SECURITY DEFINER functions are revoked from anon/authenticated where
 *       intended and the two required grants are preserved,
 *   and that the migration changes no function body / table / policy.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sql = readFileSync(
  join(
    resolve(process.cwd(), "supabase/migrations"),
    "20260619010000_lint_function_search_path_and_execute_hardening.sql",
  ),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");

describe("security-linter hardening — search_path + EXECUTE (static)", () => {
  describe("(A) search_path pinned", () => {
    const fns = [
      "set_updated_at()",
      "account_memberships_enforce_personal_invariants()",
      "account_memberships_enforce_team_owner_invariants()",
      "accounts_enforce_owner_is_member()",
      "bump_template_usage_counters()",
    ];
    it.each(fns)("pins search_path = public on %s", (fn) => {
      const escaped = fn.replace(/[()]/g, "\\$&");
      expect(code).toMatch(
        new RegExp(`ALTER\\s+FUNCTION\\s+public\\.${escaped}\\s+SET\\s+search_path\\s*=\\s*public`, "i"),
      );
    });
  });

  describe("(B1) trigger functions revoked from anon + authenticated", () => {
    const triggers = [
      "handle_new_user()",
      "workflow_folders_enforce_same_account_parent()",
      "workflows_enforce_same_account_folder()",
    ];
    it.each(triggers)("revokes EXECUTE from anon/authenticated/PUBLIC on %s", (fn) => {
      const escaped = fn.replace(/[()]/g, "\\$&");
      expect(code).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${escaped}\\s+FROM\\s+anon,\\s*authenticated,\\s*PUBLIC`,
          "i",
        ),
      );
    });
  });

  describe("(B2) rate limiter is service-role only", () => {
    it("revokes anon + authenticated", () => {
      expect(code).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.increment_api_key_rate_limits\([^)]*\)\s+FROM\s+anon,\s*authenticated,\s*PUBLIC/i,
      );
    });
    it("re-grants EXECUTE to service_role", () => {
      expect(code).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.increment_api_key_rate_limits\([^)]*\)\s+TO\s+service_role/i,
      );
    });
  });

  describe("(B3) is_account_member keeps the authenticated grant the RLS policy needs", () => {
    it("revokes anon EXECUTE", () => {
      expect(code).toMatch(
        /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.is_account_member\(uuid\)\s+FROM\s+anon,\s*PUBLIC/i,
      );
    });
    it("preserves EXECUTE for authenticated (and service_role)", () => {
      expect(code).toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_account_member\(uuid\)\s+TO\s+authenticated,\s*service_role/i,
      );
    });
    it("does NOT revoke authenticated from is_account_member", () => {
      expect(code).not.toMatch(
        /REVOKE[^;]*is_account_member[^;]*authenticated/i,
      );
    });
  });

  it("changes no function body, table, or policy", () => {
    expect(code).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(code).not.toMatch(/CREATE\s+TABLE|CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+TABLE/i);
    expect(code).not.toMatch(/INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM\s+public\./i);
  });
});
