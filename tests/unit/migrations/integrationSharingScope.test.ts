/**
 * @jest-environment node
 *
 * Static guard for the explicit-connection-sharing column
 * (Slice 4.CONN-SHARE / CS-1). Reads the migration SQL (no DB) so CI proves the
 * shape + the behavior-inert fences on every run:
 *   - additive nullable `integration_sharing_scope text` on public.integrations,
 *   - CHECK allows NULL OR one of exactly two known values,
 *   - NO backfill (no INSERT / UPDATE),
 *   - NO RLS change (no ENABLE RLS, no CREATE/DROP POLICY),
 *   - touches NO OAuth/integration token material,
 *   - operates ONLY on public.integrations (no other table touched).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILE = "20260622000000_add_integration_sharing_scope.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("CS-1 — integration_sharing_scope column (static guards)", () => {
  describe("additive nullable column", () => {
    it("adds integration_sharing_scope text to public.integrations", () => {
      expect(code).toMatch(
        /ALTER\s+TABLE\s+public\.integrations\s+ADD\s+COLUMN\s+integration_sharing_scope\s+text/i,
      );
    });

    it("does NOT declare the column NOT NULL (nullable = unset/derive-default state)", () => {
      expect(code).not.toMatch(/integration_sharing_scope\s+text\s+NOT\s+NULL/i);
    });
  });

  describe("CHECK constraint", () => {
    it("allows NULL OR exactly the two known values", () => {
      expect(code).toMatch(
        /CHECK\s*\(\s*integration_sharing_scope\s+IS\s+NULL\s+OR\s+integration_sharing_scope\s+IN\s*\(\s*'private_to_connector'\s*,\s*'shared_with_account'\s*\)\s*\)/i,
      );
    });

    it("names the constraint", () => {
      expect(code).toMatch(/ADD\s+CONSTRAINT\s+integrations_sharing_scope_chk/i);
    });

    it("permits no other scope literal", () => {
      const literals = [...code.matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);
      expect(new Set(literals)).toEqual(new Set(["private_to_connector", "shared_with_account"]));
    });
  });

  describe("behavior-inert fences", () => {
    it("performs NO backfill / data write", () => {
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code).not.toMatch(/\bUPDATE\s+public\./i);
    });

    it("makes NO RLS change (no ENABLE RLS, no CREATE/DROP POLICY)", () => {
      expect(code).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(code).not.toMatch(/CREATE\s+POLICY/i);
      expect(code).not.toMatch(/DROP\s+POLICY/i);
    });

    it("touches NO OAuth/integration token material", () => {
      expect(code).not.toMatch(/access_token/i);
      expect(code).not.toMatch(/refresh_token/i);
      expect(code).not.toMatch(/encrypted/i);
    });

    it("operates ONLY on public.integrations", () => {
      const tablesTouched = [...code.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi)].map((m) =>
        m[1]!.toLowerCase(),
      );
      expect(new Set(tablesTouched)).toEqual(new Set(["integrations"]));
    });

    it("creates NO new table (so no RLS/GRANT obligation)", () => {
      expect(code).not.toMatch(/CREATE\s+TABLE/i);
    });
  });
});
