/**
 * @jest-environment node
 *
 * OAUTH-ACCT-BIND — route tests for POST /api/integrations/oauth/[provider]/connect.
 *
 * Proves the connect ROUTE resolves the user's ACTIVE account at connect-start and
 * forwards it to the dispatcher (which binds it into the signed state). A plain
 * connect on a Team account must pass the TEAM account — never the personal one.
 * resolveActiveAccount failures map to typed, non-leaking HTTP codes and never
 * start OAuth. Reconnect continues to use the already-authorized row account.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockResolveActive = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...a: unknown[]) => mockResolveActive(...a),
}));

const mockResolveReconnect = jest.fn();
jest.mock("@/services/integrations/reconnect", () => ({
  resolveReconnectTarget: (...a: unknown[]) => mockResolveReconnect(...a),
}));

const mockConnect = jest.fn();
jest.mock("@/services/oauth/dispatcher", () => ({
  connect: (...a: unknown[]) => mockConnect(...a),
}));

import { POST } from "@/app/api/integrations/oauth/[provider]/connect/route";

const USER = "user-A";
const TEAM = "team-acct-A";
const PERSONAL = "personal-acct-A";

function params(provider = "notion") {
  return { params: Promise.resolve({ provider }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER } }, error: null });
}
function plainReq(provider = "notion") {
  return new Request(`http://x/api/integrations/oauth/${provider}/connect`, { method: "POST" });
}
function jsonReq(body: unknown, provider = "notion") {
  return new Request(`http://x/api/integrations/oauth/${provider}/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue({ redirectUrl: "https://api.notion.com/v1/oauth/authorize?x=1" });
});

it("plain connect resolves the ACTIVE account and forwards it (team, not personal)", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: true, accountId: TEAM, source: "active" });
  const res = await POST(plainReq(), params());
  expect(res.status).toBe(200);
  expect(mockResolveActive).toHaveBeenCalledWith(USER);
  expect(mockConnect).toHaveBeenCalledWith({
    userId: USER,
    accountId: TEAM,
    provider: "notion",
  });
  // The bug: this would have been the personal account. Guard against regression.
  expect(mockConnect.mock.calls[0]![0].accountId).not.toBe(PERSONAL);
});

it("non-member active account → 403, OAuth never starts", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: false, reason: "not_member", accountId: TEAM });
  const res = await POST(plainReq(), params());
  expect(res.status).toBe(403);
  expect(mockConnect).not.toHaveBeenCalled();
});

it("frozen active account → 409, OAuth never starts", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: false, reason: "account_frozen", accountId: TEAM });
  const res = await POST(plainReq(), params());
  expect(res.status).toBe(409);
  expect(mockConnect).not.toHaveBeenCalled();
});

it("401 unauthenticated never resolves an account nor starts OAuth", async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  const res = await POST(plainReq(), params());
  expect(res.status).toBe(401);
  expect(mockResolveActive).not.toHaveBeenCalled();
  expect(mockConnect).not.toHaveBeenCalled();
});

it("response leaks no account id on failure (typed reason only)", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: false, reason: "not_member", accountId: TEAM });
  const res = await POST(plainReq(), params());
  const json = await res.json();
  expect(JSON.stringify(json)).not.toContain(TEAM);
});

it("reconnect uses the authorized ROW account, not the active account", async () => {
  signedIn();
  mockResolveReconnect.mockResolvedValueOnce({
    ok: true,
    accountId: "row-team-acct",
    integrationId: "int-77",
    expectedProviderAccountId: "marcus@example.com",
  });
  const res = await POST(
    jsonReq({ reconnect: { integrationId: "int-77", accountId: "row-team-acct" } }, "gmail"),
    params("gmail"),
  );
  expect(res.status).toBe(200);
  // Active-account resolution is NOT consulted for reconnect.
  expect(mockResolveActive).not.toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalledWith({
    userId: USER,
    accountId: "row-team-acct",
    provider: "gmail",
    reconnect: {
      integrationId: "int-77",
      accountId: "row-team-acct",
      expectedProviderAccountId: "marcus@example.com",
    },
  });
});
