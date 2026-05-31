/**
 * @jest-environment node
 *
 * Tests for POST /api/workflows/[id]/runs/[runId]/ai/repair (Slice 4.AI-13).
 *
 * Auth runs through the real `requireUser` (createClient mocked). The AI-7
 * repair service is mocked so the route's auth / body-handling / status-
 * mapping / no-leak contract is isolated from validator + preview internals.
 * The repair service itself is deterministic and read-only — it makes NO
 * model call — so unlike the plan route there is no MODEL/PARSE failure
 * surface to map.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockSuggestRepair = jest.fn();
jest.mock("@/services/ai/repair", () => ({
  suggestWorkflowRepairForAI: (...a: unknown[]) => mockSuggestRepair(...a),
}));

const mockRecordRepair = jest.fn();
jest.mock("@/services/ai/events", () => ({
  recordAiRepairOutcome: (...a: unknown[]) => mockRecordRepair(...a),
}));

// 4.ACCOUNT-MODEL-9d: the route resolves the caller's account for AI-cost ownership.
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: jest.fn(async () => ({ id: "acct-user-1" })),
}));

import { POST } from "@/app/api/workflows/[id]/runs/[runId]/ai/repair/route";

function call(id: string, runId: string, body?: unknown) {
  const init: {
    method: string;
    body?: string;
    headers?: Record<string, string>;
  } = { method: "POST" };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return POST(
    new Request(`http://x/api/workflows/${id}/runs/${runId}/ai/repair`, init),
    { params: Promise.resolve({ id, runId }) },
  );
}

const okFailureSummary = {
  failed: true,
  status: "failed" as const,
  isTest: false,
  failedNodeId: "n-slack",
  errorCode: "MISSING_REQUIRED_FIELD",
  classification: {
    title: "A field is missing",
    description: "userId is required.",
    severity: "error" as const,
  },
};

const okRepairableResult = {
  ok: true as const,
  workflowId: "wf-1",
  workflowRunId: "run-1",
  failureSummary: okFailureSummary,
  repairability: "repairable" as const,
  reasonCode: "MISSING_REQUIRED_FIELD",
  proposedPatch: {
    patchId: "repair:run-1",
    workflowId: "wf-1",
    baseRevision: "rev-1",
    operations: [
      {
        op: "updateNodeConfig",
        nodeId: "n-slack",
        config: { userId: "{{AI_FIELD:userId}}" },
      },
    ],
    summary: "Repair proposal",
    rationale: "Missing required field on n-slack.",
  },
  preview: {
    ok: true,
    workflowId: "wf-1",
    riskLevel: "low",
    requiresConfirmation: false,
    validation: { ok: true, errors: [], warnings: [] },
    changes: [{ op: "updateNodeConfig", description: "Set userId on n-slack" }],
  },
  requiredUserInput: [],
  recommendations: ["Fill the userId field on n-slack."],
  confidence: "medium" as const,
  safetyNotes: [],
  noMutation: true as const,
};

const okNeedsInputResult = {
  ok: true as const,
  workflowId: "wf-1",
  workflowRunId: "run-1",
  failureSummary: okFailureSummary,
  repairability: "needsUserInput" as const,
  reasonCode: "MISSING_REQUIRED_FIELD",
  requiredUserInput: [
    { nodeId: "n-slack", field: "userId", label: "Slack recipient", kind: "config_value" as const },
  ],
  recommendations: [],
  confidence: "medium" as const,
  safetyNotes: [],
  noMutation: true as const,
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockSuggestRepair.mockReset();
  mockRecordRepair.mockReset();
  mockRecordRepair.mockResolvedValue(undefined);
});

describe("auth", () => {
  it("returns 401 for an unauthenticated request and never calls the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(401);
    expect(mockSuggestRepair).not.toHaveBeenCalled();
  });
});

describe("path validation", () => {
  it("returns 400 when workflow id is blank", async () => {
    const res = await call("   ", "run-1");
    expect(res.status).toBe(400);
    expect(mockSuggestRepair).not.toHaveBeenCalled();
  });

  it("returns 400 when run id is blank", async () => {
    const res = await call("wf-1", "   ");
    expect(res.status).toBe(400);
    expect(mockSuggestRepair).not.toHaveBeenCalled();
  });
});

describe("body handling", () => {
  it("accepts an empty body (POST with no JSON)", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okNeedsInputResult);
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(200);
    expect(mockSuggestRepair).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      workflowRunId: "run-1",
    });
  });

  it("accepts an empty JSON object body", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okNeedsInputResult);
    const res = await call("wf-1", "run-1", {});
    expect(res.status).toBe(200);
  });

  it("strips and ignores forward-compat fields (repairPrompt, modelTier, selectedNodeId) — service still gets only ids", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okNeedsInputResult);
    await call("wf-1", "run-1", {
      repairPrompt: "the slack node fails",
      modelTier: "strong",
      selectedNodeId: "n-slack",
    });
    expect(mockSuggestRepair).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      workflowRunId: "run-1",
    });
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const res = await call("wf-1", "run-1", "not json{");
    expect(res.status).toBe(400);
    expect(mockSuggestRepair).not.toHaveBeenCalled();
  });

  it("returns 400 when the body has an invalid modelTier enum value", async () => {
    const res = await call("wf-1", "run-1", { modelTier: "turbo" });
    expect(res.status).toBe(400);
    expect(mockSuggestRepair).not.toHaveBeenCalled();
  });

  it("returns 400 when repairPrompt exceeds the max length", async () => {
    const res = await call("wf-1", "run-1", { repairPrompt: "a".repeat(4_001) });
    expect(res.status).toBe(400);
    expect(mockSuggestRepair).not.toHaveBeenCalled();
  });

  it("ignores unknown body keys (forward-compatible)", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okNeedsInputResult);
    const res = await call("wf-1", "run-1", { somethingNew: true, repairPrompt: "x" });
    expect(res.status).toBe(200);
  });
});

describe("service wiring", () => {
  it("calls suggestWorkflowRepairForAI with userId/workflowId/runId from auth + path", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okRepairableResult);
    await call("wf-1", "run-1");
    expect(mockSuggestRepair).toHaveBeenCalledWith({
      userId: "user-1",
      workflowId: "wf-1",
      workflowRunId: "run-1",
    });
  });
});

describe("result mapping", () => {
  it("returns 200 with the structured body for repairable + previewed", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okRepairableResult);
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      repairability: "repairable",
      reasonCode: "MISSING_REQUIRED_FIELD",
      proposedPatch: expect.objectContaining({ patchId: "repair:run-1" }),
      preview: expect.objectContaining({ ok: true }),
    });
  });

  it("returns 200 for a needs-user-input result (no patch, no preview)", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okNeedsInputResult);
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repairability).toBe("needsUserInput");
    expect(body.requiredUserInput).toHaveLength(1);
    expect(body.proposedPatch).toBeUndefined();
  });

  it("returns 200 for a no-safe-repair result (recommendations only)", async () => {
    mockSuggestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: "wf-1",
      workflowRunId: "run-1",
      failureSummary: { ...okFailureSummary, errorCode: "BILLING_EXHAUSTED" },
      repairability: "noSafeRepair",
      reasonCode: "BILLING_LIMIT",
      requiredUserInput: [],
      recommendations: ["Upgrade your plan to keep running this workflow."],
      confidence: "high",
      safetyNotes: [],
      noMutation: true,
    });
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repairability).toBe("noSafeRepair");
    expect(body.proposedPatch).toBeUndefined();
  });

  it("returns 404 when the service returns NOT_FOUND (run missing / not owned)", async () => {
    mockSuggestRepair.mockResolvedValueOnce({
      ok: false,
      code: "NOT_FOUND",
      message: "No workflow run.",
      noMutation: true,
    });
    const res = await call("wf-1", "run-bogus");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Workflow run not found.");
  });

  it("returns 500 (sanitized) when the service returns READ_FAILED", async () => {
    mockSuggestRepair.mockResolvedValueOnce({
      ok: false,
      code: "READ_FAILED",
      message: "Couldn't read the workflow run.",
      noMutation: true,
    });
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to suggest a repair.");
  });

  it("returns a sanitized 500 when the service throws (no internals leaked)", async () => {
    mockSuggestRepair.mockRejectedValueOnce(new Error("getById failed: secret-conn-str"));
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret-conn-str");
    expect(body.error).toBe("Failed to suggest a repair.");
  });
});

describe("AI-10 observability (fail-open)", () => {
  it("records a repair event with the userId/workflowId/runId + result", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okRepairableResult);
    await call("wf-1", "run-1");
    expect(mockRecordRepair).toHaveBeenCalledWith(
      { accountId: "acct-user-1", userId: "user-1", workflowId: "wf-1", workflowRunId: "run-1" },
      expect.objectContaining({ ok: true }),
    );
  });

  it("still returns the correct status when event recording rejects", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okRepairableResult);
    mockRecordRepair.mockRejectedValueOnce(new Error("ledger down"));
    const res = await call("wf-1", "run-1");
    expect(res.status).toBe(200);
  });
});

describe("read-only / no-apply / no-model-direct", () => {
  it("does not import the apply service, a writing repo, or a model client", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/applyWorkflowPatch\w*\s*\(/);
    expect(src).not.toMatch(/from\s+["']@\/repositories\//);
    expect(src).not.toMatch(/updateDraftDefinition/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/modelClients/);
    expect(src).not.toMatch(/from\s+["']@\/core\/ai\/modelClient/);
  });

  it("does not call the planner — repair is its own service", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/planner/);
  });
});

describe("no-leak", () => {
  it("the response exposes no secret-identifier substrings", async () => {
    mockSuggestRepair.mockResolvedValueOnce(okRepairableResult);
    const res = await call("wf-1", "run-1");
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
      "ya29.",
    ]) {
      expect(serialized).not.toContain(needle);
    }
  });
});

describe("metadata-driven — no hardcoded provider behavior", () => {
  it("the route source contains no provider-specific name (no `stripe`, `slack`, `gmail`, etc. in branching)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts"),
      "utf8",
    );
    // The route delegates entirely to the deterministic service; it must not
    // branch on any provider identifier. (Substring check is sufficient — a
    // future regression that hardcodes `stripe:event_received` would fail.)
    for (const provider of ["stripe", "slack", "gmail", "github", "notion", "airtable", "shopify", "hubspot"]) {
      expect(src.toLowerCase()).not.toContain(provider);
    }
  });
});
