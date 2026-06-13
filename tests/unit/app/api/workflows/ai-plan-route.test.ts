/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/plan (Slice 4.AI-9A).
 *
 * Auth runs through the real `requireUser` (createClient mocked); the planner
 * service is mocked so the route's auth / validation / status-mapping / no-leak
 * contract is isolated from model + preview internals. No live model/network
 * calls. The route is preview-only — these assert it never reaches apply/repo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockPlan = jest.fn();
jest.mock("@/services/ai/planner", () => ({
  planWorkflowFromPromptForAI: (...a: unknown[]) => mockPlan(...a),
}));

const mockRecordPlan = jest.fn();
jest.mock("@/services/ai/events", () => ({
  recordAiPlanOutcome: (...a: unknown[]) => mockRecordPlan(...a),
}));

// 4.AI-CREDITS-3b-0: the route resolves the WORKFLOW-OWNING account (+ authorizes
// membership) via `loadWorkflowForMember` before the planner. Partial-mock `_shared`
// so `loadWorkflowForMember` is controllable while `requireUser` / `parseJsonBody`
// stay real (the auth + body-parse contract is still exercised end-to-end).
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => {
  const actual = jest.requireActual("@/app/api/workflows/_shared");
  return {
    ...actual,
    loadWorkflowForMember: (...a: unknown[]) => mockLoadWorkflowForMember(...a),
  };
});

// 4.AI-CREDITS-3b-i: the route gates the paid planner call through `aiCreditGate`
// before invoking it. Mock the gate so the route's gate→deny / gate→proceed wiring is
// tested in isolation; the gate's own deduct/flag/frozen behavior is covered by
// tests/unit/services/billing/aiCreditGate.test.ts.
const mockAiCreditGate = jest.fn();
jest.mock("@/services/billing/aiCreditGate", () => ({
  aiCreditGate: (...a: unknown[]) => mockAiCreditGate(...a),
}));

import { NextResponse } from "next/server";
import { POST } from "@/app/api/workflows/[id]/ai/plan/route";

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/plan`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

const successResult = {
  ok: true,
  intentSummary: "Post to Slack on new email",
  assumptions: [],
  requiredUserInput: [],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p1", workflowId: "wf-1", baseRevision: "rev", operations: [], summary: "s", rationale: "r" },
  preview: { ok: true, workflowId: "wf-1", canApplyLater: true },
  canApplyLater: true,
  model: { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" },
  noMutation: true,
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockPlan.mockReset();
  mockRecordPlan.mockReset();
  mockRecordPlan.mockResolvedValue(undefined);
  mockLoadWorkflowForMember.mockReset();
  // Default: caller is a member of the workflow's account. `record.accountId` is
  // the workflow-owning account (acct-wf-1), distinct from the actor's user id.
  mockLoadWorkflowForMember.mockResolvedValue({
    ok: true,
    record: { id: "wf-1", accountId: "acct-wf-1" },
  });
  mockAiCreditGate.mockReset();
  // Default: enforcement flag OFF → the gate is a no-op and the planner proceeds.
  mockAiCreditGate.mockResolvedValue({
    ok: true,
    skipped: true,
    reason: "enforcement_disabled",
  });
});

describe("auth", () => {
  it("returns 401 for an unauthenticated request and never calls the planner", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    const res = await call("wf-1", { prompt: "do x" });
    expect(res.status).toBe(401);
    expect(mockPlan).not.toHaveBeenCalled();
  });
});

describe("request validation", () => {
  it("returns 400 when prompt is missing", async () => {
    const res = await call("wf-1", {});
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("returns 400 when prompt is empty", async () => {
    const res = await call("wf-1", { prompt: "   " });
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("returns 400 when prompt exceeds the max length", async () => {
    const res = await call("wf-1", { prompt: "a".repeat(8_001) });
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid modelTier", async () => {
    const res = await call("wf-1", { prompt: "x", modelTier: "turbo" });
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await call("wf-1", "not json{");
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("ignores unknown body keys (forward-compatible)", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { prompt: "x", feature: "anything", extra: 1 });
    expect(res.status).toBe(200);
  });
});

describe("planner wiring", () => {
  it("calls the planner with userId, workflowId, and prompt", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "build me a flow" });
    expect(mockPlan).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      prompt: "build me a flow",
    });
  });

  it("forwards an allow-listed modelTier", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "x", modelTier: "fast" });
    expect(mockPlan).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      prompt: "x",
      modelTier: "fast",
    });
  });

  it("trims the prompt before passing it on", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "  spaced  " });
    expect(mockPlan).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "spaced" }),
    );
  });
});

describe("result mapping", () => {
  it("returns 200 with the plan result on success", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, canApplyLater: true, noMutation: true });
  });

  it("returns 200 for a no-patch (needs-input) result", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: true,
      intentSummary: "x",
      assumptions: [],
      requiredUserInput: [{ label: "Pick a channel", kind: "config_value" }],
      unsupportedRequests: [],
      safetyNotes: [],
      canApplyLater: false,
      model: { modelId: "m", tier: "strong", feature: "creation" },
      noMutation: true,
    });
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canApplyLater).toBe(false);
    expect(body.requiredUserInput).toHaveLength(1);
  });

  it("returns 503 (not 500) when the model is not configured", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: false,
      code: "MODEL_FAILED",
      message: "The model did not return a plan (NOT_CONFIGURED).",
      model: { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation" },
      errors: [{ stage: "model", code: "NOT_CONFIGURED", message: "no key" }],
      noMutation: true,
    });
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "MODEL_FAILED" });
  });

  it("returns 502 for a parse failure and surfaces the parse stage/code in the body", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: false,
      code: "PARSE_FAILED",
      message: "unparseable",
      errors: [{ stage: "parse", code: "INVALID_PATCH", message: "bad" }],
      noMutation: true,
    });
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "PARSE_FAILED" });
    expect(body.errors[0].stage).toBe("parse");
    expect(body.errors[0].code).toBe("INVALID_PATCH");
  });

  it("maps a service NOT_FOUND (PREVIEW_UNAVAILABLE) to 404", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: false,
      code: "PREVIEW_UNAVAILABLE",
      message: "could not preview",
      errors: [{ stage: "preview", code: "NOT_FOUND", message: "No workflow." }],
      noMutation: true,
    });
    const res = await call("missing", { prompt: "x" });
    expect(res.status).toBe(404);
  });

  it("returns a sanitized 500 when the planner throws (no internals leaked)", async () => {
    mockPlan.mockRejectedValueOnce(new Error("getById failed: secret-connection-string"));
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret-connection-string");
    expect(body.error).toBe("Failed to generate a workflow plan.");
  });
});

describe("AI-10 observability (fail-open)", () => {
  it("records a plan event with the workflow-owning account/user/workflow + result", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "x" });
    expect(mockRecordPlan).toHaveBeenCalledWith(
      { accountId: "acct-wf-1", userId: "user-1", workflowId: "wf-1" },
      expect.objectContaining({ ok: true }),
    );
  });

  it("still returns 200 when event recording rejects (analytics never breaks the route)", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    mockRecordPlan.mockRejectedValueOnce(new Error("ledger down"));
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(200);
  });
});

// ─── Slice 4.AI-CREDITS-3b-0 — workflow-owning-account attribution + authz ────
describe("AI-CREDITS-3b-0 — workflow-owning account attribution", () => {
  it("personal workflow → recorder gets the workflow's account id (= record.accountId)", async () => {
    // A personal workflow is owned by the user's personal account; record.accountId
    // carries that account id (not the raw user id).
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: true,
      record: { id: "wf-1", accountId: "acct-personal-1" },
    });
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "x" });
    expect(mockRecordPlan).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-personal-1", userId: "user-1" }),
      expect.anything(),
    );
  });

  it("team workflow → recorder gets the team/workflow account id, NOT the actor's personal id", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: true,
      record: { id: "wf-team", accountId: "acct-team-7" },
    });
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-team", { prompt: "x" });
    const [scope] = mockRecordPlan.mock.calls[0]!;
    expect((scope as { accountId: string }).accountId).toBe("acct-team-7");
    // The actor id must never be used as the cost-owner account.
    expect((scope as { accountId: string }).accountId).not.toBe("user-1");
  });

  it("the recorder's accountId equals the resolver's record.accountId", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: true,
      record: { id: "wf-9", accountId: "acct-resolved-9" },
    });
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-9", { prompt: "x" });
    const [scope] = mockRecordPlan.mock.calls[0]!;
    expect((scope as { accountId: string }).accountId).toBe("acct-resolved-9");
  });

  it("ignores a client-supplied accountId — uses the resolved workflow account", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    // Malicious/incorrect client tries to choose the cost owner.
    await call("wf-1", { prompt: "x", accountId: "acct-EVIL" });
    const [scope] = mockRecordPlan.mock.calls[0]!;
    expect((scope as { accountId: string }).accountId).toBe("acct-wf-1");
    expect((scope as { accountId: string }).accountId).not.toBe("acct-EVIL");
    // The planner is never handed a client accountId either.
    const [planArg] = mockPlan.mock.calls[0]!;
    expect(planArg).not.toHaveProperty("accountId");
  });

  it("returns a no-leak 404 BEFORE the planner when the workflow is missing/non-member/deleted", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json(
        { error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" },
        { status: 404 },
      ),
    });
    const res = await call("wf-forbidden", { prompt: "x" });
    expect(res.status).toBe(404);
    // No paid model call for an unauthorized id.
    expect(mockPlan).not.toHaveBeenCalled();
    // No telemetry attributed for a request that never reached the planner.
    expect(mockRecordPlan).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.code).toBe("WORKFLOW_NOT_FOUND");
    // No existence leak / no internals.
    expect(JSON.stringify(body)).not.toContain("acct-");
  });
});

// ─── Slice 4.AI-CREDITS-3b-i — AI-credit gate before the paid planner call ────
describe("AI-CREDITS-3b-i — AI-credit gate", () => {
  it("flag OFF (gate skipped) → planner proceeds with no denial; gate gets the right inputs", async () => {
    // Default beforeEach gate = enforcement_disabled (flag OFF). No deduction RPC is
    // exercised here — that no-op is proven in aiCreditGate.test.ts; the route's job is
    // to call the gate with the workflow-owning account + feature + planned tier.
    mockPlan.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { prompt: "x", modelTier: "strong" });
    expect(res.status).toBe(200);
    expect(mockAiCreditGate).toHaveBeenCalledTimes(1);
    expect(mockAiCreditGate).toHaveBeenCalledWith({
      accountId: "acct-wf-1",
      feature: "workflow_creation",
      plannedTier: "strong",
    });
    expect(mockPlan).toHaveBeenCalledTimes(1);
  });

  it("defaults plannedTier to 'fast' when the request omits modelTier", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "x" });
    expect(mockAiCreditGate).toHaveBeenCalledWith(
      expect.objectContaining({ plannedTier: "fast" }),
    );
  });

  it("flag ON + sufficient credits → exactly one gate call and the planner is called", async () => {
    mockAiCreditGate.mockResolvedValueOnce({ ok: true, charged: 2, used: 2, limit: 500 });
    mockPlan.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(200);
    expect(mockAiCreditGate).toHaveBeenCalledTimes(1); // no double-charge
    expect(mockPlan).toHaveBeenCalledTimes(1);
  });

  it("flag ON + insufficient credits → 402 AI_CREDITS_EXHAUSTED and the planner is NOT called", async () => {
    mockAiCreditGate.mockResolvedValueOnce({
      ok: false,
      reason: "insufficient_ai_credits",
      used: 20,
      limit: 20,
    });
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(402);
    expect(mockPlan).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "AI_CREDITS_EXHAUSTED" });
    // The member-visible quota integers are allowed; nothing else leaks.
    expect(body.used).toBe(20);
    expect(body.limit).toBe(20);
  });

  it("flag ON + gate error → 503 AI_GATE_ERROR (fail-closed) and the planner is NOT called", async () => {
    mockAiCreditGate.mockResolvedValueOnce({
      ok: false,
      reason: "gate_error",
      used: 0,
      limit: 0,
    });
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(503);
    expect(mockPlan).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "AI_GATE_ERROR" });
  });

  it("flag ON + frozen account → 403 ACCOUNT_PENDING_DELETION and the planner is NOT called", async () => {
    mockAiCreditGate.mockResolvedValueOnce({
      ok: false,
      reason: "account_frozen",
      used: 0,
      limit: 0,
    });
    const res = await call("wf-1", { prompt: "x" });
    expect(res.status).toBe(403);
    expect(mockPlan).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "ACCOUNT_PENDING_DELETION" });
  });

  it("gate and recorder receive the SAME workflow-owning account id", async () => {
    mockLoadWorkflowForMember.mockResolvedValueOnce({
      ok: true,
      record: { id: "wf-team", accountId: "acct-team-42" },
    });
    mockAiCreditGate.mockResolvedValueOnce({ ok: true, charged: 2, used: 2, limit: 2000 });
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-team", { prompt: "x" });
    const [gateArg] = mockAiCreditGate.mock.calls[0]!;
    const [recordScope] = mockRecordPlan.mock.calls[0]!;
    expect((gateArg as { accountId: string }).accountId).toBe("acct-team-42");
    expect((recordScope as { accountId: string }).accountId).toBe("acct-team-42");
  });

  it("never trusts a client-supplied accountId for the gate", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "x", accountId: "acct-EVIL" });
    const [gateArg] = mockAiCreditGate.mock.calls[0]!;
    expect((gateArg as { accountId: string }).accountId).toBe("acct-wf-1");
    expect((gateArg as { accountId: string }).accountId).not.toBe("acct-EVIL");
  });

  it("denial response leaks no secrets or account ids", async () => {
    mockAiCreditGate.mockResolvedValueOnce({
      ok: false,
      reason: "insufficient_ai_credits",
      used: 20,
      limit: 20,
    });
    const res = await call("wf-1", { prompt: "x" });
    const serialized = JSON.stringify(await res.json());
    for (const needle of ["acct-", "ANTHROPIC_API_KEY", "accessToken", "Bearer ", "sk-ant-"]) {
      expect(serialized).not.toContain(needle);
    }
  });
});

describe("preview-only / no-apply", () => {
  it("does not import the apply service, a workflow-writing repo, or a model adapter", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/ai/plan/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/applyWorkflowPatch\w*\s*\(/);
    expect(src).not.toMatch(/from\s+["']@\/repositories\//);
    expect(src).not.toMatch(/updateDraftDefinition/);
  });
});

describe("no-leak", () => {
  it("the response exposes no secret-identifier substrings", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { prompt: "x" });
    const body = await res.json();
    const serialized = JSON.stringify(body);
    for (const needle of [
      "ANTHROPIC_API_KEY",
      "accessToken",
      "refreshToken",
      "apiSecret",
      "clientSecret",
      "webhookSecret",
      "botToken",
      "Authorization",
      "Bearer ",
      "sk-ant-",
      "x-api-key",
    ]) {
      expect(serialized).not.toContain(needle);
    }
  });
});

// ─── Slice 4.AI-24 — currentGraph plumbing ───────────────────────────────────

describe("currentGraph (AI-24)", () => {
  it("forwards a client-supplied currentGraph to the planner service", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    const currentGraph = {
      nodes: [
        {
          id: "trig-1",
          kind: "trigger",
          provider: "native",
          type: "manual.run",
        },
        {
          id: "act-1",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
        },
      ],
      edges: [{ id: "e-1", from: "trig-1", to: "act-1" }],
    };
    const res = await call("wf-1", {
      prompt: "Send a Slack message when I get an email",
      currentGraph,
    });
    expect(res.status).toBe(200);
    expect(mockPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workflowId: "wf-1",
        prompt: "Send a Slack message when I get an email",
        currentGraph,
      }),
    );
  });

  it("accepts an empty currentGraph (post-delete-without-save case)", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", {
      prompt: "Send a Slack message when I get an email",
      currentGraph: { nodes: [], edges: [] },
    });
    expect(res.status).toBe(200);
    expect(mockPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        currentGraph: { nodes: [], edges: [] },
      }),
    );
  });

  it("works without currentGraph (forward-compat with non-builder callers)", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "do x" });
    const [planArg] = mockPlan.mock.calls[0]!;
    expect(planArg).not.toHaveProperty("currentGraph");
  });

  it("returns 400 when currentGraph.nodes contains an unknown kind", async () => {
    const res = await call("wf-1", {
      prompt: "x",
      currentGraph: {
        nodes: [
          { id: "a", kind: "router", provider: "slack", type: "send" },
        ],
        edges: [],
      },
    });
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("returns 400 when currentGraph exceeds the node cap (defense against oversized payloads)", async () => {
    const nodes = Array.from({ length: 501 }, (_, i) => ({
      id: `n${i}`,
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
    }));
    const res = await call("wf-1", {
      prompt: "x",
      currentGraph: { nodes, edges: [] },
    });
    expect(res.status).toBe(400);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("strips unknown keys on a currentGraph node (forward-compatible — schema-strip)", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", {
      prompt: "x",
      currentGraph: {
        nodes: [
          {
            id: "a",
            kind: "trigger",
            provider: "native",
            type: "manual.run",
            // Caller might accidentally include config; the schema strips
            // it so the planner service never sees it.
            config: { accessToken: "ya29.LEAKED-SECRET" },
            position: { x: 1, y: 2 },
          },
        ],
        edges: [],
      },
    });
    const [planArg] = mockPlan.mock.calls[0]!;
    const forwarded = (planArg as { currentGraph: { nodes: Array<Record<string, unknown>> } })
      .currentGraph.nodes[0]!;
    expect(forwarded).not.toHaveProperty("config");
    expect(forwarded).not.toHaveProperty("position");
    // The forwarded shape is exactly the allowlisted fields.
    expect(forwarded).toEqual({
      id: "a",
      kind: "trigger",
      provider: "native",
      type: "manual.run",
    });
  });
});
