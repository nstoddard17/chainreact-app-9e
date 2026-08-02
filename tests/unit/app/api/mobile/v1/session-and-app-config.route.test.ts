/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET as sessionGet } from "@/app/api/mobile/v1/session/route";
import { GET as appConfigGet } from "@/app/api/mobile/v1/app-config/route";

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(),
}));
jest.mock("@/repositories/mcpRateLimits", () => ({
  incrementMcpRateLimitWindowsServiceRole: jest.fn().mockResolvedValue({ token: 1, account: 1 }),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  listByUserServiceRole: jest.fn(),
  getRoleServiceRole: jest.fn(),
}));
jest.mock("@/repositories/accounts", () => ({
  listByIdsServiceRole: jest.fn(),
}));
jest.mock("@/repositories/userProfiles", () => ({
  getActiveAccountIdServiceRole: jest.fn(),
}));

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { incrementMcpRateLimitWindowsServiceRole } from "@/repositories/mcpRateLimits";
import {
  listByUserServiceRole,
} from "@/repositories/accountMemberships";
import { listByIdsServiceRole } from "@/repositories/accounts";
import { getActiveAccountIdServiceRole } from "@/repositories/userProfiles";

const getUserMock = jest.fn();
(getServiceRoleClient as jest.Mock).mockReturnValue({ auth: { getUser: getUserMock } });

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PERSONAL = "00000000-0000-4000-8000-0000000000a1";
const TEAM = "00000000-0000-4000-8000-0000000000a2";
const ORG = "00000000-0000-4000-8000-0000000000a3";

function authedReq(path = "session"): NextRequest {
  return new NextRequest(`http://localhost/api/mobile/v1/${path}`, {
    headers: { authorization: "Bearer valid-user-jwt" },
  });
}

beforeEach(() => {
  process.env.ENABLE_MOBILE_API = "true";
  jest.clearAllMocks();
  (incrementMcpRateLimitWindowsServiceRole as jest.Mock).mockResolvedValue({ token: 1, account: 1 });
  getUserMock.mockResolvedValue({
    data: { user: { id: USER_ID, email: "fixture-user@example.test" } },
    error: null,
  });
});
afterAll(() => {
  delete process.env.ENABLE_MOBILE_API;
});

describe("GET /api/mobile/v1/session", () => {
  it("returns every account type with roles, frozen state, and SERVER capability booleans", async () => {
    (listByUserServiceRole as jest.Mock).mockResolvedValue([
      { accountId: PERSONAL, userId: USER_ID, role: "owner" },
      { accountId: TEAM, userId: USER_ID, role: "member" },
      { accountId: ORG, userId: USER_ID, role: "admin" },
    ]);
    (listByIdsServiceRole as jest.Mock).mockResolvedValue([
      { id: PERSONAL, name: "Example Person", type: "personal", deletionStatus: "active" },
      { id: TEAM, name: "Example Team", type: "team", deletionStatus: "active" },
      { id: ORG, name: "Example Org", type: "organization", deletionStatus: "pending_deletion" },
    ]);
    (getActiveAccountIdServiceRole as jest.Mock).mockResolvedValue(TEAM);

    const res = await sessionGet(authedReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(USER_ID);
    expect(body.accounts).toHaveLength(3);
    const byId = new Map(body.accounts.map((a: { id: string }) => [a.id, a]));
    expect(byId.get(PERSONAL)).toMatchObject({
      type: "personal",
      role: "owner",
      isFrozen: false,
      capabilities: { canManageAccount: true },
    });
    expect(byId.get(TEAM)).toMatchObject({
      role: "member",
      capabilities: { canManageAccount: false },
    });
    expect(byId.get(ORG)).toMatchObject({
      role: "admin",
      isFrozen: true,
      capabilities: { canManageAccount: true },
    });
    // Stored web pointer honored as the SUGGESTION (it names a listed, unfrozen account).
    expect(body.defaultAccountId).toBe(TEAM);
  });

  it("suggests personal when the stored pointer names a frozen/unlisted account — and never writes anything", async () => {
    (listByUserServiceRole as jest.Mock).mockResolvedValue([
      { accountId: PERSONAL, userId: USER_ID, role: "owner" },
    ]);
    (listByIdsServiceRole as jest.Mock).mockResolvedValue([
      { id: PERSONAL, name: "Example Person", type: "personal", deletionStatus: "active" },
    ]);
    (getActiveAccountIdServiceRole as jest.Mock).mockResolvedValue(TEAM);
    const res = await sessionGet(authedReq());
    const body = await res.json();
    expect(body.defaultAccountId).toBe(PERSONAL);
    // The userProfiles mock exposes ONLY the read — a write would have thrown,
    // and none of the mocked modules exposes a setter to call.
  });

  it("leaks no auth metadata, tokens, or membership provenance", async () => {
    (listByUserServiceRole as jest.Mock).mockResolvedValue([
      {
        accountId: PERSONAL,
        userId: USER_ID,
        role: "owner",
        invitedByUserId: "SECRET-INVITER-ID",
        joinedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    (listByIdsServiceRole as jest.Mock).mockResolvedValue([
      {
        id: PERSONAL,
        name: "Example Person",
        type: "personal",
        deletionStatus: "active",
        ownerUserId: "SECRET-OWNER-ID",
      },
    ]);
    (getActiveAccountIdServiceRole as jest.Mock).mockResolvedValue(null);
    const res = await sessionGet(authedReq());
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("SECRET-INVITER-ID");
    expect(text).not.toContain("SECRET-OWNER-ID");
    expect(text).not.toContain("valid-user-jwt");
    expect(text).not.toContain("joinedAt");
  });
});

describe("GET /api/mobile/v1/app-config", () => {
  it("is public (no bearer), allow-listed values only, with bounded cache headers", async () => {
    const res = await appConfigGet(new NextRequest("http://localhost/api/mobile/v1/app-config"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "apiVersion",
      "contractsSchemaVersion",
      "forceUpdate",
      "latestVersion",
      "maintenance",
      "minSupportedVersion",
    ]);
    expect(body.apiVersion).toBe("v1");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, must-revalidate");
    // Nothing environment-shaped can appear.
    const text = JSON.stringify(body);
    for (const marker of ["supabase", "SUPABASE", "vercel", "VERCEL", "http", "v2-dev", "ENABLE_"]) {
      expect(text).not.toContain(marker);
    }
  });

  it("flag off → the SAME bare 404 as the rest of the namespace (no safer exception)", async () => {
    delete process.env.ENABLE_MOBILE_API;
    const res = await appConfigGet(new NextRequest("http://localhost/api/mobile/v1/app-config"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found." });
  });

  it("public per-IP limit → 429 with Retry-After", async () => {
    (incrementMcpRateLimitWindowsServiceRole as jest.Mock).mockResolvedValue({ token: 1000, account: 1 });
    const res = await appConfigGet(
      new NextRequest("http://localhost/api/mobile/v1/app-config", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
