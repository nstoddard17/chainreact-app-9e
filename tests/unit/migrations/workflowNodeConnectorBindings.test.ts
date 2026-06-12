/**
 * @jest-environment node
 *
 * Static guard for the workflow_node_connector_bindings foundation
 * (Slice 4.CONN-SHARE / CS-4a). Reads the migration SQL (no DB) so CI proves the
 * shape + behavior-inert fences: table + columns + FKs, one-per-node unique,
 * indexes, set_updated_at trigger, RLS + membership-gated SELECT policy + NO
 * client write policy, explicit GRANTs, NO status column, NO provider map in SQL,
 * NO backfill, NO token columns.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260623000000_workflow_node_connector_bindings.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("CS-4a — workflow_node_connector_bindings foundation (static guards)", () => {
  describe("table + columns", () => {
    it("creates the side table", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.workflow_node_connector_bindings/i);
    });
    it("keys the workflow with ON DELETE CASCADE", () => {
      expect(code).toMatch(
        /workflow_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.workflows\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      );
    });
    it("binds connector_user_id to auth.users with ON DELETE CASCADE", () => {
      expect(code).toMatch(
        /connector_user_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      );
    });
    it("records created_by_user_id provenance with ON DELETE SET NULL", () => {
      expect(code).toMatch(
        /created_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      );
    });
    it("has NOT NULL node_id + provider", () => {
      expect(code).toMatch(/node_id\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/provider\s+text\s+NOT\s+NULL/i);
    });
    it("has NO status column (direct binding, not a consent machine)", () => {
      expect(code).not.toMatch(/\bstatus\b/i);
    });
  });

  describe("indexes + trigger", () => {
    it("one binding per node (full unique on workflow_id, node_id)", () => {
      expect(code).toMatch(
        /CREATE\s+UNIQUE\s+INDEX\s+workflow_node_connector_bindings_one_per_node\s+ON\s+public\.workflow_node_connector_bindings\s*\(\s*workflow_id\s*,\s*node_id\s*\)/i,
      );
    });
    it("indexes workflow_id and connector_user_id", () => {
      expect(code).toMatch(/CREATE\s+INDEX\s+workflow_node_connector_bindings_workflow_idx[\s\S]*?\(\s*workflow_id\s*\)/i);
      expect(code).toMatch(/CREATE\s+INDEX\s+workflow_node_connector_bindings_connector_idx[\s\S]*?\(\s*connector_user_id\s*\)/i);
    });
    it("wires the set_updated_at trigger", () => {
      expect(code).toMatch(
        /CREATE\s+TRIGGER\s+workflow_node_connector_bindings_set_updated_at[\s\S]*?EXECUTE\s+FUNCTION\s+public\.set_updated_at\(\)/i,
      );
    });
  });

  describe("RLS + GRANTs", () => {
    it("enables RLS", () => {
      expect(code).toMatch(
        /ALTER\s+TABLE\s+public\.workflow_node_connector_bindings\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    });
    it("has a membership-gated, freeze-aware SELECT policy", () => {
      expect(code).toMatch(
        /CREATE\s+POLICY\s+workflow_node_connector_bindings_select_account_member\s+ON\s+public\.workflow_node_connector_bindings\s+FOR\s+SELECT/i,
      );
      expect(code).toMatch(/JOIN\s+public\.account_memberships\s+am/i);
      expect(code).toMatch(/am\.user_id\s*=\s*auth\.uid\(\)/i);
      expect(code).toMatch(/a\.deletion_status\s*=\s*'active'/i);
    });
    it("has NO user-facing write policy (writes are service-role only)", () => {
      expect(code).not.toMatch(/FOR\s+INSERT/i);
      expect(code).not.toMatch(/FOR\s+UPDATE/i);
      expect(code).not.toMatch(/FOR\s+DELETE/i);
    });
    it("grants SELECT to authenticated and all to service_role", () => {
      expect(code).toMatch(/GRANT\s+SELECT\s+ON\s+public\.workflow_node_connector_bindings\s+TO\s+authenticated/i);
      expect(code).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.workflow_node_connector_bindings\s+TO\s+service_role/i,
      );
    });
  });

  describe("hard fences", () => {
    it("does NOT duplicate the provider classification map in SQL", () => {
      expect(code).not.toMatch(/'gmail'/i);
      expect(code).not.toMatch(/'slack'/i);
    });
    it("touches NO OAuth/integration token material", () => {
      expect(code).not.toMatch(/access_token|refresh_token|encrypted|integration_sharing_scope/i);
    });
    it("performs NO backfill / data write", () => {
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    });
  });
});
