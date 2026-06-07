/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts/[id]/billing/checkout (CS-3). Mocks supabase auth,
 * requireAccountRole, the platform-billing flag, and the session service. Load-bearing:
 * flag-off 404, auth/role gates, strict body (client can't send a price id), service
 * reason→HTTP mapping, happy path returns only { url } (no Stripe id leak).
 */

const mockIsFlagOn = jest.fn();
jest.mock("@/services/billing/billingFeatureFlags", () => ({
  isPlatformBillingEnabled: () => mockIsFlagOn(),
}));

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockCreateCheckout = jest.fn();
jest.mock("@/services/billing/platformBillingSessions", () => ({
  createCheckoutSession: (...a: unknown[]) => mockCreateCheckout(...a),
}));

import { POST } from "@/app/api/accounts/[id]/billing/checkout/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}
function req(body: unknown) {
  return new Request("https://x/api/accounts/acct/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockIsFlagOn.mockReset();
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockCreateCheckout.mockReset();
  mockIsFlagOn.mockReturnValue(true); // default ON; flag-off test overrides
});

describe("feature flag", () => {
  it("404 when ENABLE_PLATFORM_BILLING is OFF — no auth, role, or service call", async () => {
    mockIsFlagOn.mockReturnValue(false);
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(404);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
});

describe("auth + role gates", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(401);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member (no leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("403 FORBIDDEN for a plain member (owner/admin only)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
});

describe("body validation (client cannot choose a price)", () => {
  it("400 on an invalid plan value", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    const res = await POST(req({ plan: "enterprise" }), params());
    expect(res.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("400 on unknown keys (strict — no client priceId/customer/plan_status)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    const res = await POST(req({ plan: "pro", priceId: "price_evil", customer: "cus_evil" }), params());
    expect(res.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
});

describe("service reason → HTTP mapping", () => {
  it.each([
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["invalid_plan_for_type", 400, "INVALID_PLAN_FOR_TYPE"],
    ["plan_not_purchasable", 400, "PLAN_NOT_PURCHASABLE"],
    ["price_not_configured", 503, "PRICE_NOT_CONFIGURED"],
    ["stripe_not_configured", 503, "PLATFORM_BILLING_NOT_CONFIGURED"],
    ["account_not_found", 404, "NOT_FOUND"],
  ] as const)("%s → %i", async (reason, status, code) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
});

describe("happy path", () => {
  it("owner gets 200 { url } and the service receives the server-side email + plan", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: true, url: "https://stripe.test/checkout" });
    const res = await POST(req({ plan: "team" }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://stripe.test/checkout");
    // no Stripe id leaked, only the session url.
    expect(JSON.stringify(body)).not.toContain("cus_");
    expect(JSON.stringify(body)).not.toContain("sub_");
    expect(mockCreateCheckout).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      requestedPlan: "team",
      contactEmail: "m@x.test",
    });
  });

  it("owner/admin Team can start a Business checkout (plan='business' accepted) → 200 { url }", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: true, url: "https://stripe.test/biz" });
    const res = await POST(req({ plan: "business" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://stripe.test/biz");
    expect(mockCreateCheckout).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      requestedPlan: "business",
      contactEmail: "m@x.test",
    });
  });

  it("500 (generic) when the service throws — no detail leaked", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockRejectedValueOnce(new Error("stripe boom sk_secret"));
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("CHECKOUT_FAILED");
    expect(JSON.stringify(body)).not.toContain("sk_secret");
  });
});
