/**
 * @jest-environment node
 *
 * Static guard for the workflow_node_credentials foundation
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-2 / CS-1).
 *
 * Reads the migration SQL (no DB) so CI proves, on every run, the foundation
 * shape + hard fences:
 *   - the side table is created with the documented columns + FKs,
 *   - the status CHECK + the partial-unique "one live grant per node" index,
 *   - RLS enabled with a membership-gated, freeze-aware SELECT policy and NO
 *     user-facing write policy (writes are service-role),
 *   - explicit Data API GRANTs (SELECT→authenticated, all→service_role),
 *   - the set_updated_at trigger,
 *   - the provider classification map is NOT duplicated in SQL,
 *   - the slice is additive (no change to workflows / created_by_user_id / the
 *     22B resolution seam).
 *
 * The live RLS + cascade + partial-unique proofs are the opt-in DB harness
 * (tests/integration/security/workflow-node-credentials-rls.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILE = "20260606000000_workflow_node_credentials.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("CS-1 — workflow_node_credentials foundation (static guards)", () => {
  describe("table + columns", () => {
    it("creates the side table", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.workflow_node_credentials/i);
    });

    it("keys the workflow with an ON DELETE CASCADE FK", () => {
      expect(code).toMatch(
        /workflow_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.workflows\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      );
    });

    it("carries node_id + provider + a NOT NULL owner with ON DELETE CASCADE", () => {
      expect(code).toMatch(/node_id\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/provider\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(
        /credential_owner_user_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      );
    });

    it("records requester provenance with ON DELETE SET NULL (not authorization)", () => {
      expect(code).toMatch(
        /requested_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      );
    });

    it("has the four-state status CHECK", () => {
      expect(code).toMatch(
        /status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'pending'/i,
      );
      expect(code).toMatch(
        /CHECK\s*\(\s*status\s+IN\s*\(\s*'pending',\s*'accepted',\s*'declined',\s*'revoked'\s*\)\s*\)/i,
      );
    });

    it("has the lifecycle timestamps", () => {
      for (const col of ["requested_at", "decided_at", "created_at", "updated_at"]) {
        expect(code).toMatch(new RegExp(`\\b${col}\\b`));
      }
    });
  });

  describe("indexes", () => {
    it("enforces one LIVE (pending|accepted) grant per (workflow_id, node_id), keeping history", () => {
      expect(code).toMatch(
        /CREATE\s+UNIQUE\s+INDEX\s+workflow_node_credentials_one_live_per_node\s+ON\s+public\.workflow_node_credentials\s*\(\s*workflow_id,\s*node_id\s*\)\s*WHERE\s+status\s+IN\s*\(\s*'pending',\s*'accepted'\s*\)/i,
      );
    });

    it("indexes accepted grants by owner for offboarding (CS-6)", () => {
      expect(code).toMatch(
        /CREATE\s+INDEX\s+workflow_node_credentials_owner_idx[\s\S]*?credential_owner_user_id[\s\S]*?WHERE\s+status\s*=\s*'accepted'/i,
      );
    });
  });

  describe("RLS + GRANTs", () => {
    it("enables RLS", () => {
      expect(code).toMatch(
        /ALTER\s+TABLE\s+public\.workflow_node_credentials\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    });

    it("has a membership-gated, freeze-aware SELECT policy through the workflow's account", () => {
      expect(code).toMatch(
        /CREATE\s+POLICY\s+workflow_node_credentials_select_account_member\s+ON\s+public\.workflow_node_credentials\s+FOR\s+SELECT/i,
      );
      expect(code).toMatch(/FROM\s+public\.workflows\s+w/i);
      expect(code).toMatch(/JOIN\s+public\.account_memberships\s+am\s+ON\s+am\.account_id\s*=\s*w\.account_id/i);
      expect(code).toMatch(/a\.deletion_status\s*=\s*'active'/i);
    });

    it("has NO user-facing write policy (writes are service-role only)", () => {
      expect(code).not.toMatch(/FOR\s+INSERT/i);
      expect(code).not.toMatch(/FOR\s+UPDATE/i);
      expect(code).not.toMatch(/FOR\s+DELETE/i);
    });

    it("grants SELECT to authenticated and all writes to service_role", () => {
      expect(code).toMatch(
        /GRANT\s+SELECT\s+ON\s+public\.workflow_node_credentials\s+TO\s+authenticated/i,
      );
      expect(code).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.workflow_node_credentials\s+TO\s+service_role/i,
      );
      // authenticated must NOT get write grants.
      expect(code).not.toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.workflow_node_credentials\s+TO\s+authenticated/i,
      );
    });

    it("wires the set_updated_at trigger", () => {
      expect(code).toMatch(
        /CREATE\s+TRIGGER\s+workflow_node_credentials_set_updated_at[\s\S]*?EXECUTE\s+FUNCTION\s+public\.set_updated_at\(\)/i,
      );
    });
  });

  describe("hard fences (additive, no behavior change)", () => {
    it("does NOT duplicate the personal/account provider map in SQL", () => {
      // Provider classification lives in core/integrations/credentialSharing.ts.
      expect(code).not.toMatch(/provider\s+IN\s*\(/i);
      expect(code).not.toMatch(/\bgmail\b/i);
      expect(code).not.toMatch(/\bslack\b/i);
    });

    it("does NOT touch workflows.created_by_user_id or the workflows definition", () => {
      expect(code).not.toMatch(/ALTER\s+TABLE\s+public\.workflows/i);
      expect(code).not.toMatch(/created_by_user_id\s*=/i);
      expect(code).not.toMatch(/draft_definition/i);
    });

    it("performs no backfill / data write (structure only)", () => {
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    });
  });
});
