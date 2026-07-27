/**
 * @jest-environment node
 *
 * REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — pins the three source-level corrections for the
 * production no-plan regression, so none of them can silently return:
 *
 *   1. PROMPT CONTRADICTION: the schema-dependent-data rule must never again instruct the model to
 *      ask for a resource BEFORE returning the plan (the a70a957d8 instruction that contradicted
 *      preview-first and produced the questionnaire).
 *   2. PROMPT PRIORITY: the response contract opens with one explicit priority order that makes the
 *      structured plan the primary output.
 *   3. PROMPT OVERLOAD: the outputs block is line-bounded with an HONEST truncation marker, and
 *      trigger outputs (the root of every mapping chain) always render before action outputs.
 *
 * Plus the typed plan-stage diagnostics: each way a plan can die names its exact stage.
 */
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import {
  buildOutputSchemaLines,
  selectRelevantProviders,
  MAX_OUTPUT_SCHEMA_LINES,
  OUTPUT_SCHEMA_TRUNCATION_LINE,
} from "@/services/ai-guidance/promptFieldSchemas";
import { diagnosePlanExtraction } from "@/services/ai-guidance/gateway/extractPlanFromText";
import { normalizeGatewayResponse } from "@/services/ai-guidance/gateway/gatewayResponseContract";
import type { WorkflowGuidanceRequest } from "@/services/ai-guidance/types";

const PRODUCTION_PROMPT =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot " +
  "contact, and send me a Gmail message summarizing their answers. Use the submitted email, " +
  "first name, last name, company, and message wherever appropriate.";

const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

/** The full prompt as production assembles it for the four-provider request. */
function buildProductionPrompt(): string {
  const relevant = selectRelevantProviders({ texts: [PRODUCTION_PROMPT] });
  return buildGatewayGuidancePrompt({
    request: EMPTY_REQUEST,
    goalText: PRODUCTION_PROMPT,
    outputSchemaLines: buildOutputSchemaLines(relevant),
  });
}

describe("prompt priority + contradiction (#10, #11, #12, #13)", () => {
  const prompt = buildProductionPrompt();

  it("(#10) the priority order opens the response contract: plan production outranks questions", () => {
    const priorityIdx = prompt.indexOf("PRIORITY ORDER");
    expect(priorityIdx).toBeGreaterThan(-1);
    expect(prompt).toContain("1. Return the structured workflowPlan json block");
    expect(prompt).toContain("2. Put missing or not-yet-knowable configuration in each step's `requiredInputs`");
    expect(prompt).toContain("3. Ask clarifying questions");
    expect(prompt).toContain("4. Prose commentary is secondary to the structured plan");
    // The plan-first rule precedes every clarification instruction in the contract block.
    const clarifyIdx = prompt.indexOf("Ask short clarifying questions FIRST");
    expect(priorityIdx).toBeLessThan(clarifyIdx);
  });

  it("(#11) resource/enum questions are routed to requiredInputs, never chat", () => {
    expect(prompt).toContain("NEVER ask any of these before returning the plan");
    expect(prompt).toContain("List each of these as `requiredInputs`");
  });

  it("(#12) the schema-dependent contradiction is gone — plan returned, resource as a setup field", () => {
    expect(prompt).not.toContain("Ask the user to pick that resource FIRST");
    expect(prompt).toContain("STILL RETURN THE PLAN");
    expect(prompt).toContain("do NOT ask the user to pick the resource in chat");
  });

  it("(#12b) true topology ambiguity still allows clarification", () => {
    expect(prompt).toContain("ONLY when the SHAPE itself is ambiguous");
  });

  it("(#13) unrelated provider limitations stay barred", () => {
    expect(prompt).toContain("Only mention a capability ChainReact LACKS when the user actually asked");
  });
});

describe("prompt overload bound (outputs block)", () => {
  it("the outputs block is line-bounded and marks its truncation honestly", () => {
    const relevant = selectRelevantProviders({ texts: [PRODUCTION_PROMPT] });
    const lines = buildOutputSchemaLines(relevant);
    // +1: the final entry may be the marker line itself.
    expect(lines.length).toBeLessThanOrEqual(MAX_OUTPUT_SCHEMA_LINES + 1);
    if (lines.length > MAX_OUTPUT_SCHEMA_LINES - 20) {
      expect(lines[lines.length - 1]).toBe(OUTPUT_SCHEMA_TRUNCATION_LINE);
    }
  });

  it("TRIGGER outputs always render before action outputs — the mapping root can never be cut first", () => {
    const relevant = selectRelevantProviders({ texts: [PRODUCTION_PROMPT] });
    const lines = buildOutputSchemaLines(relevant);
    const joined = lines.join("\n");
    // The Typeform trigger (named LAST among the relevant providers) must still be present.
    expect(joined).toContain("typeform:new_response_in_form [trigger] produces:");
    const firstAction = lines.findIndex((l) => l.includes("[action] produces:"));
    const lastTrigger = lines.map((l, i) => (l.includes("[trigger] produces:") ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(lastTrigger).toBeLessThan(firstAction === -1 ? Number.MAX_SAFE_INTEGER : firstAction);
  });
});

describe("typed plan-stage diagnostics (#4–#9)", () => {
  const envelope = (content: string) => ({ ok: true, response: { choices: [{ message: { content } }] } });

  it("(#4) valid plan text is extracted → PLAN_OK with the parsed step count", () => {
    const content = 'Here you go.\n```json\n{"title":"t","summary":"s","steps":[{"role":"trigger","provider":"native","type":"manual.run"}]}\n```';
    const d = diagnosePlanExtraction(content);
    expect(d.stage).toBe("PLAN_OK");
    expect(d.parsedStepCount).toBe(1);
    const n = normalizeGatewayResponse(envelope(content));
    expect(n.ok && n.planDiagnostics?.stage).toBe("PLAN_OK");
  });

  it("(#5) invalid JSON reports PLAN_JSON_PARSE_FAILED", () => {
    const content = 'Plan:\n```json\n{"title": "broken", "steps": [ {"role": "trigger", \n```';
    const d = diagnosePlanExtraction(content);
    expect(d.stage).toBe("PLAN_JSON_PARSE_FAILED");
    expect(d.parseFailedBlockCount).toBe(1);
  });

  it("(#6) unknown capabilities report PLAN_CAPABILITY_INVALID with the rejected count", () => {
    const content =
      'Plan:\n```json\n{"title":"x","summary":"y","steps":[{"role":"trigger","provider":"madeup","type":"nope"}]}\n```';
    const n = normalizeGatewayResponse(envelope(content));
    expect(n.ok).toBe(true);
    if (n.ok) {
      expect(n.workflowPlan).toBeNull();
      expect(n.planDiagnostics?.stage).toBe("PLAN_CAPABILITY_INVALID");
      expect(n.planDiagnostics?.invalidCapabilityCount).toBe(1);
    }
  });

  it("a JSON object that is not plan-shaped reports PLAN_SCHEMA_INVALID", () => {
    const d = diagnosePlanExtraction('```json\n{"hello":"world"}\n```');
    expect(d.stage).toBe("PLAN_SCHEMA_INVALID");
    expect(d.shapeInvalidBlockCount).toBe(1);
  });

  it("a questionnaire with no JSON at all reports MODEL_RETURNED_NO_PLAN", () => {
    const d = diagnosePlanExtraction("Which form? Which audience? Who should receive the email?");
    expect(d.stage).toBe("MODEL_RETURNED_NO_PLAN");
    expect(d.fencedBlockCount).toBe(0);
    expect(d.responseChars).toBeGreaterThan(0);
  });

  it("(#9) truncated output is classified distinctly (unclosed fence → truncationSuspected)", () => {
    const d = diagnosePlanExtraction('Plan below.\n```json\n{"title":"cut off mid-');
    expect(d.truncationSuspected).toBe(true);
  });

  it("an edit reply (mutation block) is NOT misreported as a failed plan", () => {
    const d = diagnosePlanExtraction('```json\n{"editVersion":"v1","operations":[{"op":"removeNode","nodeId":"node_1"}]}\n```');
    expect(d.stage).toBe("MODEL_RETURNED_NO_PLAN");
    expect(d.shapeInvalidBlockCount).toBe(0);
  });

  it("diagnostics carry ONLY safe metadata — never the model text", () => {
    const d = diagnosePlanExtraction("secret questionnaire content the log must never carry");
    for (const v of Object.values(d)) {
      expect(typeof v === "number" || typeof v === "boolean" || typeof v === "string").toBe(true);
    }
    expect(JSON.stringify(d)).not.toContain("secret questionnaire");
  });
});
