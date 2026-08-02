/** @jest-environment node */
import { NextRequest } from "next/server";

/**
 * MOBILE-COMPANION-M1 — the bearer gate's full authentication matrix, driven
 * through the REAL session route.
 *
 * Deliberately does NOT mock `@/utils/supabase/server`: if any mobile code
 * path ever consulted the cookie client, this suite would crash on
 * `next/headers` outside a request scope — the same guard the public
 * `/api/v1` trigger tests use to prove sessionlessness.
 */
import { GET as sessionGet } from "@/app/api/mobile/v1/session/route";

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(),
}));
jest.mock("@/repositories/mcpRateLimits", () => ({
  incrementMcpRateLimitWindowsServiceRole: jest.fn().mockResolvedValue({ token: 1, account: 1 }),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  listByUserServiceRole: jest.fn().mockResolvedValue([]),
  getRoleServiceRole: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/repositories/accounts", () => ({
  listByIdsServiceRole: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/repositories/userProfiles", () => ({
  getActiveAccountIdServiceRole: jest.fn().mockResolvedValue(null),
}));

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { incrementMcpRateLimitWindowsServiceRole } from "@/repositories/mcpRateLimits";

const getUserMock = jest.fn();
(getServiceRoleClient as jest.Mock).mockReturnValue({
  auth: { getUser: getUserMock },
});

const VALID_USER = { data: { user: { id: "00000000-0000-4000-8000-000000000001", email: "u@example.test" } }, error: null };
const REJECTED = { data: { user: null }, error: { message: "invalid JWT" } };

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/mobile/v1/session", { headers });
}

describe("mobile v1 gate — feature flag", () => {
  const flag = "ENABLE_MOBILE_API";
  const original = process.env[flag];
  afterEach(() => {
    if (original === undefined) delete process.env[flag];
    else process.env[flag] = original;
    jest.clearAllMocks();
    getUserMock.mockReset();
  });

  it.each([
    ["missing", undefined],
    ["explicit false", "false"],
    ["malformed TRUE", "TRUE"],
    ["malformed 1", "1"],
    ["empty string", ""],
  ])("namespace disabled when the flag is %s → bare no-leak 404", async (_label, value) => {
    if (value === undefined) delete process.env[flag];
    else process.env[flag] = value;
    const res = await sessionGet(req({ authorization: "Bearer some-token" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found." });
    // Nothing hidden is revealed and no verification was even attempted.
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

describe("mobile v1 gate — bearer authentication matrix (flag on)", () => {
  const flag = "ENABLE_MOBILE_API";
  const original = process.env[flag];
  beforeEach(() => {
    process.env[flag] = "true";
    jest.clearAllMocks();
    getUserMock.mockReset();
    (incrementMcpRateLimitWindowsServiceRole as jest.Mock).mockResolvedValue({ token: 1, account: 1 });
  });
  afterAll(() => {
    if (original === undefined) delete process.env[flag];
    else process.env[flag] = original;
  });

  it("verified Supabase user bearer → 200", async () => {
    getUserMock.mockResolvedValue(VALID_USER);
    const res = await sessionGet(req({ authorization: "Bearer valid-user-jwt" }));
    expect(res.status).toBe(200);
    expect(getUserMock).toHaveBeenCalledWith("valid-user-jwt");
  });

  it.each([
    ["missing header", {}],
    ["empty token", { authorization: "Bearer " }],
    ["malformed scheme", { authorization: "Token abc" }],
    ["basic scheme", { authorization: "Basic dXNlcjpwYXNz" }],
    ["bare token no scheme", { authorization: "just-a-token" }],
    ["duplicate authorization headers (comma-joined)", { authorization: "Bearer one, Bearer two" }],
    ["cookie only, no bearer", { cookie: "sb-access-token=valid-looking-cookie-value" }],
  ])("%s → stable 401, Supabase never consulted", async (_label, headers) => {
    const res = await sessionGet(req(headers as Record<string, string>));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated.", code: "UNAUTHENTICATED" });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it.each([
    ["customer API key", "crk_" + "a".repeat(30)],
    ["customer MCP token", "crmcp_" + "b".repeat(30)],
  ])("%s → 401 WITHOUT ever reaching Supabase Auth", async (_label, token) => {
    const res = await sessionGet(req({ authorization: `Bearer ${token}` }));
    expect(res.status).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("cron-style shared secret → 401 (fails verification; no fallback path)", async () => {
    getUserMock.mockResolvedValue(REJECTED);
    const res = await sessionGet(req({ authorization: "Bearer some-cron-shared-secret-value" }));
    expect(res.status).toBe(401);
  });

  it("invalid bearer + valid-looking cookie → 401 (no cookie fallback)", async () => {
    getUserMock.mockResolvedValue(REJECTED);
    const res = await sessionGet(
      req({
        authorization: "Bearer expired-or-revoked",
        cookie: "sb-access-token=valid-looking-cookie-value",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("verification throw → 401 with no internals echoed", async () => {
    getUserMock.mockRejectedValue(new Error("network to auth.internal.host:443 failed"));
    const res = await sessionGet(req({ authorization: "Bearer whatever" }));
    expect(res.status).toBe(401);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("auth.internal.host");
    expect(text).not.toContain("whatever");
  });

  it("401 bodies never echo the presented token", async () => {
    getUserMock.mockResolvedValue(REJECTED);
    const token = "SECRET-BEARER-TOKEN-VALUE-12345";
    const res = await sessionGet(req({ authorization: `Bearer ${token}` }));
    expect(JSON.stringify(await res.json())).not.toContain(token);
  });

  it("rate limit exceeded → stable 429 with Retry-After", async () => {
    getUserMock.mockResolvedValue(VALID_USER);
    (incrementMcpRateLimitWindowsServiceRole as jest.Mock).mockResolvedValue({ token: 1000, account: 1 });
    const res = await sessionGet(req({ authorization: "Bearer valid-user-jwt" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await res.json()).toEqual({
      error: "Too many requests. Please retry shortly.",
      code: "RATE_LIMITED",
    });
  });

  it("device-id rotation cannot bypass the user bucket (429 persists across device ids)", async () => {
    getUserMock.mockResolvedValue(VALID_USER);
    (incrementMcpRateLimitWindowsServiceRole as jest.Mock).mockResolvedValue({ token: 1000, account: 1 });
    for (const device of ["device-rotation-1", "device-rotation-2"]) {
      const res = await sessionGet(
        req({ authorization: "Bearer valid-user-jwt", "x-chainreact-device": device }),
      );
      expect(res.status).toBe(429);
    }
  });
});
