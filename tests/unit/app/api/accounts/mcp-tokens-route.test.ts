/**
 * @jest-environment node
 *
 * Slice 4.PUBLIC-MCP-SETTINGS-UI — management routes for /api/accounts/[id]/mcp-tokens
 * (GET/POST) and /[tokenId] (DELETE). Mocks supabase auth + the account role gate +
 * the MCP token SERVICE. Proves: auth (401), owner/admin-only gate (member → 403),
 * owner can list metadata + create a token with the raw secret returned EXACTLY ONCE,
 * the response never carries `token_hash`, and revoke is account-scoped (404 no-leak).
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
const mockRevoke = jest.fn();
jest.mock("@/services/mcp/tokens", () => ({
  MAX_MCP_TOKEN_NAME_LENGTH: 80,
  listMcpTokens: (...a: unknown[]) => mockList(...a),
  createMcpToken: (...a: unknown[]) => mockCreate(...a),
  revokeMcpToken: (...a: unknown[]) => mockRevoke(...a),
}));

import { GET, POST } from "@/app/api/accounts/[id]/mcp-tokens/route";
import { DELETE } from "@/app/api/accounts/[id]/mcp-tokens/[tokenId]/route";

const ACCOUNT = "acct-1";

function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
}
function unauthed() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}
function listParams() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function tokenParams(tokenId: string) {
  return { params: Promise.resolve({ id: ACCOUNT, tokenId }) };
}
function postReq(body: unknown) {
  return new Request(`http://test/api/accounts/${ACCOUNT}/mcp-tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const META = {
  id: "t1",
  name: "Claude Desktop",
  prefix: "crmcp_ab12",
  scopes: ["accounts:read", "workflows:read", "runs:read", "integrations:read"],
  status: "active",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
});

describe("GET /api/accounts/[id]/mcp-tokens", () => {
  it("401 when unauthenticated", async () => {
    unauthed();
    const res = await GET(new Request("http://test"), listParams());
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("403 for a member (owner/admin-only gate)", async () => {
    authed();
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await GET(new Request("http://test"), listParams());
    expect(res.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("user-1", ACCOUNT, ["owner", "admin"]);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("owner gets token metadata only — never token_hash", async () => {
    authed();
    mockList.mockResolvedValue([META]);
    const res = await GET(new Request("http://test"), listParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/token_hash|tokenHash/i);
    expect(mockList).toHaveBeenCalledWith({ accountId: ACCOUNT });
  });
});

describe("POST /api/accounts/[id]/mcp-tokens", () => {
  it("403 for a member — members cannot create team/org MCP tokens", async () => {
    authed();
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await POST(postReq({ name: "Claude" }), listParams());
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("400 on an empty name (zod) without touching the service", async () => {
    authed();
    const res = await POST(postReq({ name: "" }), listParams());
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("owner creates a token; the raw secret is returned ONCE and no token_hash leaks", async () => {
    authed();
    mockCreate.mockResolvedValue({ ok: true, token: META, rawToken: "crmcp_THE_RAW_SECRET" });
    const res = await POST(postReq({ name: "Claude Desktop" }), listParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rawToken).toBe("crmcp_THE_RAW_SECRET");
    expect(body.token).toMatchObject({ id: "t1", prefix: "crmcp_ab12" });
    expect(JSON.stringify(body.token)).not.toMatch(/token_hash|tokenHash/i);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCOUNT, createdByUserId: "user-1", name: "Claude Desktop" }),
    );
  });

  it("maps a frozen-account create refusal to 403", async () => {
    authed();
    mockCreate.mockResolvedValue({ ok: false, reason: "account_frozen" });
    const res = await POST(postReq({ name: "Claude" }), listParams());
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/accounts/[id]/mcp-tokens/[tokenId]", () => {
  it("403 for a member", async () => {
    authed();
    mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await DELETE(new Request("http://test", { method: "DELETE" }), tokenParams("t1"));
    expect(res.status).toBe(403);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("owner revoke calls the service and returns ok", async () => {
    authed();
    mockRevoke.mockResolvedValue({ ok: true, alreadyRevoked: false });
    const res = await DELETE(new Request("http://test", { method: "DELETE" }), tokenParams("t1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, alreadyRevoked: false });
    expect(mockRevoke).toHaveBeenCalledWith({ accountId: ACCOUNT, tokenId: "t1" });
  });

  it("not_found maps to 404 (cross-account / nonexistent — no existence leak)", async () => {
    authed();
    mockRevoke.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await DELETE(new Request("http://test", { method: "DELETE" }), tokenParams("nope"));
    expect(res.status).toBe(404);
  });
});
