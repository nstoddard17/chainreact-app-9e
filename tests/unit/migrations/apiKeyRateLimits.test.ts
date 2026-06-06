/**
 * @jest-environment node
 *
 * Static guard for the durable rate-limit migration
 * (Slice 4.API-KEYS-RATE-LIMIT-1). Reads the migration SQL (no DB) so CI proves the
 * shape + the service-role-only fences on every run:
 *   - the counter table + composite PK + expires index,
 *   - service-role-only access (deny-all RLS policy, GRANT to service_role, NO
 *     authenticated grant, system-table opt-out comment),
 *   - the atomic increment RPC (SECURITY DEFINER, search_path public, RETURNS TABLE),
 *     REVOKEd from PUBLIC and GRANTed EXECUTE to service_role only.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260608000000_api_key_rate_limits.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("RATE-LIMIT-1 — api_key_rate_limits migration (static guards)", () => {
  describe("table + indexes", () => {
    it("creates the counter table", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.api_key_rate_limits/i);
    });

    it("has a composite primary key on (bucket_key, window_start)", () => {
      expect(code).toMatch(/PRIMARY\s+KEY\s*\(\s*bucket_key\s*,\s*window_start\s*\)/i);
    });

    it("indexes expires_at for cleanup", () => {
      expect(code).toMatch(/CREATE\s+INDEX\s+\S*expires\S*\s+ON\s+public\.api_key_rate_limits\s*\(\s*expires_at\s*\)/i);
    });

    it("carries the count + expires_at columns", () => {
      expect(code).toMatch(/count\s+integer\s+NOT\s+NULL/i);
      expect(code).toMatch(/expires_at\s+timestamptz\s+NOT\s+NULL/i);
    });
  });

  describe("service-role-only fences", () => {
    it("declares the system-table opt-out comment", () => {
      expect(sql).toMatch(/system-table:\s*api_key_rate_limits/i);
    });

    it("enables RLS with a deny-all client policy", () => {
      expect(code).toMatch(/ALTER\s+TABLE\s+public\.api_key_rate_limits\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(code).toMatch(/CREATE\s+POLICY\s+\S+\s+ON\s+public\.api_key_rate_limits[\s\S]*USING\s*\(\s*false\s*\)/i);
    });

    it("grants service_role and NOT authenticated", () => {
      expect(code).toMatch(/GRANT[\s\S]*ON\s+public\.api_key_rate_limits\s+TO\s+service_role/i);
      expect(code).not.toMatch(/ON\s+public\.api_key_rate_limits\s+TO\s+authenticated/i);
    });
  });

  describe("increment RPC", () => {
    it("defines increment_api_key_rate_limits as SECURITY DEFINER with a pinned search_path", () => {
      expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.increment_api_key_rate_limits/i);
      expect(code).toMatch(/SECURITY\s+DEFINER/i);
      expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
    });

    it("returns the three post-increment counts as a TABLE", () => {
      expect(code).toMatch(/RETURNS\s+TABLE\s*\([\s\S]*key_count[\s\S]*workflow_count[\s\S]*account_count[\s\S]*\)/i);
    });

    it("uses an atomic UPSERT increment", () => {
      expect(code).toMatch(/ON\s+CONFLICT\s*\(\s*bucket_key\s*,\s*window_start\s*\)\s*DO\s+UPDATE\s+SET\s+count\s*=/i);
    });

    it("is REVOKEd from PUBLIC and EXECUTE-granted to service_role only", () => {
      expect(code).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.increment_api_key_rate_limits[\s\S]*FROM\s+PUBLIC/i);
      expect(code).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.increment_api_key_rate_limits[\s\S]*TO\s+service_role/i);
      expect(code).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.increment_api_key_rate_limits[\s\S]*TO\s+authenticated/i);
    });
  });
});
