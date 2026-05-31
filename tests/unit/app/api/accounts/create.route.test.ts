/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts — create Team (4.ACCOUNT-MODEL-13). Mocks
 * supabase auth + the createTeamAccount service so the route's own guards (auth
 * → parse → only-team → service) are isolated.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockCreateTeamAccount = jest.fn();
jest.mock("@/services/accounts/createTeamAccount", () => ({
  createTeamAccount: (...a: unknown[]) => mockCreateTeamAccount(...a),
}));

import { POST } from "@/app/api/accounts/route";

const USER = "user-1";

function req(body: unknown) {
  return new Request("https://app.example.test/api/accounts", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockCreateTeamAccount.mockReset();
});

describe("POST /api/accounts", () => {
  it("401s an unauthenticated caller and never creates", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ name: "Acme" }));
    expect(res.status).toBe(401);
    expect(mockCreateTeamAccount).not.toHaveBeenCalled();
  });

  it("400s a missing/blank name", async () => {
    signedIn();
    const res = await POST(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(mockCreateTeamAccount).not.toHaveBeenCalled();
  });

  it("creates a team on the happy path (201 + payload), owner = session user", async () => {
    signedIn();
    mockCreateTeamAccount.mockResolvedValueOnce({ id: "team-1", name: "Acme", type: "team" });
    const res = await POST(req({ name: "Acme" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      account: { id: "team-1", name: "Acme", type: "team" },
    });
    // userId comes from the session, never the body.
    expect(mockCreateTeamAccount).toHaveBeenCalledWith({ userId: USER, name: "Acme" });
  });

  it("accepts an explicit type:'team' but ignores any other type (organization not creatable)", async () => {
    signedIn();
    const res = await POST(req({ name: "Acme", type: "organization" }));
    // 'organization' fails the z.literal('team') → 400, service never called.
    expect(res.status).toBe(400);
    expect(mockCreateTeamAccount).not.toHaveBeenCalled();
  });

  it("cannot create as another user: ownerUserId comes from the session, not the body", async () => {
    signedIn();
    mockCreateTeamAccount.mockResolvedValueOnce({ id: "team-1", name: "Acme", type: "team" });
    await POST(req({ name: "Acme", userId: "victim", ownerUserId: "victim" }));
    expect(mockCreateTeamAccount).toHaveBeenCalledWith({ userId: USER, name: "Acme" });
  });
});
