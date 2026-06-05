/**
 * @jest-environment node
 *
 * Static guard for the get_account_member_identities anon-revoke
 * (4.SECURITY-RPC-EXECUTE-AUDIT-FIX). Reads the SQL (no DB): revokes anon,
 * re-grants authenticated + service_role, and changes nothing else.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sql = readFileSync(
  join(resolve(process.cwd(), "supabase/migrations"), "20260605000001_member_identities_revoke_anon.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");

describe("audit-fix — get_account_member_identities is authenticated-only (static)", () => {
  it("revokes anon EXECUTE", () => {
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.get_account_member_identities\(uuid\)\s+FROM\s+anon/i,
    );
  });

  it("re-grants EXECUTE to authenticated + service_role (roster lookup preserved)", () => {
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_account_member_identities\(uuid\)\s+TO\s+authenticated,\s*service_role/i,
    );
  });

  it("does not redefine the function body or touch tables / policies", () => {
    expect(code).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(code).not.toMatch(/CREATE\s+TABLE|CREATE\s+POLICY|ALTER\s+TABLE/i);
    expect(code).not.toMatch(/INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM\s+public\./i);
  });
});
