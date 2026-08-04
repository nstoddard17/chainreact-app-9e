/**
 * @jest-environment node
 *
 * REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — the exact owner-reported sequence, reproduced
 * through the real route pipeline (classification, preview-first enforcement, provider guard,
 * registry validation, preview building all run REAL). Only the model boundary (the capability
 * runner that fronts the Hermes gateway) is mocked — pinned per turn to the owner-observed model
 * behavior.
 *
 * The owner sequence (2026-08, production):
 *   1. blank canvas → "when I get an email I want to be notified in slack"
 *   2. React asks: Gmail or Microsoft Outlook?
 *   3. user answers: "gmail"
 *   4. React FALSELY claims ChainReact has no Gmail trigger (gmail:new_email is registered);
 *      canvas stays blank; no proposal.
 *   5. later, unrelated prompt "what is a workflow that you can build me that is helpful"
 *      → only THEN the Gmail → Slack two-node proposal appears.
 *
 * These tests pin the CORRECTED contract:
 *   - the clarification-ANSWER turn is plan-expected (conversation-aware classification), so a
 *     plan-less model reply triggers the structured repair and the proposal appears IN THAT TURN;
 *   - a model claim that a registered capability does not exist is never surfaced to the user
 *     (repair, honest deterministic copy, or the typed PREVIEW_PLAN_MISSING failure — never the
 *     false prose);
 *   - the server holds no cross-turn proposal state: a plan surfaced on a later turn is that
 *     turn's own model output (documented by the turn-4 test).
 */

const mockRequireUserWithAccount = jest.fn();
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
  loadWorkflowForMember: (...a: unknown[]) => mockLoadWorkflowForMember(...a),
  workflowNotFoundResponse: () =>
    new Response(JSON.stringify({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  parseJsonBody: async (
    request: Request,
    schema: {
      safeParse: (v: unknown) =>
        | { success: true; data: unknown }
        | { success: false; error: { issues: { message: string }[] } };
    },
  ) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Request body must be valid JSON." }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      };
    }
    const p = schema.safeParse(raw);
    return p.success
      ? { ok: true, data: p.data }
      : {
          ok: false,
          response: new Response(JSON.stringify({ error: p.error.issues[0]?.message ?? "Invalid." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        };
  },
}));

const mockGate = jest.fn();
const mockCharge = jest.fn();
jest.mock("@/services/billing/aiCreditGate", () => ({
  aiCreditPrecheck: (...a: unknown[]) => mockGate(...a),
  chargeAiCreditsForSuccess: (...a: unknown[]) => mockCharge(...a),
}));

const mockEnabled = jest.fn();
const mockConfig = jest.fn();
jest.mock("@/services/ai-guidance/gateway/gatewayConfig", () => ({
  ...jest.requireActual("@/services/ai-guidance/gateway/gatewayConfig"),
  isHermesAgentEnabled: () => mockEnabled(),
  getHermesAgentGatewayConfig: () => mockConfig(),
}));

const mockAuditRecord = jest.fn();
jest.mock("@/services/ai/reactAgent/audit", () => ({
  reactAgentAuditRecorder: { record: (...a: unknown[]) => mockAuditRecord(...a) },
}));

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

import { POST } from "@/app/api/accounts/[id]/ai/workflow-guidance/route";

const ACCOUNT = "acct-owner-seq";

/** Turn 1, the user's words — verbatim from the owner report. */
const TURN_1_GOAL = "when I get an email I want to be notified in slack";
/** The provider clarification (assistant turn 1) — the guard's own question shape. */
const CLARIFY_QUESTION =
  "Which email service should this use: Gmail or Microsoft Outlook? I'll keep everything else you've told me.";
/** Turn 2 (the clarification answer) — verbatim. */
const TURN_2_GOAL = "gmail";
/** The FALSE model claim observed in production (gmail:new_email is registered). */
const FALSE_CLAIM =
  "I can't watch Gmail automatically because ChainReact doesn't have a trigger for that source. " +
  "You could run the workflow manually instead.";
/** Turn 4 — the unrelated later prompt, verbatim. */
const TURN_4_GOAL = "what is a workflow that you can build me that is helpful";

/** The two-node plan the model produces when it answers truthfully (real registered capabilities). */
const GMAIL_SLACK_PLAN = {
  schemaVersion: 1,
  title: "Gmail → Slack",
  summary: "When a new email arrives in Gmail, send yourself a Slack direct message.",
  notApplied: true,
  steps: [
    {
      ref: "s0",
      role: "trigger",
      provider: "gmail",
      type: "new_email",
      purpose: "Fires when a new email arrives in the connected Gmail inbox.",
    },
    {
      ref: "s1",
      role: "action",
      provider: "slack",
      type: "send_direct_message",
      purpose: "Send a Slack direct message about the email.",
      requiredInputs: ["userId", "text"],
    },
  ],
};

const PLAN_REPLY = {
  ok: true,
  guidanceText: "Here's the workflow — Gmail New Email into a Slack direct message.",
  source: "hermes-agent",
  workflowPlan: GMAIL_SLACK_PLAN,
};

const FALSE_CLAIM_REPLY = {
  ok: true,
  guidanceText: FALSE_CLAIM,
  source: "hermes-agent",
  workflowPlan: null,
};

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

/** recentTurns as the client sends them on the clarification-answer turn. */
const TURN_2_RECENT = [
  { role: "user", text: TURN_1_GOAL },
  { role: "assistant", text: CLARIFY_QUESTION },
];

/** Full history as the client sends it on the later unrelated turn. */
const TURN_4_RECENT = [
  { role: "user", text: TURN_1_GOAL },
  { role: "assistant", text: CLARIFY_QUESTION },
  { role: "user", text: TURN_2_GOAL },
  { role: "assistant", text: FALSE_CLAIM },
];

beforeEach(() => {
  mockRequireUserWithAccount.mockReset().mockResolvedValue({ ok: true, userId: "user-1", accountId: ACCOUNT });
  mockLoadWorkflowForMember.mockReset();
  mockGate.mockReset().mockResolvedValue({ ok: true, skipped: true, reason: "enforcement_disabled" });
  mockCharge.mockReset().mockResolvedValue({ charged: 0, outcome: "not_owed" });
  mockEnabled.mockReset().mockReturnValue(true);
  mockConfig.mockReset().mockReturnValue({ gatewayUrl: "https://gw.example.com", gatewayToken: "tok", timeoutMs: 30000 });
  mockAuditRecord.mockReset().mockResolvedValue(undefined);
  mockRunner.mockReset();
  mockGetAccount.mockReset().mockResolvedValue({ id: ACCOUNT, type: "personal" });
  mockCredentials.mockReset().mockResolvedValue({ accountSharedProviders: [], currentUserPrivateProviders: [] });
  mockDecision.mockReset().mockResolvedValue({ outcome: "no_match", recommendation: null });
});

describe("owner sequence — turn 1 (email → Slack, no provider named)", () => {
  it("a model plan that picks Gmail unjustified is dropped for the deterministic Gmail/Outlook clarification (no preview)", async () => {
    mockRunner.mockResolvedValueOnce(PLAN_REPLY);
    const res = await call({ goalText: TURN_1_GOAL });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The guard owns the turn: targeted question, no plan, no preview — the canvas stays blank.
    expect(body.workflowPlan).toBeNull();
    expect(body.previewDraft).toBeNull();
    expect(body.providerClarification).toBeDefined();
    expect(body.providerClarification.kind).toBe("trigger");
    expect(body.providerClarification.options.map((o: { providerId: string }) => o.providerId)).toEqual(
      expect.arrayContaining(["gmail", "microsoft-outlook"]),
    );
    expect(body.guidanceText).toBe(body.providerClarification.question);
  });
});

describe("owner sequence — turn 2 (the clarification answer 'gmail')", () => {
  it("REGRESSION: a plan-less reply on the clarification-answer turn triggers the structured repair — the proposal appears in THIS turn", async () => {
    // Initial model call: the production false claim, no plan. Repair call: the truthful plan.
    mockRunner.mockResolvedValueOnce(FALSE_CLAIM_REPLY).mockResolvedValueOnce(PLAN_REPLY);
    const res = await call({ goalText: TURN_2_GOAL, recentTurns: TURN_2_RECENT });
    expect(res.status).toBe(200);
    const body = await res.json();

    // The conversation names gmail (this turn) + slack (turn 1) → the turn is plan-expected and
    // the repair MUST have been attempted (2 model calls, one submission, one credit path).
    expect(mockRunner).toHaveBeenCalledTimes(2);
    const repairInput = mockRunner.mock.calls[1]![0] as { goalText: string };
    expect(repairInput.goalText).toContain("gmail");

    // The proposal appears as part of THIS turn — same-turn delivery, no later prompt needed.
    expect(body.workflowPlan).not.toBeNull();
    expect(
      body.workflowPlan.steps.map((s: { provider: string; type: string }) => `${s.provider}:${s.type}`),
    ).toEqual(["gmail:new_email", "slack:send_direct_message"]);
    expect(body.previewDraft).not.toBeNull();
    expect(body.previewDraft.notApplied).toBe(true);

    // The false capability claim is never surfaced.
    expect(body.guidanceText).not.toContain("can't watch Gmail");
    expect(body.guidanceText).not.toContain("doesn't have a trigger");
  });

  it("REGRESSION: a model that REPEATS the false claim on repair still never reaches the user with it", async () => {
    mockRunner.mockResolvedValue(FALSE_CLAIM_REPLY); // initial AND repair both double down
    const res = await call({ goalText: TURN_2_GOAL, recentTurns: TURN_2_RECENT });
    const body = await res.json();

    // Whatever the terminal shape (typed failure or honest deterministic copy), the false
    // "no Gmail trigger" claim must not be user-visible.
    const text: string = body.guidanceText ?? body.message ?? "";
    expect(text).not.toContain("can't watch Gmail");
    expect(text).not.toContain("doesn't have a trigger");
    // And the turn is not silently accepted as a bare clarification: it either produced a plan
    // (deterministic fallback) or the typed plan-missing failure.
    if (res.status === 200) {
      expect(body.workflowPlan).not.toBeNull();
    } else {
      expect(res.status).toBe(503);
      expect(body.code).toBe("PREVIEW_PLAN_MISSING");
    }
  });
});

describe("capability contradiction outside the plan-expected path", () => {
  it("REGRESSION: a false 'Gmail has no trigger' claim on a single-provider turn is replaced with honest registry-derived copy", async () => {
    // Only ONE provider in the conversation → classification stays clarification-allowed, so the
    // repair path alone cannot protect this turn; the contradiction guard must.
    mockRunner.mockResolvedValue(FALSE_CLAIM_REPLY);
    const res = await call({ goalText: "can you watch my gmail inbox for new emails?" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guidanceText).not.toContain("can't watch Gmail");
    expect(body.guidanceText).not.toContain("doesn't have a trigger");
    // The honest copy names the real registered capability.
    expect(body.guidanceText.toLowerCase()).toContain("gmail");
  });
});

describe("owner sequence — turn 4 (the later unrelated prompt)", () => {
  it("documents the mechanism: the Gmail → Slack plan surfaced on turn 4 is THIS turn's own model output (no server-side buffered proposal)", async () => {
    mockRunner.mockResolvedValueOnce(PLAN_REPLY);
    const res = await call({ goalText: TURN_4_GOAL, recentTurns: TURN_4_RECENT });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Exactly one model call THIS turn produced the plan — nothing was stored across turns.
    expect(mockRunner).toHaveBeenCalledTimes(1);
    expect(body.workflowPlan).not.toBeNull();
    expect(
      body.workflowPlan.steps.map((s: { provider: string; type: string }) => `${s.provider}:${s.type}`),
    ).toEqual(["gmail:new_email", "slack:send_direct_message"]);
    // gmail is justified by the USER's own turn-2 answer in the conversation (decision-table rule
    // "explicit"), slack by turn 1 — the guard passes the plan, so the preview renders this turn.
    expect(body.previewDraft).not.toBeNull();
    expect(body.providerClarification).toBeUndefined();
  });
});
