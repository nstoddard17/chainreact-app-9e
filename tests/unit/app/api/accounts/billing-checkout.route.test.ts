/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts/[id]/billing/checkout (CS-3). Mocks supabase auth,
 * requireAccountRole, and the session service. Billing is live (no feature-flag gate).
 * Load-bearing: auth/role gates, strict body (client can't send a price id), the Pro happy
 * path (Personal Pro is live), service reason→HTTP mapping (incl. Stripe-not-configured 503),
 * happy path returns only { url } (no Stripe id leak).
 */

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
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockCreateCheckout.mockReset();
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

describe("Personal Pro (live — no flag gate)", () => {
  it("allows plan=pro → 200 { url }; plan↔type validity is enforced server-side", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: true, url: "https://stripe.test/pro" });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://stripe.test/pro");
    expect(mockCreateCheckout).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      requestedPlan: "pro",
      contactEmail: "m@x.test",
    });
  });

  it("a non-personal account buying pro is rejected by the service (invalid_plan_for_type → 400)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: false, reason: "invalid_plan_for_type" });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_PLAN_FOR_TYPE");
  });
});

describe("billing interval (PRICING-INTERVAL-1)", () => {
  it("passes a valid interval through to the service", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: true, url: "https://stripe.test/team-annual" });
    const res = await POST(req({ plan: "team", interval: "annual" }), params());
    expect(res.status).toBe(200);
    expect(mockCreateCheckout).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      requestedPlan: "team",
      interval: "annual",
      contactEmail: "m@x.test",
    });
  });

  it("400 on an invalid interval (fail closed, no service call)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    const res = await POST(req({ plan: "team", interval: "weekly" }), params());
    expect(res.status).toBe(400);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("omitted interval still calls the service (which defaults to monthly)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: true, url: "https://stripe.test/team" });
    const res = await POST(req({ plan: "team" }), params());
    expect(res.status).toBe(200);
    expect(mockCreateCheckout).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      requestedPlan: "team",
      interval: undefined,
      contactEmail: "m@x.test",
    });
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
    // BILLING-CHECKOUT-PROD-1 — configuration faults answer 503 (retrying cannot help)…
    ["stripe_price_invalid", 503, "STRIPE_PRICE_INVALID"],
    ["billing_attachment_invalid", 503, "BILLING_ATTACHMENT_INVALID"],
    // …and Stripe provider faults answer 502 (a retry is reasonable).
    ["stripe_customer_create_failed", 502, "STRIPE_CUSTOMER_CREATE_FAILED"],
    ["stripe_checkout_create_failed", 502, "STRIPE_CHECKOUT_CREATE_FAILED"],
    // A duplicate purchase of the plan the account already has is a conflict, not a fault.
    ["already_on_plan", 409, "ACCOUNT_ALREADY_ON_PAID_PLAN"],
  ] as const)("%s → %i", async (reason, status, code) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
});

describe("known billing faults are no longer an opaque 500 (BILLING-CHECKOUT-PROD-1)", () => {
  it("tells the user their account was not changed when billing is unavailable", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: false, reason: "stripe_not_configured" });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(
      "Billing checkout is temporarily unavailable. Your account was not changed. Please try again later.",
    );
  });

  it("invites a retry after a temporary Stripe failure", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({
      ok: false,
      reason: "stripe_checkout_create_failed",
    });
    const res = await POST(req({ plan: "pro" }), params());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(
      "Stripe could not start checkout right now. Your account was not changed. Please try again.",
    );
  });

  it.each([
    "stripe_not_configured",
    "price_not_configured",
    "stripe_price_invalid",
    "billing_attachment_invalid",
    "stripe_customer_create_failed",
    "stripe_checkout_create_failed",
  ] as const)("%s never names an env var, Stripe id, or internal detail", async (reason) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(req({ plan: "pro" }), params());
    const body = (await res.json()) as { error: string; code: string };
    // The MESSAGE is what the user reads — it must never name configuration or Stripe
    // internals. (`code` is the machine-readable contract and may say STRIPE_*.)
    expect(body.error).not.toMatch(/STRIPE_|PLATFORM_|NEXT_PUBLIC_/);
    expect(body.error).not.toMatch(/sk_|cus_|price_|sub_|cs_/);
    // Whatever the condition, the user is told their account is untouched.
    expect(body.error).toContain("Your account was not changed");
  });

  it("logs the unexpected error so an unclassified 500 is never silent again", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreateCheckout.mockRejectedValueOnce(new Error("db exploded"));

    const res = await POST(req({ plan: "pro" }), params());

    expect(res.status).toBe(500);
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("billing.checkout.unhandled");
    expect(logged).toContain(ACCOUNT);
    // The user still gets no internal detail.
    expect(JSON.stringify(await res.json())).not.toContain("db exploded");
    spy.mockRestore();
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
