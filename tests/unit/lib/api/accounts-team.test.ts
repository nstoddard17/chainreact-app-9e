/**
 * @jest-environment node
 *
 * Tests for the team-member + invitation client wrappers added in
 * 4.TEAM-PAGE-1. Mocks global fetch so the wire shapes (URL, method, body) and
 * error mapping are isolated from the network. Sibling of accounts.test.ts.
 */

import {
  listMembers,
  listInvitations,
  createInvitation,
  revokeInvitation,
  changeMemberRole,
  removeMember,
  AccountApiError,
} from "@/lib/api/accounts";

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}
function err(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

describe("listMembers", () => {
  it("GETs the account members route and unwraps `members` (incl. display identity)", async () => {
    const members = [
      {
        userId: "u1",
        role: "owner",
        joinedAt: "2026-05-01T00:00:00Z",
        invitedByUserId: null,
        email: "u1@x.io",
        displayName: "Ada Lovelace",
      },
    ];
    mockFetch.mockResolvedValueOnce(ok({ members }));
    const r = await listMembers("acct 1");
    expect(r).toEqual(members);
    expect(r[0]!.email).toBe("u1@x.io");
    expect(r[0]!.displayName).toBe("Ada Lovelace");
    expect(mockFetch).toHaveBeenCalledWith("/api/accounts/acct%201/members");
  });

  it("maps 403 → FORBIDDEN", async () => {
    mockFetch.mockResolvedValueOnce(err(403, { error: "Not a member." }));
    await expect(listMembers("a")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});

describe("listInvitations", () => {
  it("GETs the invitations route and unwraps `invitations`", async () => {
    const invitations = [
      { id: "i1", email: "x@y.z", role: "member", status: "pending", expiresAt: "e", createdAt: "c" },
    ];
    mockFetch.mockResolvedValueOnce(ok({ invitations }));
    const r = await listInvitations("acct1");
    expect(r).toEqual(invitations);
    expect(mockFetch).toHaveBeenCalledWith("/api/accounts/acct1/invitations");
  });
});

describe("createInvitation", () => {
  it("POSTs email+role and returns invitation + token + path + delivery status", async () => {
    const payload = {
      ok: true,
      invitation: { id: "i1", email: "a@b.c", role: "member", status: "pending", expiresAt: "e", createdAt: "c" },
      acceptToken: "raw-token",
      acceptPath: "/invitations/accept?token=raw-token",
      emailDelivery: { status: "sent" },
    };
    mockFetch.mockResolvedValueOnce(ok(payload, 201));
    const r = await createInvitation("acct1", "a@b.c", "member");
    expect(r).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/accounts/acct1/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@b.c", role: "member" }),
      }),
    );
  });

  it("degrades a missing/unknown emailDelivery to 'failed' (UI then leads with the copy link)", async () => {
    const payload = {
      ok: true,
      invitation: { id: "i1", email: "a@b.c", role: "member", status: "pending", expiresAt: "e", createdAt: "c" },
      acceptToken: "raw-token",
      acceptPath: "/invitations/accept?token=raw-token",
    };
    mockFetch.mockResolvedValueOnce(ok(payload, 201));
    const r = await createInvitation("acct1", "a@b.c", "member");
    expect(r.emailDelivery).toEqual({ status: "failed" });
  });

  it("maps 409 (team_member_limit_reached) → CONFLICT and keeps the server message", async () => {
    mockFetch.mockResolvedValueOnce(
      err(409, {
        error:
          "This account is at its member limit. Teams allow up to 5 members and Business up to 25.",
        code: "TEAM_MEMBER_LIMIT_REACHED",
      }),
    );
    await expect(createInvitation("a", "x@y.z", "admin")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: expect.stringContaining("Business up to 25"),
    });
  });
});

describe("revokeInvitation", () => {
  it("DELETEs the scoped invitation route", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true }));
    await revokeInvitation("acct1", "inv1");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/accounts/acct1/invitations/inv1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("maps 404 → UNKNOWN (not found)", async () => {
    mockFetch.mockResolvedValueOnce(err(404, { error: "Invitation not found." }));
    await expect(revokeInvitation("a", "x")).rejects.toBeInstanceOf(AccountApiError);
  });
});

describe("changeMemberRole", () => {
  it("PATCHes the member route with the new role", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true, role: "admin" }));
    await changeMemberRole("acct1", "u2", "admin");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/accounts/acct1/members/u2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "admin" }),
      }),
    );
  });
});

describe("removeMember", () => {
  it("DELETEs the member route", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true }));
    await removeMember("acct1", "u2");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/accounts/acct1/members/u2",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("maps 403 (owner target / forbidden) → FORBIDDEN", async () => {
    mockFetch.mockResolvedValueOnce(err(403, { error: "The account owner cannot be removed." }));
    await expect(removeMember("a", "owner")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
