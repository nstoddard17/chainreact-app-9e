/**
 * @jest-environment node
 *
 * Static guard for the workflow templates marketplace expansion
 * (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-2 / CS-XT-4B). Reads the migration SQL (no DB)
 * so CI proves the schema + security fences:
 *   - visibility column + CHECK (private/public/unlisted), source widened to user/official,
 *     account_id made nullable + the account↔source invariant,
 *   - published_at/unpublished_at, fork lineage, creator snapshot, denormalized counters,
 *   - the additive marketplace SELECT policy (authenticated reads official/public/unlisted;
 *     anon excluded) — the private member-only policy is untouched,
 *   - the usage-events ledger table + event-type CHECK + FKs + RLS + service-role-only GRANT
 *     (no authenticated grant) + the counter-bump trigger.
 *
 * Live RLS proofs are the opt-in DB harness
 * (tests/integration/security/workflow-templates-rls.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260617000000_workflow_templates_marketplace.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("CS-XT-4B — workflow templates marketplace expansion (static guards)", () => {
  describe("workflow_templates expansion", () => {
    it("makes account_id nullable + adds the account↔source invariant", () => {
      expect(code).toMatch(/ALTER\s+TABLE\s+public\.workflow_templates\s+ALTER\s+COLUMN\s+account_id\s+DROP\s+NOT\s+NULL/i);
      expect(code).toMatch(/workflow_templates_account_source_invariant/i);
      expect(code).toMatch(/source\s*=\s*'user'\s+AND\s+account_id\s+IS\s+NOT\s+NULL/i);
      expect(code).toMatch(/source\s*=\s*'official'\s+AND\s+account_id\s+IS\s+NULL/i);
    });

    it("widens source to (user, official)", () => {
      expect(code).toMatch(/DROP\s+CONSTRAINT\s+workflow_templates_source_known/i);
      expect(code).toMatch(/CHECK\s*\(\s*source\s+IN\s*\(\s*'user'\s*,\s*'official'\s*\)\s*\)/i);
    });

    it("adds visibility with a private/public/unlisted CHECK (default private)", () => {
      expect(code).toMatch(/visibility\s+text\s+NOT\s+NULL\s+DEFAULT\s+'private'/i);
      expect(code).toMatch(/CHECK\s*\(\s*visibility\s+IN\s*\(\s*'private'\s*,\s*'public'\s*,\s*'unlisted'\s*\)\s*\)/i);
    });

    it("adds publish timestamps, fork lineage, creator snapshot, and counters", () => {
      expect(code).toMatch(/published_at\s+timestamptz/i);
      expect(code).toMatch(/unpublished_at\s+timestamptz/i);
      expect(code).toMatch(/forked_from_template_id\s+uuid\s+REFERENCES\s+public\.workflow_templates\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
      expect(code).toMatch(/creator_display_name_snapshot\s+text/i);
      expect(code).toMatch(/usage_count\s+integer\s+NOT\s+NULL\s+DEFAULT\s+0/i);
      expect(code).toMatch(/fork_count\s+integer\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    });

    it("adds the additive marketplace SELECT policy (auth reads official/public/unlisted; anon excluded)", () => {
      expect(code).toMatch(/CREATE\s+POLICY\s+workflow_templates_select_marketplace\s+ON\s+public\.workflow_templates\s+FOR\s+SELECT/i);
      expect(code).toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
      expect(code).toMatch(/source\s*=\s*'official'\s+OR\s+visibility\s+IN\s*\(\s*'public'\s*,\s*'unlisted'\s*\)/i);
    });

    it("does NOT drop/replace the private member-only policy from CS-XT-4", () => {
      expect(code).not.toMatch(/DROP\s+POLICY[\s\S]*workflow_templates_select_account_member/i);
    });
  });

  describe("workflow_template_usage_events ledger", () => {
    it("creates the table with template CASCADE + actor/account SET NULL FKs", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.workflow_template_usage_events/i);
      expect(code).toMatch(/template_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.workflow_templates\(id\)\s+ON\s+DELETE\s+CASCADE/i);
      expect(code).toMatch(/actor_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
      expect(code).toMatch(/target_account_id\s+uuid\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
    });

    it("constrains event_type to the three known kinds", () => {
      expect(code).toMatch(/event_type\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/CHECK\s*\(\s*event_type\s+IN\s*\(\s*'used_to_create_workflow'\s*,\s*'forked'\s*,\s*'saved_copy'\s*\)\s*\)/i);
    });

    it("indexes template/actor/account/event_type/created_at", () => {
      for (const idx of ["template_idx", "actor_idx", "target_account_idx", "event_type_idx", "created_at_idx"]) {
        expect(code).toMatch(new RegExp(`CREATE\\s+INDEX\\s+workflow_template_usage_events_${idx}`, "i"));
      }
    });

    it("enables RLS and grants ONLY service_role (no authenticated/anon grant)", () => {
      expect(code).toMatch(/ALTER\s+TABLE\s+public\.workflow_template_usage_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(code).toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.workflow_template_usage_events\s+TO\s+service_role/i);
      expect(code).not.toMatch(/ON\s+public\.workflow_template_usage_events\s+TO\s+authenticated/i);
      expect(code).not.toMatch(/ON\s+public\.workflow_template_usage_events\s+TO\s+anon/i);
    });

    it("is marked a system-table (service-role-only ledger) so the RLS linter accepts no tenant policy", () => {
      expect(sql).toMatch(/--\s*system-table:\s*workflow_template_usage_events/i);
    });
  });

  describe("denormalized counter trigger (ledger = source of truth)", () => {
    it("defines a bump function that increments fork_count on 'forked' else usage_count", () => {
      expect(code).toMatch(/CREATE\s+FUNCTION\s+public\.bump_template_usage_counters/i);
      expect(code).toMatch(/fork_count\s*=\s*fork_count\s*\+\s*1/i);
      expect(code).toMatch(/usage_count\s*=\s*usage_count\s*\+\s*1/i);
    });

    it("wires it AFTER INSERT on the usage table", () => {
      expect(code).toMatch(/CREATE\s+TRIGGER\s+workflow_template_usage_events_bump_counters[\s\S]*?AFTER\s+INSERT\s+ON\s+public\.workflow_template_usage_events/i);
    });
  });

  describe("hard fences (no credential access)", () => {
    it("touches no credential / integration material", () => {
      expect(code).not.toMatch(/access_token/i);
      expect(code).not.toMatch(/refresh_token/i);
      expect(code).not.toMatch(/workflow_node_credentials/i);
    });
  });
});
