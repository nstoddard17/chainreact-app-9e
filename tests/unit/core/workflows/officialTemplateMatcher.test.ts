/**
 * @jest-environment node
 */
import {
  matchOfficialTemplates,
  selectOfficialCatalogEntries,
  type OfficialTemplateCatalogEntry,
} from "@/core/workflows/officialTemplateMatcher";
import type { MarketplaceTemplateSummary, TemplateStepSummary } from "@/contracts/workflowTemplate";

// ── Fixtures: safe catalog entries mirroring real batch-4 official templates ──
function step(kind: "trigger" | "action", provider: string, type: string): TemplateStepSummary {
  return { kind, provider, type };
}

const SUPPORT: OfficialTemplateCatalogEntry = {
  id: "t-support",
  name: "Support escalation from email",
  description:
    "When an email gets a support label in Gmail, open a HubSpot ticket, create a Trello work item, escalate in Slack, and draft an acknowledgment reply.",
  category: "sales-crm",
  triggerKind: "app",
  providers: ["gmail", "hubspot", "trello", "slack"],
  steps: [
    step("trigger", "gmail", "new_labeled_email"),
    step("action", "hubspot", "create_ticket"),
    step("action", "trello", "create_card"),
    step("action", "slack", "send_channel_message"),
    step("action", "gmail", "create_draft_reply"),
  ],
  nodeCount: 5,
  stepCount: 4,
};

const LEAD_INTAKE: OfficialTemplateCatalogEntry = {
  id: "t-lead-intake",
  name: "Lead intake to sales handoff",
  description:
    "When a new lead arrives, create the contact, add it to a list, open a follow-up task and a note, log it to a sheet, and alert sales in Slack.",
  category: "sales-crm",
  triggerKind: "app",
  providers: ["hubspot", "google-sheets", "slack"],
  steps: [
    step("trigger", "hubspot", "webhook_received"),
    step("action", "hubspot", "create_contact"),
    step("action", "hubspot", "add_contact_to_list"),
    step("action", "hubspot", "create_task"),
    step("action", "google-sheets", "append_row"),
    step("action", "slack", "send_channel_message"),
  ],
  nodeCount: 6,
  stepCount: 5,
};

const SHOPIFY_ORDER: OfficialTemplateCatalogEntry = {
  id: "t-shopify-order",
  name: "Shopify order operations",
  description:
    "When a Shopify order webhook fires, log the order to a sheet, create a monday.com fulfillment item, add an internal order note, open a customer follow-up task, and notify operations in Slack.",
  category: "ecommerce",
  triggerKind: "app",
  providers: ["shopify", "google-sheets", "monday", "hubspot", "slack"],
  steps: [
    step("trigger", "shopify", "webhook_received"),
    step("action", "google-sheets", "append_row"),
    step("action", "monday", "create_item"),
    step("action", "shopify", "add_order_note"),
    step("action", "hubspot", "create_task"),
    step("action", "slack", "send_channel_message"),
  ],
  nodeCount: 6,
  stepCount: 5,
};

const INCIDENT_TEAMS: OfficialTemplateCatalogEntry = {
  id: "t-incident",
  name: "Engineering incident intake",
  description:
    "When an incident is posted in a Microsoft Teams channel, open a GitHub issue, create a monday.com incident item and a Notion incident page, schedule a follow-up event, and notify the incident channel.",
  category: "dev-engineering",
  triggerKind: "app",
  providers: ["microsoft-teams", "github", "monday", "notion", "google-calendar"],
  steps: [
    step("trigger", "microsoft-teams", "new_channel_message"),
    step("action", "github", "create_issue"),
    step("action", "monday", "create_item"),
    step("action", "notion", "create_page"),
    step("action", "google-calendar", "create_event"),
    step("action", "microsoft-teams", "send_channel_message"),
  ],
  nodeCount: 6,
  stepCount: 5,
};

const SLACK_ONLY: OfficialTemplateCatalogEntry = {
  id: "t-slack-feedback",
  name: "Product feedback intake",
  description:
    "When a message is reacted to in Slack, pull the thread context, capture it as a Notion entry, open a GitHub issue and a Trello card, and acknowledge in Slack.",
  category: "team-ops",
  triggerKind: "app",
  providers: ["slack", "notion", "github", "trello"],
  steps: [
    step("trigger", "slack", "reaction_added"),
    step("action", "slack", "get_thread_messages"),
    step("action", "notion", "create_database_entry"),
    step("action", "github", "create_issue"),
    step("action", "trello", "create_card"),
    step("action", "slack", "send_channel_message"),
  ],
  nodeCount: 6,
  stepCount: 5,
};

const CATALOG = [SUPPORT, LEAD_INTAKE, SHOPIFY_ORDER, INCIDENT_TEAMS, SLACK_ONLY];

describe("matchOfficialTemplates — exact complex-template match", () => {
  it("matches the support-escalation template with high confidence", () => {
    const res = matchOfficialTemplates(
      "When a labeled support email comes in, create a HubSpot ticket, Trello card, Slack alert, and draft a reply.",
      CATALOG,
    );
    expect(res.confidence).toBe("high");
    expect(res.matches[0]!.templateId).toBe("t-support");
    const reasons = res.matches[0]!.reasons.join(" | ").toLowerCase();
    expect(reasons).toMatch(/trigger/);
    expect(reasons).toMatch(/ticket/);
    expect(reasons).toContain("hubspot");
  });
});

describe("matchOfficialTemplates — lead workflow", () => {
  it("ranks a lead/HubSpot template top for a lead intake request", () => {
    const res = matchOfficialTemplates(
      "When a new lead comes in, add them to HubSpot, create a sales task, log it, and notify Slack.",
      CATALOG,
    );
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.matches[0]!.templateId).toBe("t-lead-intake");
    expect(["high", "medium"]).toContain(res.matches[0]!.confidence);
  });
});

describe("matchOfficialTemplates — ecommerce workflow", () => {
  it("matches the Shopify order template", () => {
    const res = matchOfficialTemplates(
      "When a Shopify order is created, log it and create a fulfillment task.",
      CATALOG,
    );
    expect(res.matches[0]!.templateId).toBe("t-shopify-order");
    expect(["high", "medium"]).toContain(res.matches[0]!.confidence);
  });
});

describe("matchOfficialTemplates — explicit provider penalty (no silent substitution)", () => {
  it("a Slack-only template does not beat a Teams template when Teams is named", () => {
    const res = matchOfficialTemplates(
      "When something is posted in a Microsoft Teams channel, open a GitHub issue.",
      CATALOG,
    );
    expect(res.matches[0]!.templateId).toBe("t-incident");
    const slack = res.matches.find((m) => m.templateId === "t-slack-feedback");
    const incident = res.matches.find((m) => m.templateId === "t-incident")!;
    // If the Slack-only template appears at all, it must rank below the Teams template.
    if (slack) expect(incident.score).toBeGreaterThan(slack.score);
  });
});

describe("matchOfficialTemplates — alias handling", () => {
  it("'CRM' helps a HubSpot template rank for a CRM lead request", () => {
    const res = matchOfficialTemplates("Set up a CRM pipeline for new leads", CATALOG);
    expect(res.matches.length).toBeGreaterThan(0);
    expect(res.matches[0]!.summary.providers).toContain("hubspot");
    // A non-HubSpot template (Shopify orders) must not outrank the HubSpot one here.
    const shopify = res.matches.find((m) => m.templateId === "t-shopify-order");
    expect(shopify === undefined || shopify.score < res.matches[0]!.score).toBe(true);
  });
});

describe("matchOfficialTemplates — vague requests return no confident match", () => {
  it("returns no matches for a generic request", () => {
    const res = matchOfficialTemplates("make my business easier", CATALOG);
    expect(res.confidence).toBe("none");
    expect(res.matches).toHaveLength(0);
  });

  it("does not match on generic words alone (notify / update / new / create / send)", () => {
    const res = matchOfficialTemplates("create something new and notify me", CATALOG);
    expect(res.matches).toHaveLength(0);
  });

  it("returns no matches for empty input", () => {
    expect(matchOfficialTemplates("   ", CATALOG).matches).toHaveLength(0);
  });
});

describe("matchOfficialTemplates — deterministic, stable tie-breaking", () => {
  // Two entries engineered to score identically for the request.
  const A: OfficialTemplateCatalogEntry = {
    ...LEAD_INTAKE,
    id: "t-zeta",
    name: "Zeta lead flow",
  };
  const B: OfficialTemplateCatalogEntry = {
    ...LEAD_INTAKE,
    id: "t-alpha",
    name: "Alpha lead flow",
  };
  const req = "When a new lead comes in, add them to HubSpot, create a sales task, and notify Slack.";

  it("orders ties by name then id, regardless of input order", () => {
    const forward = matchOfficialTemplates(req, [A, B]).matches.map((m) => m.templateId);
    const reversed = matchOfficialTemplates(req, [B, A]).matches.map((m) => m.templateId);
    expect(forward).toEqual(reversed);
    // Same score → "Alpha lead flow" (t-alpha) sorts before "Zeta lead flow" (t-zeta).
    expect(forward.indexOf("t-alpha")).toBeLessThan(forward.indexOf("t-zeta"));
  });
});

describe("matchOfficialTemplates — useful, safe reasons", () => {
  it("explains the trigger and a key action for a prewired complex template", () => {
    const res = matchOfficialTemplates(
      "When a support email is labeled in Gmail, open a HubSpot ticket and alert Slack.",
      CATALOG,
    );
    const top = res.matches[0]!;
    const joined = top.reasons.join(" | ");
    expect(joined.toLowerCase()).toMatch(/trigger/);
    expect(joined).toMatch(/HubSpot/);
    expect(top.reasons.every((r) => !r.includes("{{"))).toBe(true);
  });
});

describe("matchOfficialTemplates — no-leak output", () => {
  it("output contains no raw {{...}}, config, definition JSON, or resource-id shapes", () => {
    const res = matchOfficialTemplates(
      "When a Shopify order is created, create a HubSpot task and notify Slack.",
      CATALOG,
    );
    const json = JSON.stringify(res);
    expect(json).not.toContain("{{");
    expect(json).not.toMatch(/"config"/);
    expect(json).not.toMatch(/"definition"/);
    expect(json).not.toMatch(/"edges"/);
    expect(json).not.toMatch(/xox[baprs]-|sk_live_|whsec_/);
    // The match summary exposes only the safe, expected keys.
    const summaryKeys = Object.keys(res.matches[0]!.summary).sort();
    expect(summaryKeys).toEqual(
      [
        "category",
        "categoryLabel",
        "nodeCount",
        "providerLabels",
        "providers",
        "stepCount",
        "steps",
        "triggerKind",
      ].sort(),
    );
  });
});

describe("selectOfficialCatalogEntries — excludes user / private / unlisted", () => {
  function summary(over: Partial<MarketplaceTemplateSummary>): MarketplaceTemplateSummary {
    return {
      id: "x",
      name: "X",
      description: null,
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
        nodeCount: 2,
        stepCount: 1,
        triggerKind: "app",
        providers: ["slack"],
        category: "team-ops",
        steps: [step("trigger", "slack", "reaction_added")],
      },
      ...over,
    };
  }

  it("keeps official+public, drops user / private / unlisted / card-less", () => {
    const entries = selectOfficialCatalogEntries([
      summary({ id: "official-public" }),
      summary({ id: "user-public", source: "user", isOfficial: false }),
      summary({ id: "official-private", visibility: "private" }),
      summary({ id: "official-unlisted", visibility: "unlisted" }),
      summary({ id: "official-no-card", card: undefined }),
    ]);
    expect(entries.map((e) => e.id)).toEqual(["official-public"]);
  });
});
