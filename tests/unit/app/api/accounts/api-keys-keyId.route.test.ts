/**
 * @jest-environment node
 *
 * Route tests for DELETE /api/accounts/[id]/api-keys/[keyId] (FK-2). Mocks supabase
 * auth, requireAccountRole, and the management service. Checks owner/admin-only,
 * idempotent revoke, no cross-account existence leak (404), frozen → 403, and that
 * no key_hash / raw key is ever returned.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockRevoke = jest.fn();
jest.mock("@/services/apiKeys/management", () => ({
  revokeApiKey: (...a: unknown[]) => mockRevoke(...a),
}));

import { DELETE } from "@/app/api/accounts/[id]/api-keys/[keyId]/route";

const ACCOUNT = "team-1";
const KEY = "key-9";
const CALLER = "owner-1";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT, keyId: KEY }) };
}
function req() {
  return new Request("https://x/api/accounts/acct/api-keys/key-9", { method: "DELETE" });
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockRevoke.mockReset();
});

describe("DELETE /api/accounts/[id]/api-keys/[keyId]", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(401);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("owner/admin revokes a live key → 200 (alreadyRevoked false), no secret material", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockRevoke.mockResolvedValueOnce({ ok: true, alreadyRevoked: false });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, alreadyRevoked: false });
    expect(JSON.stringify(body)).not.toContain("key_hash");
    expect(JSON.stringify(body)).not.toContain("crk_");
    expect(mockRevoke).toHaveBeenCalledWith({ accountId: ACCOUNT, keyId: KEY, actorUserId: CALLER });
  });

  it("idempotent: already-revoked key → 200 alreadyRevoked true", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    mockRevoke.mockResolvedValueOnce({ ok: true, alreadyRevoked: true });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyRevoked: true });
  });

  it("403 for a plain member (no revoke)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });

  it("404 (no leak) when the key is cross-account / nonexistent", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockRevoke.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("API_KEY_NOT_FOUND");
  });

  it("403 ACCOUNT_PENDING_DELETION on a frozen account", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockRevoke.mockResolvedValueOnce({ ok: false, reason: "account_frozen" });
    const res = await DELETE(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });
});
