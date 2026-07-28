/**
 * @jest-environment node
 *
 * REACT-PROVIDER-AMBIGUITY-1 — provider-selection guard at the workflow-guidance route.
 *
 * Gmail and Microsoft Outlook are SIMULTANEOUS registered email candidates (real registry — the
 * guard suite pins that precondition). Mocks only the capability runner (the Hermes boundary) and
 * the options tool; tokenizer, guard, sanitizer, patch pipeline run for real. Asserts FINAL
 * behavior (which provider/plan the route commits), not that a helper was called.
 */

const mockRequireUserWithAccount = jest.fn();
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
  loadWorkflowForMember: (...a: unknown[]) => mockLoadWorkflowForMember(...a),
  workflowNotFoundResponse: () =>
    new Response(JSON.stringify({ error: "Workflow not found." }), { status: 404, headers: { "content-type": "application/json" } }),
  parseJsonBody: async (
    request: Request,
    schema: { safeParse: (v: unknown) => { success: true; data: unknown } | { success: false; error: { issues: { message: string }[] } } },
  ) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return { ok: false, response: new Response("bad json", { status: 400 }) };
    }
    const p = schema.safeParse(raw);
    return p.success
      ? { ok: true, data: p.data }
      : { ok: false, response: new Response(JSON.stringify({ error: p.error.issues[0]?.message ?? "Invalid." }), { status: 400 }) };
  },
}));

const mockGate = jest.fn();
// REACT-AGENT-FIRST-TURN-1 — the route prechecks before the model call and charges on success.
jest.mock("@/services/billing/aiCreditGate", () => ({
  aiCreditPrecheck: (...a: unknown[]) => mockGate(...a),
  chargeAiCreditsForSuccess: async () => ({ charged: 0, outcome: "not_owed" }),
}));

const mockEnabled = jest.fn();
const mockConfig = jest.fn();
jest.mock("@/services/ai-guidance/gateway/gatewayConfig", () => ({
  isHermesAgentEnabled: () => mockEnabled(),
  getHermesAgentGatewayConfig: () => mockConfig(),
}));

jest.mock("@/services/ai/reactAgent/audit", () => ({ reactAgentAuditRecorder: { record: jest.fn() } }));

const mockRunner = jest.fn();
jest.mock("@/services/ai/reactAgent/capabilities/workflowGuidanceIntake", () => ({
  runWorkflowGuidanceIntakeCapability: (...a: unknown[]) => mockRunner(...a),
}));

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({ getById: (...a: unknown[]) => mockGetAccount(...a) }));

const mockCredentials = jest.fn();
jest.mock("@/services/integrations/guidanceCredentialAvailability", () => ({
  getGuidanceCredentialAvailability: (...a: unknown[]) => mockCredentials(...a),
}));

const mockDecision = jest.fn();
jest.mock("@/services/workflows/officialTemplateMatching", () => ({
  ...jest.requireActual("@/services/workflows/officialTemplateMatching"),
  selectOfficialTemplateRecommendationForRequest: (...a: unknown[]) => mockDecision(...a),
}));

const mockResolveOptions = jest.fn();
jest.mock("@/services/ai/tools/options", () => ({
  resolveOptionsSourceForAI: (...a: unknown[]) => mockResolveOptions(...a),
}));

import { POST } from "@/app/api/accounts/[id]/ai/workflow-guidance/route";

const ACCOUNT = "acct-1";
const EMAIL = "vendor@example.com";
const GENERIC_GOAL = `When I receive an email from ${EMAIL}, post it to Slack`;

function call(body: unknown) {
  return POST(
    new Request(`http://x/api/accounts/${ACCOUNT}/ai/workflow-guidance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ACCOUNT }) },
  );
}

function emailToSlackPlan(provider: string, config: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    title: "Email to Slack",
    summary: "Post matching emails to Slack",
    steps: [
      { ref: "s0", role: "trigger", provider, type: "new_email", purpose: "watch", config },
      { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "post", requiredInputs: ["channel", "text"] },
    ],
    notApplied: true,
  };
}

function connected(providers: string[]) {
  mockCredentials.mockResolvedValue({
    accountSharedProviders: [],
    currentUserPrivateProviders: providers.map((providerKey) => ({ providerKey })),
  });
}

beforeEach(() => {
  mockRequireUserWithAccount.mockReset().mockResolvedValue({ ok: true, userId: "user-1", accountId: ACCOUNT });
  mockLoadWorkflowForMember.mockReset();
  mockGate.mockReset().mockResolvedValue({ ok: true, skipped: true, reason: "enforcement_disabled" });
  mockEnabled.mockReset().mockReturnValue(true);
  mockConfig.mockReset().mockReturnValue({ gatewayUrl: "https://gw.example.com", gatewayToken: "tok", timeoutMs: 30000 });
  mockRunner.mockReset();
  mockGetAccount.mockReset().mockResolvedValue({ id: ACCOUNT, type: "personal" });
  connected(["slack"]); // slack connected; NO email provider unless a test says so
  mockDecision.mockReset().mockResolvedValue({ outcome: "no_match", recommendation: null });
  mockResolveOptions.mockReset();
});

describe("1 — generic email with multiple valid candidates → targeted clarification, no silent provider", () => {
  it.each([["gmail"], ["microsoft-outlook"]])(
    "even when the model already committed to %s, the route asks instead",
    async (modelPick) => {
      connected(["slack", "gmail", "microsoft-outlook"]); // both eligible AND connected
      mockRunner.mockResolvedValue({
        ok: true,
        guidanceText: "Watching your inbox.",
        source: "hermes-agent",
        workflowPlan: emailToSlackPlan(modelPick, { from: ["[[EMAIL_1]]"] }),
      });
      const res = await call({ goalText: GENERIC_GOAL });
      const body = await res.json();
      expect(body.workflowPlan).toBeNull();
      expect(body.previewDraft).toBeNull();
      expect(body.proposedDefinition).toBeUndefined();
      expect(body.providerClarification.options.map((o: { providerId: string }) => o.providerId)).toEqual(
        expect.arrayContaining(["gmail", "microsoft-outlook"]),
      );
      expect(body.guidanceText).toContain("Which email service should this use");
      expect(body.guidanceText).toContain("Gmail");
      expect(body.guidanceText).toContain("Microsoft Outlook");
    },
  );
});

describe("2/3 — explicit provider language selects that provider and fills the sender filter", () => {
  it("explicit Gmail → gmail:new_email with the sender filter populated", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching Gmail.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("gmail", { from: ["[[EMAIL_1]]"] }),
    });
    const res = await call({ goalText: `When I receive a Gmail email from ${EMAIL}, post it to Slack` });
    const body = await res.json();
    expect(body.providerClarification).toBeUndefined();
    expect(body.workflowPlan.steps[0].provider).toBe("gmail");
    expect(body.workflowPlan.steps[0].config).toEqual({ from: [EMAIL] });
  });

  it("explicit Outlook → microsoft-outlook:new_email with the sender filter populated", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching Outlook.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("microsoft-outlook", { from: "[[EMAIL_1]]" }),
    });
    const res = await call({ goalText: `When an email arrives in Outlook from ${EMAIL}, post it to Slack` });
    const body = await res.json();
    expect(body.providerClarification).toBeUndefined();
    expect(body.workflowPlan.steps[0].provider).toBe("microsoft-outlook");
    // Outlook's `from` is a text field — the exact address, not an array.
    expect(body.workflowPlan.steps[0].config).toEqual({ from: EMAIL });
  });
});

describe("4 — editing an existing Outlook trigger preserves Outlook", () => {
  const OUTLOOK_DRAFT = {
    nodes: [
      { id: "t1", kind: "trigger", provider: "microsoft-outlook", type: "new_email", config: { folder: "Inbox" }, position: { x: 0, y: 0 } },
      { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 200, y: 0 } },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  };

  it("a sender-only constraint updates the Outlook trigger's field — provider unchanged", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Added the sender filter.",
      source: "hermes-agent",
      workflowPlan: null,
      mutationOperations: [{ op: "updateNodeConfig", nodeId: "node_1", config: { from: "[[EMAIL_1]]" } }],
    });
    const res = await call({ goalText: `Only trigger when it comes from ${EMAIL}`, currentDraft: OUTLOOK_DRAFT });
    const body = await res.json();
    expect(body.providerClarification).toBeUndefined();
    const trigger = body.proposedDefinition.nodes.find((n: { id: string }) => n.id === "t1");
    expect(trigger.provider).toBe("microsoft-outlook");
    expect(trigger.config).toEqual({ folder: "Inbox", from: EMAIL });
  });

  it("the SAME edit on an existing GMAIL trigger preserves Gmail (symmetric; no clarification)", async () => {
    // Only Outlook connected — the existing NODE decides, not connection state.
    connected(["slack", "microsoft-outlook"]);
    const GMAIL_DRAFT = {
      nodes: [
        { id: "t1", kind: "trigger", provider: "gmail", type: "new_email", config: { labelIds: ["INBOX"] }, position: { x: 0, y: 0 } },
        { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 200, y: 0 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    };
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Added the sender filter.",
      source: "hermes-agent",
      workflowPlan: null,
      mutationOperations: [{ op: "updateNodeConfig", nodeId: "node_1", config: { from: ["[[EMAIL_1]]"] } }],
    });
    const res = await call({ goalText: `Only trigger when it comes from ${EMAIL}`, currentDraft: GMAIL_DRAFT });
    const body = await res.json();
    expect(body.providerClarification).toBeUndefined();
    const trigger = body.proposedDefinition.nodes.find((n: { id: string }) => n.id === "t1");
    expect(trigger.provider).toBe("gmail");
    expect(trigger.config).toEqual({ labelIds: ["INBOX"], from: [EMAIL] });
  });

  it("a model attempt to REPLACE the trigger with unnamed Gmail is refused → clarification, draft untouched", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Switched you to Gmail.",
      source: "hermes-agent",
      workflowPlan: null,
      mutationOperations: [
        {
          op: "replaceTrigger",
          node: { id: "new_t", kind: "trigger", provider: "gmail", type: "new_email", config: { from: ["[[EMAIL_1]]"] }, position: { x: 0, y: 0 } },
        },
      ],
    });
    const res = await call({ goalText: `Only trigger when it comes from ${EMAIL}`, currentDraft: OUTLOOK_DRAFT });
    const body = await res.json();
    expect(body.proposedDefinition).toBeUndefined();
    expect(body.providerClarification).toBeDefined();
    expect(body.guidanceText).toContain("Which email service should this use");
  });
});

describe("5/10/11 — clarification continuation preserves constraints and protected literals", () => {
  it("turn 1 clarifies; turn 2 ('Outlook') completes with the original sender + subject — nothing re-typed, no raw literal ever outbound", async () => {
    connected(["slack", "gmail", "microsoft-outlook"]);
    const goal1 = `When I receive an email from ${EMAIL} with subject Invoice, post it to Slack`;

    // Turn 1 — model commits gmail; route refuses and asks.
    mockRunner.mockResolvedValueOnce({
      ok: true,
      guidanceText: "Here's the plan.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("gmail", { from: ["[[EMAIL_1]]"], subject: "Invoice" }),
    });
    const res1 = await call({ goalText: goal1 });
    const body1 = await res1.json();
    expect(body1.workflowPlan).toBeNull();
    expect(body1.providerClarification).toBeDefined();

    // Turn 2 — the user answers "Outlook"; the conversation carries the original constraint text.
    mockRunner.mockResolvedValueOnce({
      ok: true,
      guidanceText: "Using Outlook.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("microsoft-outlook", { from: "[[EMAIL_1]]", subject: "Invoice" }),
    });
    const res2 = await call({
      goalText: "Outlook",
      recentTurns: [
        { role: "user", text: goal1 },
        { role: "assistant", text: body1.guidanceText },
      ],
    });
    const body2 = await res2.json();
    expect(body2.providerClarification).toBeUndefined();
    expect(body2.workflowPlan.steps[0].provider).toBe("microsoft-outlook");
    // The sender AND the optional subject survived the clarification round trip (11).
    expect(body2.workflowPlan.steps[0].config).toEqual({ from: EMAIL, subject: "Invoice" });
    // Slack intent retained.
    expect(body2.workflowPlan.steps[1].provider).toBe("slack");
    // (10) The raw address never crossed the AI boundary on EITHER turn.
    expect(JSON.stringify(mockRunner.mock.calls)).not.toContain(EMAIL);
    expect(JSON.stringify(mockRunner.mock.calls)).toContain("[[EMAIL_1]]");
  });
});

describe("6 — no connected email provider", () => {
  it("does not default to Gmail; asks which supported service to use", async () => {
    connected([]); // nothing connected at all
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching Gmail.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("gmail", { from: ["[[EMAIL_1]]"] }),
    });
    const res = await call({ goalText: GENERIC_GOAL });
    const body = await res.json();
    expect(body.workflowPlan).toBeNull();
    expect(body.providerClarification.options.map((o: { label: string }) => o.label)).toEqual(
      expect.arrayContaining(["Gmail", "Microsoft Outlook"]),
    );
  });
});

describe("7 — exactly one connected email provider still clarifies (REACT-PROVIDER-AMBIGUITY-2)", () => {
  // Scenarios 1/2/3/12 of the -2 batch: every connection permutation, and the model having already
  // committed to the connected provider, must still produce the question.
  it.each([
    ["Gmail connected, Outlook registered but not connected", ["slack", "gmail"], "gmail", "Gmail"],
    ["Outlook connected, Gmail registered but not connected", ["slack", "microsoft-outlook"], "microsoft-outlook", "Microsoft Outlook"],
  ])("%s → clarification naming the connected provider, nothing committed", async (_label, conn, modelPick, connectedLabel) => {
    connected(conn);
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching your inbox.",
      source: "hermes-agent",
      // The model already committed to the SOLE CONNECTED provider — the guard must still refuse.
      workflowPlan: emailToSlackPlan(modelPick, { from: modelPick === "gmail" ? ["[[EMAIL_1]]"] : "[[EMAIL_1]]" }),
    });
    const res = await call({ goalText: GENERIC_GOAL });
    const body = await res.json();
    expect(body.workflowPlan).toBeNull();
    expect(body.previewDraft).toBeNull();
    expect(body.proposedDefinition).toBeUndefined();
    // Both providers offered; the connected one is flagged + mentioned as a convenience only.
    const byId = new Map(
      (body.providerClarification.options as { providerId: string; label: string; isConnected: boolean }[]).map((o) => [o.providerId, o]),
    );
    expect([...byId.keys()]).toEqual(expect.arrayContaining(["gmail", "microsoft-outlook"]));
    expect(byId.get(modelPick)!.isConnected).toBe(true);
    expect(body.guidanceText).toContain(`${connectedLabel} is already connected`);
    expect(body.guidanceText).toContain("Which email service should this use");
    // The user's other details are explicitly preserved by the copy.
    expect(body.guidanceText).toContain("I'll keep everything else you've told me");
  });

  it("both connected → still clarification (no most-recent / alphabetical / model preference)", async () => {
    connected(["slack", "gmail", "microsoft-outlook"]);
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching Gmail.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("gmail", { from: ["[[EMAIL_1]]"] }),
    });
    const res = await call({ goalText: GENERIC_GOAL });
    const body = await res.json();
    expect(body.workflowPlan).toBeNull();
    expect(body.providerClarification).toBeDefined();
    expect(body.guidanceText).toContain("are already connected");
  });

  it("no narrowing NOTICE is ever emitted in warnings (the notice channel is gone)", async () => {
    connected(["slack", "gmail"]);
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching your inbox.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("gmail", { from: ["[[EMAIL_1]]"] }),
    });
    const res = await call({ goalText: GENERIC_GOAL });
    const body = await res.json();
    expect(JSON.stringify(body.warnings ?? [])).not.toContain("Using your connected");
  });
});

describe("6b — explicit provider that is NOT connected is still honored (never substituted)", () => {
  it("explicit Outlook with only Gmail connected → Outlook selected, sender filled, Gmail not substituted", async () => {
    connected(["slack", "gmail"]);
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching Outlook.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("microsoft-outlook", { from: "[[EMAIL_1]]" }),
    });
    const res = await call({ goalText: `When an email arrives in Outlook from ${EMAIL}, post it to Slack` });
    const body = await res.json();
    expect(body.providerClarification).toBeUndefined();
    expect(body.workflowPlan.steps[0].provider).toBe("microsoft-outlook");
    expect(body.workflowPlan.steps[0].config).toEqual({ from: EMAIL });
  });
});

describe("15 — category-general: the rule is metadata-driven, not an email special case", () => {
  it("a generic 'spreadsheet' request with exactly one spreadsheet provider connected still clarifies", async () => {
    // google-sheets + microsoft-excel are both registered data providers; only Sheets is connected.
    connected(["slack", "google-sheets"]);
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "I'll log it to a spreadsheet.",
      source: "hermes-agent",
      workflowPlan: {
        schemaVersion: 1,
        title: "Log to a spreadsheet",
        summary: "Append each response to a spreadsheet",
        steps: [
          { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "start" },
          { ref: "s1", role: "action", provider: "google-sheets", type: "append_row", purpose: "log" },
        ],
        notApplied: true,
      },
    });
    const res = await call({ goalText: "When I run this manually, add each response to a spreadsheet" });
    const body = await res.json();
    expect(body.workflowPlan).toBeNull();
    expect(body.providerClarification).toBeDefined();
    const ids = (body.providerClarification.options as { providerId: string }[]).map((o) => o.providerId);
    expect(ids).toEqual(expect.arrayContaining(["google-sheets", "microsoft-excel"]));
    expect(body.guidanceText).toContain("Google Sheets is already connected");
  });
});

describe("12 — unsupported provider request", () => {
  it("a Yahoo request is not silently substituted with Gmail; supported alternatives are presented", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "I'll use Gmail for that.",
      source: "hermes-agent",
      workflowPlan: emailToSlackPlan("gmail", { from: ["[[EMAIL_1]]"] }),
    });
    const res = await call({ goalText: `When an email from ${EMAIL} lands in my Yahoo inbox, post it to Slack` });
    const body = await res.json();
    expect(body.workflowPlan).toBeNull();
    expect(body.providerClarification).toBeDefined();
    const labels = body.providerClarification.options.map((o: { label: string }) => o.label);
    expect(labels).toEqual(expect.arrayContaining(["Gmail", "Microsoft Outlook"]));
    expect(labels.join(" ")).not.toContain("Yahoo");
    expect(body.guidanceText).toContain("Which email service should this use");
  });
});
