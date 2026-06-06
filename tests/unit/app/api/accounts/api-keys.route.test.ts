/**
 * @jest-environment node
 *
 * Route tests for GET + POST /api/accounts/[id]/api-keys (FK-2). Mocks supabase
 * auth, requireAccountRole, and the management service. Load-bearing checks:
 * owner/admin-only, no key_hash in any response, raw key returned only on create,
 * zod body validation, and service-failure → HTTP mapping.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockList = jest.fn();
const mockCreate = jest.fn();
jest.mock("@/services/apiKeys/management", () => ({
  listApiKeys: (...a: unknown[]) => mockList(...a),
  createApiKey: (...a: unknown[]) => mockCreate(...a),
  MAX_API_KEY_NAME_LENGTH: 80,
}));

import { GET, POST } from "@/app/api/accounts/[id]/api-keys/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}
function postReq(body: unknown) {
  return new Request("https://x/api/accounts/acct/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getReq() {
  return new Request("https://x/api/accounts/acct/api-keys");
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockList.mockReset();
  mockCreate.mockReset();
});

describe("GET /api/accounts/[id]/api-keys", () => {
  it("401 when unauthenticated — no role check, no list", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(401);
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("owner/admin gets the metadata list (never key_hash)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockList.mockResolvedValueOnce([
      { id: "k1", accountId: ACCOUNT, name: "CI", prefix: "crk_live_AbCd1234", scopes: ["workflows:trigger"], lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: "t", createdByUserId: CALLER, status: "active" },
    ]);
    const res = await GET(getReq(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKeys).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("key_hash");
    expect(JSON.stringify(body)).not.toContain("keyHash");
    expect(mockRequireRole).toHaveBeenCalledWith(CALLER, ACCOUNT, ["owner", "admin"]);
  });

  it("403 FORBIDDEN for a plain member (owner/admin-only)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member (no leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });
});

describe("POST /api/accounts/[id]/api-keys", () => {
  it("owner/admin creates a key → 201 with the raw key exactly once + metadata (no key_hash)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    mockCreate.mockResolvedValueOnce({
      ok: true,
      key: { id: "k1", accountId: ACCOUNT, name: "CI", prefix: "crk_live_AbCd1234", scopes: ["workflows:trigger"], lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: "t", createdByUserId: CALLER, status: "active" },
      rawKey: "crk_live_RAWSECRETVALUE0000000000000000000000000000",
    });
    const res = await POST(postReq({ name: "CI", scopes: ["workflows:trigger"] }), params());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toBe("crk_live_RAWSECRETVALUE0000000000000000000000000000");
    expect(body.apiKey.id).toBe("k1");
    expect(JSON.stringify(body)).not.toContain("key_hash");
    expect(JSON.stringify(body.apiKey)).not.toContain("keyHash");
    expect(mockCreate).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      createdByUserId: CALLER,
      name: "CI",
      scopes: ["workflows:trigger"],
      expiresAt: null,
    });
  });

  it("403 for a plain member (no create)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await POST(postReq({ name: "CI", scopes: ["workflows:trigger"] }), params());
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400 on an invalid body (empty name) — zod, before the service", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    const res = await POST(postReq({ name: "", scopes: ["workflows:trigger"] }), params());
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400 on unknown body keys (strict — caller can't set prefix/hash/createdBy)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    const res = await POST(
      postReq({ name: "CI", scopes: ["workflows:trigger"], key_hash: "evil", createdByUserId: "x" }),
      params(),
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps service failures: scope_not_enabled→400, invalid_expiry→400, account_frozen→403", async () => {
    for (const [reason, status, code] of [
      ["scope_not_enabled", 400, "SCOPE_NOT_ENABLED"],
      ["invalid_expiry", 400, "INVALID_EXPIRY"],
      ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ] as const) {
      signedIn();
      mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
      mockCreate.mockResolvedValueOnce({ ok: false, reason });
      const res = await POST(postReq({ name: "CI", scopes: ["workflows:trigger"] }), params());
      expect(res.status).toBe(status);
      expect((await res.json()).code).toBe(code);
    }
  });
});
