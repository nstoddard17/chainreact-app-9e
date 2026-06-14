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

// APPS-PERM-1 — account/service-provider connect is gated to owner/admin via the
// account-authz helper. Personal-provider connect never consults it.
const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
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
  // Default: the connecting user is owner/admin (the account-provider gate passes).
  // Tests that exercise the denial path override this with mockResolvedValueOnce.
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
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

it("APPS-PERM-1 — account provider connect by a plain member → 403, OAuth never starts", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: true, accountId: TEAM, source: "active" });
  mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
  const res = await POST(plainReq("notion"), params("notion"));
  expect(res.status).toBe(403);
  expect(mockRequireRole).toHaveBeenCalledWith(USER, TEAM, ["owner", "admin"]);
  expect(mockConnect).not.toHaveBeenCalled();
});

it("APPS-PERM-1 — account provider connect by owner/admin → 200", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: true, accountId: TEAM, source: "active" });
  mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
  const res = await POST(plainReq("notion"), params("notion"));
  expect(res.status).toBe(200);
  expect(mockConnect).toHaveBeenCalled();
});

it("APPS-PERM-1 — personal provider connect by a plain member → 200, role gate NOT consulted", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: true, accountId: TEAM, source: "active" });
  const res = await POST(plainReq("gmail"), params("gmail"));
  expect(res.status).toBe(200);
  // gmail is a personal provider — the owner/admin gate must NOT apply.
  expect(mockRequireRole).not.toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalled();
});

it("APPS-PERM-1 — account-provider denial leaks no account id (typed 'forbidden' only)", async () => {
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: true, accountId: TEAM, source: "active" });
  mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
  const res = await POST(plainReq("notion"), params("notion"));
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

it("V2-READY-21 — a hostile dispatcher error collapses to the stable code (no raw leak)", async () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  signedIn();
  mockResolveActive.mockResolvedValueOnce({ ok: true, accountId: TEAM, source: "active" });
  // gmail is a personal provider → skips the owner/admin role gate, so connect() runs.
  const hostile =
    'insert into "integrations" violates constraint "integrations_pkey" ' +
    "account=" + TEAM + " provider-account=carol@example.com token=tok-SECRET scope=read:all";
  mockConnect.mockRejectedValueOnce(new Error(hostile));

  const res = await POST(plainReq("gmail"), params("gmail"));
  expect(res.status).toBe(400); // status contract preserved
  const raw = await res.text();
  expect(JSON.parse(raw).error).toBe("connect_failed");
  for (const frag of [
    "integrations_pkey",
    "constraint",
    TEAM,
    "carol@example.com",
    "tok-SECRET",
    "read:all",
  ]) {
    expect(raw).not.toContain(frag);
  }
  expect(errorSpy).toHaveBeenCalled(); // diagnostics retained server-side
  errorSpy.mockRestore();
});
