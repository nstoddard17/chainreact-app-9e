/**
 * @jest-environment node
 *
 * Static guard for the workflow_templates foundation
 * (Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4). Reads the migration
 * SQL (no DB) so CI proves the shape + the security fences on every run:
 *   - the table + columns + FKs (account ON DELETE CASCADE, creator SET NULL),
 *   - definition jsonb NOT NULL; schema_version integer NOT NULL; source CHECK ('user'),
 *   - account / account+created_at / created_by indexes; updated_at trigger,
 *   - RLS enabled with a membership-gated, freeze-aware SELECT policy and NO user-facing
 *     write policy (writes are service-role),
 *   - authenticated gets SELECT only; service_role gets ALL; no authenticated write grant,
 *   - the slice touches no credential/integration material and writes no data.
 *
 * Live RLS proofs are the opt-in DB harness
 * (tests/integration/security/workflow-templates-rls.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260616000000_workflow_templates.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("CS-XT-4 — workflow_templates foundation (static guards)", () => {
  describe("table + columns", () => {
    it("creates the table", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.workflow_templates/i);
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

    it("has NOT NULL name, jsonb definition, and integer schema_version", () => {
      expect(code).toMatch(/name\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/definition\s+jsonb\s+NOT\s+NULL/i);
      expect(code).toMatch(/schema_version\s+integer\s+NOT\s+NULL/i);
    });

    it("constrains source to 'user' (built-ins deferred)", () => {
      expect(code).toMatch(/source\s+text\s+NOT\s+NULL\s+DEFAULT\s+'user'/i);
      expect(code).toMatch(/CHECK\s*\(\s*source\s+IN\s*\(\s*'user'\s*\)\s*\)/i);
      // built-ins are NOT modeled in the DB yet.
      expect(code).not.toMatch(/'builtin'/i);
    });

    it("has created_at + updated_at timestamps", () => {
      for (const col of ["created_at", "updated_at"]) {
        expect(code).toMatch(new RegExp(`\\b${col}\\b`));
      }
    });
  });

  describe("indexes + trigger", () => {
    it("indexes by account_id, (account_id, created_at), and created_by_user_id", () => {
      expect(code).toMatch(
        /CREATE\s+INDEX\s+workflow_templates_account_idx\s+ON\s+public\.workflow_templates\s*\(\s*account_id\s*\)/i,
      );
      expect(code).toMatch(
        /CREATE\s+INDEX\s+workflow_templates_account_created_idx[\s\S]*?\(\s*account_id\s*,\s*created_at\s+DESC\s*\)/i,
      );
      expect(code).toMatch(
        /CREATE\s+INDEX\s+workflow_templates_created_by_idx\s+ON\s+public\.workflow_templates\s*\(\s*created_by_user_id\s*\)/i,
      );
    });

    it("wires the set_updated_at trigger", () => {
      expect(code).toMatch(
        /CREATE\s+TRIGGER\s+workflow_templates_set_updated_at[\s\S]*?EXECUTE\s+FUNCTION\s+public\.set_updated_at\(\)/i,
      );
    });
  });

  describe("RLS + GRANTs (service-role writes; member reads)", () => {
    it("enables RLS", () => {
      expect(code).toMatch(
        /ALTER\s+TABLE\s+public\.workflow_templates\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    });

    it("has a membership-gated, freeze-aware SELECT policy", () => {
      expect(code).toMatch(
        /CREATE\s+POLICY\s+workflow_templates_select_account_member\s+ON\s+public\.workflow_templates\s+FOR\s+SELECT/i,
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

    it("grants SELECT to authenticated and ALL to service_role; no authenticated write", () => {
      expect(code).toMatch(/GRANT\s+SELECT\s+ON\s+public\.workflow_templates\s+TO\s+authenticated/i);
      expect(code).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.workflow_templates\s+TO\s+service_role/i,
      );
      // authenticated must NOT receive write privileges.
      expect(code).not.toMatch(
        /GRANT\s+[^;]*INSERT[^;]*\s+ON\s+public\.workflow_templates\s+TO\s+authenticated/i,
      );
    });
  });

  describe("hard fences (additive, no credential access, no data write)", () => {
    it("does NOT touch any credential / integration / token material", () => {
      expect(code).not.toMatch(/access_token/i);
      expect(code).not.toMatch(/refresh_token/i);
      expect(code).not.toMatch(/integrations/i);
      expect(code).not.toMatch(/workflow_node_credentials/i);
    });

    it("performs no backfill / data write (structure only)", () => {
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    });
  });
});
