/**
 * @jest-environment node
 *
 * Static guard for the AI-credit enforcement migration (20260621000000).
 *
 * Reads the migration SQL (no DB) so CI proves its shape on every run: additive
 * AI columns + CHECK, per-plan backfill, AI-anchor alignment, and a deduct RPC
 * that mirrors deduct_tasks_if_available (flat gate + lazy rollover on the
 * SEPARATE AI anchor, reusing account_billing_period_start) with the established
 * SECURITY DEFINER + service_role-only grants — and that it does NOT touch the
 * task counters/RPCs or create a table. Live behavior is proven by the opt-in DB
 * harness, not here.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260621000000_account_billing_ai_credits.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("20260621000000 — AI credit columns (additive)", () => {
  it("adds the four AI counters with NOT NULL defaults + a non-negative reserved CHECK", () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS ai_credits_limit\s+int\s+NOT NULL\s+DEFAULT\s+20/i);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS ai_credits_used\s+int\s+NOT NULL\s+DEFAULT\s+0/i);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS ai_credits_reserved\s+int\s+NOT NULL\s+DEFAULT\s+0/i);
    expect(code).toMatch(/CHECK\s*\(\s*ai_credits_reserved\s*>=\s*0\s*\)/i);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS ai_credits_period_started_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
  });

  it("is additive only — ALTER TABLE account_billing, never CREATE/DROP TABLE", () => {
    expect(code).toMatch(/ALTER\s+TABLE\s+public\.account_billing/i);
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/DROP\s+TABLE/i);
  });

  it("backfills per-plan limits (placeholders) incl. an enterprise custom placeholder", () => {
    expect(code).toMatch(/SET\s+ai_credits_limit\s*=\s*CASE\s+plan/i);
    expect(code).toMatch(/WHEN\s+'free'\s+THEN\s+20/i);
    expect(code).toMatch(/WHEN\s+'pro'\s+THEN\s+500/i);
    expect(code).toMatch(/WHEN\s+'team'\s+THEN\s+2000/i);
    expect(code).toMatch(/WHEN\s+'business'\s+THEN\s+10000/i);
    expect(code).toMatch(/WHEN\s+'enterprise'\s+THEN\s+1000000/i);
  });

  it("aligns existing rows' AI anchor to the task period anchor", () => {
    expect(code).toMatch(/SET\s+ai_credits_period_started_at\s*=\s*period_started_at/i);
  });
});

describe("20260621000000 — deduct_ai_credits_if_available RPC", () => {
  it("defines the deduct RPC, SECURITY DEFINER, search_path pinned", () => {
    expect(code).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.deduct_ai_credits_if_available\(\s*p_account_id\s+uuid,\s*p_amount\s+int/i,
    );
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("allows a 0 amount (no-op) — errors ONLY on a negative amount", () => {
    expect(code).toMatch(/IF\s+p_amount\s*<\s*0\s+THEN/i);
    expect(code).not.toMatch(/p_amount\s*<=\s*0/i); // 0 is valid (deterministic/0-credit pass)
  });

  it("does a lazy rollover on the SEPARATE AI anchor, reusing the existing helper, under a row lock", () => {
    expect(code).toMatch(/SELECT\s+ai_credits_period_started_at\s+INTO\s+v_anchor[\s\S]*?FOR\s+UPDATE/i);
    expect(code).toMatch(/account_billing_period_start\(\s*v_anchor\s*,\s*now\(\)\s*\)/i);
    expect(code).toMatch(/SET\s+ai_credits_used\s*=\s*0,\s*ai_credits_reserved\s*=\s*0,\s*ai_credits_period_started_at\s*=\s*v_new_start/i);
    expect(code).toMatch(/IF\s+v_new_start\s*>\s*v_anchor\s+THEN/i);
  });

  it("gates on available = limit − used (flat, ai_credits_limit never reset)", () => {
    expect(code).toMatch(/ai_credits_used\s*\+\s*p_amount\s*<=\s*ai_credits_limit/i);
    // The rollover reset writes used/reserved/anchor only — never ai_credits_limit.
    for (const m of code.matchAll(/SET\s+ai_credits_used\s*=\s*0[\s\S]*?WHERE\s+account_id\s*=\s*p_account_id;/gi)) {
      expect(m[0]).not.toMatch(/ai_credits_limit\s*=/i);
    }
  });

  it("uses the established service_role-only function grants", () => {
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.deduct_ai_credits_if_available[^;]*FROM\s+public,\s*anon,\s*authenticated/i,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deduct_ai_credits_if_available[^;]*TO\s+service_role/i,
    );
  });

  it("does NOT touch the live task counters, RPCs, or the task period anchor", () => {
    expect(code).not.toMatch(/deduct_tasks_if_available/i);
    expect(code).not.toMatch(/reserve_tasks_if_available/i);
    expect(code).not.toMatch(/SET\s+tasks_used/i);
    expect(code).not.toMatch(/SET\s+tasks_reserved/i);
    // account_billing_period_start is REUSED (called), never REDEFINED here.
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.account_billing_period_start/i);
  });
});
