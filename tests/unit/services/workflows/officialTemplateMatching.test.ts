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
