/**
 * @jest-environment node
 *
 * Safe gateway prompt builder — scope-guard wiring (HERMES-AGENT-MEMORY-SCOPE-GUARD).
 * Proves the prompt always carries the scope instruction, renders the safe context (account / shared
 * + own connections / private-connection notice) when provided, and never carries excluded fields.
 */
import { buildGatewayGuidancePrompt } from "@/services/ai-guidance/gateway/buildGatewayGuidancePrompt";
import { FOREIGN_PRIVATE_CONNECTION_NOTICE } from "@/services/ai-guidance/guidanceContextPolicy";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

describe("buildGatewayGuidancePrompt — scope instruction + safe context", () => {
  it("always includes the scope + credential-availability instructions (even with no context)", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toContain("Use only the context included in this request");
    expect(prompt).toContain("Do not infer or claim access to other team members");
    expect(prompt).toContain("Only suggest using connections listed as available in this request");
  });

  it("renders account summary + shared/own connections + private-connection notice from context", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "help",
      context: {
        schemaVersion: 1,
        account: { type: "team", role: "member" },
        sharedCredentialProviders: ["slack", "notion"],
        ownConnectionProviders: ["gmail"],
        privateConnectionNotice: FOREIGN_PRIVATE_CONNECTION_NOTICE,
        scopesIncluded: ["account", "global", "user", "workflow"],
      },
    });
    expect(prompt).toContain("type=team");
    expect(prompt).toContain("your role=member");
    expect(prompt).toContain("Shared account connections available: slack, notion");
    expect(prompt).toContain("Your own connected accounts: gmail");
    expect(prompt).toContain(FOREIGN_PRIVATE_CONNECTION_NOTICE);
  });

  it("omits context lines when no context is passed", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).not.toContain("Account context:");
    expect(prompt).not.toContain("Shared account connections");
  });

  it("never carries identity/secret markers", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "help",
      context: { schemaVersion: 1, account: { type: "team" }, scopesIncluded: ["account", "global"] },
    });
    for (const needle of ["user-", "access_token", "refresh_token", "owner_user_id", "Bearer "]) {
      expect(prompt).not.toContain(needle);
    }
  });
});

describe("buildGatewayGuidancePrompt — prefer partial preview + guided setup (HERMES-AGENT-PREFER-PARTIAL-PREVIEW-WITH-SETUP)", () => {
  it("instructs the model to return a plan for a clear shape even when config values are missing, collected by ChainReact setup UI", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "send a slack message when I run this" });
    // Missing config is not a reason to withhold the plan.
    expect(prompt).toContain("RETURN the plan even if specific config values are still unknown");
    // ChainReact collects the values itself (setup UI), not via more model calls / pre-plan questions.
    expect(prompt).toContain("ChainReact collects them itself with a guided setup form");
    // Unknown field keys go in requiredInputs.
    expect(prompt).toContain("requiredInputs");
    // Explicitly: do not ask for channel/recipient/message text before returning the plan.
    expect(prompt).toContain("do NOT ask the user for a channel, recipient, or message text before returning the plan");
  });

  it("instructs the model to ask clarifying questions FIRST only when the SHAPE is ambiguous", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "do something" });
    expect(prompt).toContain("ONLY when the SHAPE itself is ambiguous");
    expect(prompt).toContain("Missing config values alone never make the shape ambiguous");
  });

  // REACT-LIVE-SKELETON — multi-step shapes (trigger + 2+ actions) must also be returned as a plan,
  // not described in prose, so the canvas skeleton updates as the conversation progresses.
  it("instructs the model to return MULTI-STEP shapes as a plan (not prose)", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "tag the subscriber then notify a channel" });
    expect(prompt).toContain("MULTI-STEP shapes too");
    expect(prompt).toContain("do NOT just describe the sequence in prose");
  });
});

describe("buildGatewayGuidancePrompt — recent conversation (HERMES-AGENT-BUILDER-RAIL-CHAT-MODE)", () => {
  it("renders the recent conversation turns as labeled lines (most recent last)", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "Add a delay before Slack.",
      recentTurns: [
        { role: "user", text: "Add a Slack message after manual run." },
        { role: "assistant", text: "Add Slack after the trigger." },
      ],
    });
    expect(prompt).toContain("Recent conversation");
    expect(prompt).toContain("User: Add a Slack message after manual run.");
    expect(prompt).toContain("Assistant: Add Slack after the trigger.");
    // The latest goal is still the request to answer now.
    expect(prompt).toContain("User goal (their words): Add a delay before Slack.");
  });

  it("omits the conversation section entirely when no turns are passed", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).not.toContain("Recent conversation");
  });

  it("defensively redacts obvious secret shapes inside a turn (a pasted token never reaches the gateway)", () => {
    const prompt = buildGatewayGuidancePrompt({
      request: EMPTY_REQUEST,
      goalText: "use my token",
      recentTurns: [{ role: "user", text: `here is my key sk-ABCDEF0123456789ABCDEF and a token ${["xoxb", "1111111111", "2222"].join("-")}` }],
    });
    expect(prompt).not.toContain("sk-ABCDEF0123456789ABCDEF");
    expect(prompt).not.toContain(["xoxb", "1111111111", "2222"].join("-"));
    expect(prompt).toContain("[redacted]");
  });
});
