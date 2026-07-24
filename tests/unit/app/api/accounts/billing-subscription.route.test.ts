/**
 * @jest-environment node
 *
 * Route tests for /api/accounts/[id]/billing/subscription
 * (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1). Mocks auth, the role gate, and the cancellation
 * service so the route's own contract is exercised in isolation.
 *
 * Proves: unauthenticated → 401; non-member → 403; an ADMIN may READ but may NOT cancel
 * (owner-only mutation — admin billing permissions are not silently expanded); the account
 * id always comes from the PATH so a caller can never target another account; every typed
 * failure maps to a sane status; and no Stripe id / secret / raw Stripe message ever appears
 * in a response.
 */

const mockRequireAuthedUserId = jest.fn();
const mockParseAccountBody = jest.fn();
jest.mock("@/app/api/account/_shared", () => ({
  requireAuthedUserId: (...a: unknown[]) => mockRequireAuthedUserId(...a),
  parseAccountBody: (...a: unknown[]) => mockParseAccountBody(...a),
}));

const mockRequireAccountRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireAccountRole(...a),
}));

const mockGetState = jest.fn();
const mockSchedule = jest.fn();
const mockResume = jest.fn();
jest.mock("@/services/billing/subscriptionCancellation", () => ({
  getAccountSubscriptionState: (...a: unknown[]) => mockGetState(...a),
  scheduleSubscriptionCancellation: (...a: unknown[]) => mockSchedule(...a),
  resumeSubscription: (...a: unknown[]) => mockResume(...a),
}));

import { GET, POST } from "@/app/api/accounts/[id]/billing/subscription/route";

const USER_ID = "user-1";
const ACCOUNT_ID = "acct-team";
const OTHER_ACCOUNT_ID = "acct-someone-else";
const SUB_ID = "sub_secret_should_never_leak";

function params(id = ACCOUNT_ID) {
  return { params: Promise.resolve({ id }) };
}

function req(body: unknown) {
  return new Request(
    `https://app.example.test/api/accounts/${ACCOUNT_ID}/billing/subscription`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

function state(over: Record<string, unknown> = {}) {
  return {
    plan: "team",
    planStatus: "active",
    hasSubscription: true,
    isCancelable: true,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    frozen: false,
    internalBilling: false,
    ...over,
  };
}

beforeEach(() => {
  mockRequireAuthedUserId.mockReset();
  mockParseAccountBody.mockReset();
  mockRequireAccountRole.mockReset();
  mockGetState.mockReset();
  mockSchedule.mockReset();
  mockResume.mockReset();

  mockRequireAuthedUserId.mockResolvedValue({ ok: true, userId: USER_ID, email: "u@e.test" });
  mockRequireAccountRole.mockResolvedValue({ ok: true, role: "owner" });
  mockGetState.mockResolvedValue({ ok: true, state: state() });
  mockSchedule.mockResolvedValue({
    ok: true,
    cancelAtPeriodEnd: true,
    effectiveAt: "2026-08-01T00:00:00.000Z",
    alreadyInState: false,
  });
  mockResume.mockResolvedValue({
    ok: true,
    cancelAtPeriodEnd: false,
    effectiveAt: null,
    alreadyInState: false,
  });
  mockParseAccountBody.mockImplementation(async (request: Request) => {
    const raw = (await request.json()) as { action?: unknown };
    if (raw.action !== "cancel" && raw.action !== "resume") {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Invalid" }), { status: 400 }),
      };
    }
    return { ok: true, data: { action: raw.action } };
  });
});

describe("GET", () => {
  it("returns the safe state with canManage=true for the owner", async () => {
    const res = await GET(new Request("https://x.test"), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ plan: "team", isCancelable: true, canManage: true });
    expect(mockGetState).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it("returns canManage=false for an ADMIN — they can see billing, not change it", async () => {
    mockRequireAccountRole.mockResolvedValue({ ok: true, role: "admin" });
    const res = await GET(new Request("https://x.test"), params());
    expect(res.status).toBe(200);
    expect((await res.json()).canManage).toBe(false);
  });

  it("401s an unauthenticated caller before any service call", async () => {
    mockRequireAuthedUserId.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const res = await GET(new Request("https://x.test"), params());
    expect(res.status).toBe(401);
    expect(mockGetState).not.toHaveBeenCalled();
  });

  it("403s a non-member", async () => {
    mockRequireAccountRole.mockResolvedValue({ ok: false, reason: "not_member" });
    const res = await GET(new Request("https://x.test"), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(mockGetState).not.toHaveBeenCalled();
  });

  it("404s an unknown account", async () => {
    mockGetState.mockResolvedValue({ ok: false, reason: "account_not_found" });
    const res = await GET(new Request("https://x.test"), params());
    expect(res.status).toBe(404);
  });

  it("gates on the account from the PATH, not on any caller-supplied default", async () => {
    await GET(new Request("https://x.test"), params(OTHER_ACCOUNT_ID));
    expect(mockRequireAccountRole).toHaveBeenCalledWith(
      USER_ID,
      OTHER_ACCOUNT_ID,
      expect.arrayContaining(["owner"]),
    );
    expect(mockGetState).toHaveBeenCalledWith(OTHER_ACCOUNT_ID);
  });
});

describe("POST", () => {
  it("schedules cancellation for the owner and returns the effective date", async () => {
    const res = await POST(req({ action: "cancel" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      cancelAtPeriodEnd: true,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      alreadyInState: false,
    });
    expect(mockSchedule).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("resumes for the owner", async () => {
    const res = await POST(req({ action: "resume" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).cancelAtPeriodEnd).toBe(false);
    expect(mockResume).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("is OWNER-ONLY: the role gate never admits an admin for the mutation", async () => {
    await POST(req({ action: "cancel" }), params());
    expect(mockRequireAccountRole).toHaveBeenCalledWith(USER_ID, ACCOUNT_ID, ["owner"]);
  });

  it("403s a non-owner (admin) with an owner-only message, touching no service", async () => {
    mockRequireAccountRole.mockResolvedValue({ ok: false, reason: "forbidden" });
    const res = await POST(req({ action: "cancel" }), params());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
    expect(body.error).toMatch(/owner/i);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller before the role gate", async () => {
    mockRequireAuthedUserId.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const res = await POST(req({ action: "cancel" }), params());
    expect(res.status).toBe(401);
    expect(mockRequireAccountRole).not.toHaveBeenCalled();
  });

  it("400s an unknown action", async () => {
    const res = await POST(req({ action: "explode" }), params());
    expect(res.status).toBe(400);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("reports idempotent repeats honestly via alreadyInState", async () => {
    mockSchedule.mockResolvedValue({
      ok: true,
      cancelAtPeriodEnd: true,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      alreadyInState: true,
    });
    const res = await POST(req({ action: "cancel" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyInState).toBe(true);
  });

  it.each([
    ["account_not_found", 404, "NOT_FOUND"],
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["internal_account", 409, "INTERNAL_BILLING_ACCOUNT"],
    ["no_subscription", 409, "NO_SUBSCRIPTION"],
    ["subscription_already_ended", 409, "SUBSCRIPTION_ALREADY_ENDED"],
    ["stripe_not_configured", 503, "PLATFORM_BILLING_NOT_CONFIGURED"],
  ])("maps %s → %i %s", async (reason, status, code) => {
    mockSchedule.mockResolvedValue({ ok: false, reason });
    const res = await POST(req({ action: "cancel" }), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it("502s on an unexpected Stripe throw WITHOUT leaking the Stripe message", async () => {
    mockSchedule.mockRejectedValue(
      new Error(`Platform Stripe POST /v1/subscriptions/${SUB_ID} failed: nope`),
    );
    const res = await POST(req({ action: "cancel" }), params());
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SUB_ID);
    expect(text).toContain("SUBSCRIPTION_UPDATE_FAILED");
  });

  it("never surfaces a Stripe id in a successful response", async () => {
    const res = await POST(req({ action: "cancel" }), params());
    expect(JSON.stringify(await res.json())).not.toMatch(/sub_|cus_|sk_/);
  });
});
