/**
 * @jest-environment node
 *
 * Route tests for POST /api/accounts/[id]/billing/portal (CS-3). Mocks supabase auth,
 * requireAccountRole, and the session service. Billing is live (no feature-flag gate).
 * Load-bearing: auth/role gates, no_customer→409, reason→HTTP mapping, happy { url }.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockRequireRole = jest.fn();
jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: (...a: unknown[]) => mockRequireRole(...a),
}));

const mockCreatePortal = jest.fn();
jest.mock("@/services/billing/platformBillingSessions", () => ({
  createPortalSession: (...a: unknown[]) => mockCreatePortal(...a),
}));

import { POST } from "@/app/api/accounts/[id]/billing/portal/route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const CALLER = "22222222-2222-2222-2222-222222222222";

function params() {
  return { params: Promise.resolve({ id: ACCOUNT }) };
}
function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: CALLER, email: "m@x.test" } }, error: null });
}
function req() {
  return new Request("https://x/api/accounts/acct/billing/portal", { method: "POST" });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRequireRole.mockReset();
  mockCreatePortal.mockReset();
});

describe("auth + role gates", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req(), params());
    expect(res.status).toBe(401);
    expect(mockCreatePortal).not.toHaveBeenCalled();
  });

  it("403 NOT_ACCOUNT_MEMBER for a non-member (no leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
  });

  it("403 FORBIDDEN for a plain member", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(mockCreatePortal).not.toHaveBeenCalled();
  });
});

describe("service reason → HTTP mapping", () => {
  it.each([
    ["account_frozen", 403, "ACCOUNT_PENDING_DELETION"],
    ["no_customer", 409, "NO_BILLING_CUSTOMER"],
    ["stripe_not_configured", 503, "PLATFORM_BILLING_NOT_CONFIGURED"],
    ["account_not_found", 404, "NOT_FOUND"],
  ] as const)("%s → %i", async (reason, status, code) => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    mockCreatePortal.mockResolvedValueOnce({ ok: false, reason });
    const res = await POST(req(), params());
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });
});

describe("happy path", () => {
  it("owner/admin gets 200 { url } and only the url (no Stripe id leak)", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreatePortal.mockResolvedValueOnce({ ok: true, url: "https://stripe.test/portal" });
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://stripe.test/portal");
    expect(JSON.stringify(body)).not.toContain("cus_");
    expect(mockCreatePortal).toHaveBeenCalledWith({ accountId: ACCOUNT });
  });

  it("500 (generic) when the service throws", async () => {
    signedIn();
    mockRequireRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    mockCreatePortal.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req(), params());
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("PORTAL_FAILED");
  });
});
