/**
 * @jest-environment node
 *
 * Route tests for POST /api/account/delete — self-serve deletion request
 * (4.ACCOUNT-MODEL-10e). Mocks supabase auth, account resolution, re-auth, and
 * the deletion service so the route's own guards (auth → confirm → re-auth →
 * service) are exercised in isolation.
 *
 * Proves: request freezes (calls the service with the caller's OWN account);
 * unauthenticated / wrong-confirmation / wrong-password are all rejected BEFORE
 * the service is touched; and the body can never target another account.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockEnsurePersonalAccount = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

const mockVerifyReauth = jest.fn();
jest.mock("@/services/accounts/accountDeletionReauth", () => ({
  verifyPasswordReauth: (...a: unknown[]) => mockVerifyReauth(...a),
}));

const mockRequestAccountDeletion = jest.fn();
jest.mock("@/services/accounts/accountDeletion", () => ({
  requestAccountDeletion: (...a: unknown[]) => mockRequestAccountDeletion(...a),
}));

// 4.ACCOUNT-MODEL-13 deletion guard — owned team/org accounts block deletion.
const mockListOwnedTeamOrg = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  listOwnedTeamOrgAccountSummaries: (...a: unknown[]) => mockListOwnedTeamOrg(...a),
}));

import { POST } from "@/app/api/account/delete/route";

const USER_ID = "user-1";
const ACCOUNT_ID = "acct-1";

function ownAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    type: "personal",
    name: "Personal",
    ownerUserId: USER_ID,
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function req(body: unknown) {
  return new Request("https://app.example.test/api/account/delete", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockVerifyReauth.mockReset();
  mockRequestAccountDeletion.mockReset();
  // Default: the user owns no team/org accounts → deletion proceeds.
  mockListOwnedTeamOrg.mockReset().mockResolvedValue([]);
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

function signedIn(email = "user@example.com") {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID, email } },
    error: null,
  });
  mockEnsurePersonalAccount.mockResolvedValueOnce(ownAccount());
}

describe("POST /api/account/delete", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ password: "pw", confirmText: "delete my account" }));
    expect(res.status).toBe(401);
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("409s when the user owns Team/Business accounts — returns owned summaries + transfer-or-delete copy, never reaches re-auth or the service", async () => {
    signedIn();
    mockListOwnedTeamOrg.mockResolvedValueOnce([
      { id: "team-1", name: "Acme Team", type: "team" },
      { id: "org-1", name: "Acme Biz", type: "organization" },
    ]);
    const res = await POST(req({ password: "pw", confirmText: "delete my account" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ACCOUNT_HAS_OWNED_TEAMS");
    expect(body.ownedAccountCount).toBe(2);
    // Owned-account summaries, with the org→Business label (never "Organization").
    expect(body.ownedAccounts).toEqual([
      { id: "team-1", name: "Acme Team", type: "team", typeLabel: "Team" },
      { id: "org-1", name: "Acme Biz", type: "organization", typeLabel: "Business" },
    ]);
    // Copy says transfer or delete, and never surfaces "Organization" as a tier.
    expect(body.error).toMatch(/transfer ownership or delete/i);
    expect(body.error).not.toMatch(/organization/i);
    // Scoped to the caller's own owned accounts (no other user's accounts).
    expect(mockListOwnedTeamOrg).toHaveBeenCalledWith(USER_ID);
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("400s a wrong confirmation phrase before re-auth or the service", async () => {
    signedIn();
    const res = await POST(req({ password: "pw", confirmText: "yes" }));
    expect(res.status).toBe(400);
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("400s a malformed body (missing password)", async () => {
    signedIn();
    const res = await POST(req({ confirmText: "delete my account" }));
    expect(res.status).toBe(400);
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("401s a wrong password (re-auth fails) and never freezes the account", async () => {
    signedIn();
    mockVerifyReauth.mockResolvedValueOnce({ ok: false, reason: "invalid_credentials" });
    const res = await POST(req({ password: "wrong", confirmText: "delete my account" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("REAUTH_FAILED");
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("freezes the account on the happy path (re-auth ok → service called with OWN account)", async () => {
    signedIn("owner@example.com");
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "2026-05-31T00:00:00.000Z",
      purgeAfter: "2026-06-30T00:00:00.000Z",
      billingCancellation: { status: "canceled", reason: null },
    });

    const res = await POST(req({ password: "pw", confirmText: "delete my account" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deletionStatus: "pending_deletion",
      requestedAt: "2026-05-31T00:00:00.000Z",
      purgeAfter: "2026-06-30T00:00:00.000Z",
      billingCancellation: "canceled",
    });
    expect(mockVerifyReauth).toHaveBeenCalledWith("owner@example.com", "pw");
    expect(mockRequestAccountDeletion).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      requestedByUserId: USER_ID,
    });
  });

  it("accepts a case-insensitive / padded confirmation phrase", async () => {
    signedIn();
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "t",
      purgeAfter: "t2",
    });
    const res = await POST(req({ password: "pw", confirmText: "  Delete My Account  " }));
    expect(res.status).toBe(200);
    expect(mockRequestAccountDeletion).toHaveBeenCalledTimes(1);
  });

  it("cannot target another account: an accountId in the body is ignored — the OWN account is used", async () => {
    signedIn();
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "t",
      purgeAfter: "t2",
    });
    // Attacker tries to smuggle a victim account id through the body.
    const res = await POST(
      req({
        password: "pw",
        confirmText: "delete my account",
        accountId: "victim-account",
        requestedByUserId: "victim-user",
      }),
    );
    expect(res.status).toBe(200);
    // Service is called with the caller's resolved OWN account/user — never the body values.
    expect(mockRequestAccountDeletion).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      requestedByUserId: USER_ID,
    });
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-1 — partial-failure honesty. The route must never return a
 * clean 200 that reads as "deletion and billing cancellation are complete" when the
 * subscription is still able to renew.
 */
describe("POST /api/account/delete — billing cancellation outcome", () => {
  function happyPath(billingCancellation: unknown) {
    signedIn("owner@example.com");
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "2026-05-31T00:00:00.000Z",
      purgeAfter: "2026-06-30T00:00:00.000Z",
      billingCancellation,
    });
    return POST(req({ password: "pw", confirmText: "delete my account" }));
  }

  it("200s a FREE account with billingCancellation=not_applicable", async () => {
    const res = await happyPath({ status: "not_applicable", reason: null });
    expect(res.status).toBe(200);
    expect((await res.json()).billingCancellation).toBe("not_applicable");
  });

  it("502s when the subscription could not be cancelled — never a fake success", async () => {
    const res = await happyPath({ status: "failed", reason: "stripe_unavailable" });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("BILLING_CANCELLATION_FAILED");
    expect(body.billingCancellation).toBe("failed");
    // ...while still reporting the REAL lifecycle state: the freeze DID happen.
    expect(body.deletionStatus).toBe("pending_deletion");
    expect(body.purgeAfter).toBe("2026-06-30T00:00:00.000Z");
    // The message tells the user what to do and what protects them meanwhile.
    expect(body.error).toMatch(/couldn't cancel your subscription/i);
    expect(body.error).toMatch(/try again/i);
  });

  it("leaks no Stripe id, customer, or secret in the failure response", async () => {
    const res = await happyPath({ status: "failed", reason: "stripe_unavailable" });
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/sub_|cus_|sk_|price_/);
  });

  it("treats an absent billing outcome as not_applicable (backward compatible)", async () => {
    const res = await happyPath(undefined);
    expect(res.status).toBe(200);
    expect((await res.json()).billingCancellation).toBe("not_applicable");
  });
});
