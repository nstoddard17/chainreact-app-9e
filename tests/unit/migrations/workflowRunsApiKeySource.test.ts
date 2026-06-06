/**
 * @jest-environment node
 *
 * Static guard for the API-key run-provenance migration
 * (Slice 4.API-KEYS-RUN-HISTORY-2 / RH-1). Reads the migration SQL (no DB) so CI
 * proves the additive, null-safe shape on every run:
 *   - the triggered_by CHECK is dropped + recreated INCLUDING 'api_key' (and still
 *     including every prior value),
 *   - a nullable triggered_by_api_key_id FK → account_api_keys(id) ON DELETE SET NULL,
 *   - a nullable triggered_by_api_key_prefix (non-secret snapshot),
 *   - NO raw key / key_hash column is added to workflow_runs.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260609000000_workflow_runs_api_key_source.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("RH-1 — workflow_runs api_key source migration (static guards)", () => {
  describe("triggered_by CHECK", () => {
    it("drops then recreates the named constraint", () => {
      expect(code).toMatch(/DROP\s+CONSTRAINT\s+workflow_runs_triggered_by_chk/i);
      expect(code).toMatch(/ADD\s+CONSTRAINT\s+workflow_runs_triggered_by_chk\s+CHECK/i);
    });

    it("includes 'api_key' in the recreated CHECK", () => {
      expect(code).toMatch(/CHECK\s*\(\s*triggered_by\s+IN\s*\([\s\S]*'api_key'[\s\S]*\)\s*\)/i);
    });

    it("preserves every prior triggered_by value", () => {
      for (const v of ["manual", "test", "webhook", "scheduled", "retry", "unknown"]) {
        expect(code).toMatch(new RegExp(`'${v}'`));
      }
    });
  });

  describe("attribution columns (additive + null-safe)", () => {
    it("adds a nullable triggered_by_api_key_id FK with ON DELETE SET NULL", () => {
      expect(code).toMatch(
        /ADD\s+COLUMN\s+triggered_by_api_key_id\s+uuid\s+REFERENCES\s+public\.account_api_keys\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
      );
      // Nullable — never declared NOT NULL.
      expect(code).not.toMatch(/triggered_by_api_key_id\s+uuid[\s\S]*?NOT\s+NULL/i);
    });

    it("adds a nullable triggered_by_api_key_prefix text column", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+triggered_by_api_key_prefix\s+text/i);
      expect(code).not.toMatch(/triggered_by_api_key_prefix\s+text[\s\S]*?NOT\s+NULL/i);
    });
  });

  describe("no-secret guarantee", () => {
    it("adds no raw-key or key_hash column to workflow_runs", () => {
      expect(code).not.toMatch(/ADD\s+COLUMN[^\n;]*key_hash/i);
      expect(code).not.toMatch(/ADD\s+COLUMN[^\n;]*raw[_\s]?key/i);
    });
  });
});
