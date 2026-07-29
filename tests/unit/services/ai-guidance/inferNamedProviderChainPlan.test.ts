/**
 * @jest-environment node
 *
 * REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — the generic, registry-driven named-provider
 * chain fallback. Runs against the REAL provider registry (no mocks): "the user named Typeform,
 * Mailchimp, HubSpot and Gmail" must resolve against the registered capabilities, not a hand-kept
 * list that drifts.
 *
 * The contract under test: a skeletal plan is produced ONLY when every named app maps to exactly
 * one capability for its clause; any ambiguity, unsupported intent, or missing trigger clause
 * declines (null). Steps never carry config values; requiredInputs come from real field metadata.
 */
import { inferNamedProviderChainPlan } from "@/services/ai-guidance/fallback/inferNamedProviderChainPlan";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { validateWorkflowPlan } from "@/services/ai-guidance/validateWorkflowPlan";

const PRODUCTION_PROMPT =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot " +
  "contact, and send me a Gmail message summarizing their answers. Use the submitted email, " +
  "first name, last name, company, and message wherever appropriate.";

describe("inferNamedProviderChainPlan — the production fixture (known-good regression)", () => {
  const plan = inferNamedProviderChainPlan(PRODUCTION_PROMPT);

  it("(#19) derives the exact four-provider topology, in the order the sentence describes", () => {
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.role}:${s.provider}:${s.type}`)).toEqual([
      "trigger:typeform:new_response_in_form",
      "action:mailchimp:add_subscriber",
      "action:hubspot:create_contact",
      "action:gmail:send_email",
    ]);
  });

  it("(#22) setup fields come from REAL registry metadata (required field keys), not guesses", () => {
    const byKey = Object.fromEntries(plan!.steps.map((s) => [`${s.provider}:${s.type}`, s]));
    const expectRequired = (key: string, kind: "trigger" | "action") => {
      const meta = kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
      const required = meta!.fields.filter((f) => f.required).map((f) => f.name);
      expect(byKey[key]!.requiredInputs ?? []).toEqual(required);
    };
    expectRequired("typeform:new_response_in_form", "trigger");
    expectRequired("mailchimp:add_subscriber", "action");
    expectRequired("hubspot:create_contact", "action");
    expectRequired("gmail:send_email", "action");
  });

  it("(#23) NO fabricated config values are inserted anywhere", () => {
    for (const step of plan!.steps) {
      expect(step.config).toBeUndefined();
    }
    expect(JSON.stringify(plan)).not.toMatch(/example\.com|@|John Smith|Acme/);
  });

  it("the plan passes the real capability validator and is advisory-only", () => {
    expect(validateWorkflowPlan(plan!).ok).toBe(true);
    expect(plan!.notApplied).toBe(true);
  });
});

describe("inferNamedProviderChainPlan — declines instead of guessing", () => {
  it("(#20) an ambiguous capability match declines the WHOLE fallback (two Mailchimp matches)", () => {
    // "add a note and a tag" matches mailchimp:add_note AND mailchimp:add_tag.
    expect(
      inferNamedProviderChainPlan("When a Typeform response arrives, add a note and a tag in Mailchimp"),
    ).toBeNull();
  });

  it("(#20) a bare verb with no object and no person reference declines (subscriber vs tag vs note)", () => {
    expect(inferNamedProviderChainPlan("When a Typeform response arrives, add a Mailchimp entry")).toBeNull();
  });

  it("(#21) an unsupported capability declines — no invented steps", () => {
    // The catalog has no Mailchimp campaign-send action; the verb/object cannot resolve.
    expect(
      inferNamedProviderChainPlan("When a Typeform response arrives, launch a Mailchimp campaign blast"),
    ).toBeNull();
  });

  it("no temporal (trigger) clause → decline; textual order alone is not a topology", () => {
    expect(inferNamedProviderChainPlan("Add them to Mailchimp and send me a Gmail message")).toBeNull();
  });

  it("fewer than two named registered providers → decline", () => {
    expect(inferNamedProviderChainPlan("When someone submits our Typeform contact form, celebrate")).toBeNull();
    expect(inferNamedProviderChainPlan("")).toBeNull();
    expect(inferNamedProviderChainPlan(undefined)).toBeNull();
  });

  it("unregistered app names never resolve (registry-driven, no invented providers)", () => {
    expect(
      inferNamedProviderChainPlan("When someone fills my SurveyFairy form, add them to CoolCRM"),
    ).toBeNull();
  });

  it("two providers in the temporal clause → decline (trigger owner is ambiguous)", () => {
    expect(
      inferNamedProviderChainPlan("When a Typeform or HubSpot event happens, send me a Gmail message"),
    ).toBeNull();
  });
});

describe("inferNamedProviderChainPlan — tokenized (sensitive-literal) goals still resolve", () => {
  it("provider names survive tokenization; placeholders never break clause matching", () => {
    const plan = inferNamedProviderChainPlan(
      "When someone submits our Typeform contact form, send a Gmail message to [[EMAIL_1]]",
    );
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "typeform:new_response_in_form",
      "gmail:send_email",
    ]);
  });
});

/**
 * REACT-AGENT-FIRST-TURN-1 — the owner-observed first-turn failure.
 *
 * Object matching used to be BINARY ("matched at least one object noun"), so
 * `slack:send_direct_message` survived on the generic word "message" alongside
 * `slack:send_channel_message` (which matches BOTH "channel" and "message"). Two survivors → the
 * planner declined → the route fell through to the model, the repair call, and this same fallback
 * again, and the user got PREVIEW_PLAN_MISSING on a request they had stated completely.
 *
 * These pin the ranked behavior: the UNIQUE strongest match wins, a genuine tie still declines.
 */
const OWNER_PROMPT =
  "When a Stripe invoice is paid, post a message in our Slack billing channel that includes the " +
  "customer name, invoice number, amount paid, and a link to the invoice.";

describe("inferNamedProviderChainPlan — ranked object matching (REACT-AGENT-FIRST-TURN-1)", () => {
  it("the exact owner-observed prompt resolves on the FIRST turn (no conversation history)", () => {
    const plan = inferNamedProviderChainPlan(OWNER_PROMPT);
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.role}:${s.provider}:${s.type}`)).toEqual([
      "trigger:stripe:event_received",
      "action:slack:send_channel_message",
    ]);
  });

  it("the owner prompt's plan is real, validated, and carries no fabricated config", () => {
    const plan = inferNamedProviderChainPlan(OWNER_PROMPT)!;
    expect(validateWorkflowPlan(plan).ok).toBe(true);
    expect(plan.notApplied).toBe(true);
    for (const step of plan.steps) expect(step.config).toBeUndefined();
    // requiredInputs come from REAL registry metadata, not from the sentence.
    const action = plan.steps.find((s) => s.role === "action")!;
    const meta = getActionMeta(`${action.provider}:${action.type}`)!;
    expect(action.requiredInputs ?? []).toEqual(
      meta.fields.filter((f) => f.required).map((f) => f.name),
    );
  });

  it("the shorter explicit 'channel message' form also resolves", () => {
    const plan = inferNamedProviderChainPlan(
      "When a Stripe invoice is paid, send a channel message in Slack.",
    );
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "stripe:event_received",
      "slack:send_channel_message",
    ]);
  });

  it("'channel' is what breaks the tie — the same sentence without it stays ambiguous", () => {
    // "message" alone matches send_channel_message and send_direct_message EQUALLY (score 1 each).
    // A tie at the top score is a genuine user decision, so the planner must still decline.
    expect(
      inferNamedProviderChainPlan("When a Stripe invoice is paid, send a message in Slack."),
    ).toBeNull();
  });

  it("a generic 'notify Slack' with no object noun at all still declines", () => {
    expect(inferNamedProviderChainPlan("When a Stripe invoice is paid, notify Slack.")).toBeNull();
  });

  it("naming the provider is never on its own enough to pick between equal actions", () => {
    // Slack is named and the verb matches, but nothing distinguishes channel from direct.
    expect(
      inferNamedProviderChainPlan("When a Stripe invoice is paid, post a message to Slack."),
    ).toBeNull();
  });

  it("the pre-existing equal-score ambiguity (Mailchimp note vs tag) is UNCHANGED", () => {
    // Both score exactly 1 ("note" / "tag"); ranking must not manufacture a winner.
    expect(
      inferNamedProviderChainPlan("When a Typeform response arrives, add a note and a tag in Mailchimp"),
    ).toBeNull();
  });

  it("a punctuation-heavy positive case still resolves through ranking", () => {
    const plan = inferNamedProviderChainPlan(
      "When a Stripe invoice is paid; post a message in our Slack billing channel, please.",
    );
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "stripe:event_received",
      "slack:send_channel_message",
    ]);
  });
});

/**
 * REACT-AGENT-AMBIGUOUS-TRIGGER-1 — "build first, configure later" for a broad configurable
 * trigger. The owner-reported prompt ("When I get a Stripe payment from Marcus, send me a Slack
 * message to the test channel.") used to return PREVIEW_PLAN_MISSING: pre-ranked matching, the
 * Slack clause tied send_channel_message against send_direct_message on the generic noun
 * "message" and the planner declined. Trigger-side, Stripe's ONE registered trigger is the broad
 * `event_received` — designed to take the exact event as a SETUP choice (`enabledEvents`), so
 * "payment" ambiguity must never block the preview. These pin the exact prompt + the phrasing
 * variants, and that the event/channel/message stay setup requirements (no fabricated values).
 */
describe("inferNamedProviderChainPlan — ambiguous Stripe payment phrasing (REACT-AGENT-AMBIGUOUS-TRIGGER-1)", () => {
  const PINNED_PROMPT =
    "When I get a Stripe payment from Marcus, send me a Slack message to the test channel.";

  it("the exact owner prompt plans stripe:event_received → slack:send_channel_message on the first pass", () => {
    const plan = inferNamedProviderChainPlan(PINNED_PROMPT);
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.role}:${s.provider}:${s.type}`)).toEqual([
      "trigger:stripe:event_received",
      "action:slack:send_channel_message",
    ]);
  });

  it("the exact Stripe EVENT stays a setup requirement — never guessed from 'payment'", () => {
    const plan = inferNamedProviderChainPlan(PINNED_PROMPT)!;
    const trigger = plan.steps[0]!;
    expect(trigger.requiredInputs).toEqual(["enabledEvents"]);
    expect(trigger.config).toBeUndefined();
    // The Slack channel + message body also remain setup fields with no values.
    const action = plan.steps[1]!;
    expect(action.requiredInputs).toEqual(["channel", "text"]);
    expect(action.config).toBeUndefined();
    // Nothing from the sentence leaked into the plan as a value ("Marcus", "test").
    expect(JSON.stringify(plan)).not.toMatch(/Marcus/);
    expect(validateWorkflowPlan(plan).ok).toBe(true);
  });

  it.each([
    "When a Stripe payment succeeds, post a message to the Slack team channel.",
    "When I receive a payment in Stripe, send a Slack message to the general channel.",
    "When someone pays us through Stripe, send a Slack channel message.",
  ])("phrasing variant plans the same shape: %s", (prompt) => {
    const plan = inferNamedProviderChainPlan(prompt);
    expect(plan).not.toBeNull();
    expect(plan!.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "stripe:event_received",
      "slack:send_channel_message",
    ]);
    expect(plan!.steps[0]!.requiredInputs).toEqual(["enabledEvents"]);
  });

  it("safe clarification is preserved when no valid configurable capability exists (genuine action tie)", () => {
    // The action side stays genuinely ambiguous without an object noun — the planner still declines
    // rather than guessing between channel and direct message.
    expect(
      inferNamedProviderChainPlan("When I get a Stripe payment from Marcus, send me a Slack message."),
    ).toBeNull();
  });
});
