/**
 * @jest-environment node
 *
 * Static guard for the account_api_keys foundation
 * (Slice 4.API-KEYS-FOUNDATION-2 / FK-1). Reads the migration SQL (no DB) so CI
 * proves the shape + the hard security fences on every run:
 *   - the table + columns + FKs (account ON DELETE CASCADE, creator SET NULL),
 *   - key_hash UNIQUE; scopes CHECK (known set + non-empty),
 *   - account / prefix / partial-active indexes; updated_at trigger,
 *   - RLS enabled with a membership-gated, freeze-aware SELECT policy and NO
 *     user-facing write policy (writes are service-role),
 *   - NO `authenticated` GRANT at all (key_hash is never client-reachable;
 *     reads go through the service-role projection — documented strategy),
 *   - the slice touches no OAuth/integration token columns and writes no data.
 *
 * The live RLS proofs are the opt-in DB harness
 * (tests/integration/security/account-api-keys-rls.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILE = "20260607000000_account_api_keys.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("FK-1 — account_api_keys foundation (static guards)", () => {
  describe("table + columns", () => {
    it("creates the table", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.account_api_keys/i);
    });

    it("keys the account with an ON DELETE CASCADE FK", () => {
      expect(code).toMatch(
        /account_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      );
    });

    it("records creator provenance with ON DELETE SET NULL (not authorization)", () => {
      expect(code).toMatch(
        /created_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      );
    });

    it("has NOT NULL name / prefix / key_hash", () => {
      expect(code).toMatch(/name\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/prefix\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/key_hash\s+text\s+NOT\s+NULL/i);
    });

    it("makes key_hash UNIQUE (the O(1) verification lookup)", () => {
      expect(code).toMatch(/UNIQUE\s*\(\s*key_hash\s*\)/i);
    });

    it("constrains scopes to a non-empty subset of the KNOWN scope set incl. workflows:trigger", () => {
      expect(code).toMatch(/scopes\s+text\[\]\s+NOT\s+NULL/i);
      expect(code).toMatch(/array_length\s*\(\s*scopes\s*,\s*1\s*\)\s*>=\s*1/i);
      expect(code).toMatch(/scopes\s*<@\s*ARRAY\s*\[/i);
      expect(code).toMatch(/'workflows:trigger'/);
    });

    it("has the lifecycle timestamps", () => {
      for (const col of ["last_used_at", "expires_at", "revoked_at", "created_at", "updated_at"]) {
        expect(code).toMatch(new RegExp(`\\b${col}\\b`));
      }
    });
  });

  describe("indexes + trigger", () => {
    it("indexes by account_id and prefix", () => {
      expect(code).toMatch(/CREATE\s+INDEX\s+account_api_keys_account_idx\s+ON\s+public\.account_api_keys\s*\(\s*account_id\s*\)/i);
      expect(code).toMatch(/CREATE\s+INDEX\s+account_api_keys_prefix_idx\s+ON\s+public\.account_api_keys\s*\(\s*prefix\s*\)/i);
    });

    it("has a partial index for active (non-revoked) keys", () => {
      expect(code).toMatch(
        /CREATE\s+INDEX\s+account_api_keys_active_idx[\s\S]*?WHERE\s+revoked_at\s+IS\s+NULL/i,
      );
    });

    it("wires the set_updated_at trigger", () => {
      expect(code).toMatch(
        /CREATE\s+TRIGGER\s+account_api_keys_set_updated_at[\s\S]*?EXECUTE\s+FUNCTION\s+public\.set_updated_at\(\)/i,
      );
    });
  });

  describe("RLS + GRANTs (key_hash never client-reachable)", () => {
    it("enables RLS", () => {
      expect(code).toMatch(
        /ALTER\s+TABLE\s+public\.account_api_keys\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    });

    it("has a membership-gated, freeze-aware SELECT policy", () => {
      expect(code).toMatch(
        /CREATE\s+POLICY\s+account_api_keys_select_account_member\s+ON\s+public\.account_api_keys\s+FOR\s+SELECT/i,
      );
      expect(code).toMatch(/FROM\s+public\.account_memberships\s+am/i);
      expect(code).toMatch(/am\.user_id\s*=\s*auth\.uid\(\)/i);
      expect(code).toMatch(/a\.deletion_status\s*=\s*'active'/i);
    });

    it("has NO user-facing write policy (writes are service-role only)", () => {
      expect(code).not.toMatch(/FOR\s+INSERT/i);
      expect(code).not.toMatch(/FOR\s+UPDATE/i);
      expect(code).not.toMatch(/FOR\s+DELETE/i);
    });

    it("grants ALL to service_role and NOTHING to authenticated (no key_hash leak path)", () => {
      expect(code).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.account_api_keys\s+TO\s+service_role/i,
      );
      // The authenticated role gets no grant at all — clients cannot read key_hash.
      expect(code).not.toMatch(/TO\s+authenticated/i);
    });
  });

  describe("hard fences (additive, no behavior change, no token access)", () => {
    it("does NOT touch any OAuth/integration token material", () => {
      expect(code).not.toMatch(/access_token/i);
      expect(code).not.toMatch(/refresh_token/i);
      expect(code).not.toMatch(/encrypted/i);
      expect(code).not.toMatch(/integrations/i);
    });

    it("performs no backfill / data write (structure only)", () => {
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    });
  });
});
