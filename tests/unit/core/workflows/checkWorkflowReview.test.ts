/**
 * checkWorkflowReview — deterministic "Check workflow" review formatting
 * (BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW).
 *
 * Proves the review is human-readable (never a raw-JSON dump), is framed by ChainReact's deterministic
 * validation verdict, and can never claim valid/ready while blockers exist — regardless of the agent
 * reply. Also proves the request context sent to the agent carries only de-identified counts + codes.
 */
import {
  looksLikeRawJson,
  sanitizeAgentSuggestions,
  buildAgentReviewGoalText,
  composeCheckWorkflowReview,
  type CheckWorkflowReviewContext,
} from "@/core/workflows/checkWorkflowReview";

const BLOCKED: CheckWorkflowReviewContext = {
  summary: "This workflow starts when Gmail new email, then runs 1 step: Slack send message.",
  blockingIssueCount: 1,
  issueMessages: ["Slack send message needs a Channel."],
  issueCodes: ["missing_required_field"],
  setupTargets: [],
};

const CLEAN: CheckWorkflowReviewContext = {
  summary: "This workflow starts when Gmail new email, then runs 1 step: Slack send message.",
  blockingIssueCount: 0,
  issueMessages: [],
  issueCodes: [],
  setupTargets: [],
};

describe("looksLikeRawJson", () => {
  it("detects a raw JSON object / array, including a ```json fenced block", () => {
    expect(looksLikeRawJson('{"nodes":[{"id":"a"}],"edges":[]}')).toBe(true);
    expect(looksLikeRawJson('[{"id":"a"},{"id":"b"}]')).toBe(true);
    expect(looksLikeRawJson('```json\n{"nodes":[]}\n```')).toBe(true);
    // Bracketed-but-not-strict-JSON blob with several key: pairs still reads as a dump.
    expect(looksLikeRawJson('{ "provider": slack, "type": send, }')).toBe(true);
  });

  it("treats prose as not-JSON", () => {
    expect(looksLikeRawJson("Add a Slack channel to the message step.")).toBe(false);
    expect(looksLikeRawJson("")).toBe(false);
  });
});

describe("sanitizeAgentSuggestions", () => {
  it("drops a raw-JSON reply", () => {
    expect(sanitizeAgentSuggestions('{"nodes":[]}', true)).toBeNull();
    expect(sanitizeAgentSuggestions('{"nodes":[]}', false)).toBeNull();
  });

  it("suppresses a readiness/validity claim only when blockers exist", () => {
    expect(sanitizeAgentSuggestions("Your workflow is valid and ready to go!", true)).toBeNull();
    // Same claim is allowed through when there are no blockers (it's not contradicting anything).
    expect(sanitizeAgentSuggestions("Your workflow is ready to go!", false)).toBe(
      "Your workflow is ready to go!",
    );
  });

  it("passes normal improvement prose through", () => {
    expect(sanitizeAgentSuggestions("Consider adding a delay before Slack.", true)).toBe(
      "Consider adding a delay before Slack.",
    );
  });
});

describe("buildAgentReviewGoalText", () => {
  it("includes blocking count + issue CODES (not user labels) when blockingIssueCount > 0", () => {
    const out = buildAgentReviewGoalText("Review my current workflow and suggest improvements or fixes.", BLOCKED);
    expect(out).toContain("Review my current workflow");
    expect(out).toContain("1 blocking setup issue");
    expect(out).toContain("missing_required_field");
    expect(out).toMatch(/not ready\s+to activate/i);
    // No user-facing label / field value leaks into the agent prompt — only codes + counts.
    expect(out).not.toContain("Slack send message needs a Channel.");
  });

  it("uses a no-blockers context line when there are no issues", () => {
    const out = buildAgentReviewGoalText("Review my current workflow.", CLEAN);
    expect(out).toContain("no blocking setup issues");
    expect(out).not.toContain("NOT ready");
  });
});

describe("composeCheckWorkflowReview", () => {
  it("frames a blocked workflow as NOT ready and lists the deterministic setup issues", () => {
    const review = composeCheckWorkflowReview({
      summary: BLOCKED.summary,
      blockingIssueCount: BLOCKED.blockingIssueCount,
      issueMessages: BLOCKED.issueMessages,
      agentText: "Here are some ideas.",
    });
    // Human-readable sections, in plain English.
    expect(review).toContain("Status");
    expect(review).toContain("Current workflow");
    expect(review).toContain("Setup issues");
    expect(review).toContain("Suggestions");
    expect(review).toContain("Next step");
    // Deterministic verdict + the actual blocker.
    expect(review).toContain("not ready to activate");
    expect(review).toContain("Slack send message needs a Channel.");
    expect(review).toContain(BLOCKED.summary);
  });

  it("never claims valid/ready when blockers exist, even if the agent insists it is", () => {
    const review = composeCheckWorkflowReview({
      summary: BLOCKED.summary,
      blockingIssueCount: BLOCKED.blockingIssueCount,
      issueMessages: BLOCKED.issueMessages,
      agentText: "Good news — your workflow is valid and ready to activate!",
    });
    // No positive readiness/validity claim survives (the agent's overclaim is suppressed).
    expect(review).not.toMatch(/\bis (valid|ready)\b/i);
    expect(review).not.toMatch(/valid and ready/i);
    expect(review).not.toMatch(/looks good|good to go|all set/i);
    // The deterministic "not ready" verdict stands.
    expect(review).toContain("not ready to activate");
  });

  it("never renders a raw-JSON agent dump as the response body", () => {
    const review = composeCheckWorkflowReview({
      summary: BLOCKED.summary,
      blockingIssueCount: BLOCKED.blockingIssueCount,
      issueMessages: BLOCKED.issueMessages,
      agentText: '{"nodes":[{"id":"a","provider":"slack"}],"edges":[]}',
    });
    expect(review).not.toContain('"nodes"');
    expect(review).not.toContain('"provider"');
    // Falls back to a safe Suggestions line instead.
    expect(review).toContain("No AI needed yet.");
  });

  it("for a clean workflow, reports no blocking issues and keeps the agent's suggestions", () => {
    const review = composeCheckWorkflowReview({
      summary: CLEAN.summary,
      blockingIssueCount: CLEAN.blockingIssueCount,
      issueMessages: CLEAN.issueMessages,
      agentText: "Consider adding a delay before Slack.",
    });
    expect(review).toContain("no blocking setup issues");
    expect(review).not.toContain("not ready to activate");
    expect(review).toContain("Consider adding a delay before Slack.");
  });
});
