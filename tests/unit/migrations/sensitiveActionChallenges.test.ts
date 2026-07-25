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
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A — the atomic
 * consume-and-schedule RPC. Static guards for the security fences and for the
 * three writes that must share one transaction; its runtime behavior is proved
 * against real Postgres in
 * tests/integration/accounts/deletionAuthorizationAtomicity.dev.test.ts.
 */
describe("schedule_account_deletion RPC (static guards)", () => {
  const rpc = readFileSync(
    join(MIGRATIONS, "20260807000000_schedule_account_deletion_rpc.sql"),
    "utf8",
  );
  const rpcCode = rpc.replace(/--[^\n]*/g, "");

  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(rpcCode).toMatch(/SECURITY\s+DEFINER/i);
    expect(rpcCode).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("is EXECUTE-able by service_role ONLY", () => {
    expect(rpcCode).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.schedule_account_deletion[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
    expect(rpcCode).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.schedule_account_deletion[\s\S]*?TO\s+service_role/i,
    );
    expect(rpcCode).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.schedule_account_deletion[\s\S]*?TO\s+(anon|authenticated)\b/i,
    );
  });

  it("locks the account row so concurrent submissions serialize", () => {
    expect(rpcCode).toMatch(/FROM\s+public\.accounts\s+WHERE\s+id\s*=\s*p_account_id\s+FOR\s+UPDATE/i);
  });

  it("performs ALL THREE writes — consume, freeze, audit row — in the one function", () => {
    expect(rpcCode).toMatch(/UPDATE\s+public\.sensitive_action_challenges[\s\S]*?SET\s+consumed_at/i);
    expect(rpcCode).toMatch(/UPDATE\s+public\.accounts[\s\S]*?deletion_status\s*=\s*'pending_deletion'/i);
    expect(rpcCode).toMatch(/INSERT\s+INTO\s+public\.account_deletions/i);
  });

  it("re-asserts EVERY challenge binding in the consuming UPDATE", () => {
    const consume = /UPDATE\s+public\.sensitive_action_challenges[\s\S]*?RETURNING/i.exec(rpcCode)![0];
    expect(consume).toMatch(/user_id\s*=\s*p_challenge_user_id/i);
    expect(consume).toMatch(/purpose\s*=\s*p_challenge_purpose/i);
    expect(consume).toMatch(/session_binding\s*=\s*p_challenge_session_binding/i);
    expect(consume).toMatch(/email_binding\s*=\s*p_challenge_email_binding/i);
    // Single-use + verified + still inside both windows.
    expect(consume).toMatch(/consumed_at\s+IS\s+NULL/i);
    expect(consume).toMatch(/invalidated_at\s+IS\s+NULL/i);
    expect(consume).toMatch(/verified_at\s+IS\s+NOT\s+NULL/i);
    expect(consume).toMatch(/verification_expires_at\s*>\s*p_requested_at/i);
    expect(consume).toMatch(/expires_at\s*>\s*p_requested_at/i);
  });

  it("re-checks the sole-owner precondition BEFORE consuming anything", () => {
    const ownerGuard = rpcCode.indexOf("owned_accounts_block");
    const consume = rpcCode.search(/UPDATE\s+public\.sensitive_action_challenges/i);
    expect(ownerGuard).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(-1);
    // The refusal returns before the consume statement is ever reached.
    expect(ownerGuard).toBeLessThan(consume);
    expect(rpcCode).toMatch(/owned\.type\s+IN\s*\(\s*'team',\s*'organization'\s*\)/i);
  });

  it("short-circuits an already-pending account without consuming or re-writing", () => {
    const pendingBranch = rpcCode.indexOf("already_pending");
    const consume = rpcCode.search(/UPDATE\s+public\.sensitive_action_challenges/i);
    expect(pendingBranch).toBeLessThan(consume);
  });

  it("makes the challenge optional so system/admin paths still work", () => {
    expect(rpcCode).toMatch(/IF\s+p_challenge_id\s+IS\s+NOT\s+NULL\s+THEN/i);
  });

  it("does NOT perform external billing work inside the transaction", () => {
    expect(rpcCode).not.toMatch(/stripe/i);
    expect(rpcCode).not.toMatch(/http|net\./i);
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
