/**
 * @jest-environment node
 *
 * Tests for `app/api/internal/diagnostics/workflow-connections/route.ts`
 * (Slice 4.MCP-STAGE-2B-4, thin shell).
 *
 * The route is a thin gated shell that delegates to the
 * `diagnoseWorkflowConnections` capability service. These tests prove the
 * ROUTE's responsibilities only: the gate, input validation, and that it
 * serializes the service's DTO verbatim. The deep per-provider + authz +
 * no-leak assertions live in
 * tests/unit/services/diagnostics/integrationConnection.test.ts.
 */

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
  // CHECK-ACTIONS-3: the connection diagnosis resolves the caller's role to compute
  // `canReconnect`. Not asserted here; default to owner so the existing serialization
  // case is unaffected.
  getRoleServiceRole: () => Promise.resolve("owner"),
}));

const mockGetActive = jest.fn();
const mockCountActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  getByIdForAccountServiceRole: jest.fn(),
  countActiveByAccountProviderServiceRole: (...a: unknown[]) => mockCountActive(...a),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

import { POST } from "@/app/api/internal/diagnostics/workflow-connections/route";

const GOOD_TOKEN = "diag-wfconn-token-0123456789abcdef";
const ACCT = "acct-1";

function req(body: unknown, token: string | null = GOOD_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://x/api/internal/diagnostics/workflow-connections", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const slackRow = () => ({
  id: "int-1",
  accountId: ACCT,
  connectedByUserId: "u1",
  provider: "slack",
  providerAccountId: "T01",
  displayName: "WS",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["channels:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
});

beforeEach(() => {
  mockGetWorkflow.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  mockGetActive.mockReset();
  mockGetActive.mockResolvedValue(slackRow());
  mockCountActive.mockReset();
  mockCountActive.mockResolvedValue(1);
  mockGetProvider.mockReset();
  mockGetProvider.mockReturnValue({
    id: "slack",
    displayName: "Slack",
    isEnabled: true,
    refreshable: true,
    scopes: { required: ["channels:read"], optional: [], deprecated: [] },
  });
  process.env.DIAGNOSTICS_API_ENABLED = "1";
  process.env.DIAGNOSTICS_API_TOKEN = GOOD_TOKEN;
  delete process.env.DIAGNOSTICS_API_ALLOW_PROD;
});

const workflow = () => ({
  id: "wf-1",
  name: "WF",
  accountId: ACCT,
  createdByUserId: "u1",
  draftDefinition: {
    nodes: [{ id: "n1", kind: "trigger", provider: "slack", type: "message_posted", config: {} }],
    edges: [],
  },
});

// ───────────────────────────── Gate (route-owned) ─────────────────────────────
describe("workflow-connections route — gate", () => {
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

// ───────────────────── Input validation (route-owned) ─────────────────────
describe("workflow-connections route — input validation", () => {
  it("400 when workflowId missing", async () => {
    expect((await POST(req({ userId: "u1" }))).status).toBe(400);
  });
  it("400 when userId missing", async () => {
    expect((await POST(req({ workflowId: "wf-1" }))).status).toBe(400);
  });
  it("400 on a non-object body", async () => {
    const bad = new Request("http://x/api/internal/diagnostics/workflow-connections", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${GOOD_TOKEN}` },
      body: "not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });
});

// ───────────────────── Delegation + serialization ─────────────────────
describe("workflow-connections route — delegates + serializes the DTO", () => {
  it("serializes the service's OK DTO verbatim", async () => {
    mockGetWorkflow.mockResolvedValue(workflow());
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "u1" }))).json();
    expect(dto).toMatchObject({
      workflowId: "wf-1",
      access: "OK",
      allRequiredConnected: true,
    });
    expect(dto.providers).toHaveLength(1);
    expect(dto.providers[0]).toMatchObject({
      provider: "slack",
      nodeIds: ["n1"],
      status: "CONNECTED",
      ready: true,
    });
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "u1");
  });

  it("NOT_FOUND → serializes ONLY {workflowId, access}", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    const dto = await (await POST(req({ workflowId: "missing", userId: "u1" }))).json();
    expect(dto).toEqual({ workflowId: "missing", access: "NOT_FOUND" });
  });

  it("NO_ACCOUNT_ACCESS (non-member) → serializes ONLY {workflowId, access}", async () => {
    mockGetWorkflow.mockResolvedValue(workflow());
    mockIsMember.mockResolvedValue(false);
    const dto = await (await POST(req({ workflowId: "wf-1", userId: "intruder" }))).json();
    expect(dto).toEqual({ workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" });
    expect(mockGetActive).not.toHaveBeenCalled();
  });
});
