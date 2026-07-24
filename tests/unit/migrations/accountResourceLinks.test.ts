/**
 * @jest-environment node
 *
 * Static guard for the account_resource_links foundation
 * (5.TRUCK-BRIDGE-1 CS-1).
 *
 * Reads the migration SQL (no DB) so CI proves, on every run, the foundation
 * shape + hard fences:
 *   - the table is created with the documented columns, FKs and CHECKs,
 *   - the two partial-unique "active link" indexes, scoped per source provider,
 *   - RLS enabled with a membership-gated, freeze-aware SELECT policy and NO
 *     write policy (writes are service-role),
 *   - the MANDATORY anon/authenticated REVOKE (this project's default
 *     privileges grant ALL on new public tables — see 20260725000000), then a
 *     service-role-only GRANT,
 *   - the set_updated_at trigger,
 *   - no secret / credential / integration-id / workflow-id column,
 *   - the deferred provider-account-discriminator limitation is documented
 *     rather than silently implied to be solved.
 *
 * The live RLS + cascade + partial-unique proofs are the opt-in DB harness
 * (tests/integration/security/account-resource-links-rls.test.ts), which cannot
 * run until this migration is applied.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILE = "20260729000000_account_resource_links.sql";

const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("CS-1 — account_resource_links table + columns (static guards)", () => {
  it("creates the table", () => {
    expect(code).toMatch(/CREATE\s+TABLE\s+public\.account_resource_links/i);
  });

  it("owns rows by account_id with an ON DELETE CASCADE FK (sole ownership column)", () => {
    expect(code).toMatch(
      /account_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("records BOTH audit user ids as provenance with ON DELETE SET NULL", () => {
    // SET NULL (not CASCADE): a deleted user must not delete the account's link.
    expect(code).toMatch(
      /created_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
    expect(code).toMatch(
      /confirmed_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });

  it("requires confirmed_at with NO default (every row is a confirmed link)", () => {
    expect(code).toMatch(/confirmed_at\s+timestamptz\s+NOT\s+NULL\s*,/i);
    expect(code).not.toMatch(/confirmed_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT/i);
  });

  it("carries every documented column", () => {
    for (const col of [
      "id",
      "account_id",
      "resource_kind",
      "source_provider",
      "source_external_id",
      "target_provider",
      "target_external_id",
      "source_label",
      "target_label",
      "match_basis",
      "created_by_user_id",
      "confirmed_by_user_id",
      "confirmed_at",
      "archived_at",
      "created_at",
      "updated_at",
    ]) {
      expect(code).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("stores NO secret, credential, integration-id, workflow-id, or vehicle-metadata column", () => {
    // The only vehicle metadata permitted is the two display-label snapshots.
    for (const forbidden of [
      "token",
      "secret",
      "encrypted",
      "credential",
      "integration_id",
      "workflow_id",
      "access_token",
      "\\bvin\\b",
      "license_plate",
      "\\bmake\\b",
      "\\bmodel\\b",
      "payload",
      "raw_response",
    ]) {
      expect(code).not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("has no user-owned authorization column (ownership is account_id alone)", () => {
    // A `user_id` / `owner_user_id` column would create a second, competing
    // ownership axis. Provenance columns are explicitly `*_by_user_id`.
    expect(code).not.toMatch(/\bowner_user_id\b/i);
    expect(code).not.toMatch(/^\s*user_id\s+uuid/im);
  });
});

describe("CS-1 — CHECK constraints", () => {
  it("restricts resource_kind to 'vehicle' in v1", () => {
    expect(code).toMatch(
      /CHECK\s*\(\s*resource_kind\s+IN\s*\(\s*'vehicle'\s*\)\s*\)/i,
    );
  });

  it("restricts match_basis to exactly the five planned values", () => {
    const m = code.match(/CHECK\s*\(\s*match_basis\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    const values = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(values.sort()).toEqual(
      [
        "manual",
        "suggested_name",
        "suggested_number",
        "suggested_plate",
        "suggested_vin",
      ].sort(),
    );
  });

  it("rejects blank/over-long provider ids and external resource ids", () => {
    for (const col of [
      "source_provider",
      "source_external_id",
      "target_provider",
      "target_external_id",
    ]) {
      expect(code).toMatch(
        new RegExp(`CHECK\\s*\\(\\s*btrim\\(${col}\\)\\s*<>\\s*''`, "i"),
      );
      expect(code).toMatch(new RegExp(`length\\(${col}\\)\\s*<=\\s*\\d+`, "i"));
    }
  });

  it("bounds the optional label snapshots without requiring them", () => {
    for (const col of ["source_label", "target_label"]) {
      expect(code).toMatch(
        new RegExp(`${col}\\s+IS\\s+NULL\\s+OR\\s+length\\(${col}\\)\\s*<=\\s*\\d+`, "i"),
      );
    }
  });

  it("rejects a self-link (same provider AND same id on both sides)", () => {
    expect(code).toMatch(/account_resource_links_distinct_sides/i);
    expect(code).toMatch(
      /source_provider\s*<>\s*target_provider\s+OR\s+source_external_id\s*<>\s*target_external_id/i,
    );
  });
});

describe("CS-1 — active-link uniqueness indexes", () => {
  it("scopes the SOURCE unique index to live rows only", () => {
    const m = code.match(
      /CREATE\s+UNIQUE\s+INDEX\s+account_resource_links_source_unique[\s\S]*?WHERE\s+archived_at\s+IS\s+NULL/i,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(
      /\(\s*account_id,\s*resource_kind,\s*source_provider,\s*source_external_id,\s*target_provider\s*\)/i,
    );
  });

  it("scopes the TARGET unique index to live rows only", () => {
    const m = code.match(
      /CREATE\s+UNIQUE\s+INDEX\s+account_resource_links_target_unique[\s\S]*?WHERE\s+archived_at\s+IS\s+NULL/i,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(
      /\(\s*account_id,\s*resource_kind,\s*source_provider,\s*target_provider,\s*target_external_id\s*\)/i,
    );
  });

  it("keys BOTH indexes on source_provider so two telematics systems may target one vehicle", () => {
    // Motive vehicle A → Fleetio X and Samsara vehicle B → Fleetio X must both
    // be legal. That is only true while source_provider is part of the TARGET
    // index key — otherwise the second link collides with the first.
    const target = code.match(
      /CREATE\s+UNIQUE\s+INDEX\s+account_resource_links_target_unique[\s\S]*?;/i,
    );
    expect(target).not.toBeNull();
    expect(target![0]).toMatch(/source_provider/i);
  });

  it("keys both indexes on account_id so two accounts may use identical provider ids", () => {
    for (const name of ["source", "target"]) {
      const m = code.match(
        new RegExp(
          `CREATE\\s+UNIQUE\\s+INDEX\\s+account_resource_links_${name}_unique[\\s\\S]*?;`,
          "i",
        ),
      );
      expect(m![0]).toMatch(/\(\s*account_id,/i);
    }
  });

  it("indexes the account listing path", () => {
    expect(code).toMatch(
      /CREATE\s+INDEX\s+account_resource_links_account_idx[\s\S]*?\(\s*account_id,\s*resource_kind,\s*created_at\s+DESC\s*\)/i,
    );
  });
});

describe("CS-1 — RLS, GRANTs, and the mandatory REVOKE", () => {
  it("enables row level security", () => {
    expect(code).toMatch(
      /ALTER\s+TABLE\s+public\.account_resource_links\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("REVOKEs the project's default anon + authenticated privileges", () => {
    // Non-negotiable: this project carries ALTER DEFAULT PRIVILEGES granting ALL
    // on new public tables to anon + authenticated (see 20260725000000). Without
    // these two REVOKEs the table ships world-writable via the Data API and the
    // service-role-only contract is fiction.
    expect(code).toMatch(/REVOKE\s+ALL\s+ON\s+public\.account_resource_links\s+FROM\s+anon/i);
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+public\.account_resource_links\s+FROM\s+authenticated/i,
    );
  });

  it("REVOKEs before it GRANTs (order is load-bearing)", () => {
    const revoke = code.search(/REVOKE\s+ALL\s+ON\s+public\.account_resource_links/i);
    const grant = code.search(/GRANT\s+[\s\S]*?ON\s+public\.account_resource_links/i);
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });

  it("grants Data API access to service_role ONLY", () => {
    expect(code).toMatch(
      /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.account_resource_links\s+TO\s+service_role/i,
    );
    // No anon grant at all, and no authenticated grant in CS-1 (no route/UI yet).
    expect(code).not.toMatch(/GRANT[^;]*ON\s+public\.account_resource_links[^;]*TO\s+anon/i);
    expect(code).not.toMatch(
      /GRANT[^;]*ON\s+public\.account_resource_links[^;]*TO\s+authenticated/i,
    );
  });

  it("has a membership-gated, freeze-aware SELECT policy (defense-in-depth)", () => {
    const policy = code.match(
      /CREATE\s+POLICY\s+account_resource_links_select_account_member[\s\S]*?;/i,
    );
    expect(policy).not.toBeNull();
    expect(policy![0]).toMatch(/FOR\s+SELECT/i);
    expect(policy![0]).toMatch(/public\.account_memberships/i);
    expect(policy![0]).toMatch(/am\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(policy![0]).toMatch(/a\.deletion_status\s*=\s*'active'/i);
  });

  it("defines NO write policy — RLS denies unmatched commands, so writes stay service-role", () => {
    const policies = [...code.matchAll(/CREATE\s+POLICY\s+(\w+)[\s\S]*?FOR\s+(\w+)/gi)];
    expect(policies.length).toBe(1);
    expect(policies[0]![2]!.toUpperCase()).toBe("SELECT");
  });

  it("installs the canonical updated_at trigger", () => {
    expect(code).toMatch(
      /CREATE\s+TRIGGER\s+account_resource_links_set_updated_at[\s\S]*?EXECUTE\s+FUNCTION\s+public\.set_updated_at\(\)/i,
    );
  });
});

describe("CS-1 — documented honesty", () => {
  it("documents the deferred provider-account discriminator limitation", () => {
    // The schema cannot distinguish two Fleetio accounts inside one ChainReact
    // account. That must be stated, not implied away.
    expect(sql).toMatch(/source_provider_account_id/i);
    expect(sql).toMatch(/target_provider_account_id/i);
    expect(sql).toMatch(/DEFERRED LIMITATION/i);
  });

  it("does NOT add the deferred discriminator columns to the table itself", () => {
    expect(code).not.toMatch(/source_provider_account_id/i);
    expect(code).not.toMatch(/target_provider_account_id/i);
  });

  it("states that provenance is never authorization", () => {
    expect(sql).toMatch(/PROVENANCE ONLY/i);
    expect(sql).toMatch(/never|NEVER/);
  });

  it("states that the service role bypasses RLS and the repository is the tenant boundary", () => {
    expect(sql).toMatch(/service role BYPASSES RLS/i);
    expect(sql).toMatch(/account_id.*predicate|predicate.*account_id/i);
  });
});
