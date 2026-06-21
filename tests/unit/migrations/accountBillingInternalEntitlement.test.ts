/**
 * @jest-environment node
 *
 * Static guard for the internal-entitlement migration (Slice
 * 4.BILLING-INTERNAL-ENTITLEMENT-1 / BIE-1). Reads the SQL (no DB): additive
 * billing_mode + internal_* columns with safe defaults + CHECKs + a clean-revert
 * consistency CHECK, and NO unsafe RLS/GRANT change (the toggle stays
 * service-role only; no public/client write path).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260707000000_account_billing_internal_entitlement.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("BIE-1 — account_billing internal entitlement migration (static guards)", () => {
  describe("columns + defaults + CHECKs", () => {
    it("adds billing_mode NOT NULL DEFAULT 'standard' with a known-set CHECK", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+billing_mode\s+text\s+NOT\s+NULL\s+DEFAULT\s+'standard'/i);
      expect(code).toMatch(/CHECK\s*\(\s*billing_mode\s+IN\s*\([\s\S]*'standard'[\s\S]*'internal_free'[\s\S]*\)\s*\)/i);
    });

    it("adds a nullable internal_reason with a known-set CHECK", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+internal_reason\s+text/i);
      expect(code).not.toMatch(/internal_reason\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/internal_reason\s+IN\s*\([\s\S]*'employee'[\s\S]*'qa'[\s\S]*'demo'[\s\S]*'load_test'[\s\S]*'partner'[\s\S]*'other'[\s\S]*\)/i);
    });

    it("adds a nullable internal_set_by_user_id FK to auth.users with ON DELETE SET NULL", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+internal_set_by_user_id\s+uuid/i);
      expect(code).toMatch(/REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
    });

    it("adds a nullable internal_set_at timestamptz", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+internal_set_at\s+timestamptz/i);
      expect(code).not.toMatch(/internal_set_at\s+timestamptz\s+NOT\s+NULL/i);
    });
  });

  describe("clean-revert consistency CHECK", () => {
    it("requires a standard row to carry no internal metadata", () => {
      expect(code).toMatch(/account_billing_internal_consistency/i);
      expect(code).toMatch(/billing_mode\s*=\s*'internal_free'\s*OR\s*\(/i);
      expect(code).toMatch(/internal_reason\s+IS\s+NULL\s+AND\s+internal_set_by_user_id\s+IS\s+NULL\s+AND\s+internal_set_at\s+IS\s+NULL/i);
    });
  });

  describe("scope fences — no toggle exposure, no privilege widening", () => {
    it("is additive only — does NOT create a table (pure ALTER)", () => {
      expect(code).not.toMatch(/CREATE\s+TABLE/i);
    });

    it("makes NO RLS / policy change", () => {
      expect(code).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(code).not.toMatch(/CREATE\s+POLICY/i);
      expect(code).not.toMatch(/DROP\s+POLICY/i);
    });

    it("grants NO new client write path (no public/client toggle)", () => {
      expect(code).not.toMatch(/GRANT[\s\S]*TO\s+anon/i);
      expect(code).not.toMatch(/GRANT[\s\S]*INSERT[\s\S]*TO\s+authenticated/i);
      expect(code).not.toMatch(/GRANT[\s\S]*UPDATE[\s\S]*TO\s+authenticated/i);
    });
  });
});
