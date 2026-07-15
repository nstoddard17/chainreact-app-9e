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

describe("selectOfficialTemplateRecommendation — multi-provider semantic action contribution (M1/M2)", () => {
  const trig = (): TemplateStepSummary => step("trigger", "typeform", "new_response");

  const SHEETS_OK: OfficialTemplateCatalogEntry = {
    id: "t-sheets-ok",
    name: "Typeform response to Google Sheets",
    description: "When a Typeform response is submitted, append it as a new row in Google Sheets.",
    category: "personal-productivity",
    triggerKind: "app",
    providers: ["typeform", "google-sheets"],
    steps: [trig(), step("action", "google-sheets", "append_row")],
    nodeCount: 2,
    stepCount: 1,
  };
  const SHEETS_DELETE: OfficialTemplateCatalogEntry = {
    ...SHEETS_OK,
    id: "t-sheets-delete",
    name: "Typeform response to Sheets with cleanup",
    description: "When a Typeform response is submitted, append a row in Google Sheets, then delete an old row.",
    steps: [trig(), step("action", "google-sheets", "append_row"), step("action", "google-sheets", "delete_row")],
    nodeCount: 3,
    stepCount: 2,
  };
  const SHEETS_SLACK: OfficialTemplateCatalogEntry = {
    id: "t-sheets-slack",
    name: "Typeform response to Sheets and Slack",
    description: "When a Typeform response is submitted, append a row in Google Sheets and notify the team in Slack.",
    category: "team-ops",
    triggerKind: "app",
    providers: ["typeform", "google-sheets", "slack"],
    steps: [trig(), step("action", "google-sheets", "append_row"), step("action", "slack", "send_channel_message")],
    nodeCount: 3,
    stepCount: 2,
  };
  const SLACK_CREATE_PLUS_SEND: OfficialTemplateCatalogEntry = {
    id: "t-slack-create-send",
    name: "Typeform response to Slack channel",
    description: "When a Typeform response is submitted, create a Slack channel and post a message.",
    category: "team-ops",
    triggerKind: "app",
    providers: ["typeform", "slack"],
    steps: [trig(), step("action", "slack", "create_channel"), step("action", "slack", "send_channel_message")],
    nodeCount: 3,
    stepCount: 2,
  };
  const HUBSPOT_EMAIL: OfficialTemplateCatalogEntry = {
    id: "t-hubspot-email",
    name: "Typeform lead to HubSpot with email",
    description: "When a Typeform response is submitted, create a HubSpot contact and email the customer.",
    category: "sales-crm",
    triggerKind: "app",
    providers: ["typeform", "hubspot"],
    steps: [trig(), step("action", "hubspot", "create_contact"), step("action", "hubspot", "send_email")],
    nodeCount: 3,
    stepCount: 2,
  };
  const DRIVE_SHARE: OfficialTemplateCatalogEntry = {
    id: "t-drive-share",
    name: "Typeform upload to Drive with public link",
    description: "When a Typeform response is submitted, upload the file to Google Drive and share the file publicly.",
    category: "files-docs",
    triggerKind: "app",
    providers: ["typeform", "google-drive"],
    steps: [trig(), step("action", "google-drive", "upload_file"), step("action", "google-drive", "share_file")],
    nodeCount: 3,
    stepCount: 2,
  };
  const SHEETS_GMAIL_READ: OfficialTemplateCatalogEntry = {
    id: "t-sheets-gmail-read",
    name: "Typeform response to Sheets",
    description: "When a Typeform response is submitted, append a row in Google Sheets and look up a Gmail message.",
    category: "personal-productivity",
    triggerKind: "app",
    providers: ["typeform", "google-sheets", "gmail"],
    steps: [trig(), step("action", "google-sheets", "append_row"), step("action", "gmail", "get_message")],
    nodeCount: 3,
    stepCount: 2,
  };
  const SHEETS_MYSTERY: OfficialTemplateCatalogEntry = {
    ...SHEETS_OK,
    id: "t-sheets-mystery",
    name: "Typeform response to Sheets (plus)",
    description: "When a Typeform response is submitted, append a row in Google Sheets and process the data.",
    steps: [trig(), step("action", "google-sheets", "append_row"), step("action", "google-sheets", "frobnicate_data")],
    nodeCount: 3,
    stepCount: 2,
  };

  const R_APPEND = "When a Typeform response is submitted, add a row to Google Sheets.";

  it("(#1/#4) a valid multi-provider template with ONLY requested actions (append + notify) → strong_match", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, add a row to Google Sheets and notify Slack.",
      [SHEETS_SLACK],
    );
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation!.templateId).toBe("t-sheets-slack");
  });

  it("(#2/#9) Typeform response → append Google Sheets row is a strong_match (mechanism wording ok)", () => {
    expect(selectOfficialTemplateRecommendation(R_APPEND, [SHEETS_OK]).outcome).toBe("strong_match");
    // "log it in" is a mechanism synonym for append — still strong.
    expect(
      selectOfficialTemplateRecommendation(
        "When a Typeform response is submitted, log it in Google Sheets.",
        [SHEETS_OK],
      ).outcome,
    ).toBe("strong_match");
  });

  it("(#3/#7) Typeform response → append row → DELETE row is NOT strong (unrequested destructive)", () => {
    const res = selectOfficialTemplateRecommendation(R_APPEND, [SHEETS_DELETE]);
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/delete row/);
  });

  it("(#5) an unrequested notification action disqualifies the template", () => {
    // User asked to create a Slack channel; the template also posts an unrequested message.
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, create a Slack channel.",
      [SLACK_CREATE_PLUS_SEND],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/didn't ask for/);
  });

  it("(#6) an unrequested email action disqualifies the template", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, create a HubSpot contact.",
      [HUBSPOT_EMAIL],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/send email/);
  });

  it("(#8) an unrequested externally-visible (non-destructive) action disqualifies the template", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, save the file to Google Drive.",
      [DRIVE_SHARE],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/share file/);
  });

  it("(#10) missing a requested outcome prevents strong_match (Gmail named but only read)", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, add a row to Google Sheets and email the customer via Gmail.",
      [SHEETS_GMAIL_READ],
    );
    expect(res.outcome).toBe("weak_match");
    expect(res.rejectedReasons.join(" ")).toMatch(/Gmail/);
  });

  it("(#11) an uncertain action purpose produces weak_match, not strong_match (conservative)", () => {
    const res = selectOfficialTemplateRecommendation(R_APPEND, [SHEETS_MYSTERY]);
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
  });

  it("(#13) a strong multi-provider match still returns exactly ONE recommendation", () => {
    expect(MAX_TEMPLATE_RECOMMENDATIONS).toBe(1);
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, add a row to Google Sheets and notify Slack.",
      [SHEETS_SLACK],
    );
    expect(res.outcome).toBe("strong_match");
    expect(Array.isArray(res.recommendation)).toBe(false);
    expect(res.recommendation).not.toBeNull();
  });

  it("injected ActionMeta facts are AUTHORITATIVE — a facts-marked destructive action flips strong→weak", () => {
    // Without facts, `sync_rows` is an unknown verb (→ weak anyway); prove the facts path is consulted
    // by marking an otherwise-appending action destructive so it no longer contributes to an append.
    const FACTS_TEMPLATE: OfficialTemplateCatalogEntry = {
      ...SHEETS_OK,
      id: "t-facts",
      steps: [trig(), step("action", "google-sheets", "append_row")],
    };
    const strong = selectOfficialTemplateRecommendation(R_APPEND, [FACTS_TEMPLATE]);
    expect(strong.outcome).toBe("strong_match");
    const weak = selectOfficialTemplateRecommendation(R_APPEND, [FACTS_TEMPLATE], {
      effectFactsFor: (p, t) => (p === "google-sheets" && t === "append_row" ? { isDestructive: true } : undefined),
    });
    expect(weak.outcome).toBe("weak_match");
    expect(weak.rejectedReasons.join(" ").toLowerCase()).toMatch(/didn't ask for/);
  });
});

describe("selectOfficialTemplateRecommendation — complete requested-outcome coverage (M3)", () => {
  const tf = (): TemplateStepSummary => step("trigger", "typeform", "new_response");

  // ── HubSpot: two outcomes on ONE provider (create + update) ────────────────────────────────────
  const HS_CREATE_ONLY: OfficialTemplateCatalogEntry = {
    id: "t-hs-create",
    name: "Typeform lead to HubSpot contact",
    description: "When a Typeform response is submitted, create a HubSpot contact.",
    category: "sales-crm",
    triggerKind: "app",
    providers: ["typeform", "hubspot"],
    steps: [tf(), step("action", "hubspot", "create_contact")],
    nodeCount: 2,
    stepCount: 1,
  };
  const HS_CREATE_UPDATE: OfficialTemplateCatalogEntry = {
    ...HS_CREATE_ONLY,
    id: "t-hs-create-update",
    name: "Typeform lead to HubSpot contact with lifecycle update",
    description: "When a Typeform response is submitted, create a HubSpot contact and update its lifecycle stage.",
    steps: [tf(), step("action", "hubspot", "create_contact"), step("action", "hubspot", "update_contact")],
    nodeCount: 3,
    stepCount: 2,
  };
  const HS_CREATE_LIFECYCLE: OfficialTemplateCatalogEntry = {
    ...HS_CREATE_UPDATE,
    id: "t-hs-create-lifecycle",
    steps: [tf(), step("action", "hubspot", "create_contact"), step("action", "hubspot", "update_lifecycle_stage")],
  };
  const HS_REQUEST = "When Typeform receives a response, create a HubSpot contact and update its lifecycle stage.";

  it("(#1/#11) same-provider create+update requested, only create present → weak_match", () => {
    const res = selectOfficialTemplateRecommendation(HS_REQUEST, [HS_CREATE_ONLY]);
    expect(res.outcome).toBe("weak_match");
    expect(res.recommendation).toBeNull();
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/every step you asked for|update/);
  });

  it("(#2) same-provider create+update requested, both present → strong_match", () => {
    expect(selectOfficialTemplateRecommendation(HS_REQUEST, [HS_CREATE_UPDATE]).outcome).toBe("strong_match");
  });

  it("(#10) 'update lifecycle stage' is satisfied by a compatible HubSpot update action", () => {
    expect(selectOfficialTemplateRecommendation(HS_REQUEST, [HS_CREATE_LIFECYCLE]).outcome).toBe("strong_match");
  });

  // ── Slack: two outcomes on ONE provider (post + create channel) ────────────────────────────────
  const SLACK_POST_ONLY: OfficialTemplateCatalogEntry = {
    id: "t-slack-post",
    name: "Slack reaction repost",
    description: "When a reaction is added in Slack, repost the message to another channel.",
    category: "team-ops",
    triggerKind: "app",
    providers: ["slack"],
    steps: [step("trigger", "slack", "reaction_added"), step("action", "slack", "send_channel_message")],
    nodeCount: 2,
    stepCount: 1,
  };
  const SLACK_POST_CREATE: OfficialTemplateCatalogEntry = {
    ...SLACK_POST_ONLY,
    id: "t-slack-post-create",
    name: "Slack reaction repost and new channel",
    description: "When a reaction is added in Slack, repost the message and create a new channel.",
    steps: [
      step("trigger", "slack", "reaction_added"),
      step("action", "slack", "send_channel_message"),
      step("action", "slack", "create_channel"),
    ],
    nodeCount: 3,
    stepCount: 2,
  };
  const SLACK_REQUEST = "When a Slack reaction is added, post a message and create a Slack channel.";

  it("(#3) Slack post-message + create-channel requested, only message present → weak_match", () => {
    const res = selectOfficialTemplateRecommendation(SLACK_REQUEST, [SLACK_POST_ONLY]);
    expect(res.outcome).toBe("weak_match");
    expect(res.rejectedReasons.join(" ").toLowerCase()).toMatch(/every step you asked for|create/);
  });

  it("(#4) Slack post-message + create-channel requested, both present → strong_match", () => {
    expect(selectOfficialTemplateRecommendation(SLACK_REQUEST, [SLACK_POST_CREATE]).outcome).toBe("strong_match");
  });

  // ── Google Sheets: append + format ─────────────────────────────────────────────────────────────
  const SHEETS_APPEND_ONLY: OfficialTemplateCatalogEntry = {
    id: "t-sheets-append",
    name: "Typeform response to Google Sheets row",
    description: "When a Typeform response is submitted, append it as a new row in Google Sheets.",
    category: "personal-productivity",
    triggerKind: "app",
    providers: ["typeform", "google-sheets"],
    steps: [tf(), step("action", "google-sheets", "append_row")],
    nodeCount: 2,
    stepCount: 1,
  };
  const SHEETS_APPEND_FORMAT: OfficialTemplateCatalogEntry = {
    ...SHEETS_APPEND_ONLY,
    id: "t-sheets-append-format",
    name: "Typeform response to Google Sheets, formatted",
    description: "When a Typeform response is submitted, append a new row in Google Sheets and format the row.",
    steps: [tf(), step("action", "google-sheets", "append_row"), step("action", "google-sheets", "format_row")],
    nodeCount: 3,
    stepCount: 2,
  };
  const SHEETS_REQUEST = "When a Typeform response is submitted, add a row to Google Sheets and format the new row.";

  it("(#5) append-row + format-row requested, only append present → weak_match", () => {
    expect(selectOfficialTemplateRecommendation(SHEETS_REQUEST, [SHEETS_APPEND_ONLY]).outcome).toBe("weak_match");
  });

  it("(#6) append-row + format-row requested, both present → strong_match", () => {
    expect(selectOfficialTemplateRecommendation(SHEETS_REQUEST, [SHEETS_APPEND_FORMAT]).outcome).toBe("strong_match");
  });

  // ── Trigger-clause verbs must not create a downstream requirement ───────────────────────────────
  it("(#7) a trigger verb ('created') does not require a create action downstream", () => {
    const T: OfficialTemplateCatalogEntry = {
      id: "t-created-trigger",
      name: "New HubSpot contact to Google Sheets",
      description: "When a HubSpot contact is created, append a new row in Google Sheets.",
      category: "personal-productivity",
      triggerKind: "app",
      providers: ["hubspot", "google-sheets"],
      steps: [step("trigger", "hubspot", "contact_created"), step("action", "google-sheets", "append_row")],
      nodeCount: 2,
      stepCount: 1,
    };
    // Only an append outcome is required (the 'created' trigger verb must not demand a create action).
    expect(
      selectOfficialTemplateRecommendation("When a HubSpot contact is created, add a row to Google Sheets.", [T]).outcome,
    ).toBe("strong_match");
  });

  it("(#8) 'When a row is added, notify Slack' requires the notify action but NOT an extra append", () => {
    const T: OfficialTemplateCatalogEntry = {
      id: "t-row-added-notify",
      name: "New Sheets lead row to Slack",
      description: "When a new lead row is added in Google Sheets, alert the sales team in Slack.",
      category: "team-ops",
      triggerKind: "app",
      providers: ["google-sheets", "slack"],
      steps: [step("trigger", "google-sheets", "new_row"), step("action", "slack", "send_channel_message")],
      nodeCount: 2,
      stepCount: 1,
    };
    // The only downstream outcome is the Slack alert — the 'added' trigger verb must NOT require an
    // extra append-row action (the template has none, yet it is still a strong match).
    expect(
      selectOfficialTemplateRecommendation(
        "When a lead row is added in Google Sheets, alert the sales team in Slack.",
        [T],
      ).outcome,
    ).toBe("strong_match");
  });

  it("(#9) 'When a message is deleted, create a task' requires the task action but NOT a delete action", () => {
    const GOOD: OfficialTemplateCatalogEntry = {
      id: "t-deleted-good",
      name: "Deleted Slack message to HubSpot task",
      description: "When a Slack message is deleted, create a follow-up task in HubSpot.",
      category: "team-ops",
      triggerKind: "app",
      providers: ["slack", "hubspot"],
      steps: [step("trigger", "slack", "message_deleted"), step("action", "hubspot", "create_task")],
      nodeCount: 2,
      stepCount: 1,
    };
    const req = "When a Slack message is deleted, create a HubSpot task.";
    expect(selectOfficialTemplateRecommendation(req, [GOOD]).outcome).toBe("strong_match");
    // (#13) An actual delete-message action WAS NOT requested downstream → M1 rejects it.
    const BAD: OfficialTemplateCatalogEntry = {
      ...GOOD,
      id: "t-deleted-bad",
      steps: [
        step("trigger", "slack", "message_deleted"),
        step("action", "hubspot", "create_task"),
        step("action", "slack", "delete_message"),
      ],
      nodeCount: 3,
      stepCount: 2,
    };
    expect(selectOfficialTemplateRecommendation(req, [BAD]).outcome).toBe("weak_match");
  });

  it("(#12) vague trailing wording does not create a spurious required action", () => {
    const res = selectOfficialTemplateRecommendation(
      "When a Typeform response is submitted, add a row to Google Sheets and do the needful.",
      [SHEETS_APPEND_ONLY],
    );
    expect(res.outcome).toBe("strong_match");
  });

  it("(#17) a strong outcome-complete match still returns exactly ONE recommendation", () => {
    expect(MAX_TEMPLATE_RECOMMENDATIONS).toBe(1);
    const res = selectOfficialTemplateRecommendation(HS_REQUEST, [HS_CREATE_UPDATE]);
    expect(res.outcome).toBe("strong_match");
    expect(Array.isArray(res.recommendation)).toBe(false);
    expect(res.recommendation).not.toBeNull();
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
