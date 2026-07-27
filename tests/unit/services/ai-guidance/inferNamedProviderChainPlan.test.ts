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
