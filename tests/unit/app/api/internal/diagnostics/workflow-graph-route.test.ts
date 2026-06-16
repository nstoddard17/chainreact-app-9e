/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/workflow-graph/route.ts` (Phase C-1).
 * The route is a thin gated shell; these prove ITS responsibilities only — the
 * gate, input validation, and verbatim DTO serialization. Deep findings + no-leak
 * assertions live in services/diagnostics/workflowGraph.test.ts.
 */
const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));
const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/workflow-graph/route";

const GOOD_TOKEN = "diag-graph-token-0123456789abcdef";
const ACCT = "acct-1";

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/workflow-graph", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function workflow() {
  return {
    id: "wf-1",
    name: "n",
    accountId: ACCT,
    createdByUserId: "creator-1",
    draftDefinition: {
      nodes: [{ id: "t1", kind: "trigger", provider: "synthetic", type: "", config: {}, position: { x: 0, y: 0 } }],
      edges: [],
    },
    definition: { nodes: [], edges: [] },
  };
}

beforeEach(() => {
  mockGetWorkflow.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

describe("workflow-graph route — gate", () => {
  it("404 when disabled, before any read", async () => {
    delete process.env.DIAGNOSTICS_API_ENABLED;
    expect((await POST(req({ workflowId: "wf-1", userId: "u1" }))).status).toBe(404);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
  it("404 in production without allow flag", async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error test override
    process.env.NODE_ENV = "production";
    const res = await POST(req({ workflowId: "wf-1", userId: "u1" }));
    // @ts-expect-error restore
    process.env.NODE_ENV = prev;
    expect(res.status).toBe(404);
  });
  it("401 on missing/wrong bearer; token never echoed", async () => {
    expect((await POST(req({ workflowId: "wf-1", userId: "u1" }, null))).status).toBe(401);
    const res = await POST(req({ workflowId: "wf-1", userId: "u1" }, "wrong"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(GOOD_TOKEN);
  });
});

describe("workflow-graph route — input validation", () => {
  it("400 when workflowId missing", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ workflowId: "wf-1" }))).status).toBe(400);
  });
});

describe("workflow-graph route — delegates + serializes the DTO", () => {
  it("authorized → serializes the service OK DTO", async () => {
    mockGetWorkflow.mockResolvedValue(workflow());
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    expect(dto).toMatchObject({ workflowId: "wf-1", access: "OK" });
    expect(typeof dto.structurallyValid).toBe("boolean");
    expect(Array.isArray(dto.findings)).toBe(true);
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("NO_ACCOUNT_ACCESS → exactly {workflowId, access}", async () => {
    mockGetWorkflow.mockResolvedValue(workflow());
    mockIsMember.mockResolvedValue(false);
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "intruder" }))).json();
    expect(dto).toEqual({ workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" });
  });
});
