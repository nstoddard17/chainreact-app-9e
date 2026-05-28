/**
 * @jest-environment node
 *
 * Slice 4.AI-31 — tests for tier-routing attribution emitted by the
 * prompt builder.
 *
 * What this file pins:
 *   - `plannerModelTier` defaults to "strong" (workflow_creation
 *     feature default); reflects the threaded tier when callers
 *     pass one.
 *   - Classifier runs by default; `classifierUsed: true`,
 *     `classifierModelTier: null` for the deterministic helper.
 *   - `ENABLE_AI_NARROWING_CLASSIFIER=false` disables the classifier;
 *     `classifierUsed: false`, `tierRoutingReason: "classifier_disabled"`.
 *   - Classifier output is ADVISORY ONLY — `finalProviderCount`
 *     equals `deterministicProviderCount` regardless of classifier
 *     state. Narrowing's `providerIds` is still authoritative for what
 *     ships to the model.
 *   - Explicit/connected/canvas providers are never dropped by the
 *     classifier — `candidateProviders` is a superset of narrowing.
 *   - `tierRoutingReason` enum: `feature_default_strong` (steady
 *     state), `classifier_disabled`, `narrowing_fallback_<reason>`.
 *   - `fallbackToFullCatalog` mirrors `providerNarrowingFallbackUsed`.
 *   - `fallbackToDeterministic` is `false` today (deterministic
 *     classifier never fails).
 *   - V1 and V2 builders produce the same tier-routing fields.
 *   - No raw user prompt / no provider id arrays in attribution.
 */
import {
  buildWorkflowPlanPromptV1WithAttribution,
  buildWorkflowPlanPromptV2WithAttribution,
  buildWorkflowPlanPromptWithAttribution,
} from "@/services/ai/planner";
import type {
  WorkflowPlanPromptInput,
} from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

function actionEntry(key: string) {
  return {
    key,
    displayName: key,
    category: "messaging" as const,
    riskLevel: "low" as const,
    isDestructive: false,
    requiresConfirmation: false,
    requiresIntegration: true,
    configFields: [{ name: "text", type: "textarea" as const, required: true }],
    outputs: [{ name: "ok", type: "boolean" }],
  };
}

function triggerEntry(key: string) {
  return {
    key,
    displayName: key,
    category: "messaging" as const,
    activation: "webhook" as const,
    requiresIntegration: true,
    configFields: [{ name: "channel", type: "combobox" as const, required: true }],
    outputs: [{ name: "text", type: "string" }],
  };
}

function provider(id: string): ProviderCatalogEntry {
  return {
    id,
    displayName: id,
    capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [actionEntry(`${id}:send`)],
    triggers: [triggerEntry(`${id}:event`)],
  };
}

function catalog(): ProviderCatalogView {
  return { providers: [provider("slack"), provider("gmail"), provider("stripe"), provider("notion"), provider("native")] };
}

function makeInput(overrides: Partial<WorkflowPlanPromptInput> = {}): WorkflowPlanPromptInput {
  return {
    userRequest: "Send a Slack DM",
    catalog: catalog(),
    connectedIntegrations: [],
    ...overrides,
  };
}

// ─── plannerModelTier ────────────────────────────────────────────────────────

describe("AI-31 — plannerModelTier defaults + override", () => {
  it("V2 builder defaults plannerModelTier to 'strong' (workflow_creation feature default)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(attribution.plannerModelTier).toBe("strong");
  });

  it("V1 builder defaults plannerModelTier to 'strong' too", () => {
    const { attribution } = buildWorkflowPlanPromptV1WithAttribution(makeInput());
    expect(attribution.plannerModelTier).toBe("strong");
  });

  it("plannerTier override on input is reflected in attribution + tierRoutingReason", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ plannerTier: "fast" }),
    );
    expect(attribution.plannerModelTier).toBe("fast");
    expect(attribution.tierRoutingReason).toBe("user_override_fast");
  });
});

// ─── classifier wiring ───────────────────────────────────────────────────────

describe("AI-31 — narrowing classifier wiring", () => {
  it("default (env unset): classifierUsed true, modelTier null, confidence set", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.classifierUsed).toBe(true);
    expect(attribution.classifierModelTier).toBeNull();
    expect(attribution.classifierConfidence).toBe("high");
    expect(attribution.classifierProviderCount).toBeGreaterThan(0);
  });

  it("ENABLE_AI_NARROWING_CLASSIFIER=false: classifierUsed false, reason='classifier_disabled'", () => {
    const KEY = "ENABLE_AI_NARROWING_CLASSIFIER";
    const prev = process.env[KEY];
    try {
      process.env[KEY] = "false";
      const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
        makeInput({ userRequest: "Send a Slack DM" }),
      );
      expect(attribution.classifierUsed).toBe(false);
      expect(attribution.classifierModelTier).toBeNull();
      expect(attribution.classifierConfidence).toBeNull();
      expect(attribution.classifierProviderCount).toBeNull();
      expect(attribution.tierRoutingReason).toBe("classifier_disabled");
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  });

  it("V1 builder applies the same classifier wiring", () => {
    const { attribution } = buildWorkflowPlanPromptV1WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.classifierUsed).toBe(true);
    expect(attribution.classifierConfidence).toBe("high");
  });

  it("classifier confidence flows from the helper: medium for alias-only", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a google mail email" }),
    );
    expect(attribution.classifierConfidence).toBe("medium");
  });

  it("classifier confidence flows from the helper: low for broad request", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    );
    expect(attribution.classifierConfidence).toBe("low");
  });
});

// ─── advisory-only safety ────────────────────────────────────────────────────

describe("AI-31 — classifier is ADVISORY: never changes the catalog", () => {
  it("finalProviderCount equals deterministicProviderCount today (no classifier overlay)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.finalProviderCount).toBe(attribution.deterministicProviderCount);
  });

  it("finalProviderCount still equals deterministicProviderCount with classifier disabled", () => {
    const KEY = "ENABLE_AI_NARROWING_CLASSIFIER";
    const prev = process.env[KEY];
    try {
      process.env[KEY] = "false";
      const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
        makeInput({ userRequest: "Send a Slack DM" }),
      );
      expect(attribution.finalProviderCount).toBe(attribution.deterministicProviderCount);
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  });

  it("explicit provider mention is in the catalog regardless of classifier state", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(messages[0]!.content).toContain("- slack");
  });

  it("connected provider is preserved regardless of classifier state", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        userRequest: "Send a Slack DM",
        connectedIntegrations: [
          { provider: "notion", connected: true, accountLabel: null, accountScope: null, scopeCount: 0 },
        ],
      }),
    );
    expect(messages[0]!.content).toContain("- notion");
  });

  it("canvas provider is preserved regardless of classifier state", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        userRequest: "Send a Slack DM",
        currentGraph: {
          nodes: [{ id: "n1", kind: "trigger", provider: "stripe", type: "event" }],
          edges: [],
        },
      }),
    );
    expect(messages[0]!.content).toContain("- stripe");
  });

  it("low-confidence classifier does NOT narrow dangerously — broad request still uses full catalog", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    );
    expect(attribution.classifierConfidence).toBe("low");
    // Full-catalog fallback shipped everything; classifier didn't narrow further.
    expect(attribution.providerNarrowingMode).toBe("full-catalog");
    expect(attribution.finalProviderCount).toBe(attribution.catalogProvidersTotal);
  });
});

// ─── tierRoutingReason vocabulary ────────────────────────────────────────────

describe("AI-31 — tierRoutingReason", () => {
  it("steady-state: 'feature_default_strong'", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.tierRoutingReason).toBe("feature_default_strong");
  });

  it("broad fallback: 'narrowing_fallback_<reason>'", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    );
    expect(attribution.tierRoutingReason).toBe(
      "narrowing_fallback_ambiguous_broad_request",
    );
  });

  it("tier override beats default: 'user_override_fast'", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ plannerTier: "fast" }),
    );
    expect(attribution.tierRoutingReason).toBe("user_override_fast");
  });

  it("classifier disabled overrides other reasons", () => {
    const KEY = "ENABLE_AI_NARROWING_CLASSIFIER";
    const prev = process.env[KEY];
    try {
      process.env[KEY] = "false";
      const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
        makeInput({ userRequest: "Send a Slack DM" }),
      );
      expect(attribution.tierRoutingReason).toBe("classifier_disabled");
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  });
});

// ─── fallback flags ──────────────────────────────────────────────────────────

describe("AI-31 — fallback flags", () => {
  it("fallbackToDeterministic is false today (deterministic classifier never fails)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.fallbackToDeterministic).toBe(false);
  });

  it("fallbackToFullCatalog mirrors providerNarrowingFallbackUsed (narrowed scenario)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.fallbackToFullCatalog).toBe(attribution.providerNarrowingFallbackUsed);
    expect(attribution.fallbackToFullCatalog).toBe(false);
  });

  it("fallbackToFullCatalog mirrors providerNarrowingFallbackUsed (broad scenario)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    );
    expect(attribution.fallbackToFullCatalog).toBe(attribution.providerNarrowingFallbackUsed);
    expect(attribution.fallbackToFullCatalog).toBe(true);
  });
});

// ─── No-leak ─────────────────────────────────────────────────────────────────

describe("AI-31 — no-leak in tier-routing attribution", () => {
  it("does not echo the raw user request text", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "SECRET-PHRASE-AI31-12345 send a Slack DM" }),
    );
    for (const [, value] of Object.entries(attribution)) {
      if (typeof value === "string") {
        expect(value).not.toContain("SECRET-PHRASE-AI31-12345");
      }
    }
  });

  it("no field is an array (counts + enums + strings only)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    for (const [, value] of Object.entries(attribution)) {
      expect(Array.isArray(value)).toBe(false);
    }
  });

  it("no tier-routing field matches the sanitizer denylist", () => {
    const BLOCKED = [
      /token/i,
      /secret/i,
      /password/i,
      /authorization/i,
      /api[-_]?key/i,
      /credential/i,
      /prompt/i,
      /completion/i,
      /body/i,
      /\bconfig\b/i,
      /\braw/i,
    ];
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const tierRoutingKeys = [
      "plannerModelTier",
      "classifierUsed",
      "classifierModelTier",
      "classifierConfidence",
      "classifierProviderCount",
      "deterministicProviderCount",
      "finalProviderCount",
      "fallbackToDeterministic",
      "fallbackToFullCatalog",
      "tierRoutingReason",
    ];
    for (const key of tierRoutingKeys) {
      expect(attribution).toHaveProperty(key);
      for (const re of BLOCKED) {
        if (re.test(key)) {
          throw new Error(
            `Tier-routing field '${key}' matches sanitizer denylist /${re.source}/${re.flags}`,
          );
        }
      }
    }
  });
});

// ─── V1 / V2 parity ─────────────────────────────────────────────────────────

describe("AI-31 — V1 + V2 produce the same tier-routing fields", () => {
  it("both report identical tier-routing field values for the same input", () => {
    const input = makeInput({ userRequest: "Send a Slack DM" });
    const v1 = buildWorkflowPlanPromptV1WithAttribution(input);
    const v2 = buildWorkflowPlanPromptV2WithAttribution(input);
    expect(v1.attribution.plannerModelTier).toBe(v2.attribution.plannerModelTier);
    expect(v1.attribution.classifierUsed).toBe(v2.attribution.classifierUsed);
    expect(v1.attribution.classifierConfidence).toBe(v2.attribution.classifierConfidence);
    expect(v1.attribution.deterministicProviderCount).toBe(v2.attribution.deterministicProviderCount);
    expect(v1.attribution.finalProviderCount).toBe(v2.attribution.finalProviderCount);
    expect(v1.attribution.tierRoutingReason).toBe(v2.attribution.tierRoutingReason);
  });

  it("dispatcher (default v2) reports the tier-routing fields", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.plannerModelTier).toBe("strong");
    expect(attribution.classifierUsed).toBe(true);
  });
});
