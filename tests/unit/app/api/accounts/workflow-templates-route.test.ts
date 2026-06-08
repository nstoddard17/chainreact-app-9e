/**
 * @jest-environment node
 *
 * GET/POST /api/accounts/[id]/workflow-templates (CS-XT-5A + created_by_user_id data-
 * minimization hardening). Mocks auth, the role gate, and the management service. Proves:
 * member-only list; the list forwards the AUTHED actor id so canManage is resolved server-side
 * and no raw creator id reaches the client; owner/admin create with tier/limit/workflow error
 * mapping; strict body rejects privileged fields; no Stripe/secret leak.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
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
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
  mockList.mockResolvedValue([]);
  mockCreate.mockResolvedValue({ ok: true, template: { id: "tpl-1", name: "T", visibility: "private" } });
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
  it("allows any member to list, forwarding the AUTHED actor id (canManage resolved server-side)", async () => {
    mockList.mockResolvedValue([{ id: "tpl-1", name: "T", canManage: true }]);
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin", "member"]);
    // The actor id comes from the verified session — never request input — so canManage is
    // computed against the right viewer.
    expect(mockList).toHaveBeenCalledWith(ACCOUNT, "user-1");
    expect((await res.json()).templates).toHaveLength(1);
  });

  it("returns canManage and NEVER a raw creator id (data minimization)", async () => {
    // The service already strips createdByUserId → canManage; the route forwards verbatim.
    mockList.mockResolvedValue([
      { id: "mine", name: "Mine", source: "user", visibility: "private", canManage: true, usageCount: 0, forkCount: 0, publishedAt: null, unpublishedAt: null, forkedFromTemplateId: null, schemaVersion: 1, createdAt: "t", updatedAt: "t" },
      { id: "theirs", name: "Theirs", source: "user", visibility: "public", canManage: false, usageCount: 0, forkCount: 0, publishedAt: null, unpublishedAt: null, forkedFromTemplateId: null, schemaVersion: 1, createdAt: "t", updatedAt: "t" },
      { id: "official", name: "Official", source: "official", visibility: "public", canManage: false, usageCount: 0, forkCount: 0, publishedAt: null, unpublishedAt: null, forkedFromTemplateId: null, schemaVersion: 1, createdAt: "t", updatedAt: "t" },
    ]);
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.templates.map((t: { id: string; canManage: boolean }) => [t.id, t.canManage])).toEqual([
      ["mine", true],
      ["theirs", false],
      ["official", false],
    ]);

    const raw = JSON.stringify(body);
    expect(raw).not.toContain("created_by_user_id");
    expect(raw).not.toContain("createdByUserId");
    expect(raw).not.toContain("user-1"); // the caller's own id never round-trips
    for (const t of body.templates) {
      expect(t).not.toHaveProperty("createdByUserId");
      expect(t).not.toHaveProperty("created_by_user_id");
    }
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
