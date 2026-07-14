/**
 * @jest-environment node
 */
import {
  matchOfficialTemplates,
  selectOfficialCatalogEntries,
  selectOfficialTemplateRecommendation,
  MAX_TEMPLATE_RECOMMENDATIONS,
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

describe("selectOfficialTemplateRecommendation — strong / weak / no-match classification (MATCH-4)", () => {
  // A tight 2-app template used to isolate the trigger + side-effect gates.
  const SHOPIFY_SLACK: OfficialTemplateCatalogEntry = {
    id: "t-shopify-slack",
    name: "Shopify order to Slack",
    description: "When a Shopify order is created, notify the team in Slack.",
    category: "ecommerce",
    triggerKind: "app",
    providers: ["shopify", "slack"],
    steps: [step("trigger", "shopify", "webhook_received"), step("action", "slack", "send_channel_message")],
    nodeCount: 2,
    stepCount: 1,
  };

  // ── Single-provider fixtures (all Slack-only) — used to prove one-app templates can be strong,
  //    and that trigger/action/side-effect mismatches still keep them weak. ───────────────────────
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
  const SLACK_POLL: OfficialTemplateCatalogEntry = {
    id: "t-slack-poll",
    name: "Slack reaction poll",
    description: "When a reaction is added in Slack, create a poll in the channel.",
    category: "team-ops",
    triggerKind: "app",
    providers: ["slack"],
    steps: [step("trigger", "slack", "reaction_added"), step("action", "slack", "create_poll")],
    nodeCount: 2,
    stepCount: 1,
  };
  const SLACK_REPOST_PLUS_DELETE: OfficialTemplateCatalogEntry = {
    id: "t-slack-repost-delete",
    name: "Slack reaction repost and cleanup",
    description: "When a reaction is added to a Slack message, repost it into another channel, then delete the original.",
    category: "team-ops",
    triggerKind: "app",
    providers: ["slack"],
    steps: [
      step("trigger", "slack", "reaction_added"),
      step("action", "slack", "send_channel_message"),
      step("action", "slack", "delete_message"),
    ],
    nodeCount: 3,
    stepCount: 2,
  };

  const SLACK_REACTION_REQUEST = "When a Slack reaction is added, post a message in another Slack channel.";

  it("(#1 multi-provider) a template that substantially matches → strong_match with ONE recommendation", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a support email is labeled in Gmail, open a HubSpot ticket, create a Trello card, and alert Slack.",
      CATALOG,
    );
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation).not.toBeNull();
    expect(res.recommendation!.templateId).toBe("t-support");
    expect(res.rejectedReasons).toHaveLength(0);
  });

  it("(#1 single-provider) an EXACT one-app template (right trigger + action, no extras) IS a strong_match", () => {
    const res = selectOfficialTemplateRecommendation(SLACK_REACTION_REQUEST, [SLACK_REPOST]);
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation!.templateId).toBe("t-slack-repost");
    expect(res.rejectedReasons).toHaveLength(0);
  });

  it("(#2 single-provider) only the provider matches (different purpose) → weak, build manually", () => {
    const res = selectOfficialTemplateRecommendation(
      "Post product updates to Slack whenever things change.",
      [SLACK_REPOST],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/purpose/);
  });

  it("(#3 single-provider) a mismatched TRIGGER (same app, different start event) → weak", () => {
    // The template starts from a reaction; the user wants an archived-channel start.
    const res = selectOfficialTemplateRecommendation(
      "When a Slack channel is archived, post a message to another Slack channel.",
      [SLACK_REPOST],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/start event/);
  });

  it("(#4 single-provider) a mismatched primary ACTION (poll vs. post a message) → weak", () => {
    const res = selectOfficialTemplateRecommendation(SLACK_REACTION_REQUEST, [SLACK_POLL]);
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/didn't ask for/);
  });

  it("(#5 single-provider) a template adding an unrelated/destructive side-effect (delete) → weak", () => {
    const res = selectOfficialTemplateRecommendation(SLACK_REACTION_REQUEST, [SLACK_REPOST_PLUS_DELETE]);
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/delete message/);
  });

  it("(#6 multi-provider) every NAMED provider must be present — a missing one keeps it weak", () => {
    // Request names Slack + HubSpot; the Slack-only template drops HubSpot.
    const res = selectOfficialTemplateRecommendation(
      "When a Slack reaction is added, open a HubSpot ticket.",
      [SLACK_REPOST],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ")).toMatch(/HubSpot/);
  });

  it("(#7 multi-provider) an EXTRA unrequested provider keeps it weak", () => {
    const SLACK_HUBSPOT_NOTION: OfficialTemplateCatalogEntry = {
      id: "t-slack-hubspot-notion",
      name: "Slack reaction to CRM ticket and note",
      description: "When a reaction is added in Slack, open a HubSpot ticket and log a Notion note.",
      category: "sales-crm",
      triggerKind: "app",
      providers: ["slack", "hubspot", "notion"],
      steps: [
        step("trigger", "slack", "reaction_added"),
        step("action", "hubspot", "create_ticket"),
        step("action", "notion", "create_page"),
      ],
      nodeCount: 3,
      stepCount: 2,
    };
    const res = selectOfficialTemplateRecommendation(
      "When a Slack reaction is added, open a HubSpot ticket.",
      [SLACK_HUBSPOT_NOTION],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ")).toMatch(/Notion/);
  });

  it("(#3-vague) a vague request → no_match (build manually, no recommendation)", () => {
    const res = selectOfficialTemplateRecommendation("make my business easier", CATALOG);
    expect(res.outcome).toBe("no_match");
    expect(res.recommendation).toBeNull();
  });

  it("(#3-empty) empty input → no_match", () => {
    expect(selectOfficialTemplateRecommendation("   ", CATALOG).outcome).toBe("no_match");
  });

  it("(#5-multi) a template that adds unrelated PROVIDERS is rejected with a safe reason", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a Shopify order is created, notify Slack.",
      CATALOG, // SHOPIFY_ORDER also creates sheet/monday/hubspot side-effects
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.rejectedReasons.join(" ")).toMatch(/didn't ask for/i);
  });

  it("(#7-tight) a tight 2-app template (no extras) IS a strong_match", () => {
    const res = selectOfficialTemplateRecommendation("When a Shopify order is created, notify Slack.", [
      SHOPIFY_SLACK,
    ]);
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation!.templateId).toBe("t-shopify-slack");
  });

  it("(#8 keywords aren't enough) an alias/keyword-only request never yields a strong_match", () => {
    const res = selectOfficialTemplateRecommendation("Set up a CRM pipeline for new leads", CATALOG);
    expect(res.outcome).not.toBe("strong_match");
    expect(res.recommendation).toBeNull();
  });

  it("(#9 anti-loop) a strong match returns a SINGLE recommendation, never a menu of alternatives", () => {
    expect(MAX_TEMPLATE_RECOMMENDATIONS).toBe(1);
    const res = selectOfficialTemplateRecommendation(SLACK_REACTION_REQUEST, [SLACK_REPOST]);
    // Exactly one recommendation object (not an array of partial alternatives to keep suggesting).
    expect(res.outcome).toBe("strong_match");
    expect(Array.isArray(res.recommendation)).toBe(false);
    expect(res.recommendation).not.toBeNull();
  });

  it("no-leak: the recommendation carries no raw {{...}}, config, definition, or resource-id shapes", () => {
    const res = selectOfficialTemplateRecommendation(SLACK_REACTION_REQUEST, [SLACK_REPOST]);
    const json = JSON.stringify(res);
    expect(json).not.toContain("{{");
    expect(json).not.toMatch(/"config"|"definition"|"edges"/);
    expect(json).not.toMatch(/xox[baprs]-|sk_live_|whsec_/);
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
