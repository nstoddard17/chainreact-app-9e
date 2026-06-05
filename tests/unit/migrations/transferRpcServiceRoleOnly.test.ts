/**
 * @jest-environment node
 *
 * Static guard for the transfer-RPC privilege lock-down (TL-1 security
 * follow-up). The original migration's REVOKE FROM PUBLIC was insufficient on a
 * Supabase project whose default privileges re-grant EXECUTE to anon +
 * authenticated; this migration revokes those explicitly so the RPC is
 * service_role-only. Reads the SQL (no DB).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const sql = readFileSync(
  join(resolve(process.cwd(), "supabase/migrations"), "20260605000000_transfer_rpc_service_role_only.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");

describe("TL-1 follow-up — transfer RPC is service_role-only (static)", () => {
  it("explicitly revokes EXECUTE from PUBLIC, anon, AND authenticated", () => {
    expect(code).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.transfer_account_ownership\(uuid,\s*uuid,\s*uuid\)\s+FROM\s+PUBLIC/i);
    expect(code).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.transfer_account_ownership\(uuid,\s*uuid,\s*uuid\)\s+FROM\s+anon/i);
    expect(code).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.transfer_account_ownership\(uuid,\s*uuid,\s*uuid\)\s+FROM\s+authenticated/i);
  });

  it("grants EXECUTE to service_role only", () => {
    expect(code).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.transfer_account_ownership\(uuid,\s*uuid,\s*uuid\)\s+TO\s+service_role/i);
    expect(code).not.toMatch(/GRANT\s+EXECUTE[^;]*TO[^;]*\b(anon|authenticated)\b/i);
  });

  it("changes no table / policy / data", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE|CREATE\s+POLICY|INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM\s+public\./i);
  });
});
