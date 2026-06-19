/**
 * @jest-environment node
 *
 * Route tests for /api/accounts/[id]/billing/personal (PPT-1). Mocks auth, role, and the
 * personalPlan service. Billing is live (no feature-flag gate). Load-bearing: auth/role
 * gates, personal-only, no Stripe id leak, body validation, reason→HTTP mapping.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockGetState = jest.fn();
const mockSetCancel = jest.fn();
jest.mock("@/services/billing/personalPlan", () => ({
  getPersonalPlanState: (...a: unknown[]) => mockGetState(...a),
  setPersonalCancelAtPeriodEnd: (...a: unknown[]) => mockSetCancel(...a),
}));

import { GET, POST } from "@/app/api/accounts/[id]/billing/personal/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}
function getReq() {
  return new Request("https://x/api/accounts/acct/billing/personal");
}
function postReq(body: unknown) {
  return new Request("https://x/api/accounts/acct/billing/personal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockGetState.mockReset();
  mockSetCancel.mockReset();
});

describe("GET (read state)", () => {
  it("401 unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await GET(getReq(), params())).status).toBe(401);
  });

  it("403 for a non-member / plain member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    expect((await GET(getReq(), params())).status).toBe(403);
  });

  it("returns the safe state (no Stripe ids) for owner/admin", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockGetState.mockResolvedValueOnce({
      ok: true,
      state: {
        isPaidPersonalPro: true,
        plan: "pro",
        planStatus: "active",
        currentPeriodEnd: "2026-07-01T00:00:00Z",
        cancelAtPeriodEnd: false,
        downgrade: { allowed: true, blockers: [] },
      },
    });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isPaidPersonalPro).toBe(true);
    expect(body.downgrade.allowed).toBe(true);
    expect(JSON.stringify(body)).not.toContain("cus_");
    expect(JSON.stringify(body)).not.toContain("sub_");
  });

  it("400 NOT_PERSONAL_ACCOUNT for a non-personal account", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockGetState.mockResolvedValueOnce({ ok: false, reason: "not_personal" });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NOT_PERSONAL_ACCOUNT");
  });
});

describe("POST (set cancel at period end)", () => {
  it("403 for a plain member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    expect((await POST(postReq({ cancelAtPeriodEnd: true }), params())).status).toBe(403);
    expect(mockSetCancel).not.toHaveBeenCalled();
  });

  it("400 on a non-boolean / unknown-key body (strict)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    expect((await POST(postReq({ cancelAtPeriodEnd: "yes" }), params())).status).toBe(400);
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    expect((await POST(postReq({ cancelAtPeriodEnd: true, evil: 1 }), params())).status).toBe(400);
    expect(mockSetCancel).not.toHaveBeenCalled();
  });

  it("200 { cancelAtPeriodEnd } on success", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockSetCancel.mockResolvedValueOnce({ ok: true, cancelAtPeriodEnd: true });
    const res = await POST(postReq({ cancelAtPeriodEnd: true }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).cancelAtPeriodEnd).toBe(true);
    expect(mockSetCancel).toHaveBeenCalledWith(ACCOUNT, true);
  });

  it.each([
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["no_subscription", 409, "NO_SUBSCRIPTION"],
    ["stripe_not_configured", 503, "PLATFORM_BILLING_NOT_CONFIGURED"],
    ["not_personal", 400, "NOT_PERSONAL_ACCOUNT"],
    ["account_not_found", 404, "NOT_FOUND"],
  ] as const)("%s → %i", async (reason, status, code) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockSetCancel.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(postReq({ cancelAtPeriodEnd: true }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it("500 (generic) when the service throws — no detail leaked", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockSetCancel.mockRejectedValueOnce(new Error("boom whsec_x"));
    const res = await POST(postReq({ cancelAtPeriodEnd: true }), params());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("whsec_x");
  });
});
