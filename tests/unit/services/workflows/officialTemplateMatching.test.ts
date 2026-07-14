/**
 * @jest-environment node
 */
import type { MarketplaceTemplateSummary, TemplateStepSummary } from "@/contracts/workflowTemplate";
import type { OfficialTemplateCatalogEntry } from "@/core/workflows/officialTemplateMatcher";

// Mock the repository so the DEFAULT loader path is exercised without a DB.
const listOfficialTemplatesServiceRole = jest.fn();
jest.mock("@/repositories/workflowTemplates", () => ({
  listOfficialTemplatesServiceRole: () => listOfficialTemplatesServiceRole(),
}));

import {
  suggestOfficialTemplatesForRequest,
  selectOfficialTemplateRecommendationForRequest,
  buildManualFallbackNoticeText,
  toGuidanceTemplateMatches,
  buildOfficialTemplateMatchGuidanceText,
} from "@/services/workflows/officialTemplateMatching";
import type { OfficialTemplateMatch } from "@/core/workflows/officialTemplateMatcher";

function step(kind: "trigger" | "action", provider: string, type: string): TemplateStepSummary {
  return { kind, provider, type };
}

const SHOPIFY_ENTRY: OfficialTemplateCatalogEntry = {
  id: "t-shopify-order",
  name: "Shopify order operations",
  description: "When a Shopify order webhook fires, log the order and open a fulfillment task.",
  category: "ecommerce",
  triggerKind: "app",
  providers: ["shopify", "google-sheets", "hubspot", "slack"],
  steps: [
    step("trigger", "shopify", "webhook_received"),
    step("action", "google-sheets", "append_row"),
    step("action", "hubspot", "create_task"),
    step("action", "slack", "send_channel_message"),
  ],
  nodeCount: 4,
  stepCount: 3,
};

function officialSummary(over: Partial<MarketplaceTemplateSummary> = {}): MarketplaceTemplateSummary {
  return {
    id: "t-shopify-order",
    name: "Shopify order operations",
    description: "When a Shopify order webhook fires, log the order and open a fulfillment task.",
    source: "official",
    isOfficial: true,
    visibility: "public",
    creatorDisplayName: "ChainReact",
    usageCount: 0,
    forkCount: 0,
    forkedFromTemplateId: null,
    publishedAt: null,
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00Z",
    card: {
      nodeCount: 4,
      stepCount: 3,
      triggerKind: "app",
      providers: ["shopify", "google-sheets", "hubspot", "slack"],
      category: "ecommerce",
      steps: [
        step("trigger", "shopify", "webhook_received"),
        step("action", "google-sheets", "append_row"),
        step("action", "hubspot", "create_task"),
        step("action", "slack", "send_channel_message"),
      ],
    },
    ...over,
  };
}

beforeEach(() => listOfficialTemplatesServiceRole.mockReset());

describe("suggestOfficialTemplatesForRequest — injected loader (no DB)", () => {
  it("ranks the catalog from the injected loader", async () => {
    const res = await suggestOfficialTemplatesForRequest({
      requestText: "When a Shopify order is created, create a HubSpot task and notify Slack.",
      loadCatalog: async () => [SHOPIFY_ENTRY],
    });
    expect(res.matches[0]!.templateId).toBe("t-shopify-order");
    expect(res.confidence).not.toBe("none");
    expect(listOfficialTemplatesServiceRole).not.toHaveBeenCalled();
  });

  it("returns no confident match for a vague request", async () => {
    const res = await suggestOfficialTemplatesForRequest({
      requestText: "make my business easier",
      loadCatalog: async () => [SHOPIFY_ENTRY],
    });
    expect(res).toEqual({ confidence: "none", matches: [] });
  });
});

describe("suggestOfficialTemplatesForRequest — default loader uses the official-only repository", () => {
  it("reads the official catalog and excludes any non-official summary defensively", async () => {
    listOfficialTemplatesServiceRole.mockResolvedValue([
      officialSummary({ id: "t-shopify-order" }),
      // A defensive case: even if a non-official row slipped through, it must be filtered out.
      officialSummary({ id: "sneaky-user", source: "user", isOfficial: false }),
    ]);
    const res = await suggestOfficialTemplatesForRequest({
      requestText: "When a Shopify order is created, create a HubSpot task and notify Slack.",
    });
    expect(listOfficialTemplatesServiceRole).toHaveBeenCalledTimes(1);
    expect(res.matches.every((m) => m.templateId !== "sneaky-user")).toBe(true);
    expect(res.matches[0]!.templateId).toBe("t-shopify-order");
  });
});

describe("selectOfficialTemplateRecommendationForRequest — multi-provider action scrutiny (M1, real ActionMeta facts)", () => {
  function multiEntry(steps: TemplateStepSummary[], providers: string[]): OfficialTemplateCatalogEntry {
    return {
      id: "t-multi",
      name: "Typeform response to Google Sheets",
      description: "When a Typeform response is submitted, append it as a new row in Google Sheets.",
      category: "personal-productivity",
      triggerKind: "app",
      providers,
      steps,
      nodeCount: steps.length,
      stepCount: steps.length - 1,
    };
  }
  const REQUEST = "When a Typeform response is submitted, add a row to Google Sheets.";

  it("a multi-provider template with only the requested action is strong (facts lookup runs, no throw)", async () => {
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText: REQUEST,
      loadCatalog: async () => [
        multiEntry(
          [step("trigger", "typeform", "new_response"), step("action", "google-sheets", "append_row")],
          ["typeform", "google-sheets"],
        ),
      ],
    });
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation!.templateId).toBe("t-multi");
  });

  it("a multi-provider template with an unrequested destructive action is weak (build manually)", async () => {
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText: REQUEST,
      loadCatalog: async () => [
        multiEntry(
          [
            step("trigger", "typeform", "new_response"),
            step("action", "google-sheets", "append_row"),
            step("action", "google-sheets", "delete_row"),
          ],
          ["typeform", "google-sheets"],
        ),
      ],
    });
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
  });
});

describe("selectOfficialTemplateRecommendationForRequest — three-way decision (MATCH-4)", () => {
  it("strong_match → maps a SINGLE safe recommendation DTO (isOfficial, no summary/config)", async () => {
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText:
        "When a Shopify order is created, log it to Google Sheets, create a HubSpot task, and notify Slack.",
      loadCatalog: async () => [SHOPIFY_ENTRY],
    });
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation).not.toBeNull();
    expect(res.recommendation!.templateId).toBe("t-shopify-order");
    expect(res.recommendation!.isOfficial).toBe(true);
    expect(res.recommendation).not.toHaveProperty("summary");
    const json = JSON.stringify(res);
    expect(json).not.toContain("{{");
    expect(json).not.toMatch(/"config"|"definition"|"edges"/);
  });

  it("strong_match for an EXACT SINGLE-provider template (one named app) → maps a recommendation", async () => {
    const SLACK_REPOST: OfficialTemplateCatalogEntry = {
      id: "t-slack-repost",
      name: "Slack reaction repost",
      description: "When a reaction is added to a Slack message, repost it into another channel.",
      category: "team-ops",
      triggerKind: "app",
      providers: ["slack"],
      steps: [step("trigger", "slack", "reaction_added"), step("action", "slack", "send_channel_message")],
      nodeCount: 2,
      stepCount: 1,
    };
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText: "When a Slack reaction is added, post a message in another Slack channel.",
      loadCatalog: async () => [SLACK_REPOST],
    });
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation!.templateId).toBe("t-slack-repost");
    expect(res.recommendation!.providers).toEqual(["slack"]);
  });

  it("weak_match (partial / unrelated side-effects) → no recommendation (build manually)", async () => {
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText: "When a Shopify order is created, notify Slack.", // template also adds Sheets + HubSpot
      loadCatalog: async () => [SHOPIFY_ENTRY],
    });
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
  });

  it("no_match (vague request) → no recommendation", async () => {
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText: "make my business easier",
      loadCatalog: async () => [SHOPIFY_ENTRY],
    });
    expect(res.outcome).toBe("no_match");
    expect(res.recommendation).toBeNull();
  });

  it("default loader reads the official-only repository", async () => {
    listOfficialTemplatesServiceRole.mockResolvedValue([officialSummary({ id: "t-shopify-order" })]);
    const res = await selectOfficialTemplateRecommendationForRequest({
      requestText:
        "When a Shopify order is created, log it to Google Sheets, create a HubSpot task, and notify Slack.",
    });
    expect(listOfficialTemplatesServiceRole).toHaveBeenCalledTimes(1);
    expect(res.outcome).toBe("strong_match");
  });
});

describe("buildManualFallbackNoticeText", () => {
  it("returns safe, model-free copy (no {{...}}, no ids)", () => {
    const text = buildManualFallbackNoticeText();
    expect(text.toLowerCase()).toContain("build it directly");
    expect(text).not.toContain("{{");
  });
});

describe("toGuidanceTemplateMatches — safe flattening", () => {
  const match: OfficialTemplateMatch = {
    templateId: "t-1",
    name: "Support escalation from email",
    description: "Open a HubSpot ticket and alert Slack.",
    score: 18,
    confidence: "high",
    reasons: ["Matches the Gmail new labeled email trigger"],
    summary: {
      providers: ["gmail", "hubspot", "slack"],
      providerLabels: ["Gmail", "HubSpot", "Slack"],
      triggerKind: "app",
      category: "sales-crm",
      categoryLabel: "Sales & CRM",
      nodeCount: 4,
      stepCount: 3,
      steps: [{ kind: "trigger", provider: "gmail", type: "new_labeled_email", label: "Gmail: New labeled email" }],
    },
  };

  it("flattens summary + stamps isOfficial, carrying only safe fields", () => {
    const [dto] = toGuidanceTemplateMatches([match]);
    expect(dto).toMatchObject({
      templateId: "t-1",
      name: "Support escalation from email",
      confidence: "high",
      isOfficial: true,
      providers: ["gmail", "hubspot", "slack"],
      providerLabels: ["Gmail", "HubSpot", "Slack"],
      triggerKind: "app",
      stepCount: 3,
    });
    expect(dto).not.toHaveProperty("summary");
  });

  it("never produces raw {{...}}, config, or definition keys", () => {
    const json = JSON.stringify(toGuidanceTemplateMatches([match]));
    expect(json).not.toContain("{{");
    expect(json).not.toMatch(/"config"|"definition"|"edges"/);
  });
});

describe("buildOfficialTemplateMatchGuidanceText", () => {
  it("names the top match and reassures nothing was created", () => {
    const [dto] = toGuidanceTemplateMatches([
      {
        templateId: "t-1",
        name: "Support escalation from email",
        description: null,
        score: 18,
        confidence: "high",
        reasons: [],
        summary: {
          providers: [],
          providerLabels: [],
          triggerKind: "app",
          category: "sales-crm",
          categoryLabel: "Sales & CRM",
          nodeCount: 1,
          stepCount: 0,
          steps: [],
        },
      },
    ]);
    const text = buildOfficialTemplateMatchGuidanceText([dto!]);
    expect(text).toContain("Support escalation from email");
    expect(text.toLowerCase()).toContain("official template");
    expect(text).not.toContain("{{");
  });

  it("returns empty string for no matches", () => {
    expect(buildOfficialTemplateMatchGuidanceText([])).toBe("");
  });
});
