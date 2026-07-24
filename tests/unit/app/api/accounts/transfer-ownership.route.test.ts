/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts/[id]/transfer-ownership (TL-2). Mocks the
 * supabase server client (auth), requireAccountRole, the step-up re-auth, and the
 * transferOwnership service. Real `parseAccountBody` runs against the real body.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockVerifyReauth = jest.fn();
jest.mock("@/services/accounts/accountDeletionReauth", () => ({
  verifyPasswordReauth: (...a: unknown[]) => mockVerifyReauth(...a),
}));

const mockTransfer = jest.fn();
jest.mock("@/services/accounts/transferOwnership", () => ({
  transferOwnership: (...a: unknown[]) => mockTransfer(...a),
}));

import { POST } from "@/app/api/accounts/[id]/transfer-ownership/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";
const TARGET = "33333333-3333-3333-3333-333333333333";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function req(body: unknown) {
  return new Request("https://x/api/accounts/acct/transfer-ownership", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function signedIn(email = "owner@example.test") {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email } }, error: null });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockVerifyReauth.mockReset().mockResolvedValue({ ok: true });
  mockTransfer.mockReset();
});

describe("POST /api/accounts/[id]/transfer-ownership", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ targetUserId: TARGET, password: "pw" }), params());
    expect(res.status).toBe(401);
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("400 on an invalid body (missing targetUserId)", async () => {
    signedIn();
    const res = await POST(req({ password: "pw" }), params());
    expect(res.status).toBe(400);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("403 NOT_OWNER when the caller is an admin/member (role gate 'forbidden')", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await POST(req({ targetUserId: TARGET, password: "pw" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_OWNER");
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("403 NOT_ACCOUNT_MEMBER when the caller is not a member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await POST(req({ targetUserId: TARGET, password: "pw" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });

  it("401 REAUTH_FAILED on a wrong/absent step-up password — service never runs", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockVerifyReauth.mockResolvedValueOnce({ ok: false, reason: "invalid_credentials" });
    const res = await POST(req({ targetUserId: TARGET, password: "wrong" }), params());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("REAUTH_FAILED");
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("200 on the happy path: owner role gate + step-up, calls the service, returns a safe summary", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockTransfer.mockResolvedValueOnce({
      ok: true,
      account: { id: ACCOUNT, name: "Team", type: "team", ownerUserId: TARGET },
      previousOwnerUserId: CALLER,
      newOwnerUserId: TARGET,
    });
    const res = await POST(req({ targetUserId: TARGET, password: "pw" }), params());
    expect(res.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith(CALLER, ACCOUNT, ["owner"]);
    expect(mockVerifyReauth).toHaveBeenCalledWith("owner@example.test", "pw");
    expect(mockTransfer).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      callerUserId: CALLER,
      targetUserId: TARGET,
    });
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      account: { id: ACCOUNT, name: "Team", type: "team", ownerUserId: TARGET },
      transfer: {
        previousOwnerUserId: CALLER,
        previousOwnerRole: "admin",
        newOwnerUserId: TARGET,
        newOwnerRole: "owner",
      },
    });
    // No PII leaks into the summary.
    expect(JSON.stringify(body)).not.toMatch(/@|email/i);
  });

  it.each([
    ["personal_account", 400, "PERSONAL_ACCOUNT_UNSUPPORTED"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["target_not_member", 404, "TARGET_NOT_MEMBER"],
    ["target_is_owner", 400, "TARGET_ALREADY_OWNER"],
    ["account_not_found", 404, "ACCOUNT_NOT_FOUND"],
    ["not_owner", 403, "NOT_OWNER"],
    ["transfer_failed", 500, "TRANSFER_FAILED"],
  ])("maps service reason %s → %i %s", async (reason, status, code) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockTransfer.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(req({ targetUserId: TARGET, password: "pw" }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-3 — the recipient-eligibility refusal projected into HTTP.
 *
 * The guard itself lives in the SERVICE (the only path that can make another user an owner);
 * the route's job is to turn the typed reason into something the initiating owner can act on
 * without learning another user's private account lifecycle.
 */
describe("POST — recipient unavailable (ACCOUNT-BILLING-LIFECYCLE-3)", () => {
  it("409s with TARGET_UNAVAILABLE and actionable copy", async () => {
    signedIn();
    mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
    mockVerifyReauth.mockResolvedValue({ ok: true });
    mockTransfer.mockResolvedValueOnce({
      ok: false,
      reason: "target_unavailable",
    });

    const res = await POST(req({ targetUserId: TARGET, password: "pw" }), params());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("TARGET_UNAVAILABLE");
    // Actionable: tells the owner what to do instead.
    expect(body.error).toMatch(/choose a different member/i);
  });

  it("discloses NOTHING about the recipient's account lifecycle", async () => {
    signedIn();
    mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
    mockVerifyReauth.mockResolvedValue({ ok: true });
    mockTransfer.mockResolvedValueOnce({
      ok: false,
      reason: "target_unavailable",
    });

    const body = await (await POST(req({ targetUserId: TARGET, password: "pw" }), params())).json();
    const text = JSON.stringify(body);

    // Never reveals that the other user is deleting their account, nor when, nor any id.
    expect(text).not.toMatch(/deleting|deletion|pending|frozen|purge|grace/i);
    expect(text).not.toContain(TARGET);
  });

  it("the route does NOT re-implement the eligibility check", async () => {
    // A second copy in the route would drift from the service and could be bypassed by any
    // non-route caller — the exact failure mode this slice removed from the deletion path.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "app/api/accounts/[id]/transfer-ownership/route.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/getPersonalAccountForUserServiceRole|deletionStatus/);
  });
});
