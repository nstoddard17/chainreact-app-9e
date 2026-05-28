/**
 * @jest-environment node
 *
 * Slice 4.AI-30 — tests for the deterministic provider narrowing helper.
 *
 * What this file pins:
 *   - Safety invariants: explicit mentions, current canvas, connected, and
 *     native are NEVER dropped from the narrowed set.
 *   - Alias coverage: every alias in the table maps to its provider when
 *     used in a request; word-boundary matching avoids substring false
 *     positives.
 *   - Ambiguous capability tokens ("email", "calendar") add multi-candidate
 *     inclusions ONLY when the user didn't already name a specific
 *     provider.
 *   - Full-catalog fallback for the documented reasons: env disabled,
 *     empty request, empty catalog, broad generic phrasing, no provider
 *     mention, complex-canvas vague edit.
 *   - No-substitution cases: every scenario in the user spec ("Send a
 *     Slack DM when I get a Gmail email", "When Stripe payment fails send
 *     me a Slack DM", "When I get an email send a Slack message") includes
 *     ALL named providers.
 *   - Decision metadata shape: `providerIds`, `explicitlyMentionedProviderIds`,
 *     `aliasMatchedProviderIds`, `connectedProviderIds`, `canvasProviderIds`,
 *     `ambiguousInclusions`, `nativeIncluded`, `fallbackReason`,
 *     `omittedProviderCount` are all deterministic.
 *
 * Helper-only contract — does NOT exercise the prompt builder. Builder /
 * attribution wiring is covered by `buildWorkflowPlanPromptV2.test.ts` and
 * `buildWorkflowPlanPrompt.attribution.test.ts`.
 */
import {
  filterCatalogToNarrowed,
  narrowProvidersForPlan,
  type NarrowProvidersInput,
} from "@/services/ai/planner/narrowProvidersForPlan";
import type {
  ConnectedIntegrationView,
} from "@/services/ai/tools/integrations";
import type {
  CurrentWorkflowGraphView,
} from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

// ─── Catalog fixtures: all 26 registry provider ids (lean entries — the
// helper only consults `id`). ────────────────────────────────────────────────

const ALL_PROVIDER_IDS: readonly string[] = [
  "gmail",
  "microsoft-outlook",
  "microsoft-outlook-calendar",
  "google-calendar",
  "google-sheets",
  "google-drive",
  "google-docs",
  "google-analytics",
  "microsoft-teams",
  "microsoft-excel",
  "microsoft-onedrive",
  "microsoft-onenote",
  "slack",
  "discord",
  "stripe",
  "shopify",
  "notion",
  "trello",
  "airtable",
  "hubspot",
  "mailchimp",
  "monday",
  "github",
  "facebook",
  "dropbox",
  "native",
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

function fullCatalog(): ProviderCatalogView {
  return { providers: ALL_PROVIDER_IDS.map(leanProvider) };
}

function makeInput(
  overrides: Partial<NarrowProvidersInput> = {},
): NarrowProvidersInput {
  return {
    userRequest: "",
    catalog: fullCatalog(),
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

function canvasGraph(
  nodes: ReadonlyArray<{ id: string; provider: string; type: string; kind?: "trigger" | "action" }>,
): CurrentWorkflowGraphView {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.kind ?? "action",
      provider: n.provider,
      type: n.type,
    })),
    edges: [],
  };
}

// ─── Env flag ────────────────────────────────────────────────────────────────

describe("narrowProvidersForPlan — env flag", () => {
  const KEY = "ENABLE_AI_PROVIDER_NARROWING";
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env[KEY];
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env[KEY];
    else process.env[KEY] = originalEnv;
  });

  it("env=false → full-catalog with reason narrowing_disabled", () => {
    process.env[KEY] = "false";
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(result.mode).toBe("full-catalog");
    expect(result.fallbackReason).toBe("narrowing_disabled");
    expect(result.providerIds.size).toBe(ALL_PROVIDER_IDS.length);
  });

  it("env unset → narrowing active when a provider is named", () => {
    delete process.env[KEY];
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("slack")).toBe(true);
  });

  it("env=true → narrowing active (only the literal 'false' disables)", () => {
    process.env[KEY] = "true";
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(result.mode).toBe("narrowed");
  });
});

// ─── Always-include invariants ───────────────────────────────────────────────

describe("narrowProvidersForPlan — always-include invariants", () => {
  it("explicitly-named Slack is always included (canonical id mention → explicit, not alias)", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM when a webhook fires" }),
    );
    expect(result.providerIds.has("slack")).toBe(true);
    // "slack" IS the canonical provider id, so it lands in the explicit
    // bucket, not the alias bucket. (Aliases are non-canonical surface
    // forms like "google mail" → gmail.)
    expect(result.explicitlyMentionedProviderIds).toContain("slack");
    expect(result.aliasMatchedProviderIds).not.toContain("slack");
  });

  it("alias-only mention (no canonical id in text) lands in aliasMatchedProviderIds", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send via google mail when a webhook fires" }),
    );
    expect(result.providerIds.has("gmail")).toBe(true);
    expect(result.aliasMatchedProviderIds).toContain("gmail");
    expect(result.explicitlyMentionedProviderIds).not.toContain("gmail");
  });

  it("connected providers are always included even when not in request", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        userRequest: "Send a Slack DM",
        connectedIntegrations: [connected("notion"), connected("airtable")],
      }),
    );
    expect(result.providerIds.has("notion")).toBe(true);
    expect(result.providerIds.has("airtable")).toBe(true);
    expect(result.providerIds.has("slack")).toBe(true);
    expect(result.connectedProviderIds).toEqual(["notion", "airtable"]);
  });

  it("canvas providers are always included even when not in request", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        userRequest: "Send a Slack DM",
        currentGraph: canvasGraph([
          { id: "n1", provider: "stripe", type: "event_received", kind: "trigger" },
          { id: "n2", provider: "trello", type: "create_card" },
        ]),
      }),
    );
    expect(result.providerIds.has("stripe")).toBe(true);
    expect(result.providerIds.has("trello")).toBe(true);
    expect(result.canvasProviderIds).toEqual(["stripe", "trello"]);
  });

  it("native is included in every narrowed result", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(result.nativeIncluded).toBe(true);
    expect(result.providerIds.has("native")).toBe(true);
  });

  it("native logic keyword 'manual' counts as a provider mention (narrows even without other providers)", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "run manually" }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("native")).toBe(true);
  });
});

// ─── Alias coverage ──────────────────────────────────────────────────────────

describe("narrowProvidersForPlan — alias coverage", () => {
  const cases: ReadonlyArray<{ request: string; expectedIds: readonly string[] }> = [
    { request: "Send me a Gmail email", expectedIds: ["gmail"] },
    { request: "via google mail", expectedIds: ["gmail"] },
    { request: "use ms outlook for the reply", expectedIds: ["microsoft-outlook"] },
    { request: "Outlook calendar event", expectedIds: ["microsoft-outlook-calendar"] },
    { request: "google calendar invite", expectedIds: ["google-calendar"] },
    { request: "add a row to a google sheet", expectedIds: ["google-sheets"] },
    { request: "upload to google drive", expectedIds: ["google-drive"] },
    { request: "create a google doc", expectedIds: ["google-docs"] },
    { request: "google analytics report", expectedIds: ["google-analytics"] },
    { request: "post in microsoft teams", expectedIds: ["microsoft-teams"] },
    { request: "save to microsoft excel", expectedIds: ["microsoft-excel"] },
    { request: "upload to onedrive", expectedIds: ["microsoft-onedrive"] },
    { request: "save a note in onenote", expectedIds: ["microsoft-onenote"] },
    { request: "ping me on discord", expectedIds: ["discord"] },
    { request: "stripe payment failed", expectedIds: ["stripe"] },
    { request: "create a shopify order", expectedIds: ["shopify"] },
    { request: "add a notion page", expectedIds: ["notion"] },
    { request: "create a trello card", expectedIds: ["trello"] },
    { request: "add an airtable record", expectedIds: ["airtable"] },
    { request: "hubspot deal closed", expectedIds: ["hubspot"] },
    { request: "send a mailchimp campaign", expectedIds: ["mailchimp"] },
    { request: "create a monday.com item", expectedIds: ["monday"] },
    { request: "new github commit", expectedIds: ["github"] },
    { request: "facebook page comment", expectedIds: ["facebook"] },
    { request: "save to dropbox", expectedIds: ["dropbox"] },
  ];

  for (const { request, expectedIds } of cases) {
    it(`"${request}" → includes ${expectedIds.join(", ")}`, () => {
      const result = narrowProvidersForPlan(makeInput({ userRequest: request }));
      expect(result.mode).toBe("narrowed");
      for (const id of expectedIds) {
        expect(result.providerIds.has(id)).toBe(true);
      }
    });
  }

  it("word-boundary matching: 'monthly' must NOT match 'monday'", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "every monthly meeting send me a Slack DM" }),
    );
    expect(result.providerIds.has("monday")).toBe(false);
  });

  it("word-boundary matching: 'esteems' must NOT match 'teams'", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "the team esteems Slack messages" }),
    );
    expect(result.providerIds.has("microsoft-teams")).toBe(false);
    expect(result.providerIds.has("slack")).toBe(true);
  });
});

// ─── Ambiguous capability tokens ─────────────────────────────────────────────

describe("narrowProvidersForPlan — ambiguous capability tokens", () => {
  it('"email" with no provider named → both gmail + microsoft-outlook', () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "when I get an email send a Slack DM" }),
    );
    expect(result.providerIds.has("gmail")).toBe(true);
    expect(result.providerIds.has("microsoft-outlook")).toBe(true);
    expect(result.ambiguousInclusions).toEqual(
      expect.arrayContaining(["gmail", "microsoft-outlook"]),
    );
  });

  it('"email" with Gmail named → only gmail (no ambiguous add)', () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "when I get a Gmail email send a Slack DM" }),
    );
    expect(result.providerIds.has("gmail")).toBe(true);
    expect(result.providerIds.has("microsoft-outlook")).toBe(false);
    expect(result.ambiguousInclusions).toEqual([]);
  });

  it('"calendar" with no provider named → both calendars', () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "when I get a calendar invite send a Slack DM" }),
    );
    expect(result.providerIds.has("google-calendar")).toBe(true);
    expect(result.providerIds.has("microsoft-outlook-calendar")).toBe(true);
  });

  it('"calendar" with Google named → only google-calendar', () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "when I get a google calendar invite send a Slack DM" }),
    );
    expect(result.providerIds.has("google-calendar")).toBe(true);
    expect(result.providerIds.has("microsoft-outlook-calendar")).toBe(false);
  });
});

// ─── Multi-provider scenarios from the AI-30 spec ────────────────────────────

describe("narrowProvidersForPlan — multi-provider no-substitution scenarios", () => {
  it("Slack DM when I get a Gmail email → both slack + gmail in narrowed set", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM when I get a Gmail email" }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("slack")).toBe(true);
    expect(result.providerIds.has("gmail")).toBe(true);
    // Ambiguous email-token addition is suppressed because gmail was named.
    expect(result.providerIds.has("microsoft-outlook")).toBe(false);
  });

  it("Stripe payment fails → send Slack DM: both stripe + slack", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "When Stripe payment fails send me a Slack DM" }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("stripe")).toBe(true);
    expect(result.providerIds.has("slack")).toBe(true);
  });

  it("When I get an email send a Slack message: gmail + outlook (ambiguous) + slack", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "When I get an email send a Slack message" }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("slack")).toBe(true);
    expect(result.providerIds.has("gmail")).toBe(true);
    expect(result.providerIds.has("microsoft-outlook")).toBe(true);
  });

  it("Slack DM doesn't force any specific action — provider only", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send me a Slack DM" }),
    );
    expect(result.providerIds.has("slack")).toBe(true);
    // narrowing helper never picks an action; planner decides.
  });
});

// ─── Fallback paths ──────────────────────────────────────────────────────────

describe("narrowProvidersForPlan — full-catalog fallback paths", () => {
  it("empty request → full catalog, reason empty_user_request", () => {
    const result = narrowProvidersForPlan(makeInput({ userRequest: "   " }));
    expect(result.mode).toBe("full-catalog");
    expect(result.fallbackReason).toBe("empty_user_request");
  });

  it("empty catalog → full catalog (passthrough), reason empty_catalog", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        userRequest: "Send a Slack DM",
        catalog: { providers: [] },
      }),
    );
    expect(result.mode).toBe("full-catalog");
    expect(result.fallbackReason).toBe("empty_catalog");
    expect(result.providerIds.size).toBe(0);
  });

  it("broad generic phrase, no provider mention → full catalog", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "create an automation" }),
    );
    expect(result.mode).toBe("full-catalog");
    expect(result.fallbackReason).toBe("ambiguous_broad_request");
  });

  it("broad generic phrase WITH a provider mention → narrowed (kept the named provider)", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "create an automation using Slack" }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("slack")).toBe(true);
  });

  it("no provider mention at all (vague but specific-sounding) → full catalog", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "ping me when something changes" }),
    );
    expect(result.mode).toBe("full-catalog");
    expect(result.fallbackReason).toBe("no_provider_mention");
  });

  it("complex canvas + extremely short prompt → full catalog (vague edit)", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        userRequest: "add a step",
        currentGraph: canvasGraph([
          { id: "n1", provider: "stripe", type: "event_received", kind: "trigger" },
          { id: "n2", provider: "slack", type: "send_direct_message" },
          { id: "n3", provider: "gmail", type: "send_email" },
          { id: "n4", provider: "notion", type: "create_page" },
        ]),
      }),
    );
    expect(result.mode).toBe("full-catalog");
    expect(result.fallbackReason).toBe("complex_canvas_vague_edit");
  });

  it("complex canvas + LONG specific prompt with provider mention → narrowed (no vague-edit trigger)", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        userRequest:
          "Add a Trello card creation step after the Slack DM goes out, using the Stripe customer name",
        currentGraph: canvasGraph([
          { id: "n1", provider: "stripe", type: "event_received", kind: "trigger" },
          { id: "n2", provider: "slack", type: "send_direct_message" },
          { id: "n3", provider: "gmail", type: "send_email" },
          { id: "n4", provider: "notion", type: "create_page" },
        ]),
      }),
    );
    expect(result.mode).toBe("narrowed");
    expect(result.providerIds.has("trello")).toBe(true);
    expect(result.providerIds.has("slack")).toBe(true);
    expect(result.providerIds.has("stripe")).toBe(true);
  });
});

// ─── Decision metadata ───────────────────────────────────────────────────────

describe("narrowProvidersForPlan — decision metadata", () => {
  it("populates explicit/alias/connected/canvas arrays separately", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        // "Slack" and "Gmail" are canonical provider ids — they go to
        // explicitlyMentionedProviderIds. An alias-only ("google mail")
        // would land in aliasMatchedProviderIds.
        userRequest: "Send a Slack DM when I get a Gmail email",
        connectedIntegrations: [connected("notion")],
        currentGraph: canvasGraph([
          { id: "n1", provider: "stripe", type: "event_received", kind: "trigger" },
        ]),
      }),
    );
    expect(result.explicitlyMentionedProviderIds).toEqual(
      expect.arrayContaining(["slack", "gmail"]),
    );
    expect(result.aliasMatchedProviderIds).not.toContain("slack");
    expect(result.aliasMatchedProviderIds).not.toContain("gmail");
    expect(result.connectedProviderIds).toEqual(["notion"]);
    expect(result.canvasProviderIds).toEqual(["stripe"]);
    expect(result.nativeIncluded).toBe(true);
  });

  it("computes omittedProviderCount as (total - included) when narrowed", () => {
    const result = narrowProvidersForPlan(
      makeInput({ userRequest: "Send a Slack DM" }),
    );
    expect(result.mode).toBe("narrowed");
    // slack + native always included; everything else dropped.
    expect(result.omittedProviderCount).toBe(
      ALL_PROVIDER_IDS.length - result.providerIds.size,
    );
    expect(result.providerIds.has("slack")).toBe(true);
    expect(result.providerIds.has("native")).toBe(true);
  });

  it("omittedProviderCount is 0 in full-catalog mode", () => {
    const result = narrowProvidersForPlan(makeInput({ userRequest: "" }));
    expect(result.mode).toBe("full-catalog");
    expect(result.omittedProviderCount).toBe(0);
  });

  it("connected/canvas providers not in the catalog are filtered out of metadata arrays", () => {
    const result = narrowProvidersForPlan(
      makeInput({
        userRequest: "Send a Slack DM",
        connectedIntegrations: [connected("ghost-provider")],
        currentGraph: canvasGraph([
          { id: "n1", provider: "another-ghost", type: "x" },
        ]),
      }),
    );
    expect(result.connectedProviderIds).not.toContain("ghost-provider");
    expect(result.canvasProviderIds).not.toContain("another-ghost");
  });
});

// ─── filterCatalogToNarrowed ─────────────────────────────────────────────────

describe("filterCatalogToNarrowed", () => {
  it("returns the same catalog object when full-catalog mode", () => {
    const catalog = fullCatalog();
    const result = narrowProvidersForPlan({
      ...makeInput({ userRequest: "" }),
      catalog,
    });
    expect(result.mode).toBe("full-catalog");
    expect(filterCatalogToNarrowed(catalog, result)).toBe(catalog);
  });

  it("filters to the narrowed provider ids when narrowed", () => {
    const catalog = fullCatalog();
    const result = narrowProvidersForPlan({
      ...makeInput({ userRequest: "Send a Slack DM" }),
      catalog,
    });
    const filtered = filterCatalogToNarrowed(catalog, result);
    const filteredIds = new Set(filtered.providers.map((p) => p.id));
    expect(filteredIds.size).toBeLessThan(catalog.providers.length);
    expect(filteredIds.has("slack")).toBe(true);
    expect(filteredIds.has("native")).toBe(true);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe("narrowProvidersForPlan — determinism", () => {
  it("same input → same output (run repeatedly)", () => {
    const input = makeInput({
      userRequest: "When Stripe payment fails send me a Slack DM",
      connectedIntegrations: [connected("notion")],
      currentGraph: canvasGraph([
        { id: "n1", provider: "stripe", type: "event_received", kind: "trigger" },
      ]),
    });
    const a = narrowProvidersForPlan(input);
    const b = narrowProvidersForPlan(input);
    expect(Array.from(a.providerIds).sort()).toEqual(
      Array.from(b.providerIds).sort(),
    );
    expect(a.fallbackReason).toBe(b.fallbackReason);
    expect(a.mode).toBe(b.mode);
  });
});
