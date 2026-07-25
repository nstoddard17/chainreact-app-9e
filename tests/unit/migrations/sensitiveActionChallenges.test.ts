/**
 * @jest-environment node
 *
 * Static guard for the sensitive-action challenge migration
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1). Reads the migration SQL (no DB) so
 * CI proves the shape + the service-role-only fences on every run:
 *   - the challenge table with every field the deletion flow binds on,
 *   - a CLOSED purpose CHECK (a challenge authorizes one action, not "any"),
 *   - service-role-only access (deny-all RLS policy, GRANT to service_role, NO
 *     authenticated grant),
 *   - no plaintext-code column and no email/session column — only digests,
 *   - the ON DELETE CASCADE that removes challenges with their user.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260806000000_sensitive_action_challenges.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("sensitive_action_challenges migration (static guards)", () => {
  describe("table shape", () => {
    it("creates the table", () => {
      expect(code).toMatch(/CREATE\s+TABLE\s+public\.sensitive_action_challenges/i);
    });

    it("has an opaque uuid primary key", () => {
      expect(code).toMatch(/id\s+uuid\s+PRIMARY\s+KEY/i);
    });

    it("binds to a user with ON DELETE CASCADE", () => {
      expect(code).toMatch(
        /user_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i,
      );
    });

    it("carries every binding + lifecycle column the flow depends on", () => {
      for (const column of [
        "purpose",
        "session_binding",
        "email_binding",
        "code_verifier",
        "expires_at",
        "attempt_count",
        "max_attempts",
        "verified_at",
        "verification_expires_at",
        "consumed_at",
        "invalidated_at",
        "last_sent_at",
        "send_count",
        "created_at",
        "updated_at",
      ]) {
        expect(code).toMatch(new RegExp(`\\b${column}\\b`, "i"));
      }
    });

    it("CLOSES the purpose set — a challenge authorizes one named action", () => {
      expect(code).toMatch(/CHECK\s*\(\s*\n?\s*purpose\s+IN\s*\(\s*'delete_account'\s*\)/i);
    });

    it("requires a positive attempt cap", () => {
      expect(code).toMatch(/CHECK\s*\(\s*max_attempts\s*>\s*0\s*\)/i);
    });

    it("pairs verified_at with its window (no dangling authorization window)", () => {
      expect(code).toMatch(/verified_at\s+IS\s+NULL\s+AND\s+verification_expires_at\s+IS\s+NULL/i);
    });

    it("indexes the (user, purpose) lookup and expiry cleanup", () => {
      expect(code).toMatch(
        /CREATE\s+INDEX\s+\S+\s+ON\s+public\.sensitive_action_challenges\s*\(\s*user_id\s*,\s*purpose/i,
      );
      expect(code).toMatch(
        /CREATE\s+INDEX\s+\S+\s+ON\s+public\.sensitive_action_challenges\s*\(\s*expires_at\s*\)/i,
      );
    });
  });

  describe("no secret or PII column", () => {
    it("stores no plaintext code", () => {
      expect(code).not.toMatch(/\bcode\s+text/i);
      expect(code).not.toMatch(/plaintext|raw_code|code_plain/i);
    });

    it("stores no email address and no raw session id — digests only", () => {
      expect(code).not.toMatch(/\bemail\s+text/i);
      expect(code).not.toMatch(/\bsession_id\b/i);
      expect(code).toMatch(/email_binding\s+text\s+NOT\s+NULL/i);
      expect(code).toMatch(/session_binding\s+text\s+NOT\s+NULL/i);
    });
  });

  describe("service-role-only fences", () => {
    it("declares the system-table opt-out comment", () => {
      expect(sql).toMatch(/system-table:\s*sensitive_action_challenges/i);
    });

    it("enables RLS", () => {
      expect(code).toMatch(
        /ALTER\s+TABLE\s+public\.sensitive_action_challenges\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    });

    it("denies EVERY client operation — not even the subject user may read it", () => {
      expect(code).toMatch(
        /CREATE\s+POLICY\s+\S+\s+\n?\s*ON\s+public\.sensitive_action_challenges\s*\n?\s*FOR\s+ALL\s+USING\s*\(\s*false\s*\)\s+WITH\s+CHECK\s*\(\s*false\s*\)/i,
      );
    });

    it("GRANTs to service_role and to NOTHING else", () => {
      expect(code).toMatch(
        /GRANT[\s\S]*ON\s+public\.sensitive_action_challenges\s+TO\s+service_role/i,
      );
      expect(code).not.toMatch(
        /GRANT[\s\S]*ON\s+public\.sensitive_action_challenges\s+TO\s+authenticated/i,
      );
      expect(code).not.toMatch(
        /GRANT[\s\S]*ON\s+public\.sensitive_action_challenges\s+TO\s+anon/i,
      );
    });
  });
});

/**
 * Account-deletion MEMBERSHIP contract (unchanged by this slice, re-proved here).
 *
 * A user who is only a MEMBER of someone else's team must, on final purge, lose
 * that membership (freeing the seat) while the team, its owner, and its resources
 * survive. That behavior is a foreign-key contract, so it is asserted against the
 * migrations that declare it rather than re-implemented in the purge service.
 */
describe("account-deletion membership contract (FK guards)", () => {
  const memberships = readFileSync(
    join(MIGRATIONS, "20260530000000_accounts_and_memberships.sql"),
    "utf8",
  ).replace(/--[^\n]*/g, "");
  const invitations = readFileSync(
    join(MIGRATIONS, "20260531000011_account_invitations.sql"),
    "utf8",
  ).replace(/--[^\n]*/g, "");

  it("removes the deleted user's memberships with the auth.users row (CASCADE)", () => {
    expect(memberships).toMatch(
      /user_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("does NOT cascade the team account itself — a member leaving never deletes the team", () => {
    // The account root is only removed via its own account_id cascade, which the
    // purge applies to the DELETED user's OWN personal account and no other.
    expect(memberships).toMatch(
      /account_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
    expect(memberships).toMatch(
      /owner_user_id\s+uuid\s+NOT\s+NULL\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
    );
  });

  it("keeps an accepted invitation as audit history (accepted_by → SET NULL, not delete)", () => {
    expect(invitations).toMatch(
      /accepted_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
    expect(invitations).toMatch(
      /invited_by_user_id\s+uuid\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });
});
