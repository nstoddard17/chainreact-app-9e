/**
 * @jest-environment node
 *
 * Static guard for the active_account_id column (Slice 4.ACCOUNT-MODEL-11a).
 *
 * Reads the migration SQL (no DB) so CI proves, on every run, the hard fences of
 * this migration-only slice:
 *   - user_profiles gains a nullable active_account_id with an accounts FK that is
 *     ON DELETE SET NULL (the self-healing pointer from the switcher plan).
 *   - It is ADDITIVE: no backfill, no RLS-policy change, no other table touched,
 *     no team/org schema, no FK loosening.
 *
 * The live column-exists + ON DELETE SET NULL proof is the opt-in DB harness
 * (tests/integration/migrations/user-profiles-active-account-id.dev.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260531000009_user_profiles_active_account_id.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("4.ACCOUNT-MODEL-11a — user_profiles.active_account_id (static guards)", () => {
  it("adds a nullable active_account_id column to user_profiles", () => {
    expect(code).toMatch(
      /ALTER\s+TABLE\s+public\.user_profiles\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+active_account_id\s+uuid/i,
    );
    // nullable: no NOT NULL on the new column.
    expect(code).not.toMatch(/active_account_id\s+uuid[^;]*NOT\s+NULL/i);
  });

  it("references accounts(id) ON DELETE SET NULL (self-healing pointer)", () => {
    expect(code).toMatch(
      /REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });

  it("is idempotent (IF NOT EXISTS)", () => {
    expect(code).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  });

  describe("hard fences — additive only", () => {
    it("performs NO backfill (NULL is the launch default)", () => {
      expect(code).not.toMatch(/UPDATE\s+public\.user_profiles/i);
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
    });

    it("does NOT create or alter any RLS policy", () => {
      expect(code).not.toMatch(/CREATE\s+POLICY/i);
      expect(code).not.toMatch(/DROP\s+POLICY/i);
      expect(code).not.toMatch(/ALTER\s+POLICY/i);
    });

    it("touches ONLY user_profiles (no accounts/memberships/hot-table changes)", () => {
      // The only ALTER TABLE is on user_profiles.
      const alterTargets = [...code.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi)].map(
        (m) => m[1]!.toLowerCase(),
      );
      expect(alterTargets).toEqual(["user_profiles"]);
      // No team/org schema, no FK loosening, no new table.
      expect(code).not.toMatch(/CREATE\s+TABLE/i);
      expect(code).not.toMatch(/DROP\s+CONSTRAINT/i);
      expect(code).not.toMatch(/handle_new_user/i);
    });

    it("does NOT touch resolver/route source (migration-only slice)", () => {
      // Belt-and-suspenders: the migration file is pure SQL — no helper names leak.
      expect(code).not.toMatch(/resolveActiveAccount|setActiveAccount|requireUserWithAccount/i);
    });
  });
});
