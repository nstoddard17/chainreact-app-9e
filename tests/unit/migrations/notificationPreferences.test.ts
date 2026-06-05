/**
 * @jest-environment node
 *
 * Static guard for the notification-preference columns (Slice 4.ACCOUNT-SETTINGS-4).
 *
 * Reads the migration SQL (no DB) so CI proves, on every run, the hard fences of
 * this additive slice:
 *   - user_profiles gains three boolean toggles, NOT NULL with the documented
 *     defaults (workflow alerts + team activity ON, product updates OFF).
 *   - It is ADDITIVE: no new table, no RLS-policy change, no other table touched,
 *     no backfill UPDATE — the columns inherit user_profiles' existing RLS.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260605000002_user_profiles_notification_preferences.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("4.ACCOUNT-SETTINGS-4 — notification preference columns (static guards)", () => {
  it("adds three boolean columns to user_profiles, idempotently", () => {
    for (const col of [
      "notify_product_updates",
      "notify_workflow_alerts",
      "notify_team_activity",
    ]) {
      expect(code).toMatch(
        new RegExp(
          `ALTER\\s+TABLE\\s+public\\.user_profiles\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\s+boolean\\s+NOT\\s+NULL\\s+DEFAULT`,
          "i",
        ),
      );
    }
  });

  it("uses the documented defaults — alerts/activity ON, product updates OFF", () => {
    expect(code).toMatch(/notify_product_updates\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i);
    expect(code).toMatch(/notify_workflow_alerts\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i);
    expect(code).toMatch(/notify_team_activity\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i);
  });

  describe("hard fences — additive only", () => {
    it("creates no new table and changes no RLS policy", () => {
      expect(code).not.toMatch(/CREATE\s+TABLE/i);
      expect(code).not.toMatch(/CREATE\s+POLICY/i);
      expect(code).not.toMatch(/DROP\s+POLICY/i);
      expect(code).not.toMatch(/ALTER\s+POLICY/i);
      expect(code).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    });

    it("touches ONLY user_profiles and performs no backfill UPDATE", () => {
      const alterTargets = [
        ...code.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi),
      ].map((m) => m[1]!.toLowerCase());
      expect(new Set(alterTargets)).toEqual(new Set(["user_profiles"]));
      expect(code).not.toMatch(/UPDATE\s+public\.user_profiles/i);
      expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code).not.toMatch(/handle_new_user/i);
    });

    it("adds no notification delivery / per-account columns", () => {
      expect(code).not.toMatch(/email|smtp|webhook|slack|digest|account_id/i);
    });
  });
});
