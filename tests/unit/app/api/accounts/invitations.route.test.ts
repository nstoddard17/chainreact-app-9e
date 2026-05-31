/**
 * @jest-environment node
 *
 * Route tests for /api/accounts/[id]/invitations (POST create, GET list) and
 * /api/accounts/[id]/invitations/[invitationId] (DELETE revoke) —
 * 4.ACCOUNT-MODEL-15. Mocks auth + requireAccountRole + the invitation service
 * so the route's own auth/role/parse/mapping is isolated.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockCreate = jest.fn();
const mockList = jest.fn();
const mockRevoke = jest.fn();
jest.mock("@/services/accounts/invitations", () => ({
  createInvitation: (...a: unknown[]) => mockCreate(...a),
  listInvitations: (...a: unknown[]) => mockList(...a),
  revokeInvitation: (...a: unknown[]) => mockRevoke(...a),
}));

import { POST, GET } from "@/app/api/accounts/[id]/invitations/route";
import { DELETE } from "@/app/api/accounts/[id]/invitations/[invitationId]/route";

const USER = "owner-1";
const ACCOUNT = "team-1";

function params(extra: Record<string, string> = {}) {
  // Cast to the richer shape so the same helper satisfies both the {id} routes
  // (POST/GET) and the {id, invitationId} route (DELETE) — structurally OK.
  return {
    params: Promise.resolve({ id: ACCOUNT, ...extra }),
  } as { params: Promise<{ id: string; invitationId: string }> };
}
function req(body?: unknown) {
  return new Request(`https://app.test/api/accounts/${ACCOUNT}/invitations`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER } }, error: null });
}
function asOwner() {
  signedIn();
  mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockCreate.mockReset();
  mockList.mockReset();
  mockRevoke.mockReset();
});

describe("POST /api/accounts/[id]/invitations", () => {
  it("401s an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("403s a non-member (NOT_ACCOUNT_MEMBER)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("403s a member (FORBIDDEN — only owner/admin invite)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("requires owner/admin role from requireAccountRole", async () => {
    asOwner();
    mockCreate.mockResolvedValueOnce({ ok: true, invitation: inv(), acceptToken: "raw", acceptPath: "/x" });
    await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(mockRequireRole).toHaveBeenCalledWith(USER, ACCOUNT, ["owner", "admin"]);
  });

  it("400s an invalid email", async () => {
    asOwner();
    const res = await POST(req({ email: "not-an-email", role: "member" }), params());
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400s an 'owner' role (not in the admin|member enum)", async () => {
    asOwner();
    const res = await POST(req({ email: "a@b.com", role: "owner" }), params());
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("201s on success and returns the accept link (raw token exposed only here)", async () => {
    asOwner();
    mockCreate.mockResolvedValueOnce({
      ok: true, invitation: inv(), acceptToken: "raw-token", acceptPath: "/invitations/accept?token=raw-token",
    });
    const res = await POST(req({ email: "A@B.com", role: "admin" }), params());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.acceptToken).toBe("raw-token");
    expect(body.acceptPath).toContain("token=");
    expect(mockCreate).toHaveBeenCalledWith({
      accountId: ACCOUNT, inviterUserId: USER, email: "A@B.com", role: "admin",
    });
  });

  it("403 ACCOUNT_PENDING_DELETION when the account is frozen", async () => {
    asOwner();
    mockCreate.mockResolvedValueOnce({ ok: false, reason: "account_frozen" });
    const res = await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });

  it("409 ALREADY_MEMBER / DUPLICATE_PENDING_INVITE", async () => {
    asOwner();
    mockCreate.mockResolvedValueOnce({ ok: false, reason: "already_member" });
    const res1 = await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(res1.status).toBe(409);
    expect((await res1.json()).code).toBe("ALREADY_MEMBER");

    asOwner();
    mockCreate.mockResolvedValueOnce({ ok: false, reason: "duplicate_pending" });
    const res2 = await POST(req({ email: "a@b.com", role: "member" }), params());
    expect(res2.status).toBe(409);
    expect((await res2.json()).code).toBe("DUPLICATE_PENDING_INVITE");
  });
});

describe("GET /api/accounts/[id]/invitations", () => {
  it("403s a member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await GET(new Request("https://app.test"), params());
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("lists pending invites for an owner/admin", async () => {
    asOwner();
    mockList.mockResolvedValueOnce([inv()]);
    const res = await GET(new Request("https://app.test"), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toHaveLength(1);
    // Projection only — no token_hash leaks (the record never carries it).
    expect(body.invitations[0]).not.toHaveProperty("tokenHash");
  });
});

describe("DELETE /api/accounts/[id]/invitations/[invitationId]", () => {
  it("403s a member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await DELETE(new Request("https://app.test", { method: "DELETE" }), params({ invitationId: "inv-1" }));
    expect(res.status).toBe(403);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("revokes for an owner/admin", async () => {
    asOwner();
    mockRevoke.mockResolvedValueOnce({ ok: true });
    const res = await DELETE(new Request("https://app.test", { method: "DELETE" }), params({ invitationId: "inv-1" }));
    expect(res.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith({ accountId: ACCOUNT, invitationId: "inv-1" });
  });

  it("404s a missing invite", async () => {
    asOwner();
    mockRevoke.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const res = await DELETE(new Request("https://app.test", { method: "DELETE" }), params({ invitationId: "nope" }));
    expect(res.status).toBe(404);
  });
});

function inv() {
  return {
    id: "inv-1", email: "a@b.com", role: "member", status: "pending",
    expiresAt: "2999-01-01T00:00:00.000Z", createdAt: "2026-05-31T00:00:00.000Z",
  };
}
