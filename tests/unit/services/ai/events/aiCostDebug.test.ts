/**
 * @jest-environment node
 *
 * Slice 4.AI-35D — dev cost guard + per-request cost visibility.
 *
 * Pins: dev-only AND flag gating (never in prod), the full-catalog warning
 * thresholds (Part C — fallback / >=20k tokens / >=20 providers warn; a
 * narrowed call does NOT), the cost computation (Sonnet known, classifier
 * unknown → "unknown"), and the no-secrets guarantee of the formatted line.
 */
import {
  FULL_CATALOG_PROVIDER_THRESHOLD,
  FULL_CATALOG_TOKEN_THRESHOLD,
  buildAiCostDebugRecord,
  formatAiCostDebugLine,
  isAiCostDebugEnabled,
  logAiCostDebug,
  shouldWarnFullCatalog,
  type AiCostDebugInput,
} from "@/services/ai/events/aiCostDebug";

const NARROWED: AiCostDebugInput = {
  feature: "workflow_creation",
  eventType: "ai_model_call_completed",
  modelProvider: "anthropic",
  modelName: "claude-sonnet-4-6",
  promptVersion: "workflow-planner-v3",
  inputTokens: 10_820,
  outputTokens: 392,
  providerNarrowingMode: "narrowed",
  providerNarrowingFallbackUsed: false,
  catalogProviderCount: 3,
  catalogProvidersTotal: 26,
  plannerModelTier: "strong",
  classifierUsed: true,
  classifierModelTier: null,
  tierRoutingReason: "feature_default_strong",
  plannerInteractionKind: "initial_plan",
  patchOutcome: "previewed",
  workflowId: "wf-123",
};

const FULL_CATALOG: AiCostDebugInput = {
  ...NARROWED,
  inputTokens: 39_958,
  outputTokens: 219,
  providerNarrowingMode: "full-catalog",
  providerNarrowingFallbackUsed: true,
  providerNarrowingReason: "ambiguous_broad_request",
  catalogProviderCount: 26,
  tierRoutingReason: "narrowing_fallback_ambiguous_broad_request",
};

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    process.env = saved;
  }
}

describe("isAiCostDebugEnabled — dev-only AND flag-gated", () => {
  it("never enabled in production, even with the flag on", () => {
    withEnv({ NODE_ENV: "production", ENABLE_AI_COST_DEBUG: "true" }, () => {
      expect(isAiCostDebugEnabled()).toBe(false);
    });
  });

  it("enabled in dev only when the flag is exactly 'true'", () => {
    withEnv({ NODE_ENV: "development", ENABLE_AI_COST_DEBUG: "true" }, () => {
      expect(isAiCostDebugEnabled()).toBe(true);
    });
    withEnv({ NODE_ENV: "development", ENABLE_AI_COST_DEBUG: "1" }, () => {
      expect(isAiCostDebugEnabled()).toBe(false);
    });
    withEnv({ NODE_ENV: "test", ENABLE_AI_COST_DEBUG: undefined }, () => {
      expect(isAiCostDebugEnabled()).toBe(false);
    });
  });
});

describe("shouldWarnFullCatalog — Part C thresholds", () => {
  it("warns on a full-catalog fallback", () => {
    expect(shouldWarnFullCatalog(FULL_CATALOG)).toBe(true);
  });

  it("warns when input tokens reach the threshold", () => {
    expect(shouldWarnFullCatalog({ inputTokens: FULL_CATALOG_TOKEN_THRESHOLD })).toBe(true);
    expect(shouldWarnFullCatalog({ inputTokens: FULL_CATALOG_TOKEN_THRESHOLD - 1 })).toBe(false);
  });

  it("warns when catalog provider count reaches the threshold", () => {
    expect(shouldWarnFullCatalog({ catalogProviderCount: FULL_CATALOG_PROVIDER_THRESHOLD })).toBe(true);
    expect(shouldWarnFullCatalog({ catalogProviderCount: FULL_CATALOG_PROVIDER_THRESHOLD - 1 })).toBe(false);
  });

  it("does NOT warn for a normal narrowed call", () => {
    expect(shouldWarnFullCatalog(NARROWED)).toBe(false);
  });
});

describe("buildAiCostDebugRecord — safe, computed", () => {
  it("computes total tokens + Sonnet cost for a priced model", () => {
    const rec = buildAiCostDebugRecord(NARROWED);
    expect(rec.totalTokens).toBe(10_820 + 392);
    expect(rec.estimatedCostUsd).toBeCloseTo(0.03834, 5);
    expect(rec.fullCatalogWarning).toBe(false);
  });

  it("reports unknown cost (null) for an unpriced classifier model", () => {
    const rec = buildAiCostDebugRecord({
      feature: "provider_discovery",
      eventType: "ai_model_call_completed",
      modelProvider: "openai",
      modelName: "gpt-4.1-mini",
      inputTokens: 50,
      outputTokens: 10,
    });
    expect(rec.estimatedCostUsd).toBeNull();
  });

  it("flags the full-catalog warning on a fallback record", () => {
    expect(buildAiCostDebugRecord(FULL_CATALOG).fullCatalogWarning).toBe(true);
  });
});

describe("formatAiCostDebugLine — no secrets, greppable", () => {
  it("renders the safe summary fields", () => {
    const line = formatAiCostDebugLine(buildAiCostDebugRecord(NARROWED));
    expect(line).toContain("[ai-cost]");
    expect(line).toContain("feature=workflow_creation");
    expect(line).toContain("model=claude-sonnet-4-6");
    expect(line).toContain("in=10820");
    expect(line).toContain("cost=$0.0383");
    expect(line).toContain("narrowing=narrowed");
    expect(line).toContain("interaction=initial_plan");
    expect(line).toContain("patch=previewed");
  });

  it("renders cost=unknown for an unpriced model", () => {
    const line = formatAiCostDebugLine(
      buildAiCostDebugRecord({
        feature: "provider_discovery",
        eventType: "ai_model_call_completed",
        modelName: "gpt-4.1-mini",
        inputTokens: 50,
        outputTokens: 10,
      }),
    );
    expect(line).toContain("cost=unknown");
  });

  it("never contains secret-shaped substrings (structural — no field carries one)", () => {
    const line = formatAiCostDebugLine(buildAiCostDebugRecord(FULL_CATALOG));
    expect(line).not.toMatch(/xox[bpsr]-|Bearer\s|ya29\.|sk-ant-|accessToken|refreshToken|access_token|password/i);
  });

  // Slice 4.AI-35B — required-input resolution mode (deterministic vs re-plan).
  it("renders resolution=deterministic(reason) when the field is set", () => {
    const rec = buildAiCostDebugRecord({
      feature: "workflow_creation",
      eventType: "ai_required_input_completed",
      requiredInputResolutionMode: "deterministic",
      requiredInputResolutionReason: "config_values_applied",
    });
    expect(rec.requiredInputResolutionMode).toBe("deterministic");
    expect(formatAiCostDebugLine(rec)).toContain("resolution=deterministic(config_values_applied)");
  });

  it("omits the resolution segment when the field is absent", () => {
    expect(formatAiCostDebugLine(buildAiCostDebugRecord(NARROWED))).not.toContain("resolution=");
  });
});

describe("logAiCostDebug — gating", () => {
  it("is a no-op (no console output) when disabled", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    withEnv({ NODE_ENV: "test", ENABLE_AI_COST_DEBUG: undefined }, () => {
      logAiCostDebug(NARROWED);
    });
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    info.mockRestore();
    warn.mockRestore();
  });

  it("emits console.info for a narrowed call and console.warn (+ message) for full-catalog when enabled", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    withEnv({ NODE_ENV: "development", ENABLE_AI_COST_DEBUG: "true" }, () => {
      logAiCostDebug(NARROWED);
      logAiCostDebug(FULL_CATALOG);
    });
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("costs about 3x a narrowed call");
    info.mockRestore();
    warn.mockRestore();
  });
});
