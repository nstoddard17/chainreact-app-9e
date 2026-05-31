/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/ai/apply (Slice 4.AI-9B).
 *
 * Auth runs through the real `requireUser` (createClient mocked); the AI-6 apply
 * service is mocked so the route's auth / validation / status-mapping / no-leak
 * contract is isolated. The route is the only mutation entry point — these assert
 * it delegates to the apply service and never touches a model/planner/repo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockApply = jest.fn();
jest.mock("@/services/ai/apply", () => ({
  applyWorkflowPatchForAI: (...a: unknown[]) => mockApply(...a),
}));

const mockRecordApply = jest.fn();
jest.mock("@/services/ai/events", () => ({
  recordAiApplyOutcome: (...a: unknown[]) => mockRecordApply(...a),
}));

// 4.ACCOUNT-MODEL-9d: the route resolves the caller's account for AI-cost ownership.
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: jest.fn(async () => ({ id: "acct-user-1" })),
}));

import { POST } from "@/app/api/workflows/[id]/ai/apply/route";

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://x/api/workflows/${id}/ai/apply`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

const samplePatch = {
  patchId: "p1",
  workflowId: "wf-1",
  baseRevision: "2026-05-25T00:00:00Z",
  operations: [{ op: "moveNode", nodeId: "n1", position: { x: 1, y: 2 } }],
  summary: "Move node",
  rationale: "tidy",
};

const successResult = {
  ok: true,
  workflowId: "wf-1",
  appliedPatchId: "p1",
  appliedOperationCount: 1,
  affectedNodeIds: ["n1"],
  affectedEdgeIds: [],
  riskLevel: "low",
  requiresConfirmation: false,
  riskReasons: [],
  workflow: { id: "wf-1", name: "WF", state: "draft", nodeCount: 1, edgeCount: 0 },
  updatedAt: "2026-05-25T01:00:00Z",
  summaryText: 'Applied 1 change to "WF". Risk: low.',
};

const fail = (code: string, message = "x", extra: Record<string, unknown> = {}) => ({
  ok: false,
  code,
  message,
  ...extra,
});

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockApply.mockReset();
  mockRecordApply.mockReset();
  mockRecordApply.mockResolvedValue(undefined);
});

describe("auth", () => {
  it("returns 401 for an unauthenticated request and never calls the apply service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(401);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("request validation", () => {
  it("returns 400 when patch is missing", async () => {
    const res = await call("wf-1", {});
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("returns 400 when patch is not an object", async () => {
    const res = await call("wf-1", { patch: "not-an-object" });
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid confirmation shape", async () => {
    const res = await call("wf-1", { patch: samplePatch, confirmation: { confirmed: "yes" } });
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await call("wf-1", "not json{");
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("apply-service wiring", () => {
  it("calls applyWorkflowPatchForAI with userId, workflowId, and patch", async () => {
    mockApply.mockResolvedValueOnce(successResult);
    await call("wf-1", { patch: samplePatch });
    expect(mockApply).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      patch: samplePatch,
    });
  });

  it("forwards the confirmation when present", async () => {
    mockApply.mockResolvedValueOnce(successResult);
    const confirmation = { confirmed: true, acceptedRiskLevel: "high", acceptedAt: "2026-05-25T02:00:00Z" };
    await call("wf-1", { patch: samplePatch, confirmation });
    expect(mockApply).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      patch: samplePatch,
      confirmation,
    });
  });
});

describe("status mapping", () => {
  it("returns 200 with the apply result on success", async () => {
    mockApply.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, appliedPatchId: "p1", updatedAt: "2026-05-25T01:00:00Z" });
  });

  it("maps NOT_FOUND to 404", async () => {
    mockApply.mockResolvedValueOnce(fail("NOT_FOUND", "No workflow 'wf-1'."));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(404);
  });

  it("maps CONFIRMATION_REQUIRED to 428", async () => {
    mockApply.mockResolvedValueOnce(fail("CONFIRMATION_REQUIRED", "high-risk; confirm."));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("maps STALE_PATCH to 409", async () => {
    mockApply.mockResolvedValueOnce(fail("STALE_PATCH", "re-preview."));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(409);
  });

  it("maps PATCH_INVALID to 400", async () => {
    mockApply.mockResolvedValueOnce(fail("PATCH_INVALID", "bad shape", { errors: [{ code: "INVALID_PATCH", message: "x" }] }));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(400);
  });

  it("maps VALIDATION_FAILED to 400", async () => {
    mockApply.mockResolvedValueOnce(fail("VALIDATION_FAILED", "registry"));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(400);
  });

  it("maps UNSUPPORTED_OPERATION to 400", async () => {
    mockApply.mockResolvedValueOnce(fail("UNSUPPORTED_OPERATION", "unknown op"));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(400);
  });

  it("maps UPDATE_FAILED to 500", async () => {
    mockApply.mockResolvedValueOnce(fail("UPDATE_FAILED", "couldn't save"));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(500);
  });

  it("returns a sanitized 500 when the apply service throws (no internals leaked)", async () => {
    mockApply.mockRejectedValueOnce(new Error("update failed: secret-connection-string"));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret-connection-string");
    expect(body.error).toBe("Failed to apply the workflow patch.");
  });
});

describe("AI-10 observability (fail-open)", () => {
  it("records an apply event with the user/workflow/patchId + result", async () => {
    mockApply.mockResolvedValueOnce(successResult);
    await call("wf-1", { patch: samplePatch });
    expect(mockRecordApply).toHaveBeenCalledWith(
      { accountId: "acct-user-1", userId: "user-1", workflowId: "wf-1", patchId: "p1" },
      expect.objectContaining({ ok: true }),
    );
  });

  it("still returns 200 when event recording rejects (analytics never breaks the route)", async () => {
    mockApply.mockResolvedValueOnce(successResult);
    mockRecordApply.mockRejectedValueOnce(new Error("ledger down"));
    const res = await call("wf-1", { patch: samplePatch });
    expect(res.status).toBe(200);
  });
});

describe("no model / no planner / no direct mutation", () => {
  it("does not import a model client, the planner, or a repository", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/ai/apply/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/planner/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/modelClients/);
    expect(src).not.toMatch(/from\s+["']@\/core\/ai\/modelClient/);
    expect(src).not.toMatch(/from\s+["']@\/repositories\//);
    expect(src).not.toMatch(/generateStructuredJson/);
  });
});

describe("no-leak", () => {
  it("the response exposes no secret-identifier substrings", async () => {
    mockApply.mockResolvedValueOnce(successResult);
    const res = await call("wf-1", { patch: samplePatch });
    const serialized = JSON.stringify(await res.json());
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
