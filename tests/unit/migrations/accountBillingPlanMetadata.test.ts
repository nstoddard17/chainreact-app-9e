/**
 * @jest-environment node
 *
 * Static guard for the plan-metadata migration (Slice 4.BILLING-PLAN-METADATA-2 /
 * CS-1). Reads the SQL (no DB): additive plan columns + CHECKs + a safe type→plan
 * backfill, NO Stripe columns (deferred to CS-2), and NO unsafe RLS/GRANT change.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260611000000_account_billing_plan_metadata.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("CS-1 — account_billing plan metadata migration (static guards)", () => {
  describe("columns + CHECKs", () => {
    it("adds plan NOT NULL DEFAULT 'free' with a known-set CHECK", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+plan\s+text\s+NOT\s+NULL\s+DEFAULT\s+'free'/i);
      expect(code).toMatch(/CHECK\s*\(\s*plan\s+IN\s*\([\s\S]*'free'[\s\S]*'pro'[\s\S]*'team'[\s\S]*'business'[\s\S]*'enterprise'[\s\S]*\)\s*\)/i);
    });

    it("adds plan_status NOT NULL DEFAULT 'active' with a known-set CHECK", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+plan_status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'active'/i);
      expect(code).toMatch(/CHECK\s*\(\s*plan_status\s+IN\s*\([\s\S]*'active'[\s\S]*'past_due'[\s\S]*'canceled'[\s\S]*\)\s*\)/i);
    });

    it("adds a nullable current_period_end", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+current_period_end\s+timestamptz/i);
      expect(code).not.toMatch(/current_period_end\s+timestamptz\s+NOT\s+NULL/i);
    });
  });

  describe("backfill", () => {
    it("maps account type → plan (personal→free, team→team, organization→business)", () => {
      expect(code).toMatch(/UPDATE\s+public\.account_billing/i);
      expect(code).toMatch(/WHEN\s+'personal'\s+THEN\s+'free'/i);
      expect(code).toMatch(/WHEN\s+'team'\s+THEN\s+'team'/i);
      expect(code).toMatch(/WHEN\s+'organization'\s+THEN\s+'business'/i);
    });
  });

  describe("scope fences", () => {
    it("adds NO Stripe columns (deferred to CS-2)", () => {
      expect(code).not.toMatch(/stripe_customer_id|stripe_subscription_id|ADD\s+COLUMN[^\n;]*stripe/i);
    });

    it("makes NO unsafe RLS / GRANT change", () => {
      expect(code).not.toMatch(/DROP\s+POLICY/i);
      expect(code).not.toMatch(/CREATE\s+POLICY/i);
      expect(code).not.toMatch(/GRANT[\s\S]*TO\s+anon/i);
      // No new write grant to authenticated (writes stay service-role only).
      expect(code).not.toMatch(/GRANT[\s\S]*INSERT[\s\S]*TO\s+authenticated/i);
      expect(code).not.toMatch(/GRANT[\s\S]*UPDATE[\s\S]*TO\s+authenticated/i);
    });
  });
});
