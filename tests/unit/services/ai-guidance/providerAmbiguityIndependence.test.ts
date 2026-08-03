/** @jest-environment node */
/**
 * Template / few-shot independence (REACT-PROVIDER-AMBIGUITY-1, scenario 9).
 *
 * Generic "email" must stay ambiguous even where Gmail exists in catalogs/examples:
 *   - the official-template matcher may not STRONG-match (auto-recommend) a Gmail-trigger template
 *     for a request that never named Gmail — the "email" alias is ranking signal only;
 *   - the gateway prompt carries no Gmail-biased few-shot example and states the provider rule.
 */
import {
  selectOfficialTemplateRecommendation,
  type OfficialTemplateCatalogEntry,
} from "@/core/workflows/officialTemplateMatcher";
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import { buildEditableWorkflowGraph } from "@/services/ai-guidance/editableGraph/buildEditableWorkflowGraph";
import { buildSafeGuidanceContext } from "@/services/ai-guidance/guidanceContextPolicy";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const GMAIL_TO_SLACK_TEMPLATE: OfficialTemplateCatalogEntry = {
  id: "t-gmail-slack",
  name: "Email to Slack alert",
  description: "When an email arrives in Gmail, post it to a Slack channel.",
  category: "team-ops",
  triggerKind: "app",
  providers: ["gmail", "slack"],
  steps: [
    { kind: "trigger", provider: "gmail", type: "new_email" },
    { kind: "action", provider: "slack", type: "send_channel_message" },
  ],
  nodeCount: 2,
  stepCount: 1,
};

describe("template matcher — generic email never auto-recommends a Gmail template", () => {
  it("'When I receive an email … post it to Slack' does NOT strong-match the Gmail template", () => {
    const res = selectOfficialTemplateRecommendation(
      "When I receive an email from a vendor, post it to Slack",
      [GMAIL_TO_SLACK_TEMPLATE],
    );
    expect(res.outcome).not.toBe("strong_match");
    expect(res.recommendation).toBeNull();
  });

  it("naming Gmail explicitly still strong-matches (provider evidence, not alias)", () => {
    const res = selectOfficialTemplateRecommendation(
      "When I receive an email in Gmail, post it to Slack",
      [GMAIL_TO_SLACK_TEMPLATE],
    );
    expect(res.outcome).toBe("strong_match");
    expect(res.recommendation?.templateId).toBe("t-gmail-slack");
  });
});

describe("gateway prompt — no Gmail few-shot bias; explicit provider rule", () => {
  const EMPTY_REQUEST: WorkflowGuidanceRequest = {
    schemaVersion: 1,
    guidanceKind: "workflow_design",
    workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
  };

  it("states the provider rule for new-workflow requests (generic word ≠ provider; never default to Gmail)", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help me automate" });
    expect(prompt).toContain("PROVIDER RULE");
    expect(prompt).toContain('names a KIND of app, NOT a provider');
    expect(prompt).toContain("Never default to Gmail or to the first catalog entry");
  });

  it("states that a connected provider is available, NOT selected (REACT-PROVIDER-AMBIGUITY-2)", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "when I receive an email, post it to Slack",
      // A REAL scope-guarded context listing Gmail as the caller's own connection — the prompt must
      // still tell the model that availability isn't a selection.
      context: buildSafeGuidanceContext({
        viewerUserId: "user-1",
        account: { type: "personal" },
        ownConnectionProviders: ["gmail"],
      }),
    });
    expect(prompt).toContain("CONNECTION IS NOT A CHOICE");
    expect(prompt).toContain("a connected provider is available, not selected");
    expect(prompt).toContain("Ask a targeted clarification even when only one of those providers is connected");
    // The availability instruction must not read as "prefer what's connected".
    expect(prompt).toContain("A connected provider is AVAILABLE, not SELECTED");
    expect(prompt).not.toContain("Only suggest using connections listed as available");
  });

  it("the edit-instruction op example is provider-neutral (no gmail:send_email few-shot)", () => {
    const { graph } = buildEditableWorkflowGraph({
      nodes: [
        { id: "n1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [],
    });
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "change something",
      editableGraph: graph,
    });
    expect(prompt).not.toContain('"provider":"gmail"');
    expect(prompt).toContain('"provider":"<provider from the catalog>"');
  });
});
