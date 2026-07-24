/** @jest-environment node */
import {
  AI_ACTION_REGISTRY,
  getAiActionRegistryEntry,
  listAiActionRegistryEntries,
} from "@/services/ai/processor/aiActionRegistry";

describe("AI action registry", () => {
  it("is frozen (registry and entries)", () => {
    expect(Object.isFrozen(AI_ACTION_REGISTRY)).toBe(true);
    for (const entry of listAiActionRegistryEntries()) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it("resolves the three planned keys", () => {
    expect(getAiActionRegistryEntry("ai:analyze_document")?.feature).toBe("document_analysis");
    expect(getAiActionRegistryEntry("ai:transform_data")?.feature).toBe("data_transform");
    expect(getAiActionRegistryEntry("ai:suggest_schema")?.feature).toBe("schema_suggestion");
  });

  it("fails closed for unknown keys (including prototype names)", () => {
    expect(getAiActionRegistryEntry("ai:generate_text")).toBeUndefined();
    expect(getAiActionRegistryEntry("")).toBeUndefined();
    expect(getAiActionRegistryEntry("toString")).toBeUndefined();
    expect(getAiActionRegistryEntry("constructor")).toBeUndefined();
  });

  it("has no duplicate features or action keys", () => {
    const entries = listAiActionRegistryEntries();
    const keys = entries.map((e) => e.actionKey);
    const features = entries.map((e) => e.feature);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(features).size).toBe(features.length);
  });

  it("every entry declares the full flag set, phase-1 invariants hold", () => {
    for (const entry of listAiActionRegistryEntries()) {
      expect(entry.actionKey).toMatch(/^ai:[a-z][a-z0-9_]*$/);
      expect(entry.feature).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(entry.supportedTiers.length).toBeGreaterThan(0);
      for (const tier of entry.supportedTiers) {
        expect(["fast", "strong"]).toContain(tier);
      }
      expect(entry.structuredOutput).toBe(true);
      expect(entry.streaming).toBe(false); // phase 1: nothing streams
      expect(typeof entry.testModeAllowed).toBe("boolean");
      expect(typeof entry.costPreview).toBe("boolean");
      expect(entry.enabledFlag).toBe("AI_PROCESSOR_ENABLED");
    }
  });

  // CS-3 lockstep seam: today the three features are deliberately UNPRICED
  // (executeAiAction refuses them). CS-3 extends this test into the full
  // registry ↔ FEATURE_BASE_CREDITS ↔ AiCostFeature ↔ CHECK lockstep.
  it("documents the pre-CS-3 state: registry features are not yet priced", async () => {
    const { computeAiCreditCharge } = await import("@/core/billing/aiCreditPolicy");
    for (const entry of listAiActionRegistryEntries()) {
      const charge = computeAiCreditCharge({
        feature: entry.feature,
        isLlmCall: true,
        modelTier: "fast",
      });
      expect(charge.mapped).toBe(false); // CS-3 flips this to true
    }
  });
});
