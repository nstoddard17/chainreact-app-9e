/**
 * @jest-environment node
 *
 * Slice 4.AI-30 — tests for provider narrowing inside the prompt builder
 * (V1 + V2 paths), the CONTEXT PACKET narrowing fields, the R1
 * narrowing-aware no-substitution rule, the attribution narrowing fields,
 * and the ENABLE_AI_PROVIDER_NARROWING env-flag rollback.
 *
 * Separated from `buildWorkflowPlanPrompt.test.ts` and
 * `buildWorkflowPlanPromptV2.test.ts` so the narrowing contract lives in
 * one reviewable file (and so per-file line counts stay under the project
 * soft-ceiling).
 *
 * Pinned:
 *   - V1 + V2 BOTH apply narrowing (rollback is env-flag, not packet
 *     version).
 *   - V2 CONTEXT PACKET reports `providersIncluded` < `providersTotal`
 *     when narrowed; reports both equal when full-catalog.
 *   - V2 CONTEXT PACKET reports `narrowingMode` + `narrowingReason`.
 *   - R1 contains the new narrowing-aware no-substitution clause (and
 *     stays above R2 so prominence is preserved).
 *   - Attribution fields: catalogProvidersTotal, providerNarrowingEnabled,
 *     providerNarrowingMode, providerNarrowingFallbackUsed,
 *     providerNarrowingReason, providerNarrowingOmittedCount.
 *   - Representative cost reductions: Slack-only, Stripe+Slack, ambiguous
 *     broad request (no reduction). Char counts; not token estimates.
 *   - No-leak: narrowing decision metadata never leaks raw user request
 *     or provider id ARRAYS into attribution (counts/enums only).
 */
import {
  buildWorkflowPlanPromptV1WithAttribution,
  buildWorkflowPlanPromptV2WithAttribution,
  buildWorkflowPlanPromptWithAttribution,
} from "@/services/ai/planner";
import {
  PLANNER_PACKET_VERSION,
  type WorkflowPlanPromptInput,
} from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

// ─── Catalog fixtures: 5 lean usable providers (slack, gmail, stripe,
// trello, native) so narrowing produces a visible char reduction
// without dragging in the full 26-provider registry. ────────────────────────

function actionEntry(key: string, providerId: string) {
  return {
    key,
    displayName: key,
    category: "messaging" as const,
    riskLevel: "low" as const,
    isDestructive: false,
    requiresConfirmation: false,
    requiresIntegration: providerId !== "native",
    configFields: [
      { name: "text", type: "textarea" as const, required: true },
    ],
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
    configFields: [
      { name: "channel", type: "combobox" as const, required: true },
    ],
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
    actions: [actionEntry(`${id}:send`, id)],
    triggers: [triggerEntry(`${id}:event`)],
  };
}

function multiProviderCatalog(): ProviderCatalogView {
  return {
    providers: [
      provider("slack"),
      provider("gmail"),
      provider("stripe"),
      provider("trello"),
      provider("notion"),
      // `native` mimics the synthetic provider — must be in catalog so
      // narrowing's always-include path can pick it up.
      provider("native"),
    ],
  };
}

function makeInput(
  overrides: Partial<WorkflowPlanPromptInput> = {},
): WorkflowPlanPromptInput {
  return {
    userRequest: "Send a Slack DM",
    catalog: multiProviderCatalog(),
    connectedIntegrations: [],
    ...overrides,
  };
}

// ─── Env-flag rollback ───────────────────────────────────────────────────────

describe("AI-30 — ENABLE_AI_PROVIDER_NARROWING rollback flag", () => {
  const KEY = "ENABLE_AI_PROVIDER_NARROWING";
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env[KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[KEY];
    else process.env[KEY] = originalEnv;
  });

  it("env unset → narrowing ON (V2 default)", () => {
    delete process.env[KEY];
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.providerNarrowingEnabled).toBe(true);
    expect(attribution.providerNarrowingMode).toBe("narrowed");
    expect(attribution.providerNarrowingFallbackUsed).toBe(false);
  });

  it("env=false → narrowing OFF, full catalog, reason narrowing_disabled (V2)", () => {
    process.env[KEY] = "false";
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.providerNarrowingEnabled).toBe(false);
    expect(attribution.providerNarrowingMode).toBe("full-catalog");
    expect(attribution.providerNarrowingFallbackUsed).toBe(false);
    expect(attribution.providerNarrowingReason).toBe("narrowing_disabled");
    expect(attribution.catalogProviderCount).toBe(attribution.catalogProvidersTotal);
  });

  it("env=false → V1 builder also restores full catalog", () => {
    process.env[KEY] = "false";
    const { attribution } = buildWorkflowPlanPromptV1WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.providerNarrowingMode).toBe("full-catalog");
    expect(attribution.catalogProviderCount).toBe(attribution.catalogProvidersTotal);
  });
});

// ─── V2 CONTEXT PACKET narrowing fields ──────────────────────────────────────

describe("AI-30 — V2 CONTEXT PACKET reports narrowing", () => {
  it("narrowed: providersIncluded < providersTotal, narrowingMode=narrowed, narrowingReason=null", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    const system = messages[0]!.content;
    expect(system).toMatch(/"providersTotal":\s*6/);
    // Slack named + native always-include = 2 included; total 6.
    expect(system).toMatch(/"providersIncluded":\s*2/);
    expect(system).toContain('"narrowingMode": "narrowed"');
    expect(system).toContain('"narrowingReason": null');
  });

  it("full-catalog fallback for ambiguous broad request reports reason", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    );
    const system = messages[0]!.content;
    expect(system).toContain('"narrowingMode": "full-catalog"');
    expect(system).toContain('"narrowingReason": "ambiguous_broad_request"');
    expect(system).toMatch(/"providersIncluded":\s*6/);
    expect(system).toMatch(/"providersTotal":\s*6/);
  });
});

// ─── R1 narrowing-aware no-substitution clause ───────────────────────────────

describe("AI-30 — R1 contains the narrowing-aware no-substitution clause", () => {
  it("renders the new clause inside R1, above R2", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    const system = messages[0]!.content;
    const r1Index = system.indexOf("R1 — SAFETY-CRITICAL");
    const r2Index = system.indexOf("R2 — CURRENT CANVAS GROUNDING");
    const narrowingClauseIndex = system.indexOf(
      "The catalog above may have been narrowed",
    );
    expect(r1Index).toBeGreaterThan(0);
    expect(r2Index).toBeGreaterThan(r1Index);
    expect(narrowingClauseIndex).toBeGreaterThan(r1Index);
    expect(narrowingClauseIndex).toBeLessThan(r2Index);
  });

  it("R1 title surfaces the narrowing extension", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(messages[0]!.content).toContain(
      "R1 — SAFETY-CRITICAL (catalog-only use + no substitution, including under narrowing)",
    );
  });

  it("V1 builder renders the new constraint string too (PLANNER_CONSTRAINTS is shared)", () => {
    const { messages } = buildWorkflowPlanPromptV1WithAttribution(makeInput());
    expect(messages[0]!.content).toContain(
      "The catalog above may have been narrowed",
    );
  });
});

// ─── Attribution narrowing fields ────────────────────────────────────────────

describe("AI-30 — attribution narrowing fields", () => {
  it("narrowed: omittedProviderCount = total - included", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(attribution.providerNarrowingMode).toBe("narrowed");
    expect(attribution.providerNarrowingOmittedCount).toBe(
      attribution.catalogProvidersTotal - attribution.catalogProviderCount,
    );
    expect(attribution.providerNarrowingOmittedCount).toBeGreaterThan(0);
  });

  it("full-catalog: omittedProviderCount = 0 (no providers dropped)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    );
    expect(attribution.providerNarrowingMode).toBe("full-catalog");
    expect(attribution.providerNarrowingOmittedCount).toBe(0);
  });

  it("providerNarrowingFallbackUsed distinguishes 'tried-and-bailed' from 'disabled'", () => {
    // Tried-and-bailed: narrowing enabled, helper chose full-catalog.
    const tried = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    ).attribution;
    expect(tried.providerNarrowingEnabled).toBe(true);
    expect(tried.providerNarrowingFallbackUsed).toBe(true);

    const KEY = "ENABLE_AI_PROVIDER_NARROWING";
    const prev = process.env[KEY];
    try {
      process.env[KEY] = "false";
      const disabled = buildWorkflowPlanPromptV2WithAttribution(
        makeInput({ userRequest: "create an automation" }),
      ).attribution;
      expect(disabled.providerNarrowingEnabled).toBe(false);
      expect(disabled.providerNarrowingFallbackUsed).toBe(false);
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  });
});

// ─── Cost reduction in representative scenarios ──────────────────────────────

describe("AI-30 — representative cost reductions (char counts, deterministic)", () => {
  it("Slack-only request: catalogChars shrinks vs full catalog", () => {
    const slackOnly = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    ).attribution;
    const broadCtrl = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    ).attribution;
    // Narrowed: 2 providers (slack + native). Full: 6 providers.
    expect(slackOnly.catalogProviderCount).toBe(2);
    expect(broadCtrl.catalogProviderCount).toBe(6);
    expect(slackOnly.catalogChars).toBeLessThan(broadCtrl.catalogChars);
    expect(slackOnly.totalPacketChars).toBeLessThan(broadCtrl.totalPacketChars);
  });

  it("Stripe + Slack request: both included, catalog smaller than full", () => {
    const both = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "When Stripe payment fails send me a Slack DM" }),
    ).attribution;
    expect(both.catalogProviderCount).toBeGreaterThanOrEqual(3); // stripe + slack + native
    expect(both.catalogProviderCount).toBeLessThan(both.catalogProvidersTotal);
    expect(both.providerNarrowingMode).toBe("narrowed");
  });

  it("Current-canvas edit: canvas providers preserved across narrowing", () => {
    const result = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        userRequest: "Add a Trello card creation after the Slack DM goes out using stripe customer name",
        currentGraph: {
          nodes: [
            { id: "n1", kind: "trigger", provider: "stripe", type: "event" },
            { id: "n2", kind: "action", provider: "slack", type: "send" },
            { id: "n3", kind: "action", provider: "notion", type: "send" },
            { id: "n4", kind: "action", provider: "gmail", type: "send" },
          ],
          edges: [],
        },
      }),
    );
    const system = result.messages[0]!.content;
    expect(system).toContain("- stripe");
    expect(system).toContain("- slack");
    expect(system).toContain("- notion");
    expect(system).toContain("- gmail");
    expect(system).toContain("- trello");
    expect(result.attribution.providerNarrowingMode).toBe("narrowed");
  });

  it("ambiguous broad prompt: full catalog (no reduction)", () => {
    const broad = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "create an automation" }),
    ).attribution;
    expect(broad.catalogProviderCount).toBe(broad.catalogProvidersTotal);
  });
});

// ─── No-substitution scenarios at prompt level ───────────────────────────────

describe("AI-30 — multi-provider scenarios produce non-substituted catalogs", () => {
  it("'Slack DM when I get a Gmail email' renders BOTH slack and gmail in the catalog", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM when I get a Gmail email" }),
    );
    const system = messages[0]!.content;
    expect(system).toContain("- slack");
    expect(system).toContain("- gmail");
  });

  it("'When Stripe payment fails send a Slack DM' renders BOTH stripe and slack", () => {
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "When Stripe payment fails send me a Slack DM" }),
    );
    const system = messages[0]!.content;
    expect(system).toContain("- stripe");
    expect(system).toContain("- slack");
  });

  it("'When I get an email send a Slack message' includes gmail + outlook (ambiguous) + slack — but only those connected to the catalog fixture", () => {
    // Our fixture catalog has gmail and slack but no microsoft-outlook
    // entry; the helper filters connected/canvas/alias picks against the
    // catalog, so outlook is silently dropped (it's not narrowable into a
    // catalog it isn't in). Slack + Gmail still appear.
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "When I get an email send a Slack message" }),
    );
    const system = messages[0]!.content;
    expect(system).toContain("- slack");
    expect(system).toContain("- gmail");
  });

  it("disconnected named provider is included in the catalog (so the planner can return select_integration, not substitute)", () => {
    // Catalog has stripe; user names stripe but is not connected.
    const { messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        userRequest: "When a Stripe payment fails alert me on Slack",
        connectedIntegrations: [
          { provider: "slack", connected: true, accountLabel: "Acme", accountScope: null, scopeCount: 0 },
        ],
      }),
    );
    const system = messages[0]!.content;
    expect(system).toContain("- stripe");
    expect(system).toContain("- slack");
  });
});

// ─── Determinism + no-leak ───────────────────────────────────────────────────

describe("AI-30 — determinism + no-leak", () => {
  it("same input → same messages + attribution (narrowing helper is pure)", () => {
    const a = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    const b = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(a.messages).toEqual(b.messages);
    expect(a.attribution).toEqual(b.attribution);
  });

  it("attribution never contains raw user request text or arbitrary string blobs", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        userRequest: "SECRET-LOOKING-PHRASE-XYZ-12345 send a Slack DM",
      }),
    );
    for (const [, value] of Object.entries(attribution)) {
      if (typeof value === "string") {
        expect(value).not.toContain("SECRET-LOOKING-PHRASE-XYZ-12345");
      }
    }
  });

  it("attribution carries no provider id arrays (counts + enums only)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    for (const [, value] of Object.entries(attribution)) {
      expect(Array.isArray(value)).toBe(false);
    }
  });

  it("V2 builder reports the current PLANNER_PACKET_VERSION", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(makeInput());
    expect(attribution.packetVersion).toBe(PLANNER_PACKET_VERSION);
  });

  it("dispatcher routes to V2 by default (narrowing-aware)", () => {
    const { attribution } = buildWorkflowPlanPromptWithAttribution(makeInput());
    expect(attribution.packetVersion).toBe(PLANNER_PACKET_VERSION);
    expect(attribution.providerNarrowingMode).toBe("narrowed");
  });
});
