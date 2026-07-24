/**
 * @jest-environment node
 *
 * Static guard for the dismissed-suggestion table (5.TRUCK-BRIDGE-1 CS-5).
 *
 * Reads the migration SQL (no DB) so CI proves, on every run:
 *   - account_id is the sole ownership column, CASCADE,
 *   - the provenance FK is ON DELETE SET NULL (a dismissal outlives its author),
 *   - every bounding CHECK, including the evidence-fingerprint bound,
 *   - the PARTIAL unique index (one live dismissal per pair) so archiving frees
 *     the pair for a new rejection,
 *   - RLS enabled, membership-gated + freeze-aware SELECT policy, NO write policy,
 *   - the MANDATORY anon/authenticated REVOKE BEFORE the service-role GRANT
 *     (this project's default privileges grant ALL on new public tables — see
 *     20260725000000 — so granting narrowly does not end up narrow),
 *   - no credential / integration-id / VIN / plate column ever appears.
 *
 * Live cascade / uniqueness / REVOKE proofs are the opt-in DB harness
 * (tests/integration/security/account-resource-link-dismissals-rls.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILE = "20260731000000_account_resource_link_dismissals.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("CS-5 — account_resource_link_dismissals table + columns", () => {
  it("creates the table", () => {
    expect(code).toMatch(/CREATE\s+TABLE\s+public\.account_resource_link_dismissals/i);
  });

  it("owns rows by account_id with an ON DELETE CASCADE FK (sole ownership column)", () => {
    expect(code).toMatch(
      /account_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("keeps provenance ON DELETE SET NULL — a dismissal outlives its author", () => {
    expect(code).toMatch(
      /dismissed_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });

  it("requires dismissed_at with NO default (the writer states when)", () => {
    expect(code).toMatch(/dismissed_at\s+timestamptz\s+NOT\s+NULL/i);
    expect(code).not.toMatch(/dismissed_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT/i);
  });

  it("carries a soft-lifecycle archived_at", () => {
    expect(code).toMatch(/archived_at\s+timestamptz/i);
  });

  it("bounds resource_kind, match_tier, both provider ids, both external ids, and the fingerprint", () => {
    expect(code).toMatch(/CHECK\s*\(resource_kind\s+IN\s*\('vehicle'\)\)/i);
    expect(code).toMatch(/CHECK\s*\(match_tier\s+IN\s*\('vin',\s*'plate',\s*'number',\s*'name'\)\)/i);
    for (const col of [
      "source_provider",
      "target_provider",
      "source_external_id",
      "target_external_id",
      "evidence_fingerprint",
    ]) {
      expect(code).toMatch(new RegExp(`btrim\\(${col}\\)\\s*<>\\s*''`, "i"));
      expect(code).toMatch(new RegExp(`length\\(${col}\\)\\s*<=\\s*\\d+`, "i"));
    }
    // The fingerprint is the one bounded at 512 (evidence sentences, not ids).
    expect(code).toMatch(/length\(evidence_fingerprint\)\s*<=\s*512/i);
  });

  it("rejects a self-referential dismissal, mirroring the links table", () => {
    expect(code).toMatch(/arld_distinct_sides/i);
    expect(code).toMatch(
      /source_provider\s*<>\s*target_provider\s+OR\s+source_external_id\s*<>\s*target_external_id/i,
    );
  });

  it("stores NO credential, integration id, or workflow id", () => {
    for (const banned of [
      "access_token",
      "refresh_token",
      "api_key",
      "account_token",
      "credential",
      "integration_id",
      "workflow_id",
      "encrypted",
    ]) {
      expect(code.toLowerCase()).not.toContain(banned);
    }
  });

  it("stores NO vehicle identity column (no VIN, no plate, no make/model/year)", () => {
    // Column-oriented rather than substring-oriented: `'vin'` legitimately
    // appears as a match_tier ENUM VALUE, which is a tier name, not the VIN
    // itself. What must never exist is a COLUMN holding fleet identity data —
    // this table stores the rejected PAIR and the sentence the user read.
    const columnBlock = code.match(/CREATE\s+TABLE[^(]*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
    for (const banned of [
      /^\s*vin\s+/im,
      /^\s*license_plate\s+/im,
      /^\s*make\s+/im,
      /^\s*model\s+/im,
      /^\s*year\s+/im,
    ]) {
      expect(columnBlock).not.toMatch(banned);
    }
  });
});

describe("CS-5 — indexes", () => {
  it("enforces ONE ACTIVE dismissal per pair, partially (archiving frees it)", () => {
    expect(code).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+account_resource_link_dismissals_pair_unique[\s\S]*?WHERE\s+archived_at\s+IS\s+NULL/i,
    );
  });

  it("keys that index on the PAIR, not on the evidence fingerprint", () => {
    const idx = code.match(
      /CREATE\s+UNIQUE\s+INDEX\s+account_resource_link_dismissals_pair_unique([\s\S]*?);/i,
    )?.[1];
    expect(idx).toBeTruthy();
    expect(idx).toMatch(/account_id/i);
    expect(idx).toMatch(/source_external_id/i);
    expect(idx).toMatch(/target_external_id/i);
    // A per-fingerprint index would accumulate a row per evidence variant.
    expect(idx).not.toMatch(/evidence_fingerprint/i);
  });

  it("indexes the account listing read", () => {
    expect(code).toMatch(/CREATE\s+INDEX\s+account_resource_link_dismissals_account_idx/i);
  });

  it("installs the canonical set_updated_at trigger", () => {
    expect(code).toMatch(/EXECUTE\s+FUNCTION\s+public\.set_updated_at\(\)/i);
  });
});

describe("CS-5 — RLS + GRANT posture", () => {
  it("enables row level security", () => {
    expect(code).toMatch(
      /ALTER\s+TABLE\s+public\.account_resource_link_dismissals\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("REVOKEs anon AND authenticated — and does so BEFORE any GRANT", () => {
    const revokeAnon = code.search(/REVOKE\s+ALL\s+ON\s+public\.account_resource_link_dismissals\s+FROM\s+anon/i);
    const revokeAuthed = code.search(
      /REVOKE\s+ALL\s+ON\s+public\.account_resource_link_dismissals\s+FROM\s+authenticated/i,
    );
    const grant = code.search(/GRANT\s+SELECT[^;]*TO\s+service_role/i);
    expect(revokeAnon).toBeGreaterThan(-1);
    expect(revokeAuthed).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(-1);
    // Order matters: a REVOKE after the GRANT would strip nothing useful and the
    // default-privileges surplus would survive.
    expect(revokeAnon).toBeLessThan(grant);
    expect(revokeAuthed).toBeLessThan(grant);
  });

  it("grants the Data API to service_role ONLY", () => {
    expect(code).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.account_resource_link_dismissals\s+TO\s+service_role/i,
    );
    expect(code).not.toMatch(/GRANT[^;]*TO\s+authenticated/i);
    expect(code).not.toMatch(/GRANT[^;]*TO\s+anon/i);
  });

  it("has a membership-gated, freeze-aware SELECT policy and NO write policy", () => {
    expect(code).toMatch(/CREATE\s+POLICY\s+account_resource_link_dismissals_select_account_member/i);
    expect(code).toMatch(/FOR\s+SELECT/i);
    expect(code).toMatch(/am\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(code).toMatch(/a\.deletion_status\s*=\s*'active'/i);
    // RLS denies any command with no matching policy, so the absence of an
    // INSERT/UPDATE/DELETE policy is the write protection.
    expect(code).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE)/i);
  });
});

describe("CS-5 — documented intent", () => {
  it("states plainly that a dismissal is NOT a link and is unreachable from execution", () => {
    expect(sql).toMatch(/NOT a link/i);
    expect(sql).toMatch(/find_linked_vehicle/i);
  });

  it("explains the evidence fingerprint's purpose rather than leaving it cryptic", () => {
    expect(sql).toMatch(/evidence_fingerprint/i);
    expect(sql).toMatch(/materially|unchanged|equality/i);
  });
});
