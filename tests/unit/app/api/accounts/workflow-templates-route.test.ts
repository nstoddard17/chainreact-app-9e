/**
 * @jest-environment node
 *
 * GET/POST /api/accounts/[id]/workflow-templates (CS-XT-5A). Mocks auth, the role gate, the
 * flag, and the management service. Proves: flag-off dark 404; member-only list; owner/admin
 * create with tier/limit/workflow error mapping; strict body rejects privileged fields; no
 * Stripe/secret leak.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockFlag = jest.fn();
jest.mock("@/services/workflows/portabilityFlags", () => ({
  isWorkflowTemplatesEnabled: () => mockFlag(),
}));

const mockList = jest.fn();
const mockCreate = jest.fn();
jest.mock("@/services/workflows/templateManagement", () => ({
  listAccountTemplates: (...a: unknown[]) => mockList(...a),
  createAccountTemplate: (...a: unknown[]) => mockCreate(...a),
}));

import { GET, POST } from "@/app/api/accounts/[id]/workflow-templates/route";

const ACCOUNT = "acct-1";
function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
}
function postReq(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  jest.clearAllMocks();
  authed();
  mockFlag.mockReturnValue(true);
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
  mockList.mockResolvedValue([]);
  mockCreate.mockResolvedValue({ ok: true, template: { id: "tpl-1", name: "T", visibility: "private" } });
});

describe("flag gating", () => {
  it("GET 404 when ENABLE_WORKFLOW_TEMPLATES is off", async () => {
    mockFlag.mockReturnValue(false);
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(404);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });
  it("POST 404 when off", async () => {
    mockFlag.mockReturnValue(false);
    const res = await POST(postReq({ workflowId: "11111111-1111-1111-1111-111111111111" }), params());
    expect(res.status).toBe(404);
  });
});

describe("GET — list (any member)", () => {
  it("401 unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(new Request("http://x"), params())).status).toBe(401);
  });
  it("403 NOT_ACCOUNT_MEMBER for a non-member (no leak)", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });
  it("allows any member to list", async () => {
    mockList.mockResolvedValue([{ id: "tpl-1", name: "T" }]);
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin", "member"]);
    expect((await res.json()).templates).toHaveLength(1);
  });
});

describe("POST — create (owner/admin)", () => {
  const WF = "11111111-1111-1111-1111-111111111111";

  it("requires owner/admin (member forbidden → 403 FORBIDDEN)", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await POST(postReq({ workflowId: WF }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin"]);
  });

  it("creates (201) and never echoes a Stripe id", async () => {
    const res = await POST(postReq({ workflowId: WF, name: "My T" }), params());
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toMatch(/stripe/i);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT, actorUserId: "user-1", workflowId: WF, name: "My T" }));
  });

  it("strict body rejects a privileged field (source) → 400", async () => {
    const res = await POST(postReq({ workflowId: WF, source: "official", usage_count: 999 }), params());
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("tier_forbidden → 403 TEMPLATES_REQUIRE_UPGRADE", async () => {
    mockCreate.mockResolvedValue({ ok: false, reason: "tier_forbidden" });
    const res = await POST(postReq({ workflowId: WF }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TEMPLATES_REQUIRE_UPGRADE");
  });

  it("limit_reached → 403 TEMPLATE_LIMIT_REACHED with limit/count", async () => {
    mockCreate.mockResolvedValue({ ok: false, reason: "limit_reached", limit: 25, count: 25 });
    const res = await POST(postReq({ workflowId: WF }), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("TEMPLATE_LIMIT_REACHED");
    expect(body.limit).toBe(25);
  });

  it("workflow_not_found → 404 (no cross-account leak)", async () => {
    mockCreate.mockResolvedValue({ ok: false, reason: "workflow_not_found" });
    const res = await POST(postReq({ workflowId: WF }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("WORKFLOW_NOT_FOUND");
  });
});
