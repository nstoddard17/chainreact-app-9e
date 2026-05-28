/**
 * @jest-environment node
 *
 * Tests for core/ai/models.ts (Slice 4.AI-8A).
 *
 * Config-only — no model is called. These pin tier defaults, the feature→tier
 * map, safe fallbacks for unknown features/ids, and the no-secrets guarantee.
 */
import {
  DEFAULT_MODEL_BUDGET,
  DEFAULT_MODEL_TIER,
  FEATURE_DEFAULT_TIER,
  getModelById,
  getModelForFeature,
  getModelForTier,
  MODELS,
  MODEL_API_KEY_ENV,
  type ModelDefinition,
} from "@/core/ai/models";
import type { AiFeature, ModelTier } from "@/core/ai/modelTypes";

describe("MODELS config", () => {
  it("defines both fast and strong tiers", () => {
    expect(MODELS.fast).toBeDefined();
    expect(MODELS.strong).toBeDefined();
    expect(MODELS.fast.tier).toBe("fast");
    expect(MODELS.strong.tier).toBe("strong");
  });

  it("each model carries id, provider, and finite token caps", () => {
    for (const model of Object.values(MODELS)) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(["anthropic", "openai"]).toContain(model.provider);
      expect(model.maxInputTokens).toBeGreaterThan(0);
      expect(model.maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it("default tier resolves to a real model definition", () => {
    expect(MODELS[DEFAULT_MODEL_TIER]).toBeDefined();
  });

  it("budget has a positive timeout and non-negative retry count", () => {
    expect(DEFAULT_MODEL_BUDGET.timeoutMs).toBeGreaterThan(0);
    expect(DEFAULT_MODEL_BUDGET.maxRetries).toBeGreaterThanOrEqual(0);
  });
});

describe("no secrets in config", () => {
  /** No string anywhere in the config object may look like a real API key. */
  function assertNoSecretValues(value: unknown): void {
    if (typeof value === "string") {
      expect(value).not.toMatch(/sk-[a-zA-Z0-9]/); // OpenAI-style key
      expect(value).not.toMatch(/sk-ant-/); // Anthropic-style key
      expect(value.length).toBeLessThan(200); // no embedded blob
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(assertNoSecretValues);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(assertNoSecretValues);
    }
  }

  it("MODELS contains no API-key-shaped strings", () => {
    assertNoSecretValues(MODELS);
  });

  it("MODEL_API_KEY_ENV lists env var NAMES only, never values", () => {
    expect(MODEL_API_KEY_ENV.anthropic).toBe("ANTHROPIC_API_KEY");
    expect(MODEL_API_KEY_ENV.openai).toBe("OPENAI_API_KEY");
    // Names end in _KEY / _API_KEY; they are not themselves secrets.
    for (const name of Object.values(MODEL_API_KEY_ENV)) {
      expect(name).toMatch(/_KEY$/);
      expect(name).not.toMatch(/sk-/);
    }
  });
});

describe("getModelForTier", () => {
  it.each<[ModelTier]>([["fast"], ["strong"]])(
    "returns the model for tier %s",
    (tier) => {
      const model: ModelDefinition = getModelForTier(tier);
      expect(model.tier).toBe(tier);
    },
  );
});

describe("getModelForFeature", () => {
  it("maps every feature in the tier map to a real model", () => {
    const features = Object.keys(FEATURE_DEFAULT_TIER) as AiFeature[];
    for (const feature of features) {
      const model = getModelForFeature(feature);
      expect(model.tier).toBe(FEATURE_DEFAULT_TIER[feature]);
    }
  });

  it("creation/editing/repair use the strong tier", () => {
    expect(getModelForFeature("creation").tier).toBe("strong");
    expect(getModelForFeature("editing").tier).toBe("strong");
    expect(getModelForFeature("repair").tier).toBe("strong");
  });

  it("falls back to the default tier for an unknown feature value", () => {
    // Cast through unknown — a runtime caller can pass anything.
    const model = getModelForFeature("totally_unknown" as unknown as AiFeature);
    expect(model.tier).toBe(DEFAULT_MODEL_TIER);
  });
});

describe("getModelById", () => {
  it("resolves a known model id", () => {
    const strong = MODELS.strong;
    expect(getModelById(strong.id)).toEqual(strong);
  });

  it("returns undefined for an unknown id (clear failure, no throw)", () => {
    expect(getModelById("gpt-does-not-exist")).toBeUndefined();
  });
});

// ─── Slice 4.AI-34A: OpenAI provider config ──────────────────────────────────

import { OPENAI_MODELS, getModelForProviderTier } from "@/core/ai/models";
import type { ModelProvider } from "@/core/ai/modelTypes";

describe("OPENAI_MODELS config (AI-34A)", () => {
  it("defines both tiers with provider=openai", () => {
    expect(OPENAI_MODELS.fast.provider).toBe("openai");
    expect(OPENAI_MODELS.strong.provider).toBe("openai");
    expect(OPENAI_MODELS.fast.tier).toBe("fast");
    expect(OPENAI_MODELS.strong.tier).toBe("strong");
  });

  it("each OpenAI model carries id + finite token caps", () => {
    for (const m of Object.values(OPENAI_MODELS)) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(Number.isFinite(m.maxInputTokens)).toBe(true);
      expect(Number.isFinite(m.maxOutputTokens)).toBe(true);
    }
  });

  it("OpenAI model ids do not collide with Anthropic ids", () => {
    const anthropicIds = new Set(Object.values(MODELS).map((m) => m.id));
    for (const m of Object.values(OPENAI_MODELS)) {
      expect(anthropicIds.has(m.id)).toBe(false);
    }
  });
});

describe("getModelForProviderTier (AI-34A)", () => {
  it("resolves the Anthropic model for provider=anthropic (default planner unchanged)", () => {
    expect(getModelForProviderTier("anthropic", "strong")).toEqual(MODELS.strong);
    expect(getModelForProviderTier("anthropic", "fast")).toEqual(MODELS.fast);
  });

  it("resolves the OpenAI model for provider=openai", () => {
    expect(getModelForProviderTier("openai", "strong")).toEqual(OPENAI_MODELS.strong);
    expect(getModelForProviderTier("openai", "fast")).toEqual(OPENAI_MODELS.fast);
  });

  it("the DEFAULT resolver (getModelForTier) still returns Anthropic — no behavior switch", () => {
    expect(getModelForTier("strong").provider).toBe("anthropic");
    expect(getModelForFeature("creation").provider).toBe("anthropic");
  });
});

describe("getModelById across providers (AI-34A)", () => {
  it("resolves an OpenAI model id to its OpenAI definition (telemetry provider mapping)", () => {
    const openaiStrong = OPENAI_MODELS.strong;
    const found = getModelById(openaiStrong.id);
    expect(found).toEqual(openaiStrong);
    expect(found?.provider satisfies ModelProvider | undefined).toBe("openai");
  });

  it("still resolves Anthropic ids", () => {
    expect(getModelById(MODELS.strong.id)?.provider).toBe("anthropic");
  });
});
