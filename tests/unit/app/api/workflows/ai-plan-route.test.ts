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
  it("records a plan event with the user/workflow + result", async () => {
    mockPlan.mockResolvedValueOnce(successResult);
    await call("wf-1", { prompt: "x" });
    expect(mockRecordPlan).toHaveBeenCalledWith(
      { userId: "user-1", workflowId: "wf-1" },
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
