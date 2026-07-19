/**
 * @jest-environment node
 *
 * REACT-CONFIG-COVERAGE-1 — route-level regression for optional-field intent + sensitive literals
 * on POST /api/accounts/[id]/ai/workflow-guidance.
 *
 * Mocks ONLY the external boundaries (the capability runner standing in for the Hermes gateway, and
 * the provider-backed options tool); the tokenizer, sanitizer, resolver pass, editable graph, patch
 * pipeline, and discovery registry run for REAL. Covers:
 *   1. the exact reported case — sender email tokenized outbound, canonical optional `from` filter
 *      populated with the exact address in the returned plan (raw literal absent from what crosses
 *      the AI boundary);
 *   2. unsupplied optional fields stay absent (no guessing);
 *   3. a user-named dynamic label resolves through the canonical options resolver — and an
 *      unresolvable label becomes a targeted input, never a silent drop;
 *   4. the EDIT path applies user-supplied optional values (incl. explicit false) while preserving
 *      unrelated existing config (merge, not erase).
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
      safeParse: (v: unknown) => { success: true; data: unknown } | { success: false; error: { issues: { message: string }[] } };
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
jest.mock("@/services/billing/aiCreditGate", () => ({ aiCreditGate: (...a: unknown[]) => mockGate(...a) }));

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

// The provider boundary behind the canonical options resolver (scenario 6). Everything above it
// (label matching, deferral, requiredInputs) runs for real.
const mockResolveOptions = jest.fn();
jest.mock("@/services/ai/tools/options", () => ({
  resolveOptionsSourceForAI: (...a: unknown[]) => mockResolveOptions(...a),
}));

import { POST } from "@/app/api/accounts/[id]/ai/workflow-guidance/route";

const ACCOUNT = "acct-1";
const EMAIL = "vendor@example.com";
const GOAL = `When I receive an email from ${EMAIL}, post it to Slack`;

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

/** A capability-valid plan the mocked runner returns, with the model echoing the placeholder. */
function planWithSenderFilter(config: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    title: "Email to Slack",
    summary: "Post matching emails to Slack",
    steps: [
      { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch", config },
      {
        ref: "s1",
        role: "action",
        provider: "slack",
        type: "send_channel_message",
        purpose: "post",
        requiredInputs: ["channel", "text"],
      },
    ],
    notApplied: true,
  };
}

beforeEach(() => {
  mockRequireUserWithAccount.mockReset().mockResolvedValue({ ok: true, userId: "user-1", accountId: ACCOUNT });
  mockLoadWorkflowForMember.mockReset();
  mockGate.mockReset().mockResolvedValue({ ok: true, skipped: true, reason: "enforcement_disabled" });
  mockEnabled.mockReset().mockReturnValue(true);
  mockConfig.mockReset().mockReturnValue({ gatewayUrl: "https://gw.example.com", gatewayToken: "tok", timeoutMs: 30000 });
  mockRunner.mockReset();
  mockGetAccount.mockReset().mockResolvedValue({ id: ACCOUNT, type: "personal" });
  mockCredentials.mockReset().mockResolvedValue({
    accountSharedProviders: [],
    currentUserPrivateProviders: [{ providerKey: "gmail" }, { providerKey: "slack" }],
  });
  mockDecision.mockReset().mockResolvedValue({ outcome: "no_match", recommendation: null });
  mockResolveOptions.mockReset();
});

describe("scenario 1 — the exact reported case", () => {
  it("tokenizes the sender outbound, populates the canonical optional `from` filter with the exact address inbound", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "I'll watch for emails from [[EMAIL_1]] and post them to Slack.",
      source: "hermes-agent",
      workflowPlan: planWithSenderFilter({ from: ["[[EMAIL_1]]"] }),
    });

    const res = await call({ goalText: GOAL });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Outbound: the capability (→ gateway prompt) never sees the raw address — only the token.
    const runnerInput = mockRunner.mock.calls[0]![0] as { goalText: string; fieldSchemaLines?: string[] };
    expect(runnerInput.goalText).toContain("[[EMAIL_1]]");
    expect(runnerInput.goalText).not.toContain(EMAIL);
    expect(JSON.stringify(mockRunner.mock.calls)).not.toContain(EMAIL);
    // The narrowed field schemas make the optional sender filter discoverable.
    expect(runnerInput.fieldSchemaLines!.join("\n")).toContain("gmail:new_email");
    expect(runnerInput.fieldSchemaLines!.join("\n")).toContain("from (string-array, optional");

    // Inbound: the plan carries the user's exact address in the canonical optional field.
    expect(body.workflowPlan.steps[0].config).toEqual({ from: [EMAIL] });
    // Display text is rebound too (the user sees their own address, not a token).
    expect(body.guidanceText).toContain(EMAIL);
    expect(body.guidanceText).not.toContain("[[EMAIL_1]]");
    // The preview still surfaces the slack step's needed inputs.
    expect(body.previewDraft.nodes[1].missingInputs).toEqual(["channel", "text"]);
  });

  it("does not guess unsupplied optional fields (subject/hasAttachment/labelIds stay absent)", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Done.",
      source: "hermes-agent",
      workflowPlan: planWithSenderFilter({ from: ["[[EMAIL_1]]"] }),
    });
    const res = await call({ goalText: GOAL });
    const body = await res.json();
    expect(Object.keys(body.workflowPlan.steps[0].config)).toEqual(["from"]);
  });
});

describe("scenario 6 — dynamic label through the canonical resolver", () => {
  it("maps a user-named label to the stored id via the options resolver", async () => {
    mockResolveOptions.mockResolvedValue({
      ok: true,
      data: {
        source: "gmail:labels",
        items: [
          { value: "INBOX", label: "Inbox" },
          { value: "Label_7", label: "Vendors" },
        ],
        hasMore: false,
        truncated: false,
      },
    });
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching the Vendors label.",
      source: "hermes-agent",
      workflowPlan: planWithSenderFilter({ labelIds: ["Vendors"] }),
    });
    const res = await call({ goalText: "When an email lands in my Vendors label, post it to Slack" });
    const body = await res.json();
    expect(body.workflowPlan.steps[0].config).toEqual({ labelIds: ["Label_7"] });
    expect(mockResolveOptions).toHaveBeenCalledWith(
      expect.objectContaining({ source: "gmail:labels", userId: "user-1" }),
    );
  });

  it("defers an unresolvable label to targeted input + a safe warning (never silently dropped, never guessed)", async () => {
    mockResolveOptions.mockResolvedValue({
      ok: true,
      data: { source: "gmail:labels", items: [{ value: "INBOX", label: "Inbox" }], hasMore: false, truncated: false },
    });
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Watching that label.",
      source: "hermes-agent",
      workflowPlan: planWithSenderFilter({ labelIds: ["No Such Label"] }),
    });
    const res = await call({ goalText: "When an email lands in a label, post it to Slack" });
    const body = await res.json();
    const step = body.workflowPlan.steps[0];
    expect(step.config).toBeUndefined();
    expect(step.requiredInputs).toContain("labelIds");
    expect((body.warnings as string[]).join(" ")).toContain("labelIds");
    // The user's label text never ships as a guessed id anywhere in the plan.
    expect(JSON.stringify(body.workflowPlan)).not.toContain("No Such Label");
  });
});

describe("edit path — user-supplied optional values merge without erasing existing config", () => {
  const DRAFT = {
    nodes: [
      {
        id: "trigger-1",
        kind: "trigger",
        provider: "gmail",
        type: "new_email",
        config: { from: ["vendor@example.com"], labelIds: ["INBOX"] },
        position: { x: 0, y: 0 },
      },
      {
        id: "action-1",
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        config: { channel: "C123", text: "hi" },
        position: { x: 200, y: 0 },
      },
    ],
    edges: [{ id: "e1", from: "trigger-1", to: "action-1" }],
  };

  it("applies subject + explicit false via updateNodeConfig, preserves from/labelIds, drops undeclared keys", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Filtering by subject too.",
      source: "hermes-agent",
      workflowPlan: null,
      mutationOperations: [
        {
          op: "updateNodeConfig",
          nodeId: "node_1",
          config: { subject: "Invoice", subjectExactMatch: false, madeUpKey: "x" },
        },
      ],
    });
    const res = await call({
      goalText: "Only when the subject says Invoice (not exact match)",
      currentDraft: DRAFT,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const trigger = body.proposedDefinition.nodes.find((n: { id: string }) => n.id === "trigger-1");
    expect(trigger.config).toEqual({
      from: ["vendor@example.com"],
      labelIds: ["INBOX"],
      subject: "Invoice",
      subjectExactMatch: false,
    });
    // Untouched node fully preserved.
    const action = body.proposedDefinition.nodes.find((n: { id: string }) => n.id === "action-1");
    expect(action.config).toEqual({ channel: "C123", text: "hi" });
  });

  it("edit path rebinds a tokenized recipient literal into the applied config (create/edit parity)", async () => {
    mockRunner.mockResolvedValue({
      ok: true,
      guidanceText: "Added the sender filter.",
      source: "hermes-agent",
      workflowPlan: null,
      mutationOperations: [
        { op: "updateNodeConfig", nodeId: "node_1", config: { from: ["[[EMAIL_1]]"] } },
      ],
    });
    const res = await call({
      goalText: `Also filter to emails from ${"ceo@corp.com"}`,
      currentDraft: DRAFT,
    });
    const body = await res.json();
    const runnerInput = mockRunner.mock.calls[0]![0] as { goalText: string };
    expect(runnerInput.goalText).not.toContain("ceo@corp.com");
    const trigger = body.proposedDefinition.nodes.find((n: { id: string }) => n.id === "trigger-1");
    expect(trigger.config.from).toEqual(["ceo@corp.com"]);
  });
});
