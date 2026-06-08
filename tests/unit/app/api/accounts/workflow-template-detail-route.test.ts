/**
 * @jest-environment node
 *
 * PATCH/DELETE /api/accounts/[id]/workflow-templates/[templateId] (CS-XT-5A). Mocks auth, the
 * role gate, the flag, and the management service. Proves flag-off dark 404; owner/admin role
 * gate; creator-only edit (non-creator → 403 FORBIDDEN_NOT_CREATOR); not-found 404; success.
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

const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/services/workflows/templateManagement", () => ({
  updateAccountTemplate: (...a: unknown[]) => mockUpdate(...a),
  deleteAccountTemplate: (...a: unknown[]) => mockDelete(...a),
}));

import { PATCH, DELETE } from "@/app/api/accounts/[id]/workflow-templates/[templateId]/route";

const ACCOUNT = "acct-1";
const TPL = "tpl-1";
function params() {
  return { params: Promise.resolve({ id: ACCOUNT, templateId: TPL }) };
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
}
function patchReq(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  jest.clearAllMocks();
  authed();
  mockFlag.mockReturnValue(true);
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
  mockUpdate.mockResolvedValue({ ok: true, template: { id: TPL, visibility: "public" } });
  mockDelete.mockResolvedValue({ ok: true });
});

describe("flag gating", () => {
  it("PATCH 404 when off", async () => {
    mockFlag.mockReturnValue(false);
    expect((await PATCH(patchReq({ name: "x" }), params())).status).toBe(404);
  });
  it("DELETE 404 when off", async () => {
    mockFlag.mockReturnValue(false);
    expect((await DELETE(new Request("http://x", { method: "DELETE" }), params())).status).toBe(404);
  });
});

describe("PATCH — creator-only update", () => {
  it("requires owner/admin role at the route", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await PATCH(patchReq({ name: "x" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin"]);
  });

  it("empty body → 400 (no fields to update)", async () => {
    const res = await PATCH(patchReq({}), params());
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("non-creator → 403 FORBIDDEN_NOT_CREATOR", async () => {
    mockUpdate.mockResolvedValue({ ok: false, reason: "forbidden_not_creator" });
    const res = await PATCH(patchReq({ name: "hijack" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_NOT_CREATOR");
  });

  it("not found → 404", async () => {
    mockUpdate.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await PATCH(patchReq({ name: "x" }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("TEMPLATE_NOT_FOUND");
  });

  it("creator publishes (visibility public) → 200", async () => {
    const res = await PATCH(patchReq({ visibility: "public" }), params());
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ templateId: TPL, visibility: "public" }));
  });
});

describe("DELETE — creator or owner", () => {
  it("not found → 404", async () => {
    mockDelete.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await DELETE(new Request("http://x", { method: "DELETE" }), params())).status).toBe(404);
  });

  it("non-creator non-owner → 403", async () => {
    mockDelete.mockResolvedValue({ ok: false, reason: "forbidden_not_creator" });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN_NOT_CREATOR");
  });

  it("passes the resolved role to the service (owner-override) and 200s", async () => {
    mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), params());
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({ templateId: TPL, actorRole: "owner" }));
  });
});
