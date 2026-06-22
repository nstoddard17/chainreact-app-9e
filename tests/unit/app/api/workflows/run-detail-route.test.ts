/**
 * @jest-environment node
 *
 * Tests for app/api/workflows/[id]/runs/[runId]/route.ts.
 *
 * Verifies the auth gate, the workflowId/runId cross-check, the membership
 * gate, the 404 (no-existence-leak) shape, and the V2-READY-51 sanitized
 * wire-shape: per-step status timeline + humanized errorClassification, with
 * the raw triggerEvent / fatalError and (for non-test runs) per-step output
 * all stripped. The authz + output-gating angles are covered in depth by
 * run-routes-authz.test.ts; this file focuses on the detail wire-shape.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

// V2-READY-51 — the detail route reads the run via service-role (non-authorizing)
// and then authorizes EXPLICITLY: cross-validate workflowId, then
// `requireWorkflowAccountMember` (`accountMemberships.isMember`). It also loads
// the workflow (`workflows.getById`) to resolve per-step output redaction. Stub
// both data dependencies (not a fake Supabase client shape).
const mockWorkflowGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockWorkflowGetById(...args),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...args: unknown[]) => mockIsMember(...args),
}));

import { GET } from "@/app/api/workflows/[id]/runs/[runId]/route";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "ev1",
  occurredAt: "2026-05-17T00:00:00Z",
  providerAccountId: "system",
  payload: { inputs: {} },
};

const ACCOUNT_ID = "acct-1";

// A normal member viewing their OWN non-test run. Per V2-READY-51 the detail DTO
// exposes SAFE operational fields only: per-step OUTPUT is author-test-only, so a
// non-test run never carries output, and the raw triggerEvent / fatalError are
// never on the wire (the humanized errorClassification is the only error surface).
const baseRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  workflowId: "22222222-2222-2222-2222-222222222222",
  accountId: ACCOUNT_ID,
  triggeredByUserId: "user-1",
  status: "succeeded" as const,
  triggerNodeId: "t1",
  triggerEvent,
  steps: [
    {
      nodeId: "t1",
      status: "succeeded" as const,
      output: { event: triggerEvent },
    },
    {
      nodeId: "a1",
      status: "succeeded" as const,
      output: { sentTo: "C123-secret" },
    },
  ],
  fatalError: null,
  errorClassification: null,
  startedAt: "2026-05-17T00:00:00Z",
  finishedAt: "2026-05-17T00:00:01Z",
  createdAt: "2026-05-17T00:00:00Z",
  isTest: false,
  triggeredBy: "manual" as const,
  triggeredByApiKeyId: null,
  triggeredByApiKeyPrefix: null,
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetById.mockReset();
  // Default: caller is a member of the run's account; the redaction workflow
  // lookup returns nothing (output is gated off for non-test runs anyway).
  mockWorkflowGetById.mockReset();
  mockWorkflowGetById.mockResolvedValue(null);
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
});

function authedUser(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
}

function makeRequest(): Request {
  return new Request("http://x/api/workflows/wf-1/runs/run-1");
}

describe("GET /api/workflows/[id]/runs/[runId]", () => {
  it("returns 401 when no user is signed in", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns 404 when the run does not exist (RLS or missing)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the run exists but belongs to a different workflow", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, workflowId: "wf-other" });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 (no existence leak) when the caller is not a member of the run's account", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, workflowId: "wf-1" });
    mockIsMember.mockResolvedValueOnce(false);
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockIsMember).toHaveBeenCalledWith("user-1", ACCOUNT_ID);
  });

  it("returns the sanitized run detail for a member (steps status-only, NO triggerEvent / fatalError / output on a non-test run)", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({ ...baseRecord, workflowId: "wf-1" });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: baseRecord.id,
      workflowId: "wf-1",
      status: "succeeded",
      triggerNodeId: "t1",
      errorClassification: null,
    });
    // V2-READY-51 payload lockdown — the raw upstream payload + engine-internal
    // fatal details are NEVER on the wire; engine-internal id/timestamp dropped.
    expect(body).not.toHaveProperty("triggerEvent");
    expect(body).not.toHaveProperty("fatalError");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("createdAt");
    // Step status timeline is present; per-step OUTPUT is author-test-only, so a
    // non-test run carries status (+ sanitized error) but no output blob.
    expect(body.steps).toHaveLength(2);
    expect(body.steps[1]).toMatchObject({ nodeId: "a1", status: "succeeded" });
    expect(body.steps[1]).not.toHaveProperty("output");
    // The step output blob (and anything in it) never reaches the client.
    expect(JSON.stringify(body)).not.toContain("C123-secret");
  });

  it("failed run → humanized errorClassification + sanitized step error, NO raw fatalError", async () => {
    authedUser();
    mockGetById.mockResolvedValueOnce({
      ...baseRecord,
      workflowId: "wf-1",
      status: "failed" as const,
      // Raw engine-internal fatal text — must NOT reach the client.
      fatalError: { code: "HANDLER_FAILED", message: "raw-fatal-leak-xyz" },
      errorClassification: {
        title: "Slack call timed out",
        description: "Slack didn't respond in time.",
        hint: "Retry the run.",
        action: "open_node",
        severity: "error" as const,
      },
      steps: [
        {
          nodeId: "a1",
          status: "failed" as const,
          error: { code: "HANDLER_FAILED", message: "raw-fatal-leak-xyz" },
        },
      ],
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1", runId: "run-1" }),
    });
    const body = await res.json();
    expect(body.status).toBe("failed");
    // The raw fatalError is gone; the humanized errorClassification is the surface.
    expect(body).not.toHaveProperty("fatalError");
    expect(body.errorClassification).toMatchObject({
      title: "Slack call timed out",
      action: "open_node",
      severity: "error",
    });
    // Step keeps the stable code; the message is humanized (raw text scrubbed).
    expect(body.steps[0].error).toMatchObject({ code: "HANDLER_FAILED" });
    expect(JSON.stringify(body)).not.toContain("raw-fatal-leak-xyz");
  });
});
