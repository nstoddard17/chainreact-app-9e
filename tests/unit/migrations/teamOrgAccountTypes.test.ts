/**
 * @jest-environment node
 *
 * Static guard for the type/role CHECK relaxations (Slice 4.ACCOUNT-MODEL-13).
 * Reads the migration SQL (no DB) so CI proves the hard fences:
 *   - accounts.type CHECK relaxed to personal|team|organization.
 *   - account_memberships.role CHECK relaxed to owner|admin|member.
 *   - additive only: no new table, no data writes, no policy/trigger/index change,
 *     no FK change.
 *
 * The live accept/reject proof is the opt-in DB harness
 * (tests/integration/migrations/team-org-account-types.dev.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260531000010_team_org_account_types.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("4.ACCOUNT-MODEL-13 — type/role CHECK relaxation (static guards)", () => {
  it("relaxes accounts.type to personal | team | organization", () => {
    expect(code).toMatch(
      /ADD\s+CONSTRAINT\s+accounts_type_check\s+CHECK\s*\(\s*type\s+IN\s*\(\s*'personal'\s*,\s*'team'\s*,\s*'organization'\s*\)\s*\)/i,
    );
  });

  it("relaxes account_memberships.role to owner | admin | member", () => {
    expect(code).toMatch(
      /ADD\s+CONSTRAINT\s+account_memberships_role_check\s+CHECK\s*\(\s*role\s+IN\s*\(\s*'owner'\s*,\s*'admin'\s*,\s*'member'\s*\)\s*\)/i,
    );
  });

  it("drops the old CHECKs name-agnostically (introspection, idempotent)", () => {
    expect(code).toMatch(/FROM\s+pg_constraint/i);
    expect(code).toMatch(/DROP\s+CONSTRAINT/i);
  });

  describe("hard fences — additive only", () => {
    it("creates no table and writes no rows", () => {
      expect(code).not.toMatch(/CREATE\s+TABLE/i);
      expect(code).not.toMatch(/INSERT\s+INTO/i);
      expect(code).not.toMatch(/UPDATE\s+public\./i);
    });

    it("changes no policy, trigger, index, or FK", () => {
      expect(code).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY|ALTER\s+POLICY/i);
      expect(code).not.toMatch(/CREATE\s+TRIGGER|DROP\s+TRIGGER/i);
      expect(code).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX/i);
      expect(code).not.toMatch(/FOREIGN\s+KEY|REFERENCES/i);
      expect(code).not.toMatch(/handle_new_user|enforce_personal_invariants/i);
    });

    it("only touches accounts + account_memberships", () => {
      const alterTargets = [...code.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi)].map(
        (m) => m[1]!.toLowerCase(),
      );
      expect(new Set(alterTargets)).toEqual(
        new Set(["accounts", "account_memberships"]),
      );
    });
  });
});
