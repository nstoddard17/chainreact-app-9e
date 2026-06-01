/**
 * @jest-environment node
 *
 * Route tests for GET /api/accounts (4.ACCOUNT-MODEL-18). Mocks auth + the
 * account-list service so the route's auth + envelope is isolated.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockListSummaries = jest.fn();
jest.mock("@/services/accounts/accountList", () => ({
  listUserAccountSummaries: (...a: unknown[]) => mockListSummaries(...a),
}));

// createTeamAccount is imported by the route module (POST) — stub it so the
// module loads without pulling the real service graph.
jest.mock("@/services/accounts/createTeamAccount", () => ({
  createTeamAccount: jest.fn(),
}));

import { GET } from "@/app/api/accounts/route";

const USER = "user-1";

beforeEach(() => {
  mockGetUser.mockReset();
  mockListSummaries.mockReset();
});

describe("GET /api/accounts", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockListSummaries).not.toHaveBeenCalled();
  });

  it("returns the { activeAccountId, accounts } envelope for the session user", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER } }, error: null });
    const payload = {
      activeAccountId: "personal-1",
      accounts: [
        { id: "personal-1", name: "Personal", type: "personal", role: "owner", isActive: true, deletionStatus: "active" },
      ],
    };
    mockListSummaries.mockResolvedValueOnce(payload);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    // service is called with the SESSION user id (never request input).
    expect(mockListSummaries).toHaveBeenCalledWith(USER);
  });
});
