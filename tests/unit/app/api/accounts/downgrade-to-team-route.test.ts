/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-5 / CS-BD-3 — POST /api/accounts/[id]/billing/
 * downgrade-to-team. Mocks supabase auth + the account role gate + the flag + the CS-BD-1
 * orchestration. Proves: flag-off 404; auth 401; OWNER-only (admin/member/non-member denied);
 * delegates to downgradeBusinessToTeam with the actor; typed reason → HTTP mapping; safe result
 * only (no Stripe ids).
 */

const mockFlag = jest.fn();
jest.mock("@/services/billing/billingFeatureFlags", () => ({
  isBusinessDowngradeEnabled: () => mockFlag(),
}));

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockDowngrade = jest.fn();
jest.mock("@/services/billing/businessDowngrade", () => ({
  downgradeBusinessToTeam: (...a: unknown[]) => mockDowngrade(...a),
}));

import { POST } from "@/app/api/accounts/[id]/billing/downgrade-to-team/route";

const ACCOUNT = "acct-org-1";
const OWNER = "user-owner";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function req() {
  return new Request("http://x/api/accounts/acct/billing/downgrade-to-team", { method: "POST" });
}
function authed() {
  mockGetUser.mockResolvedValue({ data: { user: { id: OWNER, email: "o@x.test" } }, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  authed();
  mockRequireRole.mockResolvedValue({ ok: true, role: "owner" });
  mockDowngrade.mockResolvedValue({ ok: true, alreadyTeam: false, removedMembers: 3, flattenedFolders: 2 });
});

it("404 when ENABLE_BUSINESS_DOWNGRADE is OFF — no auth/role/service call", async () => {
  mockFlag.mockReturnValue(false);
  const res = await POST(req(), params());
  expect(res.status).toBe(404);
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRequireRole).not.toHaveBeenCalled();
  expect(mockDowngrade).not.toHaveBeenCalled();
});

it("401 when unauthenticated", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  const res = await POST(req(), params());
  expect(res.status).toBe(401);
  expect(mockDowngrade).not.toHaveBeenCalled();
});

it("403 NOT_ACCOUNT_MEMBER for a non-member — no service call", async () => {
  mockRequireRole.mockResolvedValue({ ok: false, reason: "not_member" });
  const res = await POST(req(), params());
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  expect(mockDowngrade).not.toHaveBeenCalled();
});

it("403 FORBIDDEN for an admin/member (owner-only) — no service call", async () => {
  mockRequireRole.mockResolvedValue({ ok: false, reason: "forbidden" });
  const res = await POST(req(), params());
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe("FORBIDDEN");
  expect(mockDowngrade).not.toHaveBeenCalled();
  // gate asked for owner only
  expect(mockRequireRole).toHaveBeenCalledWith(OWNER, ACCOUNT, ["owner"]);
});

it("owner triggers the downgrade — delegates to the orchestration with the actor, returns counts", async () => {
  const res = await POST(req(), params());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ ok: true, alreadyTeam: false, removedMembers: 3, flattenedFolders: 2 });
  expect(mockDowngrade).toHaveBeenCalledWith({ accountId: ACCOUNT, actorUserId: OWNER });
  // no Stripe id leaks
  expect(JSON.stringify(body)).not.toMatch(/cus_|sub_/);
});

it("maps not_business → 400, account_frozen → 403, flip_failed → 500", async () => {
  mockDowngrade.mockResolvedValueOnce({ ok: false, reason: "not_business" });
  expect((await POST(req(), params())).status).toBe(400);
  mockDowngrade.mockResolvedValueOnce({ ok: false, reason: "account_frozen" });
  expect((await POST(req(), params())).status).toBe(403);
  mockDowngrade.mockResolvedValueOnce({ ok: false, reason: "flip_failed" });
  const res = await POST(req(), params());
  expect(res.status).toBe(500);
  expect((await res.json()).code).toBe("DOWNGRADE_FAILED");
});

it("500 (generic) when the orchestration throws — no detail leaked", async () => {
  mockDowngrade.mockRejectedValueOnce(new Error("offboarding boom secret"));
  const res = await POST(req(), params());
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body.code).toBe("DOWNGRADE_FAILED");
  expect(JSON.stringify(body)).not.toMatch(/boom secret/);
});
