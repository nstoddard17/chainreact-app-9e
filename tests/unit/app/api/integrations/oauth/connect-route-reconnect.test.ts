/**
 * @jest-environment node
 *
 * Route tests for POST /api/integrations/oauth/[provider]/connect in reconnect
 * mode (Slice 4.APPS-RECONNECT). Mocks session auth + the reconnect service +
 * the dispatcher; asserts the thin route's typed-reason → HTTP mapping, that it
 * forwards the server-resolved reconnect bundle to the dispatcher, and that NO
 * identity (email / provider_account_id) ever appears in the response. The
 * authz matrix itself lives in the reconnect service test.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
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

const CALLER = "user-1";

function params(provider = "gmail") {
  return { params: Promise.resolve({ provider }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER } }, error: null });
}
function reconnectReq(body: unknown, provider = "gmail") {
  return new Request(`http://x/api/integrations/oauth/${provider}/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("401 when unauthenticated — neither service nor dispatcher called", async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  const res = await POST(reconnectReq({ reconnect: { integrationId: "i", accountId: "a" } }), params());
  expect(res.status).toBe(401);
  expect(mockResolveReconnect).not.toHaveBeenCalled();
  expect(mockConnect).not.toHaveBeenCalled();
});

it("400 when reconnect is missing ids — dispatcher not called", async () => {
  signedIn();
  const res = await POST(reconnectReq({ reconnect: { integrationId: "" } }), params());
  expect(res.status).toBe(400);
  expect(mockConnect).not.toHaveBeenCalled();
});

it.each([
  ["not_found", 404],
  ["forbidden", 403],
  ["account_frozen", 409],
] as const)("maps reconnect reason %s → %d and never starts OAuth", async (reason, status) => {
  signedIn();
  mockResolveReconnect.mockResolvedValueOnce({ ok: false, reason });
  const res = await POST(
    reconnectReq({ reconnect: { integrationId: "int-1", accountId: "acc-1" } }),
    params(),
  );
  expect(res.status).toBe(status);
  expect(mockConnect).not.toHaveBeenCalled();
});

it("cross-account / non-member id collapses to 404 (no existence leak)", async () => {
  signedIn();
  mockResolveReconnect.mockResolvedValueOnce({ ok: false, reason: "not_found" });
  const res = await POST(
    reconnectReq({ reconnect: { integrationId: "someone-elses", accountId: "acc-1" } }),
    params(),
  );
  expect(res.status).toBe(404);
});

it("on authorize success forwards the resolved bundle to connect() and returns only redirectUrl", async () => {
  signedIn();
  mockResolveReconnect.mockResolvedValueOnce({
    ok: true,
    accountId: "team-acct",
    integrationId: "int-77",
    expectedProviderAccountId: "marcus@example.com",
  });
  mockConnect.mockResolvedValueOnce({ redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });

  const res = await POST(
    reconnectReq({ reconnect: { integrationId: "int-77", accountId: "team-acct" } }),
    params(),
  );
  expect(res.status).toBe(200);

  // Resolver is asked with the route provider + session caller id.
  expect(mockResolveReconnect).toHaveBeenCalledWith({
    provider: "gmail",
    accountId: "team-acct",
    integrationId: "int-77",
    callerUserId: CALLER,
  });
  // Dispatcher receives the SERVER-resolved bundle (incl. the steering identity).
  expect(mockConnect).toHaveBeenCalledWith({
    userId: CALLER,
    provider: "gmail",
    reconnect: {
      integrationId: "int-77",
      accountId: "team-acct",
      expectedProviderAccountId: "marcus@example.com",
    },
  });

  // No identity leaks back to the client — only the redirect URL.
  const json = await res.json();
  expect(json).toEqual({ redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
  expect(JSON.stringify(json)).not.toContain("marcus@example.com");
});

it("a plain connect (no reconnect body) never calls the reconnect resolver", async () => {
  signedIn();
  mockConnect.mockResolvedValueOnce({ redirectUrl: "https://slack.com/oauth?x=1" });
  const res = await POST(new Request("http://x", { method: "POST" }), params("slack"));
  expect(res.status).toBe(200);
  expect(mockResolveReconnect).not.toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalledWith({ userId: CALLER, provider: "slack" });
});
