/**
 * @jest-environment node
 *
 * Static guard for the AI-provider feature CHECK migration (20260728000000).
 *
 * Reads the migration SQL (no DB) so CI proves its shape on every run: it is a
 * non-destructive CHECK widening that preserves every previously-allowed
 * feature, adds exactly the three ChainReact AI provider features, and touches
 * nothing else (no table/RLS/grant changes). Live behavior is proven by the
 * opt-in DB harness, not here.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260728000000_ai_cost_events_feature_add_ai_provider.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

const PREVIOUSLY_ALLOWED = [
  "workflow_creation",
  "workflow_editing",
  "workflow_repair",
  "workflow_explanation",
  "workflow_qa",
  "failed_run_analysis",
  "provider_discovery",
  "template_recommendation",
  "template_customization",
  "cost_preview",
  "other",
];
const NEWLY_ALLOWED = ["document_analysis", "data_transform", "schema_suggestion"];

describe("20260728000000 — ai_cost_events feature CHECK widening", () => {
  it("drops and recreates the named constraint (forward-only widening)", () => {
    expect(code).toMatch(
      /ALTER TABLE public\.ai_cost_events\s+DROP CONSTRAINT IF EXISTS ai_cost_events_feature_chk/i,
    );
    expect(code).toMatch(
      /ALTER TABLE public\.ai_cost_events\s+ADD CONSTRAINT ai_cost_events_feature_chk CHECK/i,
    );
  });

  it("preserves every previously-allowed feature", () => {
    for (const feature of PREVIOUSLY_ALLOWED) {
      expect(code).toContain(`'${feature}'`);
    }
  });

  it("adds exactly the three AI provider features", () => {
    for (const feature of NEWLY_ALLOWED) {
      expect(code).toContain(`'${feature}'`);
    }
    const values = [...code.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values.sort()).toEqual([...PREVIOUSLY_ALLOWED, ...NEWLY_ALLOWED].sort());
  });

  it("is constraint-only — no table, RLS, policy, grant, or data changes", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/DROP\s+TABLE/i);
    expect(code).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/CREATE\s+POLICY/i);
    expect(code).not.toMatch(/\bGRANT\b|\bREVOKE\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+public\.|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b/i);
  });

  it("does not modify the already-applied predecessor migration", () => {
    const predecessor = readFileSync(
      join(MIGRATIONS, "20260703000000_ai_cost_events_feature_add_workflow_qa.sql"),
      "utf8",
    );
    for (const feature of NEWLY_ALLOWED) {
      expect(predecessor).not.toContain(feature);
    }
  });
});
