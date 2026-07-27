/**
 * @jest-environment node
 *
 * Static guard for the AI-credit repricing + plan-sync migration (20260808000000,
 * AI-CREDITS-REPRICE-1). Reads the migration SQL (no DB) so CI proves its shape:
 * new-row default 100, a GUARDED re-stamp (only known old defaults are rewritten —
 * custom / enterprise values survive), and the business upgrade/downgrade RPCs
 * gaining p_ai_credits_limit with old single-signature functions dropped and
 * service_role-only grants re-applied. Live behavior is proven by the opt-in DB
 * harness, not here.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260808000000_ai_credits_repricing_plan_sync.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("20260808000000 — repriced allocations", () => {
  it("raises the new-row column default to 100 (Free allocation)", () => {
    expect(code).toMatch(
      /ALTER\s+COLUMN\s+ai_credits_limit\s+SET\s+DEFAULT\s+100/i,
    );
  });

  it("re-stamps the owner-approved allocations per plan (100/2000/10000/50000)", () => {
    expect(code).toMatch(/WHEN\s+'free'\s+THEN\s+100/i);
    expect(code).toMatch(/WHEN\s+'pro'\s+THEN\s+2000/i);
    expect(code).toMatch(/WHEN\s+'team'\s+THEN\s+10000/i);
    expect(code).toMatch(/WHEN\s+'business'\s+THEN\s+50000/i);
  });

  it("GUARDS the re-stamp: only known old defaults are rewritten; enterprise excluded", () => {
    // Custom values (anything not in the old-default set) and every enterprise
    // row (incl. the 1000000 placeholder) must survive untouched.
    expect(code).toMatch(
      /WHERE\s+plan\s+IN\s*\(\s*'free',\s*'pro',\s*'team',\s*'business'\s*\)/i,
    );
    expect(code).toMatch(/ai_credits_limit\s+IN\s*\(\s*20,\s*500,\s*2000,\s*10000\s*\)/i);
    expect(code).not.toMatch(/WHEN\s+'enterprise'\s+THEN\s+\d/i);
  });

  it("touches ONLY the limit — never used / reserved / the AI period anchor", () => {
    expect(code).not.toMatch(/SET\s+ai_credits_used/i);
    expect(code).not.toMatch(/SET\s+ai_credits_reserved/i);
    expect(code).not.toMatch(/ai_credits_period_started_at\s*=/i);
    expect(code).not.toMatch(/deduct_ai_credits_if_available/i);
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/DROP\s+TABLE/i);
  });
});

describe("20260808000000 — plan-sync RPC extension", () => {
  it("drops the OLD single-signature functions (no stale overload stays callable)", () => {
    expect(code).toMatch(
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.apply_business_upgrade\(uuid,\s*text,\s*timestamptz,\s*boolean,\s*text,\s*text,\s*int\)/i,
    );
    expect(code).toMatch(
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.apply_business_downgrade\(uuid,\s*text,\s*int\)/i,
    );
  });

  it("recreates both RPCs WITH p_ai_credits_limit and writes it with the plan flip", () => {
    expect(code).toMatch(
      /FUNCTION\s+public\.apply_business_upgrade\([\s\S]*?p_tasks_limit\s+int,\s*p_ai_credits_limit\s+int\s*\)/i,
    );
    expect(code).toMatch(
      /FUNCTION\s+public\.apply_business_downgrade\([\s\S]*?p_tasks_limit\s+int,\s*p_ai_credits_limit\s+int\s*\)/i,
    );
    // Both plan-flip UPDATEs stamp the AI cap alongside tasks_limit.
    const stamps = code.match(/ai_credits_limit\s*=\s*p_ai_credits_limit/gi) ?? [];
    expect(stamps).toHaveLength(2);
  });

  it("keeps SECURITY DEFINER + pinned search_path + service_role-only grants on both", () => {
    for (const fn of ["apply_business_upgrade", "apply_business_downgrade"]) {
      expect(code).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}[^;]*FROM\\s+public,\\s*anon,\\s*authenticated`,
          "i",
        ),
      );
      expect(code).toMatch(
        new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}[^;]*TO\\s+service_role`, "i"),
      );
    }
    expect(code.match(/SECURITY\s+DEFINER/gi)).toHaveLength(2);
    expect(code.match(/SET\s+search_path\s*=\s*public/gi)).toHaveLength(2);
  });

  it("never hardcodes a per-plan number inside the RPC bodies (policy stays in TS)", () => {
    // The RPC bodies write caller-supplied params only; the CASE re-stamp is the
    // single place plan numbers appear, outside any function body.
    const bodies = [...code.matchAll(/AS\s+\$\$([\s\S]*?)\$\$/gi)].map((m) => m[1]!);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).not.toMatch(/ai_credits_limit\s*=\s*\d/);
      expect(body).not.toMatch(/tasks_limit\s*=\s*\d/);
    }
  });
});
