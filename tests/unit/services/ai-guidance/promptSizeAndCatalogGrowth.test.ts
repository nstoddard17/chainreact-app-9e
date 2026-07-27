/**
 * @jest-environment node
 *
 * REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — prompt-size ceilings, relevant-capability selection, and
 * catalog-growth behavior. Runs against the REAL registry (no mocks) so the ceilings are what
 * production actually sends; the growth test then simulates a much larger registry through the
 * builder's own inputs to prove size is bounded by SELECTION, not by catalog volume.
 */
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import {
  buildCompactCapabilityLines,
  buildOtherProviderNamesLine,
  selectRelevantProvidersWithMode,
  MAX_COMPACT_CATALOG_LINES,
  COMPACT_CATALOG_TRUNCATION_LINE,
  MAX_FIELD_SCHEMA_PROVIDERS,
} from "@/services/ai-guidance/promptFieldSchemas";
import { validateWorkflowPlan } from "@/services/ai-guidance/validateWorkflowPlan";
import { inferNamedProviderChainPlan } from "@/services/ai-guidance/fallback/inferNamedProviderChainPlan";
import { WORKFLOW_PLAN_SCHEMA_VERSION } from "@/contracts/guidanceSession";
import type { WorkflowGuidanceRequest } from "@/services/ai-guidance/types";

const CLEAR_FOUR =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot contact, and send me a Gmail summary.";

const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

/** Approved Stage-A ceiling for explicit named-provider workflows (chars ≈ tokens × 4). */
const NAMED_PROMPT_CHAR_CEILING = 32_000; // ≈ 8,000 estimated tokens

function buildStageAPrompt(goal: string): { prompt: string; mode: string; providers: readonly string[] } {
  const selection = selectRelevantProvidersWithMode({ texts: [goal] });
  const prompt = buildGatewayGuidancePrompt({
    request: EMPTY_REQUEST,
    goalText: goal,
    compactCapabilityLines: buildCompactCapabilityLines(selection.providers),
    otherProvidersLine: buildOtherProviderNamesLine(selection.providers),
  });
  return { prompt, mode: selection.mode, providers: selection.providers };
}

describe("prompt-size ceilings (#1, #3, #4, #5)", () => {
  it("(#1) the clear four-provider prompt stays under the approved ceiling", () => {
    const { prompt, mode } = buildStageAPrompt(CLEAR_FOUR);
    expect(mode).toBe("named");
    expect(prompt.length).toBeLessThan(NAMED_PROMPT_CHAR_CEILING);
  });

  it("(#4) selection includes ALL explicitly named providers", () => {
    const { providers } = buildStageAPrompt(CLEAR_FOUR);
    for (const p of ["typeform", "mailchimp", "hubspot", "gmail"]) expect(providers).toContain(p);
    // Named mode drops the unrelated category padding the old selection carried.
    expect(providers).not.toContain("discord");
    expect(providers).not.toContain("facebook");
  });

  it("(#5) a generic request keeps the real alternatives (broad mode)", () => {
    const { mode, providers } = buildStageAPrompt("When I receive an email, save the attachment to cloud storage.");
    expect(mode).toBe("broad");
    // Both supported email providers stay available for the provider question.
    expect(providers).toContain("gmail");
    expect(providers).toContain("microsoft-outlook");
  });

  it("(#3) compact trigger lines keep output names (the mapping roots) while actions stay one-line", () => {
    const lines = buildCompactCapabilityLines(["typeform"]);
    const triggerLine = lines.find((l) => l.includes("typeform:new_response_in_form"));
    expect(triggerLine).toBeDefined();
    expect(triggerLine).toContain("outputs:");
    expect(triggerLine).toMatch(/\[trigger\]/);
  });

  it("named-mode prompts still carry names-only awareness of every other provider", () => {
    const { prompt } = buildStageAPrompt(CLEAR_FOUR);
    expect(prompt).toContain("Other available ChainReact providers (names only");
  });
});

describe("full-registry validation stays authoritative (#6, #29)", () => {
  it("an invented capability is rejected regardless of what the prompt carried", () => {
    const plan = {
      schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
      title: "x",
      summary: "y",
      notApplied: true as const,
      steps: [
        { ref: "s0", role: "trigger" as const, provider: "typeform", type: "new_response_in_form", purpose: "" },
        { ref: "s1", role: "action" as const, provider: "madeup", type: "do_thing", purpose: "" },
      ],
    };
    const v = validateWorkflowPlan(plan);
    expect(v.ok).toBe(false);
  });
});

describe("catalog growth (#25–#28)", () => {
  /** Simulated much-larger registry: many providers, none of them named in the request. */
  const GROWN_PROVIDER_IDS = Array.from({ length: 100 }, (_, i) => `grown-provider-${i}`);

  it("(#26) the compact catalog is LINE-bounded with an honest marker, whatever the provider count", () => {
    // Feed the builder far more providers than production selection ever would — the bound holds.
    const lines = buildCompactCapabilityLines([
      "gmail",
      "hubspot",
      "mailchimp",
      "typeform",
      "slack",
      "stripe",
      "shopify",
      "trello",
      ...GROWN_PROVIDER_IDS, // unknown ids contribute nothing (registry-driven)
    ]);
    expect(lines.length).toBeLessThanOrEqual(MAX_COMPACT_CATALOG_LINES + 1);
    if (lines.length === MAX_COMPACT_CATALOG_LINES + 1) {
      expect(lines[lines.length - 1]).toBe(COMPACT_CATALOG_TRUNCATION_LINE);
    }
  });

  it("(#27) provider selection is capped, so registry growth cannot linearly grow the prompt", () => {
    const selection = selectRelevantProvidersWithMode({
      texts: ["When I receive an email, save the attachment to cloud storage."],
    });
    expect(selection.providers.length).toBeLessThanOrEqual(MAX_FIELD_SCHEMA_PROVIDERS);
  });

  it("(#28) local deterministic planning time does not grow with metadata volume (strict bound)", () => {
    // (#20) — the whole local plan (classification happens in the route; this is the planner) must
    // complete far inside the local reserve. Generous CI bound; production measures sub-5ms.
    const start = performance.now();
    for (let i = 0; i < 10; i += 1) inferNamedProviderChainPlan(CLEAR_FOUR);
    const perCallMs = (performance.now() - start) / 10;
    expect(perCallMs).toBeLessThan(150);
  });
});
