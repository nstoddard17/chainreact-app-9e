/**
 * Static migration-shape guard for react_agent_audit_events
 * (REACT-AGENT-CS-5B-AUDIT-STORAGE).
 *
 * Proves the security/no-leak shape of the audit-ledger migration WITHOUT a live DB
 * (the runtime RLS/CHECK behavior — member-only read, invalid outcome/mode rejection,
 * set-null on delete — is proven by gated DB tests after db:push). This scans the
 * committed SQL so the governance guarantees can't silently regress.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260705000000_react_agent_audit_events.sql",
  ),
  "utf8",
);

describe("react_agent_audit_events migration — security shape", () => {
  it("creates the table and enables RLS", () => {
    expect(SQL).toMatch(/CREATE TABLE public\.react_agent_audit_events/);
    expect(SQL).toMatch(/ALTER TABLE public\.react_agent_audit_events ENABLE ROW LEVEL SECURITY/);
  });

  it("reads are gated to account members via account_memberships", () => {
    expect(SQL).toMatch(/CREATE POLICY react_agent_audit_select_account_member/);
    expect(SQL).toMatch(/FROM public\.account_memberships am/);
    expect(SQL).toMatch(/am\.user_id = auth\.uid\(\)/);
  });

  it("is service-role-write-only: authenticated gets SELECT only, no write policy", () => {
    expect(SQL).toMatch(/GRANT SELECT ON public\.react_agent_audit_events TO authenticated/);
    expect(SQL).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.react_agent_audit_events TO service_role/);
    // No INSERT/UPDATE/DELETE GRANT to authenticated.
    expect(SQL).not.toMatch(/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/);
    // No user-facing write POLICY (only the SELECT policy exists).
    expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/);
  });

  it("anonymize-retain deletion convention: account/actor/workflow/cost FKs are ON DELETE SET NULL", () => {
    expect(SQL).toMatch(/account_id uuid REFERENCES public\.accounts\(id\) ON DELETE SET NULL/);
    expect(SQL).toMatch(/actor_user_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    expect(SQL).toMatch(/workflow_id uuid REFERENCES public\.workflows\(id\) ON DELETE SET NULL/);
    expect(SQL).toMatch(/ai_cost_event_id uuid REFERENCES public\.ai_cost_events\(id\) ON DELETE SET NULL/);
    // No CASCADE delete of the governance trail.
    expect(SQL).not.toMatch(/ON DELETE CASCADE/);
  });

  it("constrains outcome + mode to closed sets and metadata to an object", () => {
    expect(SQL).toMatch(/outcome IN \(\s*'success',\s*'denied',\s*'failed'\s*\)/);
    expect(SQL).toMatch(/mode IN \(\s*'read_only',\s*'proposes_change',\s*'requires_approval'\s*\)/);
    expect(SQL).toMatch(/jsonb_typeof\(metadata\) = 'object'/);
  });

  it("has no raw-payload columns (only ids / enums / opaque refs / sanitized metadata)", () => {
    for (const banned of [
      /\bprompt\b/i,
      /\bcompletion\b/i,
      /\banswer\b/i,
      /\bquestion\b/i,
      /\bconfig\b/i,
      /\bsecret\b/i,
      /\btoken\b/i,
      /\bpayload\b/i,
    ]) {
      // Allow the banned word only inside the leading comment block's redaction rule;
      // assert it never appears as a column definition (`<word> text/jsonb ...`).
      const columnLike = new RegExp(`\\n\\s+\\w*${banned.source.replace(/\\b/g, "")}\\w*\\s+(text|jsonb|uuid)`, "i");
      expect(SQL).not.toMatch(columnLike);
    }
  });
});
