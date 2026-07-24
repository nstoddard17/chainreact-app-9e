/** @jest-environment node */
/**
 * Registry ↔ policy ↔ ledger-type ↔ DATABASE lockstep (AI-PROVIDER-3 CS-3).
 *
 * One AI capability's feature key must be simultaneously: requestable by the
 * model layer (`AiFeature`), priced by the credit policy
 * (`FEATURE_BASE_CREDITS`), recordable by the ledger contract
 * (`AI_COST_FEATURES`), and accepted by the live `ai_cost_events_feature_chk`
 * CHECK constraint. A drift in any one of those four is a production INSERT
 * failure or a silent over-charge, so it fails HERE first.
 *
 * The DB half reads the real migration SQL (no database connection) — the
 * LATEST migration that redefines the constraint is the effective one.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { FEATURE_DEFAULT_TIER } from "@/core/ai/models";
import {
  TIER_CREDIT_MULTIPLIER,
  UNMAPPED_LLM_FALLBACK_CREDITS,
  computeAiCreditCharge,
  getFeatureBaseCredits,
  isFeaturePriced,
} from "@/core/billing/aiCreditPolicy";
import { AI_COST_FEATURES } from "@/repositories/aiCostEvents";
import {
  AI_ACTION_REGISTRY,
  listAiActionRegistryEntries,
} from "@/services/ai/processor/aiActionRegistry";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const CONSTRAINT = "ai_cost_events_feature_chk";

/** Values allowed by the newest migration that (re)defines the CHECK. */
function latestCheckConstraintValues(): { file: string; values: string[] } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      return new RegExp(`ADD\\s+CONSTRAINT\\s+${CONSTRAINT}`, "i").test(sql);
    });
  const file = files.at(-1);
  if (!file) throw new Error(`No migration defines ${CONSTRAINT}`);
  const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "");
  const match = new RegExp(
    `ADD\\s+CONSTRAINT\\s+${CONSTRAINT}\\s+CHECK\\s*\\(\\s*feature\\s+IN\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(sql);
  if (!match?.[1]) throw new Error(`Could not parse ${CONSTRAINT} values from ${file}`);
  const values = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
  return { file, values };
}

describe("AI provider billing lockstep", () => {
  const { file: latestFile, values: dbFeatures } = latestCheckConstraintValues();
  const entries = listAiActionRegistryEntries();

  it("uses the CS-3 migration as the effective constraint definition", () => {
    expect(latestFile).toBe("20260728000000_ai_cost_events_feature_add_ai_provider.sql");
  });

  it("every registry feature is a valid model-layer feature (has a default tier)", () => {
    for (const entry of entries) {
      // FEATURE_DEFAULT_TIER is Record<AiFeature, …> — presence here proves the
      // key is a real AiFeature at runtime, not just at compile time.
      expect(Object.keys(FEATURE_DEFAULT_TIER)).toContain(entry.feature);
    }
  });

  it("every registry feature has an explicit credit price", () => {
    for (const entry of entries) {
      expect(isFeaturePriced(entry.feature)).toBe(true);
    }
  });

  it("every registry feature is accepted by the ledger TYPE contract", () => {
    for (const entry of entries) {
      expect(AI_COST_FEATURES).toContain(entry.feature);
    }
  });

  it("every registry feature is accepted by the DATABASE CHECK constraint", () => {
    for (const entry of entries) {
      expect(dbFeatures).toContain(entry.feature);
    }
  });

  it("the ledger type and the DB constraint allow exactly the same set", () => {
    expect([...dbFeatures].sort()).toEqual([...AI_COST_FEATURES].sort());
  });

  it("the CS-3 migration preserved every previously-allowed value", () => {
    // The pre-CS-3 set (20260703000000). None may disappear.
    for (const preexisting of [
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
    ]) {
      expect(dbFeatures).toContain(preexisting);
    }
    expect(dbFeatures).toContain("document_analysis");
    expect(dbFeatures).toContain("data_transform");
    expect(dbFeatures).toContain("schema_suggestion");
  });

  it("every ai:* key is represented exactly once", () => {
    const keys = entries.map((e) => e.actionKey);
    expect(keys.sort()).toEqual([
      "ai:analyze_document",
      "ai:suggest_schema",
      "ai:transform_data",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(AI_ACTION_REGISTRY).sort()).toEqual(keys.sort());
  });

  it("no registered AI capability can reach the generic fallback — every charge is policy-derived", () => {
    for (const entry of entries) {
      const base = getFeatureBaseCredits(entry.feature);
      expect(base).toBeDefined();
      for (const tier of entry.supportedTiers) {
        const charge = computeAiCreditCharge({
          feature: entry.feature,
          isLlmCall: true,
          modelTier: tier,
        });
        // `mapped` is the authoritative "did NOT use the fallback" signal…
        expect(charge.mapped).toBe(true);
        // …and the amount is exactly the declared base × the tier multiplier,
        // never the fallback's base. (Note a strong-tier charge may legitimately
        // exceed UNMAPPED_LLM_FALLBACK_CREDITS — e.g. document_analysis strong
        // is 6 — so magnitude alone proves nothing; provenance does.)
        expect(charge.credits).toBe(
          Math.ceil((base as number) * TIER_CREDIT_MULTIPLIER[tier]),
        );
        const fallbackAmount = Math.ceil(
          UNMAPPED_LLM_FALLBACK_CREDITS * TIER_CREDIT_MULTIPLIER[tier],
        );
        expect(charge.credits).not.toBe(fallbackAmount);
      }
    }
  });

  it("registry supportedTiers match the owner-approved capability matrix", () => {
    expect(AI_ACTION_REGISTRY["ai:analyze_document"].supportedTiers).toEqual([
      "fast",
      "strong",
    ]);
    expect(AI_ACTION_REGISTRY["ai:transform_data"].supportedTiers).toEqual([
      "fast",
      "strong",
    ]);
    // schema_suggestion is fast-only — a cheap builder-time helper.
    expect(AI_ACTION_REGISTRY["ai:suggest_schema"].supportedTiers).toEqual(["fast"]);
  });
});
