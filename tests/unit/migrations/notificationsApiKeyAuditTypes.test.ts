/**
 * @jest-environment node
 *
 * Static guard for the API-key audit notification-type migration
 * (Slice 4.API-KEYS-AUDIT-1). Reads the SQL (no DB) so CI proves the enum is
 * extended idempotently and that no table/policy/secret column is introduced.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260610000000_notifications_api_key_audit_types.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("AUDIT-1 — notification_type api-key audit migration (static guards)", () => {
  it("adds api_key_created + api_key_revoked to notification_type, idempotently", () => {
    expect(code).toMatch(
      /ALTER\s+TYPE\s+public\.notification_type\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'api_key_created'/i,
    );
    expect(code).toMatch(
      /ALTER\s+TYPE\s+public\.notification_type\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'api_key_revoked'/i,
    );
  });

  it("introduces no new table, policy, or secret column", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/CREATE\s+POLICY/i);
    expect(code).not.toMatch(/key_hash|raw[_\s]?key|token/i);
  });
});
