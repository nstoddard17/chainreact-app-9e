/**
 * @jest-environment node
 *
 * V2-READY-51 — membership authorization + payload sanitization for the builder
 * run routes. After the `workflow_runs` authenticated SELECT grant was revoked,
 * `workflowRuns.getById` / `listByWorkflow` read via service-role (bypassing
 * RLS), so these routes MUST authorize explicitly:
 *
 *   - GET /api/workflows/[id]/runs/[runId] — fetch the run (service-role), cross-
 *     validate its workflowId, then `requireWorkflowAccountMember`. A non-member,
 *     a missing run, and a workflowId mismatch ALL collapse to 404 (no existence
 *     leak). The DTO never carries raw triggerEvent / fatalError, and per-step
 *     output appears ONLY for the run's own author viewing their test run.
 *   - GET /api/workflows/[id]/runs — `loadWorkflowForMember` (missing / deleted /
 *     non-member → 404) before listing; summaries strip steps/trigger/fatal.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockRunGetById = jest.fn();
const mockListByWorkflow = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  getById: (...a: unknown[]) => mockRunGetById(...a),
  listByWorkflow: (...a: unknown[]) => mockListByWorkflow(...a),
}));

const mockWorkflowGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockWorkflowGetById(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));

import { GET as getDetail } from "@/app/api/workflows/[id]/runs/[runId]/route";
import { GET as getList } from "@/app/api/workflows/[id]/runs/route";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";

const WORKFLOW_ID = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_ID = "acct-1";
const AUTHOR = "author-1";

function authed(userId: string): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
}

function runRecord(over: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: RUN_ID,
    workflowId: WORKFLOW_ID,
    accountId: ACCOUNT_ID,
    triggeredByUserId: AUTHOR,
    status: "succeeded",
    triggerNodeId: "t1",
    triggerEvent: {
      provider: "native",
      eventType: "manual.run",
      eventId: "ev-1",
      occurredAt: "2026-05-22T00:00:00Z",
      providerAccountId: "system",
      payload: { secret: "trigger-body-leak" },
    },
    steps: [{ nodeId: "a1", status: "succeeded", output: { token: "sk-leak-99" } }],
    fatalError: { code: "HANDLER_FAILED", message: "raw fatal leak" },
    errorClassification: null,
    startedAt: "2026-05-22T00:00:00Z",
    finishedAt: "2026-05-22T00:00:01Z",
    createdAt: "2026-05-22T00:00:00Z",
    isTest: true,
    triggeredBy: "test",
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: null,
    ...over,
  };
}

const workflowRow = {
  id: WORKFLOW_ID,
  accountId: ACCOUNT_ID,
  state: "draft",
  draftDefinition: {
    nodes: [
      { id: "a1", kind: "action", provider: "native", type: "http_request", config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [],
  },
};

beforeEach(() => {
  mockGetUser.mockReset();
  mockRunGetById.mockReset();
  mockListByWorkflow.mockReset();
  mockWorkflowGetById.mockReset();
  mockIsMember.mockReset();
});

const detailParams = Promise.resolve({ id: WORKFLOW_ID, runId: RUN_ID });

describe("GET /api/workflows/[id]/runs/[runId] — V2-READY-51 authz + sanitization", () => {
  it("401 when unauthenticated (no run read attempted)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await getDetail(new Request("http://x"), { params: detailParams });
    expect(res.status).toBe(401);
    expect(mockRunGetById).not.toHaveBeenCalled();
  });

  it("404 when the run does not exist", async () => {
    authed(AUTHOR);
    mockRunGetById.mockResolvedValueOnce(null);
    const res = await getDetail(new Request("http://x"), { params: detailParams });
    expect(res.status).toBe(404);
    expect(mockIsMember).not.toHaveBeenCalled();
  });

  it("404 when the run's workflowId does not match the path [id]", async () => {
    authed(AUTHOR);
    mockRunGetById.mockResolvedValueOnce(runRecord({ workflowId: "other-wf" }));
    const res = await getDetail(new Request("http://x"), { params: detailParams });
    expect(res.status).toBe(404);
    expect(mockIsMember).not.toHaveBeenCalled();
  });

  it("404 (no existence leak) when the caller is NOT a member of the run's account", async () => {
    authed("intruder");
    mockRunGetById.mockResolvedValueOnce(runRecord());
    mockIsMember.mockResolvedValueOnce(false);
    const res = await getDetail(new Request("http://x"), { params: detailParams });
    expect(res.status).toBe(404);
    expect(mockIsMember).toHaveBeenCalledWith("intruder", ACCOUNT_ID);
  });

  it("author viewing their TEST run → 200, output present, NO raw triggerEvent/fatalError", async () => {
    authed(AUTHOR);
    mockRunGetById.mockResolvedValueOnce(runRecord());
    mockIsMember.mockResolvedValueOnce(true);
    mockWorkflowGetById.mockResolvedValueOnce(workflowRow);
    const res = await getDetail(new Request("http://x"), { params: detailParams });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect("triggerEvent" in body).toBe(false);
    expect("fatalError" in body).toBe(false);
    const step = (body.steps as Array<Record<string, unknown>>)[0]!;
    expect(step.output).toBeDefined();
    // The raw trigger body + raw fatal message never reach the client.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("trigger-body-leak");
    expect(serialized).not.toContain("raw fatal leak");
  });

  it("co-member viewing the author's run → 200 but step output OMITTED", async () => {
    authed("teammate");
    mockRunGetById.mockResolvedValueOnce(runRecord());
    mockIsMember.mockResolvedValueOnce(true);
    mockWorkflowGetById.mockResolvedValueOnce(workflowRow);
    const res = await getDetail(new Request("http://x"), { params: detailParams });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { steps: Array<Record<string, unknown>> };
    expect("output" in body.steps[0]!).toBe(false);
    expect(JSON.stringify(body)).not.toContain("sk-leak-99");
  });
});

describe("GET /api/workflows/[id]/runs — V2-READY-51 member gate", () => {
  const listParams = Promise.resolve({ id: WORKFLOW_ID });

  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await getList(new Request("http://x"), { params: listParams });
    expect(res.status).toBe(401);
    expect(mockListByWorkflow).not.toHaveBeenCalled();
  });

  it("404 when the workflow is missing (no run list read attempted)", async () => {
    authed(AUTHOR);
    mockWorkflowGetById.mockResolvedValueOnce(null);
    const res = await getList(new Request("http://x"), { params: listParams });
    expect(res.status).toBe(404);
    expect(mockListByWorkflow).not.toHaveBeenCalled();
  });

  it("404 when the caller is not a member of the workflow's account", async () => {
    authed("intruder");
    mockWorkflowGetById.mockResolvedValueOnce(workflowRow);
    mockIsMember.mockResolvedValueOnce(false);
    const res = await getList(new Request("http://x"), { params: listParams });
    expect(res.status).toBe(404);
    expect(mockListByWorkflow).not.toHaveBeenCalled();
  });

  it("member → 200 with summaries that strip steps/triggerEvent/fatalError", async () => {
    authed(AUTHOR);
    mockWorkflowGetById.mockResolvedValueOnce(workflowRow);
    mockIsMember.mockResolvedValueOnce(true);
    mockListByWorkflow.mockResolvedValueOnce([runRecord()]);
    const res = await getList(new Request("http://x"), { params: listParams });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Array<Record<string, unknown>> };
    const run = body.runs[0]!;
    expect(run.id).toBe(RUN_ID);
    for (const banned of ["steps", "triggerEvent", "fatalError"]) {
      expect(banned in run).toBe(false);
    }
    expect(JSON.stringify(body)).not.toContain("trigger-body-leak");
    expect(JSON.stringify(body)).not.toContain("sk-leak-99");
  });
});
