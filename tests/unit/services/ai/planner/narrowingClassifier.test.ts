/**
 * @jest-environment node
 *
 * Slice 4.AI-31 — tests for the deterministic narrowing classifier helper.
 *
 * What this file pins:
 *   - `intentType` derivation: create vs edit vs repair vs help vs unknown,
 *     based on canvas + provider mention + request keywords.
 *   - `confidence` derivation: high (explicit canonical id) / medium
 *     (alias/ambiguous/connected/canvas) / low (no signal).
 *   - `candidateProviders` mirror of `narrowing.providerIds` — the
 *     deterministic helper NEVER drops a provider narrowing included.
 *   - `triggerHints` / `actionHints` always empty (deterministic helper
 *     can't infer these; a future model classifier will fill them).
 *   - `broadOrAmbiguous` matches narrowing's full-catalog fallback for
 *     the documented broad / vague reasons.
 *   - `source: "deterministic"` + `modelTier: null` — distinguishes from
 *     a future model-backed classifier.
 *   - `safeRunNarrowingClassifier`: env flag short-circuits; defensive
 *     try/catch returns null on throw.
 *   - Determinism: same input → same output.
 *
 * Helper-only contract. Builder/attribution wiring is covered by
 * `buildWorkflowPlanPrompt.tierRouting.test.ts`.
 */
import {
  runDeterministicNarrowingClassifier,
  safeRunNarrowingClassifier,
  isNarrowingClassifierEnabled,
} from "@/services/ai/planner/narrowingClassifier";
import {
  narrowProvidersForPlan,
  type NarrowProvidersInput,
} from "@/services/ai/planner/narrowProvidersForPlan";
import type { CurrentWorkflowGraphView } from "@/services/ai/planner/types";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

// ─── Catalog fixture (lean — helper only consults `id`) ──────────────────────

const ALL_PROVIDER_IDS: readonly string[] = [
  "slack",
  "gmail",
  "stripe",
  "notion",
  "trello",
  "native",
  "discord",
  "github",
  "shopify",
  "airtable",
];

function leanProvider(id: string): ProviderCatalogEntry {
  return {
    id,
    displayName: id,
    capabilities: { oauth: true, webhookTrigger: false, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [],
    triggers: [],
  };
}

function catalog(): ProviderCatalogView {
  return { providers: ALL_PROVIDER_IDS.map(leanProvider) };
}

function makeInput(overrides: Partial<NarrowProvidersInput> = {}): NarrowProvidersInput {
  return {
    userRequest: "",
    catalog: catalog(),
    connectedIntegrations: [],
    ...overrides,
  };
}

function connected(provider: string): ConnectedIntegrationView {
  return {
    provider,
    connected: true,
    accountLabel: null,
    accountScope: null,
    scopeCount: 0,
  };
}

function canvas(
  nodes: ReadonlyArray<{ id: string; provider: string; type: string }>,
): CurrentWorkflowGraphView {
  return {
    nodes: nodes.map((n) => ({ id: n.id, kind: "action" as const, provider: n.provider, type: n.type })),
    edges: [],
  };
}

function runAgainst(overrides: Partial<NarrowProvidersInput>) {
  const input = makeInput(overrides);
  const narrowing = narrowProvidersForPlan(input);
  return { input, narrowing, classifier: runDeterministicNarrowingClassifier(input, narrowing) };
}

// ─── source / modelTier ──────────────────────────────────────────────────────

describe("narrowingClassifier — source + modelTier", () => {
  it("source is 'deterministic' and modelTier is null", () => {
    const { classifier } = runAgainst({ userRequest: "Send me a Slack DM" });
    expect(classifier.source).toBe("deterministic");
    expect(classifier.modelTier).toBeNull();
  });

  it("triggerHints and actionHints are always empty in deterministic mode", () => {
    const { classifier } = runAgainst({ userRequest: "Send a Slack DM when I get a Gmail email" });
    expect(classifier.triggerHints).toEqual([]);
    expect(classifier.actionHints).toEqual([]);
  });
});

// ─── confidence derivation ───────────────────────────────────────────────────

describe("narrowingClassifier — confidence", () => {
  it("explicit canonical-id mention → high confidence", () => {
    const { classifier } = runAgainst({ userRequest: "Send a Slack DM" });
    expect(classifier.confidence).toBe("high");
  });

  it("alias-only mention → medium confidence", () => {
    const { classifier } = runAgainst({ userRequest: "Send a google mail email" });
    expect(classifier.confidence).toBe("medium");
  });

  it("ambiguous capability ('email' alone) → medium confidence", () => {
    const { classifier } = runAgainst({
      userRequest: "ping me when an email arrives", // "email" → ambiguous gmail+outlook
      connectedIntegrations: [],
    });
    expect(classifier.confidence).toBe("medium");
  });

  it("connected provider only, no mention → medium confidence", () => {
    // No provider mention, but logic keyword makes hasProviderMention true.
    const { classifier } = runAgainst({
      userRequest: "run manually",
      connectedIntegrations: [connected("notion")],
    });
    expect(classifier.confidence).toBe("medium");
  });

  it("broad request with no signal → low confidence", () => {
    const { classifier } = runAgainst({ userRequest: "create an automation" });
    expect(classifier.confidence).toBe("low");
  });

  it("vague-edit on complex canvas → low confidence (full-catalog fallback)", () => {
    const { classifier } = runAgainst({
      userRequest: "add a step",
      currentGraph: canvas([
        { id: "n1", provider: "stripe", type: "event" },
        { id: "n2", provider: "slack", type: "send" },
        { id: "n3", provider: "gmail", type: "send" },
        { id: "n4", provider: "notion", type: "create" },
      ]),
    });
    expect(classifier.confidence).toBe("low");
  });
});

// ─── intentType derivation ───────────────────────────────────────────────────

describe("narrowingClassifier — intentType", () => {
  it("empty canvas + explicit provider mention → create", () => {
    const { classifier } = runAgainst({ userRequest: "Send a Slack DM" });
    expect(classifier.intentType).toBe("create");
  });

  it("populated canvas + explicit provider mention → edit", () => {
    const { classifier } = runAgainst({
      userRequest: "Also send a Trello card",
      currentGraph: canvas([{ id: "n1", provider: "slack", type: "send" }]),
    });
    expect(classifier.intentType).toBe("edit");
  });

  it("request contains 'fix' → repair", () => {
    const { classifier } = runAgainst({ userRequest: "fix the broken Slack step" });
    expect(classifier.intentType).toBe("repair");
  });

  it("request contains 'broken' → repair", () => {
    const { classifier } = runAgainst({ userRequest: "Slack DM is broken" });
    expect(classifier.intentType).toBe("repair");
  });

  it("request contains 'how do i' → help", () => {
    const { classifier } = runAgainst({ userRequest: "how do i connect Slack" });
    expect(classifier.intentType).toBe("help");
  });

  it("ambiguous broad request with no signal → unknown", () => {
    const { classifier } = runAgainst({ userRequest: "create an automation" });
    expect(classifier.intentType).toBe("unknown");
  });

  it("repair keyword takes precedence over create/edit when both could apply", () => {
    const { classifier } = runAgainst({ userRequest: "fix the Slack DM action" });
    expect(classifier.intentType).toBe("repair");
  });
});

// ─── candidateProviders ──────────────────────────────────────────────────────

describe("narrowingClassifier — candidateProviders mirrors narrowing", () => {
  it("includes every provider narrowing chose, in insertion order", () => {
    const { classifier, narrowing } = runAgainst({
      userRequest: "Send a Slack DM when I get a Gmail email",
      connectedIntegrations: [connected("notion")],
      currentGraph: canvas([{ id: "n1", provider: "stripe", type: "event" }]),
    });
    expect(classifier.candidateProviders).toEqual(Array.from(narrowing.providerIds));
  });

  it("NEVER drops a provider narrowing included (safety invariant)", () => {
    // Even at low confidence, candidateProviders is the same set.
    const { classifier, narrowing } = runAgainst({ userRequest: "create an automation" });
    expect(classifier.confidence).toBe("low");
    expect(classifier.candidateProviders.length).toBe(narrowing.providerIds.size);
    for (const id of classifier.candidateProviders) {
      expect(narrowing.providerIds.has(id)).toBe(true);
    }
  });

  it("explicit Slack mention always lands in candidateProviders", () => {
    const { classifier } = runAgainst({ userRequest: "Send a Slack DM" });
    expect(classifier.candidateProviders).toContain("slack");
  });

  it("connected provider always lands in candidateProviders", () => {
    const { classifier } = runAgainst({
      userRequest: "Send a Slack DM",
      connectedIntegrations: [connected("notion")],
    });
    expect(classifier.candidateProviders).toContain("notion");
  });

  it("canvas provider always lands in candidateProviders", () => {
    const { classifier } = runAgainst({
      userRequest: "Send a Slack DM",
      currentGraph: canvas([{ id: "n1", provider: "stripe", type: "event" }]),
    });
    expect(classifier.candidateProviders).toContain("stripe");
  });
});

// ─── broadOrAmbiguous ────────────────────────────────────────────────────────

describe("narrowingClassifier — broadOrAmbiguous", () => {
  it("true when narrowing falls back with ambiguous_broad_request", () => {
    const { classifier } = runAgainst({ userRequest: "create an automation" });
    expect(classifier.broadOrAmbiguous).toBe(true);
  });

  it("true when narrowing falls back with no_provider_mention", () => {
    const { classifier } = runAgainst({ userRequest: "ping me when something changes" });
    expect(classifier.broadOrAmbiguous).toBe(true);
  });

  it("true when narrowing falls back with complex_canvas_vague_edit", () => {
    const { classifier } = runAgainst({
      userRequest: "add a step",
      currentGraph: canvas([
        { id: "n1", provider: "stripe", type: "event" },
        { id: "n2", provider: "slack", type: "send" },
        { id: "n3", provider: "gmail", type: "send" },
        { id: "n4", provider: "notion", type: "create" },
      ]),
    });
    expect(classifier.broadOrAmbiguous).toBe(true);
  });

  it("false when narrowing succeeded (mode=narrowed)", () => {
    const { classifier } = runAgainst({ userRequest: "Send a Slack DM" });
    expect(classifier.broadOrAmbiguous).toBe(false);
  });
});

// ─── safeRunNarrowingClassifier + env flag ───────────────────────────────────

describe("narrowingClassifier — safeRunNarrowingClassifier + env flag", () => {
  const KEY = "ENABLE_AI_NARROWING_CLASSIFIER";
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env[KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[KEY];
    else process.env[KEY] = originalEnv;
  });

  it("env unset → classifier enabled", () => {
    delete process.env[KEY];
    expect(isNarrowingClassifierEnabled()).toBe(true);
    const input = makeInput({ userRequest: "Send a Slack DM" });
    const narrowing = narrowProvidersForPlan(input);
    expect(safeRunNarrowingClassifier(input, narrowing)).not.toBeNull();
  });

  it("env=false → classifier disabled, safeRun returns null", () => {
    process.env[KEY] = "false";
    expect(isNarrowingClassifierEnabled()).toBe(false);
    const input = makeInput({ userRequest: "Send a Slack DM" });
    const narrowing = narrowProvidersForPlan(input);
    expect(safeRunNarrowingClassifier(input, narrowing)).toBeNull();
  });

  it("env=true → classifier enabled (only the literal 'false' disables)", () => {
    process.env[KEY] = "true";
    expect(isNarrowingClassifierEnabled()).toBe(true);
  });

  it("safeRun returns null on a thrown error (defensive try/catch)", () => {
    // Use Object.defineProperty to make `narrowing.providerIds` throw on
    // iteration — simulates a corrupted result from a future model classifier
    // upstream. The deterministic helper itself doesn't throw, so this
    // exercises the seam's defense in depth.
    const input = makeInput({ userRequest: "Send a Slack DM" });
    const realNarrowing = narrowProvidersForPlan(input);
    const broken = {
      ...realNarrowing,
      get providerIds(): never {
        throw new Error("synthetic test failure");
      },
    } as unknown as ReturnType<typeof narrowProvidersForPlan>;
    expect(safeRunNarrowingClassifier(input, broken)).toBeNull();
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe("narrowingClassifier — determinism", () => {
  it("same input → same output (pure derivation)", () => {
    const input = makeInput({
      userRequest: "When Stripe payment fails send me a Slack DM",
      connectedIntegrations: [connected("notion")],
      currentGraph: canvas([{ id: "n1", provider: "stripe", type: "event" }]),
    });
    const a = runDeterministicNarrowingClassifier(input, narrowProvidersForPlan(input));
    const b = runDeterministicNarrowingClassifier(input, narrowProvidersForPlan(input));
    expect(a).toEqual(b);
  });
});
