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

import { suggestOfficialTemplatesForRequest } from "@/services/workflows/officialTemplateMatching";

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
