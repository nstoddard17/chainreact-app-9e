/**
 * @jest-environment node
 *
 * Route tests for POST /api/invitations/accept (4.ACCOUNT-MODEL-15). Mocks auth +
 * the acceptInvitation service so the route's auth/parse/mapping is isolated.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockAccept = jest.fn();
jest.mock("@/services/accounts/invitations", () => ({
  acceptInvitation: (...a: unknown[]) => mockAccept(...a),
}));

import { POST } from "@/app/api/invitations/accept/route";

const USER = "user-2";
const EMAIL = "invitee@example.com";

function req(body?: unknown) {
  return new Request("https://app.test/api/invitations/accept", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER, email: EMAIL } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockAccept.mockReset();
});

describe("POST /api/invitations/accept", () => {
  it("401s an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ token: "t" }));
    expect(res.status).toBe(401);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("400s a missing token", async () => {
    signedIn();
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("accepts a valid invite — passes session userId + email to the service", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({
      ok: true, account: { id: "team-1", name: "Acme", type: "team" }, alreadyMember: false,
    });
    const res = await POST(req({ token: "raw-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, account: { id: "team-1", name: "Acme", type: "team" }, alreadyMember: false,
    });
    expect(mockAccept).toHaveBeenCalledWith({ token: "raw-token", userId: USER, userEmail: EMAIL });
  });

  it("403s a wrong-email acceptance", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "wrong_email" });
    const res = await POST(req({ token: "t" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("INVITATION_EMAIL_MISMATCH");
  });

  it("410s an expired or revoked invite", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "expired" });
    const r1 = await POST(req({ token: "t" }));
    expect(r1.status).toBe(410);
    expect((await r1.json()).code).toBe("INVITATION_EXPIRED");

    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "revoked" });
    const r2 = await POST(req({ token: "t" }));
    expect(r2.status).toBe(410);
    expect((await r2.json()).code).toBe("INVITATION_REVOKED");
  });

  it("409s an already-accepted invite", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "already_accepted" });
    const res = await POST(req({ token: "t" }));
    expect(res.status).toBe(409);
  });

  it("403 ACCOUNT_PENDING_DELETION when the account is frozen", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "account_frozen" });
    const res = await POST(req({ token: "t" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });

  it("404s an unknown token", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const res = await POST(req({ token: "t" }));
    expect(res.status).toBe(404);
  });

  it("409 TEAM_MEMBER_LIMIT_REACHED when the team is full at accept time", async () => {
    signedIn();
    mockAccept.mockResolvedValueOnce({ ok: false, reason: "team_member_limit_reached" });
    const res = await POST(req({ token: "t" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("TEAM_MEMBER_LIMIT_REACHED");
  });
});
