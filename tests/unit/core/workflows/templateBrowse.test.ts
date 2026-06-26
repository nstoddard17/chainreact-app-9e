/**
 * @jest-environment node
 *
 * core/workflows/templateBrowse (CS-XT-MARKETPLACE-UX-SEARCH). Pure search/filter/sort over the
 * marketplace summary. Proves: search reads only SAFE fields (title, description, derived labels —
 * never config/ids), is case-insensitive + trimmed, filters AND-combine, and each deterministic
 * sort mode (recommended preserves order; name; fewest/most steps with a stable name tie-break).
 */
import type { MarketplaceTemplateSummary, TemplateCardMeta } from "@/contracts/workflowTemplate";
import {
  templateSearchText,
  templateMatchesQuery,
  filterMarketplaceTemplates,
  sortMarketplaceTemplates,
  isMarketplaceFilterActive,
  TEMPLATE_SORTS,
} from "@/core/workflows/templateBrowse";

function t(
  id: string,
  name: string,
  description: string | null,
  card: TemplateCardMeta,
): MarketplaceTemplateSummary {
  return {
    id, name, description,
    source: "official", isOfficial: true, visibility: "public", creatorDisplayName: null,
    usageCount: 0, forkCount: 0, forkedFromTemplateId: null, publishedAt: null, schemaVersion: 1,
    createdAt: "2026-06-07T00:00:00Z", card,
  };
}

const shopifySlack: TemplateCardMeta = {
  nodeCount: 2, stepCount: 1, triggerKind: "app", providers: ["shopify", "slack"], category: "ecommerce",
  steps: [
    { kind: "trigger", provider: "shopify", type: "webhook_received" },
    { kind: "action", provider: "slack", type: "send_channel_message" },
  ],
};
const gaReport: TemplateCardMeta = {
  nodeCount: 3, stepCount: 2, triggerKind: "scheduled", providers: ["google-analytics", "slack"], category: "reporting",
  steps: [
    { kind: "trigger", provider: "native", type: "schedule.fired" },
    { kind: "action", provider: "google-analytics", type: "run_report" },
    { kind: "action", provider: "slack", type: "send_channel_message" },
  ],
};
const hubspotDraft: TemplateCardMeta = {
  nodeCount: 1, stepCount: 0, triggerKind: "manual", providers: ["hubspot"], category: "sales-crm",
  steps: [{ kind: "trigger", provider: "hubspot", type: "webhook_received" }],
};

const A = t("a", "Order alert", "Tell the team about a new order.", shopifySlack);
const B = t("b", "Weekly report", "Recurring analytics digest.", gaReport);
const C = t("c", "Lead capture", null, hubspotDraft);
const LIST = [A, B, C];

describe("templateSearchText — safe fields only", () => {
  it("includes title, description, category label, trigger kind, app names, step labels", () => {
    const text = templateSearchText(A);
    expect(text).toContain("order alert");
    expect(text).toContain("new order");
    expect(text).toContain("ecommerce");
    expect(text).toContain("app-triggered");
    expect(text).toContain("shopify");
    expect(text).toContain("slack");
    expect(text).toContain("send channel message"); // humanized step
  });
  it("never includes raw type ids / config keys", () => {
    const text = templateSearchText(A);
    expect(text).not.toContain("webhook_received");
    expect(text).not.toContain("send_channel_message");
    expect(text).not.toContain("config");
  });
});

describe("templateMatchesQuery — case-insensitive + trimmed", () => {
  it("matches title regardless of case/whitespace", () => {
    expect(templateMatchesQuery(A, "  ORDER  ")).toBe(true);
    expect(templateMatchesQuery(A, "order alert")).toBe(true);
  });
  it("matches derived labels (app, category, trigger, step)", () => {
    expect(templateMatchesQuery(A, "shopify")).toBe(true);
    expect(templateMatchesQuery(B, "reporting")).toBe(true);
    expect(templateMatchesQuery(B, "scheduled")).toBe(true);
    expect(templateMatchesQuery(B, "run report")).toBe(true);
  });
  it("empty/whitespace query matches everything", () => {
    expect(templateMatchesQuery(C, "   ")).toBe(true);
  });
  it("non-match returns false", () => {
    expect(templateMatchesQuery(A, "zzzznope")).toBe(false);
  });
});

describe("filterMarketplaceTemplates — AND of search + category + provider", () => {
  it("category + provider + search combine as AND", () => {
    expect(filterMarketplaceTemplates(LIST, { query: "", category: "ecommerce", provider: "all" }).map((x) => x.id)).toEqual(["a"]);
    expect(filterMarketplaceTemplates(LIST, { query: "", category: "all", provider: "slack" }).map((x) => x.id)).toEqual(["a", "b"]);
    // slack app AND a query that only B matches → B only.
    expect(filterMarketplaceTemplates(LIST, { query: "analytics", category: "all", provider: "slack" }).map((x) => x.id)).toEqual(["b"]);
    // contradictory AND → empty.
    expect(filterMarketplaceTemplates(LIST, { query: "", category: "ecommerce", provider: "google-analytics" })).toEqual([]);
  });
});

describe("sortMarketplaceTemplates — deterministic modes", () => {
  it("recommended preserves input order and does not mutate input", () => {
    const out = sortMarketplaceTemplates(LIST, "recommended");
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(out).not.toBe(LIST);
  });
  it("name sorts A–Z", () => {
    expect(sortMarketplaceTemplates(LIST, "name").map((x) => x.name)).toEqual(["Lead capture", "Order alert", "Weekly report"]);
  });
  it("fewest-steps then most-steps order by step count with a name tie-break", () => {
    expect(sortMarketplaceTemplates(LIST, "fewest-steps").map((x) => x.id)).toEqual(["c", "a", "b"]); // 0,1,2
    expect(sortMarketplaceTemplates(LIST, "most-steps").map((x) => x.id)).toEqual(["b", "a", "c"]); // 2,1,0
  });
  it("every advertised sort key is handled", () => {
    for (const s of TEMPLATE_SORTS) {
      expect(() => sortMarketplaceTemplates(LIST, s.key)).not.toThrow();
    }
  });
});

describe("isMarketplaceFilterActive", () => {
  it("true when query/category/provider narrows; false otherwise", () => {
    expect(isMarketplaceFilterActive({ query: "", category: "all", provider: "all" })).toBe(false);
    expect(isMarketplaceFilterActive({ query: " ", category: "all", provider: "all" })).toBe(false);
    expect(isMarketplaceFilterActive({ query: "x", category: "all", provider: "all" })).toBe(true);
    expect(isMarketplaceFilterActive({ query: "", category: "ecommerce", provider: "all" })).toBe(true);
    expect(isMarketplaceFilterActive({ query: "", category: "all", provider: "slack" })).toBe(true);
  });
});
