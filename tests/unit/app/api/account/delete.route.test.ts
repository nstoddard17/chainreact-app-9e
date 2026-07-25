/**
 * @jest-environment node
 *
 * Route tests for POST /api/account/delete — the self-serve deletion request
 * (4.ACCOUNT-MODEL-10e; step-up replaced in ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Mocks supabase auth, account resolution, the challenge consumption, and the
 * deletion service so the route's own guards (auth → session/MFA gate → typed
 * DELETE → consume authorization → service) are exercised in isolation.
 *
 * Proves the new contract: NO password is involved for any provider; a request
 * without a live verified authorization is refused before anything is frozen; a
 * replay fails; the exact word `DELETE` is required; the sole-owner and billing
 * protections are unchanged; and the body can never target another account.
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

const mockConsume = jest.fn();
jest.mock("@/services/accounts/deletionChallenge", () => ({
  consumeDeletionAuthorization: (...a: unknown[]) => mockConsume(...a),
}));

const mockRequestAccountDeletion = jest.fn();
jest.mock("@/services/accounts/accountDeletion", () => ({
  // Keep the REAL error class so `instanceof` identity is shared between the route and
  // this test — a stubbed class would silently fail the route's typed-refusal branch.
  ...jest.requireActual("@/services/accounts/accountDeletion"),
  requestAccountDeletion: (...a: unknown[]) => mockRequestAccountDeletion(...a),
}));

// 4.ACCOUNT-MODEL-13 deletion guard — owned team/org accounts block deletion.
const mockListOwnedTeamOrg = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  listOwnedTeamOrgAccountSummaries: (...a: unknown[]) => mockListOwnedTeamOrg(...a),
}));

import { POST } from "@/app/api/account/delete/route";
import { OwnedAccountsBlockDeletionError } from "@/services/accounts/accountDeletion";

const USER_ID = "user-1";
const ACCOUNT_ID = "acct-1";
const SESSION_ID = "sess-abc";

/** An access token whose payload carries `session_id` + `aal`. */
function accessToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.sig`;
}

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
  mockGetSession.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockConsume.mockReset();
  mockRequestAccountDeletion.mockReset();
  // Default: the user owns no team/org accounts → deletion proceeds.
  mockListOwnedTeamOrg.mockReset().mockResolvedValue([]);
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

/**
 * Sign a user in. `factors` defaults to none, so the AAL2 branch is off unless a
 * test opts into it — exactly like a real account without MFA.
 */
function signedIn(
  opts: {
    email?: string;
    factors?: Array<{ status: string; factor_type: string }>;
    aal?: string;
    sessionId?: string | null;
  } = {},
) {
  const {
    email = "user@example.com",
    factors = [],
    aal = "aal1",
    sessionId = SESSION_ID,
  } = opts;
  mockGetUser.mockResolvedValueOnce({
    data: {
      user: {
        id: USER_ID,
        email,
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        factors,
      },
    },
    error: null,
  });
  mockEnsurePersonalAccount.mockResolvedValueOnce(ownAccount());
  mockGetSession.mockResolvedValueOnce({
    data: {
      session: {
        access_token: accessToken(
          sessionId === null ? { aal } : { session_id: sessionId, aal },
        ),
      },
    },
    error: null,
  });
}

describe("POST /api/account/delete — universal email-code authorization", () => {
  it("401s an unauthenticated caller and never touches the challenge or service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(401);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("REJECTS a password in the body — there is no password step for any provider", async () => {
    signedIn();
    const res = await POST(req({ confirmText: "DELETE", password: "hunter2" }));
    expect(res.status).toBe(400);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("400s anything other than the exact word DELETE, before the authorization is spent", async () => {
    for (const confirmText of ["delete", " DELETE ", "delete my account", "DELETE ME", ""]) {
      mockConsume.mockClear();
      mockRequestAccountDeletion.mockClear();
      signedIn();
      const res = await POST(req({ confirmText }));
      expect(res.status).toBe(400);
      expect(mockConsume).not.toHaveBeenCalled();
      expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
    }
  });

  it("401s when there is no verified authorization and never freezes the account", async () => {
    signedIn();
    mockConsume.mockResolvedValueOnce({ ok: false, reason: "no_authorization" });
    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("VERIFICATION_REQUIRED");
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("gives the SAME generic code whether the authorization was missing, spent, or expired", async () => {
    const codes: string[] = [];
    for (const reason of ["no_authorization", "expired"]) {
      signedIn();
      mockConsume.mockResolvedValueOnce({ ok: false, reason });
      const res = await POST(req({ confirmText: "DELETE" }));
      codes.push((await res.json()).code);
    }
    // One machine code for every refusal — the client can never tell which binding failed.
    expect(new Set(codes)).toEqual(new Set(["VERIFICATION_REQUIRED"]));
  });

  it("503s a misconfigured challenge subsystem rather than deleting unverified", async () => {
    signedIn();
    mockConsume.mockResolvedValueOnce({ ok: false, reason: "not_configured" });
    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("VERIFICATION_UNAVAILABLE");
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("403s an MFA-enrolled user whose session is still AAL1 (assurance contract preserved)", async () => {
    signedIn({ factors: [{ status: "verified", factor_type: "totp" }], aal: "aal1" });
    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MFA_REQUIRED");
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("allows an MFA-enrolled user at AAL2 (code AND assurance, not code INSTEAD OF assurance)", async () => {
    signedIn({ factors: [{ status: "verified", factor_type: "totp" }], aal: "aal2" });
    mockConsume.mockResolvedValueOnce({ ok: true, challengeId: "c1" });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "t",
      purgeAfter: "t2",
    });
    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(200);
  });

  it("401s when the session id cannot be read — a challenge is never left unbound", async () => {
    signedIn({ sessionId: null });
    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("SESSION_UNAVAILABLE");
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("freezes the account on the happy path, consuming the caller's OWN session authorization", async () => {
    signedIn({ email: "owner@example.com" });
    mockConsume.mockResolvedValueOnce({ ok: true, challengeId: "chal-1" });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "2026-05-31T00:00:00.000Z",
      purgeAfter: "2026-06-30T00:00:00.000Z",
      billingCancellation: { status: "canceled", reason: null },
    });

    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deletionStatus: "pending_deletion",
      requestedAt: "2026-05-31T00:00:00.000Z",
      purgeAfter: "2026-06-30T00:00:00.000Z",
      billingCancellation: "canceled",
    });
    // Every binding comes from the verified session — nothing from the body.
    expect(mockConsume).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      verifiedEmail: "owner@example.com",
    });
    expect(mockRequestAccountDeletion).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      requestedByUserId: USER_ID,
    });
  });

  it("consumes the authorization BEFORE the lifecycle transition (replay can't reuse it)", async () => {
    const order: string[] = [];
    signedIn();
    mockConsume.mockImplementationOnce(async () => {
      order.push("consume");
      return { ok: true, challengeId: "c1" };
    });
    mockRequestAccountDeletion.mockImplementationOnce(async () => {
      order.push("delete");
      return { deletionStatus: "pending_deletion", deletionRequestedAt: "t", purgeAfter: "t2" };
    });
    await POST(req({ confirmText: "DELETE" }));
    expect(order).toEqual(["consume", "delete"]);
  });

  it("a REPLAY of the same request fails once the authorization is spent", async () => {
    signedIn();
    mockConsume.mockResolvedValueOnce({ ok: true, challengeId: "c1" });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "t",
      purgeAfter: "t2",
    });
    expect((await POST(req({ confirmText: "DELETE" }))).status).toBe(200);

    // Second attempt: the atomic consume finds nothing left to spend.
    signedIn();
    mockConsume.mockResolvedValueOnce({ ok: false, reason: "no_authorization" });
    const replay = await POST(req({ confirmText: "DELETE" }));
    expect(replay.status).toBe(401);
    expect(mockRequestAccountDeletion).toHaveBeenCalledTimes(1);
  });

  it("cannot target another account: an accountId in the body is a 400 (strict schema)", async () => {
    signedIn();
    const res = await POST(
      req({ confirmText: "DELETE", accountId: "victim-account", requestedByUserId: "victim-user" }),
    );
    expect(res.status).toBe(400);
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("never echoes a code, address, or session id in any response", async () => {
    signedIn({ email: "owner@example.com" });
    mockConsume.mockResolvedValueOnce({ ok: false, reason: "no_authorization" });
    const res = await POST(req({ confirmText: "DELETE" }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("owner@example.com");
    expect(text).not.toContain(SESSION_ID);
    expect(text).not.toMatch(/\b\d{6}\b/);
  });
});

describe("POST /api/account/delete — eligibility checks re-run at deletion time", () => {
  it("409s when the SERVICE refuses because the user owns Team/Business accounts", async () => {
    // ACCOUNT-BILLING-LIFECYCLE-2: the sole-owner precondition lives in
    // `requestAccountDeletion` (the canonical chokepoint every entry point shares). The
    // route PROJECTS the service's typed refusal into HTTP 409 — and because the check
    // runs at DELETION time, a team acquired after the code was verified still blocks.
    signedIn();
    mockConsume.mockResolvedValueOnce({ ok: true, challengeId: "c1" });
    mockRequestAccountDeletion.mockRejectedValueOnce(
      new OwnedAccountsBlockDeletionError([
        { id: "team-1", name: "Acme Team", type: "team" },
        { id: "org-1", name: "Acme Biz", type: "organization" },
      ]),
    );

    const res = await POST(req({ confirmText: "DELETE" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ACCOUNT_HAS_OWNED_TEAMS");
    expect(body.ownedAccountCount).toBe(2);
    // Owned-account summaries, with the org→Business label (never "Organization").
    expect(body.ownedAccounts).toEqual([
      { id: "team-1", name: "Acme Team", type: "team", typeLabel: "Team" },
      { id: "org-1", name: "Acme Biz", type: "organization", typeLabel: "Business" },
    ]);
    expect(body.error).toMatch(/transfer ownership or delete/i);
    expect(body.error).not.toMatch(/organization/i);
    // No lifecycle state is implied: the refusal carries no deletionStatus/purgeAfter.
    expect(body.deletionStatus).toBeUndefined();
    expect(body.purgeAfter).toBeUndefined();
    expect(body.billingCancellation).toBeUndefined();
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-1 — partial-failure honesty. The route must never return a
 * clean 200 that reads as "deletion and billing cancellation are complete" when the
 * subscription is still able to renew. Unchanged by the new step-up.
 */
describe("POST /api/account/delete — billing cancellation outcome", () => {
  function happyPath(billingCancellation: unknown) {
    signedIn({ email: "owner@example.com" });
    mockConsume.mockResolvedValueOnce({ ok: true, challengeId: "c1" });
    mockRequestAccountDeletion.mockResolvedValueOnce({
      deletionStatus: "pending_deletion",
      deletionRequestedAt: "2026-05-31T00:00:00.000Z",
      purgeAfter: "2026-06-30T00:00:00.000Z",
      billingCancellation,
    });
    return POST(req({ confirmText: "DELETE" }));
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

/**
 * GET has no side effects because it does not exist. Verified structurally: the
 * module exports POST and nothing else, so Next.js answers 405 to every other
 * method and no code path can send, verify, or consume a challenge via a URL visit.
 */
describe("POST /api/account/delete — HTTP surface", () => {
  it("exports POST only (no GET/DELETE/PUT side-effect surface)", async () => {
    const mod = await import("@/app/api/account/delete/route");
    expect(Object.keys(mod).sort()).toEqual(["POST"]);
  });
});
