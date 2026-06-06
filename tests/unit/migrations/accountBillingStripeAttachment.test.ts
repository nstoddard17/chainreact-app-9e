/**
 * @jest-environment node
 *
 * Static guard for the Stripe-attachment migration (Slice 4.BILLING-PLAN-METADATA-3 /
 * CS-2). Reads the SQL (no DB): additive Stripe id columns + cancel flag + partial
 * unique indexes, NO Stripe price column (deferred), NO RLS/GRANT loosening, and NO
 * checkout/portal/webhook table or payment behavior.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260612000000_account_billing_stripe_attachment.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
// Strip comments so assertions match executable SQL only.
const code = sql.replace(/--[^\n]*/g, "");

describe("CS-2 — account_billing Stripe attachment migration (static guards)", () => {
  describe("columns", () => {
    it("adds nullable stripe_customer_id + stripe_subscription_id (text)", () => {
      expect(code).toMatch(/ADD\s+COLUMN\s+stripe_customer_id\s+text/i);
      expect(code).toMatch(/ADD\s+COLUMN\s+stripe_subscription_id\s+text/i);
      // Nullable — no NOT NULL on either id column.
      expect(code).not.toMatch(/stripe_customer_id\s+text\s+NOT\s+NULL/i);
      expect(code).not.toMatch(/stripe_subscription_id\s+text\s+NOT\s+NULL/i);
    });

    it("adds cancel_at_period_end boolean NOT NULL DEFAULT false", () => {
      expect(code).toMatch(
        /ADD\s+COLUMN\s+cancel_at_period_end\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i,
      );
    });
  });

  describe("uniqueness", () => {
    it("creates a partial unique index on stripe_customer_id WHERE NOT NULL", () => {
      expect(code).toMatch(
        /CREATE\s+UNIQUE\s+INDEX\s+\S*stripe_customer\S*\s+ON\s+public\.account_billing\s*\(\s*stripe_customer_id\s*\)\s*WHERE\s+stripe_customer_id\s+IS\s+NOT\s+NULL/i,
      );
    });

    it("creates a partial unique index on stripe_subscription_id WHERE NOT NULL", () => {
      expect(code).toMatch(
        /CREATE\s+UNIQUE\s+INDEX\s+\S*stripe_subscription\S*\s+ON\s+public\.account_billing\s*\(\s*stripe_subscription_id\s*\)\s*WHERE\s+stripe_subscription_id\s+IS\s+NOT\s+NULL/i,
      );
    });
  });

  describe("scope fences", () => {
    it("does NOT add a stripe_price_id column (price snapshot deferred)", () => {
      expect(code).not.toMatch(/stripe_price_id/i);
    });

    it("creates NO new table (checkout/portal/webhook tables deferred)", () => {
      expect(code).not.toMatch(/CREATE\s+TABLE/i);
    });

    it("makes NO unsafe RLS / GRANT change (writes stay service-role only)", () => {
      expect(code).not.toMatch(/DROP\s+POLICY/i);
      expect(code).not.toMatch(/CREATE\s+POLICY/i);
      expect(code).not.toMatch(/GRANT[\s\S]*TO\s+anon/i);
      expect(code).not.toMatch(/GRANT[\s\S]*INSERT[\s\S]*TO\s+authenticated/i);
      expect(code).not.toMatch(/GRANT[\s\S]*UPDATE[\s\S]*TO\s+authenticated/i);
      // No GRANT at all in this slice — the columns inherit account_billing's posture.
      expect(code).not.toMatch(/\bGRANT\b/i);
    });

    it("wires no payment behavior (no checkout/webhook/portal SQL artifacts)", () => {
      expect(code).not.toMatch(/checkout|webhook|portal|payment_intent/i);
    });
  });
});
