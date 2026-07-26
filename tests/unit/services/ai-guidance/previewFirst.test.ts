/**
 * @jest-environment node
 *
 * REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1 — the deterministic classifier that decides
 * whether a clarification-only guidance reply is acceptable, and the single repair instruction.
 *
 * The classifier runs against the REAL provider registry (no mocks): "the user named Typeform,
 * Mailchimp, HubSpot and Gmail" must mean the registered providers, not a hand-kept list that
 * drifts. It reads only the request text — never the model's prose.
 */
import {
  classifyPreviewFirst,
  buildPreviewFirstRepairGoal,
  MIN_REPAIR_BUDGET_MS,
} from "@/services/ai-guidance/previewFirst/classifyPreviewFirst";

const PRODUCTION_PROMPT =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot " +
  "contact, and send me a Gmail message summarizing their answers. Use the submitted email, " +
  "first name, last name, company, and message wherever appropriate.";

describe("classifyPreviewFirst — preview expected", () => {
  it("classifies the exact production prompt as preview_expected with the four named providers", () => {
    const c = classifyPreviewFirst({ goalText: PRODUCTION_PROMPT, editing: false });
    expect(c.kind).toBe("preview_expected");
    expect(c.namedProviders).toEqual(["gmail", "hubspot", "mailchimp", "typeform"]);
  });

  it("two explicitly named apps with a clear sequence are enough", () => {
    const c = classifyPreviewFirst({
      goalText: "When a Typeform response comes in, post it to Slack",
      editing: false,
    });
    expect(c.kind).toBe("preview_expected");
    expect(c.namedProviders).toEqual(["slack", "typeform"]);
  });

  it("still expects a preview when the tokenizer has replaced sensitive literals", () => {
    // The route classifies the TOKENIZED goal — provider names survive tokenization.
    const c = classifyPreviewFirst({
      goalText: "Add [[EMAIL_1]] to Mailchimp and send a Gmail message to [[EMAIL_2]]",
      editing: false,
    });
    expect(c.kind).toBe("preview_expected");
  });
});

describe("classifyPreviewFirst — clarification legitimately allowed", () => {
  it("generic capability words name NO provider — 'save it somewhere' stays a clarification", () => {
    const c = classifyPreviewFirst({
      goalText: "When I get an email, save it somewhere",
      editing: false,
    });
    expect(c.kind).toBe("clarification_allowed");
    expect(c.kind === "clarification_allowed" && c.reason).toBe("insufficient_named_providers");
    expect(c.namedProviders).toEqual([]);
  });

  it("a single named provider with a vague remainder stays a clarification", () => {
    const c = classifyPreviewFirst({
      goalText: "Send my Typeform answers to the team",
      editing: false,
    });
    expect(c.kind).toBe("clarification_allowed");
    expect(c.kind === "clarification_allowed" && c.reason).toBe("insufficient_named_providers");
  });

  it("an explicit provider either/or ('Gmail or Outlook') is the USER'S choice — clarify", () => {
    const c = classifyPreviewFirst({
      goalText: "When a Typeform response arrives, email me with Gmail or Outlook",
      editing: false,
    });
    expect(c.kind).toBe("clarification_allowed");
    expect(c.kind === "clarification_allowed" && c.reason).toBe("provider_alternation");
  });

  it("a destructive either/or ('delete or archive') changes what the workflow DOES — clarify", () => {
    const c = classifyPreviewFirst({
      goalText: "Every Friday, delete or archive old HubSpot contacts and log them in Google Sheets",
      editing: false,
    });
    expect(c.kind).toBe("clarification_allowed");
    expect(c.kind === "clarification_allowed" && c.reason).toBe("destructive_alternation");
  });

  it("editing turns are out of scope (the edit pipeline owns its own proposal path)", () => {
    const c = classifyPreviewFirst({ goalText: PRODUCTION_PROMPT, editing: true });
    expect(c.kind).toBe("clarification_allowed");
    expect(c.kind === "clarification_allowed" && c.reason).toBe("editing_turn");
  });

  it("an unregistered app name does not count toward the provider threshold", () => {
    const c = classifyPreviewFirst({
      goalText: "When someone fills my SurveyFairy form, add them to CoolCRM",
      editing: false,
    });
    expect(c.kind).toBe("clarification_allowed");
  });
});

describe("classifyPreviewFirst — non-alternating 'or' does not misfire", () => {
  it("'or' between values (not providers) still expects a preview", () => {
    const c = classifyPreviewFirst({
      goalText: "When a Typeform response arrives, tag them in Mailchimp as lead or customer",
      editing: false,
    });
    expect(c.kind).toBe("preview_expected");
  });
});

describe("buildPreviewFirstRepairGoal", () => {
  const goal = buildPreviewFirstRepairGoal({
    safeGoalText: "Add [[EMAIL_1]] to Mailchimp and Gmail me",
    namedProviders: ["gmail", "mailchimp"],
  });

  it("orders the plan back, forbids questions, and routes unknowns to requiredInputs", () => {
    expect(goal).toMatch(/withheld the workflow plan/i);
    expect(goal).toMatch(/Return the structured workflowPlan json block NOW/i);
    expect(goal).toMatch(/Do not ask conversational questions/i);
    expect(goal).toMatch(/requiredInputs/);
  });

  it("names the user's own apps and carries the (tokenized) original request", () => {
    expect(goal).toContain("gmail, mailchimp");
    expect(goal).toContain("Add [[EMAIL_1]] to Mailchimp and Gmail me");
  });

  it("classifies the setup-value question categories for the model", () => {
    expect(goal).toMatch(/which form\/board\/audience\/list/i);
    expect(goal).toMatch(/consent status or duplicate handling/i);
    expect(goal).toMatch(/SETUP VALUES/);
  });
});

describe("budget constant", () => {
  it("requires a realistic remaining budget before starting a repair", () => {
    // A real Hermes turn takes seconds; anything under ~15s would burn the remainder into a 504.
    expect(MIN_REPAIR_BUDGET_MS).toBeGreaterThanOrEqual(10_000);
    expect(MIN_REPAIR_BUDGET_MS).toBeLessThan(30_000);
  });
});
