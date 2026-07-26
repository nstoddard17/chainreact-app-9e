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
    // REACT-PROVIDER-AMBIGUITY-2 — the availability instruction still grounds suggestions in the
    // sanitized connection list, but no longer reads as "prefer whatever is connected".
    expect(prompt).toContain("Do not assume a connection exists that isn't listed as available");
    expect(prompt).toContain("A connected provider is AVAILABLE, not SELECTED");
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
  // ── REACT-AGENT-PREVIEW-FIRST-CLARIFICATION-FIX-1 — preview-first clarification policy ────────
  //
  // Production regression: the prompt
  //   "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot
  //    contact, and send me a Gmail message summarizing their answers..."
  // came back as SIX chat questions and NO plan — which form, Mailchimp add-vs-update, HubSpot
  // duplicate behaviour, Gmail recipient, whether to create a separate HubSpot company record, and
  // whether to shorten the message. Every one of those is either a setup field or an invented
  // decision. The instructions must name those categories explicitly rather than relying on the
  // model's reading of "the SHAPE is ambiguous".

  it("forbids asking for resource / audience / recipient / connection selections before the plan", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toContain("NEVER ask any of these before returning the plan");
    expect(prompt).toMatch(/WHICH record\/resource to use/i);
    expect(prompt).toMatch(/WHICH audience\/list\/segment/i);
    expect(prompt).toMatch(/WHO to send to/i);
    expect(prompt).toMatch(/WHICH connected account/i);
  });

  it("forbids asking for a required enum (consent status, duplicate handling) before the plan", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toMatch(/required ENUM the action declares/i);
    expect(prompt).toMatch(/consent\/subscription status, duplicate handling/i);
    // ...and says where they go instead.
    expect(prompt).toMatch(/List each of these as `requiredInputs`.*RETURN THE PLAN/is);
  });

  it("forbids asking for a mapping that only becomes knowable after a resource is chosen", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toMatch(/only becomes knowable after a resource is chosen/i);
  });

  it("states the preview-first test and the CLOSED list of reasons to withhold a plan", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toContain("PREVIEW-FIRST TEST");
    expect(prompt).toMatch(/the shape IS clear — return the plan/i);
    expect(prompt).toMatch(/It does not matter how many values are still unknown/i);
    // The four legitimate reasons.
    expect(prompt).toMatch(/two materially DIFFERENT topologies are equally plausible/i);
    expect(prompt).toMatch(/unsafe\/irreversible/i);
    expect(prompt).toMatch(/cannot identify the provider or action at all/i);
    expect(prompt).toMatch(/cannot be represented as a setup field/i);
  });

  it("forbids proposing an unrequested extra record-creating step when a field already holds the value", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toMatch(/propose ONLY the steps the user asked for/i);
    expect(prompt).toMatch(/separate company\/organization step/i);
    expect(prompt).toMatch(/map it to that field instead/i);
  });

  it("tells the model to WRITE a summary body itself instead of asking about formatting", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toMatch(/WRITE that body yourself/i);
    expect(prompt).toMatch(/Include the submitted values in full/i);
    expect(prompt).toMatch(/Do not ask whether to shorten or reformat/i);
  });

  it("tells the model not to answer a question it could answer with a default", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toMatch(/otherwise I'll do X.*just do X/is);
  });

  it("grounds capability-gap commentary in the user's actual request", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "help" });
    expect(prompt).toMatch(/Only mention a capability ChainReact LACKS when the user actually asked/i);
    expect(prompt).toMatch(/Never append general limitations of a provider that are unrelated/i);
    expect(prompt).toMatch(/never introduce a use case the user did not raise/i);
  });

  it("instructs the model to return MULTI-STEP shapes as a plan (not prose)", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "tag the subscriber then notify a channel" });
    expect(prompt).toContain("MULTI-STEP shapes too");
    expect(prompt).toContain("do NOT just describe the sequence in prose");
  });

  it("REACT-LIVE-SKELETON — tells the model not to invent a trigger / claim readiness when the source has no catalog trigger; ask or use manual.run", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "alert me on slack when usage drops" });
    expect(prompt).toMatch(/do NOT claim the flow is ready\/straightforward and do NOT invent a trigger/i);
    expect(prompt).toContain("native:manual.run");
    expect(prompt).toMatch(/ASK which source the data should come from/i);
  });
});

// RECONV-1 S3 — the edit-path prompt must teach branch labels + reconvergence (the model was never
// told edges can carry a "label" or that mutually exclusive routes should rejoin on one shared step),
// and the create-path plan format must not encourage a silent linear chain for conditional requests.
describe("buildGatewayGuidancePrompt — branch labels + reconvergence teaching (RECONV-1)", () => {
  const editableGraph = {
    schemaVersion: 1 as const,
    version: "v-test-1",
    nodeCount: 1,
    edgeCount: 0,
    nodes: [
      {
        ref: "node_1",
        role: "trigger" as const,
        kind: "trigger",
        provider: "native",
        type: "manual.run",
        capabilityKey: "native:manual.run",
        config: [],
      },
    ],
    edges: [],
  };

  it("edit instructions document the optional edge label field + the label vocabulary", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "branch it", editableGraph });
    expect(prompt).toContain('may carry an optional "label" field');
    expect(prompt).toContain('"label":"true"');
    expect(prompt).toContain("native:if_then_condition");
    expect(prompt).toMatch(/onFalse is "branch"/);
    expect(prompt).toMatch(/onFalse "skip", wire only "true"/);
    expect(prompt).toContain("config.routes[].label");
    expect(prompt).toContain("defaultRoute");
    expect(prompt).toContain("Edges from any OTHER step are unlabeled");
  });

  it("edit instructions include the worked reconvergence example (routes rejoin ONE shared step)", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "branch it", editableGraph });
    expect(prompt).toContain("RECONVERGENCE");
    expect(prompt).toContain("reconverge on ONE shared downstream step");
    expect(prompt).toContain("the shared step runs once (whichever route ran)");
    // The four worked edges: two labeled route picks + two unlabeled rejoins.
    expect(prompt).toContain('"from":"node_if","to":"new_receipt","label":"true"');
    expect(prompt).toContain('"from":"node_if","to":"new_notify","label":"false"');
    expect(prompt).toContain('"from":"new_receipt","to":"new_log"');
    expect(prompt).toContain('"from":"new_notify","to":"new_log"');
  });

  it("create-path plan instructions warn that conditional requests cannot be a silent linear chain", () => {
    const prompt = buildGatewayGuidancePrompt({ request: EMPTY_REQUEST, goalText: "if paid send receipt otherwise notify, then log" });
    expect(prompt).toContain("CONDITIONAL requests");
    expect(prompt).toContain("branch topology CANNOT be expressed in the ordered plan steps");
    expect(prompt).toContain("Do NOT emit a linear chain that would silently run both actions unconditionally");
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
