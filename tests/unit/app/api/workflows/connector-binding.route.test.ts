/**
 * @jest-environment node
 *
 * CS-4a — node connector-binding routes: auth, scope validation, typed-error
 * mapping, no-leak. Mocks supabase auth, the workflows repo (getById),
 * accountMemberships (isMember + getRole — used by requireWorkflowAccountMember +
 * requireAccountRole), and the binding service. The authz matrix itself lives in
 * the service test; here we prove the thin route plumbing.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({ getById: (...a: unknown[]) => mockGetById(...a) }));

const mockIsMember = jest.fn();
const mockGetRole = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
  getRole: (...a: unknown[]) => mockGetRole(...a),
}));

const mockSet = jest.fn();
const mockClear = jest.fn();
const mockEligible = jest.fn();
jest.mock("@/services/integrations/connectionBinding", () => ({
  setNodeConnectorBinding: (...a: unknown[]) => mockSet(...a),
  clearNodeConnectorBinding: (...a: unknown[]) => mockClear(...a),
  listEligibleSharedConnectors: (...a: unknown[]) => mockEligible(...a),
}));

import { PUT, DELETE } from "@/app/api/workflows/[id]/nodes/[nodeId]/connector-binding/route";
import { GET } from "@/app/api/workflows/[id]/nodes/[nodeId]/connector-binding/eligible-connectors/route";

const record = {
  id: "wf-1",
  accountId: "team-1",
  createdByUserId: "creatorA",
  name: "WF",
  state: "active" as const,
  draftDefinition: { nodes: [], edges: [] },
};
function params(id = "wf-1", nodeId = "node-7") {
  return { params: Promise.resolve({ id, nodeId }) };
}
function req(body: unknown = {}) {
  return new Request("http://t/", { method: "PUT", body: JSON.stringify(body) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "callerX" } }, error: null });
  mockGetById.mockResolvedValue(record);
  mockIsMember.mockResolvedValue(true);
  mockGetRole.mockResolvedValue("owner");
});

describe("PUT connector-binding", () => {
  it("401 unauthenticated → service not called", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await PUT(req({ connectorUserId: "c1" }), params());
    expect(res.status).toBe(401);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("404 non-member → service not called (no existence leak)", async () => {
    mockIsMember.mockResolvedValue(false);
    const res = await PUT(req({ connectorUserId: "c1" }), params());
    expect(res.status).toBe(404);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it.each([{}, { connectorUserId: "" }, { connectorUserId: 5 }])(
    "400 INVALID_CONNECTOR for bad body %p → service not called",
    async (body) => {
      const res = await PUT(req(body), params());
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_CONNECTOR");
      expect(mockSet).not.toHaveBeenCalled();
    },
  );

  it("200 {bound:true}; passes session caller + path ids + connector to service", async () => {
    mockSet.mockResolvedValue({ ok: true });
    const res = await PUT(req({ connectorUserId: "conn-9" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bound: true });
    expect(mockSet).toHaveBeenCalledWith({
      workflowId: "wf-1", nodeId: "node-7", connectorUserId: "conn-9", callerUserId: "callerX", callerRole: "owner",
    });
  });

  it.each([
    ["not_enabled", 404, "WORKFLOW_NOT_FOUND"],
    ["node_not_found", 404, "NODE_NOT_FOUND"],
    ["not_applicable", 400, "NOT_APPLICABLE"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["forbidden", 403, "FORBIDDEN"],
    ["connector_not_member", 400, "CONNECTOR_NOT_MEMBER"],
    ["connector_not_connected", 400, "CONNECTOR_NOT_CONNECTED"],
    ["connector_not_shared", 400, "CONNECTOR_NOT_SHARED"],
  ] as const)("maps service reason %s → %i %s", async (reason, status, code) => {
    mockSet.mockResolvedValue({ ok: false, reason });
    const res = await PUT(req({ connectorUserId: "c1" }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it("NO LEAK: success body has exactly { bound }", async () => {
    mockSet.mockResolvedValue({ ok: true });
    const res = await PUT(req({ connectorUserId: "c1" }), params());
    expect(Object.keys(await res.json())).toEqual(["bound"]);
  });
});

describe("DELETE connector-binding", () => {
  it("200 {cleared:true} when service clears", async () => {
    mockClear.mockResolvedValue({ ok: true, cleared: true });
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: true });
  });
  it("maps forbidden → 403", async () => {
    mockClear.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), params());
    expect(res.status).toBe(403);
  });
});

describe("GET eligible-connectors", () => {
  it("200 with connectors list", async () => {
    mockEligible.mockResolvedValue({
      ok: true,
      connectors: [{ userId: "alice", displayName: "Alice", role: "owner" }],
    });
    const res = await GET(new Request("http://t/"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connectors: [{ userId: "alice", displayName: "Alice", role: "owner" }] });
  });
  it("not_enabled → 404 (feature hidden)", async () => {
    mockEligible.mockResolvedValue({ ok: false, reason: "not_enabled" });
    const res = await GET(new Request("http://t/"), params());
    expect(res.status).toBe(404);
  });
});
