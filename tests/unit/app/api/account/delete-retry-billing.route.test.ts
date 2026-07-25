/**
 * @jest-environment node
 *
 * Route tests for POST /api/account/delete/retry-billing
 * (ACCOUNT-BILLING-LIFECYCLE-1; extracted in ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * The billing retry exists so recovering from OUR Stripe failure does not demand
 * a fresh emailed verification code. The safety property that makes that sound is
 * what these tests prove: the route REFUSES unless the account is already
 * `pending_deletion`, so it can never become a second, unverified way to START a
 * deletion — and it never touches the challenge subsystem.
 */

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser(), getSession: () => mockGetSession() },
  })),
}));

const mockEnsurePersonalAccount = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

const mockRequestAccountDeletion = jest.fn();
jest.mock("@/services/accounts/accountDeletion", () => ({
  ...jest.requireActual("@/services/accounts/accountDeletion"),
  requestAccountDeletion: (...a: unknown[]) => mockRequestAccountDeletion(...a),
}));

import { POST } from "@/app/api/account/delete/retry-billing/route";

const USER_ID = "user-1";
const ACCOUNT_ID = "acct-1";

function signedIn(deletionStatus: "active" | "pending_deletion") {
  mockGetUser.mockResolvedValueOnce({
    data: {
      user: {
        id: USER_ID,
        email: "owner@example.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        factors: [],
      },
    },
    error: null,
  });
  mockEnsurePersonalAccount.mockResolvedValueOnce({
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: USER_ID,
    deletionStatus,
    deletionRequestedAt: deletionStatus === "pending_deletion" ? "t" : null,
    purgeAfter: deletionStatus === "pending_deletion" ? "t2" : null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  mockGetSession.mockResolvedValueOnce({
    data: {
      session: {
        access_token: `header.${Buffer.from(
          JSON.stringify({ session_id: "sess-1", aal: "aal1" }),
        ).toString("base64url")}.sig`,
      },
    },
    error: null,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetSession.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockRequestAccountDeletion.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("POST /api/account/delete/retry-billing", () => {
  it("401s an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("REFUSES an active account — this route can never start a deletion", async () => {
    signedIn("active");
    const res = await POST();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_PENDING_DELETION");
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("retries the idempotent cancellation on an already-frozen account", async () => {
    signedIn("pending_deletion");
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "t",
      purgeAfter: "t2",
      billingCancellation: { status: "canceled", reason: null },
    });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deletionStatus: "pending_deletion",
      requestedAt: "t",
      purgeAfter: "t2",
      billingCancellation: "canceled",
    });
    expect(mockRequestAccountDeletion).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      requestedByUserId: USER_ID,
    });
  });

  it("502s honestly when the cancellation still fails, keeping the frozen state", async () => {
    signedIn("pending_deletion");
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "t",
      purgeAfter: "t2",
      billingCancellation: { status: "failed", reason: "stripe_unavailable" },
    });
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("BILLING_CANCELLATION_FAILED");
    expect(body.deletionStatus).toBe("pending_deletion");
    expect(JSON.stringify(body)).not.toMatch(/sub_|cus_|sk_|price_/);
  });

  it("exports POST only (no GET side effects)", async () => {
    const mod = await import("@/app/api/account/delete/retry-billing/route");
    expect(Object.keys(mod).sort()).toEqual(["POST"]);
  });
});
