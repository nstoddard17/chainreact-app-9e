/**
 * @jest-environment node
 *
 * Multi-step data mapping (REACT-AGENT-MULTISTEP-DATA-MAPPING-1).
 *
 * Reproduces the production failure: asked to wire a Typeform submission into Mailchimp, HubSpot and
 * Gmail, the agent picked the right four nodes and then filled the Email fields with
 * `subscriber@example.com` / `alice@example.com` and left the Gmail body blank. Nothing flowed
 * between the steps, and the proposal still looked like a success.
 *
 * Two defects are covered here, both general rather than Typeform-specific:
 *   1. the prompt never showed the model what any node PRODUCES, so no mapping was expressible;
 *   2. nothing rejected invented identity data, so the hole got filled with realistic-looking values.
 *
 * Real registry, real metadata, real sanitizer — no mocks. The external Typeform API is never
 * touched (nothing here needs a form schema; that limitation is the point of the Case-B tests).
 */

import {
  buildFieldSchemaLines,
  buildOutputSchemaLines,
  selectRelevantProviders,
} from "@/services/ai-guidance/promptFieldSchemas";
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import {
  sanitizeConfigAgainstFields,
  sanitizePlanStepConfigs,
} from "@/services/ai-guidance/planConfig/sanitizeProposedConfig";
import {
  buildUserLiteralCorpus,
  findFabricatedSampleValue,
} from "@/core/workflows/mapping/fabricatedSampleValues";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const PROMPT_TEXT =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot contact, " +
  "and send me a Gmail message summarizing their answers. Use the submitted email, first name, " +
  "last name, company, and message wherever appropriate.";

const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

// ───────────────────── Defect 1: outputs were invisible to the model ─────────────────────

describe("declared outputs are visible to the model (root cause of 'no mappings at all')", () => {
  const providers = selectRelevantProviders({
    texts: [PROMPT_TEXT],
    connectedProviders: ["typeform", "mailchimp", "hubspot", "gmail"],
  });

  it("selects the four providers the request names", () => {
    for (const id of ["typeform", "mailchimp", "hubspot", "gmail"]) {
      expect(providers).toContain(id);
    }
  });

  it("renders what the Typeform trigger PRODUCES, not just what it consumes", () => {
    const outputs = buildOutputSchemaLines(providers).join("\n");
    expect(outputs).toContain("typeform:new_response_in_form [trigger] produces:");
    // Every declared payloadShape entry must be referenceable by the model.
    const meta = getTriggerMeta("typeform:new_response_in_form")!;
    for (const o of meta.payloadShape ?? []) {
      expect(outputs).toContain(`· ${o.name} (`);
    }
  });

  it("marks respondent content as sensitive while still listing it (it is mappable)", () => {
    const outputs = buildOutputSchemaLines(["typeform"]).join("\n");
    expect(outputs).toMatch(/· answers \([^)]*sensitive/);
  });

  it("renders action outputs too, so step-to-step chains are expressible", () => {
    const outputs = buildOutputSchemaLines(["hubspot"]).join("\n");
    expect(outputs).toContain("[action] produces:");
  });

  it("the prompt carries the outputs block AND the anti-fabrication rules", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: PROMPT_TEXT,
      fieldSchemaLines: buildFieldSchemaLines(providers),
      outputSchemaLines: buildOutputSchemaLines(providers),
    });
    expect(prompt).toContain("Data each capability PRODUCES");
    expect(prompt).toContain("{{stepRef.outputName}}");
    // The rule that was missing entirely, and the multi-consumer rule the request needs.
    expect(prompt).toContain("NEVER invent a realistic-looking sample value");
    expect(prompt).toContain("ONE upstream value may feed MANY downstream steps");
    // Case B: schema-dependent data must be asked for, not guessed.
    expect(prompt).toContain("SCHEMA-DEPENDENT DATA");
  });

  it("without the outputs block the prompt still tells the model to reference outputs — the old, broken contract", () => {
    const withoutOutputs = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: PROMPT_TEXT });
    expect(withoutOutputs).toContain("{{...}} variable reference");
    expect(withoutOutputs).not.toContain("Data each capability PRODUCES");
  });
});

// ───────────────────── Defect 2: invented identity data ─────────────────────

describe("fabricated sample values never reach proposed config", () => {
  const corpus = buildUserLiteralCorpus([PROMPT_TEXT]);

  it("(#19) flags the exact values from the production failure", () => {
    expect(findFabricatedSampleValue("subscriber@example.com", corpus)).toEqual({ kind: "sample_domain" });
    expect(findFabricatedSampleValue("alice@example.com", corpus)).toEqual({ kind: "sample_domain" });
  });

  it("(#20) allows an email the user actually typed", () => {
    const userCorpus = buildUserLiteralCorpus(["Email the summary to ops@realcompany.io please"]);
    expect(findFabricatedSampleValue("ops@realcompany.io", userCorpus)).toBeNull();
    // …and still rejects a different address the model added alongside it.
    expect(findFabricatedSampleValue("someoneelse@other.io", userCorpus)).toEqual({ kind: "email" });
  });

  it("(#21) distinguishes user literals from invented ones by the user's own words, not by shape", () => {
    const userCorpus = buildUserLiteralCorpus(["forward invoices from billing@acme-supplies.co.uk"]);
    expect(findFabricatedSampleValue("billing@acme-supplies.co.uk", userCorpus)).toBeNull();
    // A filler address the user never wrote is still caught, and reported as the sample-domain class.
    expect(findFabricatedSampleValue("billing@acme.com", userCorpus)).toEqual({ kind: "sample_domain" });
  });

  it("never fires on model-authored prose or on variable references", () => {
    expect(findFabricatedSampleValue("New Typeform submission", corpus)).toBeNull();
    expect(findFabricatedSampleValue("Name: {{s0.formTitle}}\nEmail: {{s0.answers}}", corpus)).toBeNull();
    expect(findFabricatedSampleValue("", corpus)).toBeNull();
  });

  it("catches an invented address hiding inside an otherwise-mapped body", () => {
    expect(
      findFabricatedSampleValue("Email: {{s0.email}} (or reach them at alice@example.com)", corpus),
    ).toEqual({ kind: "sample_domain" });
  });

  it("(#20) THE USER ALWAYS WINS — even a reserved sample domain they typed themselves is kept", () => {
    // People genuinely test with example.com. Overriding an explicit instruction would be the
    // opposite failure to the one this guard prevents, so user-supplied literals are never judged.
    const typedIt = buildUserLiteralCorpus(["send it to test@example.com"]);
    expect(findFabricatedSampleValue("test@example.com", typedIt)).toBeNull();
    // The same address is still rejected when the user never mentioned it.
    expect(findFabricatedSampleValue("test@example.com", corpus)).toEqual({ kind: "sample_domain" });
  });

  it("ignores short digit runs, so quantities and ids are not mistaken for phone numbers", () => {
    expect(findFabricatedSampleValue("limit 100", corpus)).toBeNull();
    expect(findFabricatedSampleValue("2026-07-26", corpus)).toBeNull();
  });
});

// ───────────────────── The sanitizer's behavior on a real provider meta ─────────────────────

describe("the sanitizer removes invented values and surfaces the field as needing input", () => {
  const corpus = buildUserLiteralCorpus([PROMPT_TEXT]);
  const mailchimp = getActionMeta("mailchimp:add_subscriber")!;

  it("(#2,#19) Mailchimp email: an invented address is removed, not saved", () => {
    const result = sanitizeConfigAgainstFields(
      { email: "subscriber@example.com" },
      mailchimp.fields,
      corpus,
    );
    expect(result.config).not.toHaveProperty("email");
    expect(result.fabricatedFields).toEqual(["email"]);
  });

  it("an upstream reference in the SAME field passes through untouched", () => {
    const result = sanitizeConfigAgainstFields(
      { email: "{{s0.answers}}" },
      mailchimp.fields,
      corpus,
    );
    expect(result.config.email).toBe("{{s0.answers}}");
    expect(result.fabricatedFields).toEqual([]);
  });

  it("omitting the corpus leaves prior behavior byte-identical (opt-in guard)", () => {
    const result = sanitizeConfigAgainstFields({ email: "subscriber@example.com" }, mailchimp.fields);
    expect(result.config.email).toBe("subscriber@example.com");
    expect(result.fabricatedFields).toEqual([]);
  });

  it("(#9) a removed invention becomes a targeted required input, so the step is not 'complete'", () => {
    const plan: WorkflowPlan = {
      schemaVersion: 1,
      title: "Typeform to Mailchimp",
      summary: "",
      steps: [
        {
          ref: "s0",
          role: "trigger",
          provider: "typeform",
          type: "new_response_in_form",
          purpose: "Watch the contact form",
        },
        {
          ref: "s1",
          role: "action",
          provider: "mailchimp",
          type: "add_subscriber",
          purpose: "Add the submitter",
          config: { email: "subscriber@example.com" },
        },
      ],
      notApplied: true,
    } as WorkflowPlan;

    const { plan: sanitized, fabricated } = sanitizePlanStepConfigs(plan, corpus);
    const step = sanitized.steps.find((s) => s.ref === "s1")!;
    expect(step.config?.email).toBeUndefined();
    expect(step.requiredInputs).toContain("email");
    expect(fabricated).toEqual([{ ref: "s1", field: "email" }]);
    // Value-free reporting: the invented address never leaves the sanitizer.
    expect(JSON.stringify(sanitized)).not.toContain("example.com");
  });

  it("(#8) no example address survives anywhere in the sanitized plan", () => {
    const plan: WorkflowPlan = {
      schemaVersion: 1,
      title: "t",
      summary: "",
      steps: [
        {
          ref: "s1",
          role: "action",
          provider: "gmail",
          type: "send_email",
          purpose: "Notify",
          config: { to: "alice@example.com", subject: "New submission", textBody: "" },
        },
      ],
      notApplied: true,
    } as WorkflowPlan;
    const { plan: sanitized } = sanitizePlanStepConfigs(plan, corpus);
    expect(JSON.stringify(sanitized)).not.toMatch(/@example\.com/);
  });
});

// ───────────────────── Case B: Typeform's per-question data is not declared ─────────────────────

describe("Typeform question-level data is NOT declared metadata (Case B is the honest path)", () => {
  it("(#10) the trigger declares no per-question outputs — only an opaque answers array", () => {
    const meta = getTriggerMeta("typeform:new_response_in_form")!;
    const names = (meta.payloadShape ?? []).map((o) => o.name);
    expect(names).toContain("answers");
    // The concepts the user asked to map are NOT addressable as declared outputs. Any proposal that
    // claims otherwise is inventing them — which is exactly what the guard above now prevents.
    for (const concept of ["email", "firstName", "first_name", "lastName", "company", "message"]) {
      expect(names).not.toContain(concept);
    }
  });

  it("(#11) the form is a required, resolver-backed selection — the resource the agent must ask for first", () => {
    const meta = getTriggerMeta("typeform:new_response_in_form")!;
    const formField = meta.fields.find((f) => f.name === "formId")!;
    expect(formField.required).toBe(true);
    expect(formField.optionsSource).toBe("typeform:forms");
  });

  // REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — this test used to pin "Ask the user to pick
  // that resource FIRST", the instruction that contradicted preview-first and made the model
  // withhold the whole plan (the production regression). The rule now keeps the anti-guessing
  // protections but requires the plan to be RETURNED with the resource as a requiredInputs entry.
  it("(#12) schema-dependent data: no guessing, no invented values — but the plan is still returned", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: PROMPT_TEXT,
      outputSchemaLines: buildOutputSchemaLines(["typeform"]),
    });
    expect(prompt).toContain("do NOT guess field names and do NOT invent values");
    expect(prompt).toContain("do NOT ask the user to pick the resource in chat");
    expect(prompt).toContain("STILL RETURN THE PLAN");
    // The contradiction must never come back.
    expect(prompt).not.toContain("Ask the user to pick that resource FIRST");
  });
});
