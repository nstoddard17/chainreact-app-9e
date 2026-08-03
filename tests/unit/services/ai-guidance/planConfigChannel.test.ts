/** @jest-environment node */
/**
 * Plan-step config channel + prompt semantics (REACT-CONFIG-COVERAGE-1).
 *
 * Pins that a user-supplied value can now TRAVEL: the extractor keeps step `config` from a fenced
 * plan block, the sibling-object path keeps `requiredInputs`/`config` (previously dropped), and the
 * gateway prompt (a) renders the narrowed field schemas, (b) states the optional-field rule, and
 * (c) explains verbatim placeholder handling.
 */
import { extractPlanFromText } from "@/services/ai-guidance/gateway/extractPlanFromText";
import { requestHermesAgentGuidanceNormalized } from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import { normalizeGatewayResponse } from "@/services/ai-guidance/gateway/gatewayResponseContract";
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import {
  buildFieldSchemaLines,
  selectRelevantProviders,
} from "@/services/ai-guidance/promptFieldSchemas";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

describe("extractPlanFromText — config channel", () => {
  it("keeps step config from a fenced plan block", () => {
    const text = [
      "Here's a plan.",
      "```json",
      JSON.stringify({
        title: "T",
        summary: "S",
        steps: [
          {
            ref: "s0",
            role: "trigger",
            provider: "gmail",
            type: "new_email",
            config: { from: ["[[EMAIL_1]]"], subject: "Invoice" },
          },
        ],
      }),
      "```",
    ].join("\n");
    const extracted = extractPlanFromText(text);
    expect(extracted?.plan.steps[0]?.config).toEqual({ from: ["[[EMAIL_1]]"], subject: "Invoice" });
  });
});

describe("normalizeGatewayResponse — sibling plan object carries requiredInputs + config", () => {
  it("no longer drops the model's field hints and user values on the strict sibling path", () => {
    const normalized = normalizeGatewayResponse({
      ok: true,
      workflowPlan: {
        title: "T",
        summary: "S",
        steps: [
          {
            ref: "s0",
            role: "trigger",
            provider: "gmail",
            type: "new_email",
            purpose: "watch",
            requiredInputs: ["labelIds"],
            config: { subject: "Invoice" },
          },
        ],
      },
      response: { choices: [{ message: { content: "Here you go." } }] },
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.workflowPlan?.steps[0]?.requiredInputs).toEqual(["labelIds"]);
    expect(normalized.workflowPlan?.steps[0]?.config).toEqual({ subject: "Invoice" });
  });
});

describe("buildGatewayGuidancePrompt — field schemas + optional-field rule + placeholders", () => {
  it("renders the narrowed field-schema block and the canonical field-value rules", () => {
    const providers = selectRelevantProviders({
      texts: ["When I receive an email from [[EMAIL_1]], post it to Slack"],
      connectedProviders: ["slack"],
    });
    expect(providers).toEqual(expect.arrayContaining(["gmail", "slack"]));
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "When I receive an email from [[EMAIL_1]], post it to Slack",
      capabilityCatalog: ["gmail:new_email", "slack:send_channel_message"],
      fieldSchemaLines: buildFieldSchemaLines(providers),
    });
    // The optional sender filter is now discoverable in the prompt packet.
    expect(prompt).toContain("gmail:new_email");
    expect(prompt).toContain("from (string-array, optional");
    // Canonical rule: consider every field; never omit a user constraint because it's optional.
    expect(prompt).toContain("NEVER omit a constraint the user stated just because its field is optional");
    expect(prompt).toContain("Do not guess, pad, or fill defaults");
    expect(prompt).toContain("Preserve explicit false and 0 values exactly");
    // Placeholder contract: copy verbatim, never expand.
    expect(prompt).toContain("Copy the placeholder EXACTLY");
    // The plan shape now carries a config object.
    expect(prompt).toContain('"config": {"<declaredFieldKey>"');
  });

  it("forwards fieldSchemaLines all the way into the gateway request body (and only the tokenized goal)", async () => {
    let capturedBody = "";
    await requestHermesAgentGuidanceNormalized({
      request: EMPTY_REQUEST,
      config: { gatewayUrl: "https://gw.example.com", gatewayToken: "tok", timeoutMs: 5000 },
      goalText: "post emails from [[EMAIL_1]] to Slack",
      fieldSchemaLines: ["  - gmail:new_email [trigger] — fields: from (string-array, optional)"],
      fetchImpl: async (_url, init) => {
        capturedBody = init.body;
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, response: { choices: [{ message: { content: "ok" } }] } }),
          text: async () => "",
        };
      },
    });
    expect(capturedBody).toContain("gmail:new_email");
    expect(capturedBody).toContain("from (string-array, optional)");
    expect(capturedBody).toContain("[[EMAIL_1]]");
    expect(capturedBody).not.toContain("vendor@example.com");
    // The gateway token stays in the header, never the body.
    expect(capturedBody).not.toContain("tok\"");
  });

  it("still never leaks a raw secret shape from goal text", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "use my key sk-abcdefghijklmnopqrstuvwx please",
    });
    expect(prompt).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(prompt).toContain("[redacted]");
  });
});
