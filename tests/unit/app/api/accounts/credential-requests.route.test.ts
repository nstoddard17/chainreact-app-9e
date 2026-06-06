/**
 * @jest-environment node
 *
 * Route tests for GET /api/accounts/[id]/credential-requests (CS-7). Self-scoped
 * consent inbox. Mocks the supabase server client (auth), requireAccountRole, and
 * the inbox service. The list is always the caller's own and never another
 * member's; non-members get a no-leak 403; feature-off yields an empty list.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockListInbox = jest.fn();
jest.mock("@/services/teamCredentials/credentialRequestsInbox", () => ({
  listIncomingCredentialRequests: (...a: unknown[]) => mockListInbox(...a),
}));

import { GET } from "@/app/api/accounts/[id]/credential-requests/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function req() {
  return new Request("https://x/api/accounts/acct/credential-requests");
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockListInbox.mockReset();
});

describe("GET /api/accounts/[id]/credential-requests", () => {
  it("401 when unauthenticated — no role check, no inbox lookup", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(req(), params());
    expect(res.status).toBe(401);
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockListInbox).not.toHaveBeenCalled();
  });

  it("returns the caller's own pending requests (caller user id only)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "member" });
    const requests = [
      {
        workflowId: "wf-1",
        nodeId: "node-7",
        provider: "gmail",
        workflowName: "Send digest",
        requestedByLabel: "Dana",
        requestedAt: "2026-06-06T00:00:00Z",
      },
    ];
    mockListInbox.mockResolvedValueOnce(requests);

    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests });
    // Always the caller's own user id — never a target from request input.
    expect(mockListInbox).toHaveBeenCalledWith({ accountId: ACCOUNT, userId: CALLER });
  });

  it("returns an empty list when the feature is off (service yields [])", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    mockListInbox.mockResolvedValueOnce([]);
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [] });
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member (no inbox leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockListInbox).not.toHaveBeenCalled();
  });

  it("403 FORBIDDEN for an authenticated non-authorized caller", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockListInbox).not.toHaveBeenCalled();
  });
});
