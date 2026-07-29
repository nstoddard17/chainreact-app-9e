/**
 * @jest-environment node
 *
 * REACT-AGENT-GUIDED-BUILD-1 — connect-route handling of the popup return
 * context. The route must accept ONLY the allow-listed shape
 * `{ surface: "builder_popup", nonce: <url-safe 8..64> }`, forward it verbatim
 * to the dispatcher (which binds it into the signed state), and reject any
 * other shape with a typed 400 — a URL can never ride through here.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockResolveActive = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...a: unknown[]) => mockResolveActive(...a),
}));

jest.mock("@/services/integrations/reconnect", () => ({
  resolveReconnectTarget: jest.fn(),
}));

const mockConnect = jest.fn();
jest.mock("@/services/oauth/dispatcher", () => ({
  connect: (...a: unknown[]) => mockConnect(...a),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

import { POST } from "@/app/api/integrations/oauth/[provider]/connect/route";

const USER = "user-A";
const ACCT = "acct-A";

function params(provider = "notion") {
  return { params: Promise.resolve({ provider }) };
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
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockResolveActive.mockResolvedValue({ ok: true, accountId: ACCT, source: "active" });
  mockConnect.mockResolvedValue({ redirectUrl: "https://provider.example/authorize?x=1" });
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
});

it("forwards a valid builder_popup return context to the dispatcher", async () => {
  const res = await POST(
    jsonReq({ return: { surface: "builder_popup", nonce: "attempt-nonce-1234" } }),
    params(),
  );
  expect(res.status).toBe(200);
  expect(mockConnect).toHaveBeenCalledWith({
    userId: USER,
    accountId: ACCT,
    provider: "notion",
    returnContext: { surface: "builder_popup", nonce: "attempt-nonce-1234" },
  });
});

it.each([
  ["a URL surface", { surface: "https://evil.example", nonce: "attempt-nonce-1234" }],
  ["an unknown surface", { surface: "apps_page", nonce: "attempt-nonce-1234" }],
  ["a markup nonce", { surface: "builder_popup", nonce: "<script>x</script>" }],
  ["a short nonce", { surface: "builder_popup", nonce: "ab" }],
  ["a string", "builder_popup"],
  ["null", null],
])("rejects %s with a typed 400 and never starts OAuth", async (_label, ret) => {
  const res = await POST(jsonReq({ return: ret }), params());
  expect(res.status).toBe(400);
  expect(mockConnect).not.toHaveBeenCalled();
});

it("omitting return keeps the legacy connect contract (no returnContext key)", async () => {
  const res = await POST(jsonReq({}), params());
  expect(res.status).toBe(200);
  expect(mockConnect).toHaveBeenCalledWith({
    userId: USER,
    accountId: ACCT,
    provider: "notion",
  });
  expect(mockConnect.mock.calls[0]![0]).not.toHaveProperty("returnContext");
});
