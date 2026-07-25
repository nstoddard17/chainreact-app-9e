/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-1 — the CANONICAL OWNERSHIP RULE, end to end.
 *
 * Unlike the sibling unit tests this wires the REAL `accountDeletion` service to the REAL
 * `subscriptionCancellation` service and mocks ONLY the repositories and the external Stripe
 * boundary — so the account-scoping guarantee is proven through the actual call path rather
 * than against a stubbed seam.
 *
 * The rule (docs/rules/account-ownership-model.md): billing is account-scoped. Deleting a
 * user's PERSONAL account must cancel that account's subscription and NOTHING else — a
 * team/organization account the user merely belongs to (or even owns) keeps its own billing.
 */

const mockGetDeletionStatus = jest.fn();
/** ACCOUNT-BILLING-LIFECYCLE-2 sole-owner precondition (no owned Team/Business by default). */
const mockListOwnedTeamOrg = jest.fn();
const mockGetByIdServiceRole = jest.fn();
const mockSetDeletionPending = jest.fn();
const mockClearDeletion = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
  listOwnedTeamOrgAccountSummaries: (...a: unknown[]) => mockListOwnedTeamOrg(...a),
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
  setDeletionPendingServiceRole: (...a: unknown[]) => mockSetDeletionPending(...a),
  clearDeletionServiceRole: (...a: unknown[]) => mockClearDeletion(...a),
}));

const mockInsertPending = jest.fn();
// ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A: freeze + audit row + (optional)
// challenge consumption are ONE transactional RPC now.
const mockScheduleAtomic = jest.fn();
const mockMarkPendingCancelled = jest.fn();
jest.mock("@/repositories/accountDeletions", () => ({
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  scheduleAccountDeletionAtomic: (...a: unknown[]) => mockScheduleAtomic(...a),
  markPendingCancelled: (...a: unknown[]) => mockMarkPendingCancelled(...a),
}));

/** Account-keyed billing fakes — the whole point is that lookups are keyed on account id. */
const ATTACHMENTS: Record<string, { stripeSubscriptionId: string | null }> = {};
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: jest.fn(),
  getBillingModeServiceRole: jest.fn(async () => "standard"),
  getStripeAttachmentServiceRole: jest.fn(async (accountId: string) => ({
    stripeCustomerId: `cus_${accountId}`,
    stripeSubscriptionId: ATTACHMENTS[accountId]?.stripeSubscriptionId ?? null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  })),
}));

/** The ONLY external boundary that is mocked: Stripe itself. */
const stripeCalls: Array<{ method: string; path: string }> = [];
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => ({
    apiBase: "https://api.stripe.test",
    apiVersion: "2025-03-31.basil",
    request: async (input: { method: string; path: string }) => {
      stripeCalls.push({ method: input.method, path: input.path });
      if (input.method === "GET") {
        return { id: "sub", status: "active", cancel_at_period_end: false };
      }
      return { id: "sub", status: "canceled" };
    },
  }),
}));

import { requestAccountDeletion } from "@/services/accounts/accountDeletion";

const PERSONAL_ID = "acct-personal-of-marcus";
const TEAM_ID = "acct-team-acme";
const PERSONAL_SUB = "sub_personal_pro";
const TEAM_SUB = "sub_team_acme";
const USER_ID = "user-marcus";

function accountRow(id: string, type: string, deletionStatus = "active") {
  const pending = deletionStatus === "pending_deletion";
  return {
    id,
    type,
    name: id,
    ownerUserId: USER_ID,
    deletionStatus,
    deletionRequestedAt: pending ? "2026-07-24T00:00:00.000Z" : null,
    purgeAfter: pending ? "2026-08-23T00:00:00.000Z" : null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

/** Type for an account id in this fixture (personal unless it is the team account). */
function typeFor(id: string): string {
  return id === TEAM_ID ? "team" : "personal";
}

beforeEach(() => {
  stripeCalls.length = 0;
  // The billing repo fakes are declared in the module factory; clear their call history so
  // one test's lookups never leak into another's scoping assertions.
  const billingRepo = jest.requireMock("@/repositories/accountBilling");
  billingRepo.getStripeAttachmentServiceRole.mockClear();
  billingRepo.getBillingModeServiceRole.mockClear();
  for (const k of Object.keys(ATTACHMENTS)) delete ATTACHMENTS[k];
  // The user has a paid personal account AND belongs to a paid team account.
  ATTACHMENTS[PERSONAL_ID] = { stripeSubscriptionId: PERSONAL_SUB };
  ATTACHMENTS[TEAM_ID] = { stripeSubscriptionId: TEAM_SUB };

  mockGetDeletionStatus.mockReset().mockResolvedValue("active");
  mockListOwnedTeamOrg.mockReset().mockResolvedValue([]);
  // Accounts start ACTIVE so each request exercises the real freeze transition.
  mockGetByIdServiceRole
    .mockReset()
    .mockImplementation(async (id: string) => accountRow(id, typeFor(id), "active"));
  mockSetDeletionPending
    .mockReset()
    .mockImplementation(async (input: { accountId: string }) =>
      accountRow(input.accountId, typeFor(input.accountId), "pending_deletion"),
    );
  mockClearDeletion.mockReset();
  mockInsertPending.mockReset().mockResolvedValue({});
  mockScheduleAtomic.mockReset().mockImplementation(async (input) => ({
    outcome: "scheduled",
    accountId: input.accountId,
    deletionStatus: "pending_deletion",
    deletionRequestedAt: input.requestedAt,
    purgeAfter: input.purgeAfter,
  }));
  mockMarkPendingCancelled.mockReset();
});

it("deleting a PERSONAL account cancels only the personal subscription — the team's is untouched", async () => {
  const state = await requestAccountDeletion({
    accountId: PERSONAL_ID,
    requestedByUserId: USER_ID,
  });

  expect(state.deletionStatus).toBe("pending_deletion");
  expect(state.billingCancellation).toEqual({ status: "canceled", reason: null });

  // Every Stripe call named the PERSONAL subscription...
  expect(stripeCalls.length).toBeGreaterThan(0);
  for (const call of stripeCalls) {
    expect(call.path).toContain(PERSONAL_SUB);
  }
  // ...and none of them ever touched the team's.
  expect(stripeCalls.some((c) => c.path.includes(TEAM_SUB))).toBe(false);
  // Exactly one immediate cancellation was issued.
  expect(stripeCalls.filter((c) => c.method === "DELETE")).toHaveLength(1);
});

it("deleting a TEAM account cancels only that team's subscription", async () => {
  const state = await requestAccountDeletion({
    accountId: TEAM_ID,
    requestedByUserId: USER_ID,
  });

  expect(state.billingCancellation).toEqual({ status: "canceled", reason: null });
  for (const call of stripeCalls) {
    expect(call.path).toContain(TEAM_SUB);
  }
  expect(stripeCalls.some((c) => c.path.includes(PERSONAL_SUB))).toBe(false);
});

it("a FREE personal account is deleted with no Stripe call at all", async () => {
  ATTACHMENTS[PERSONAL_ID] = { stripeSubscriptionId: null };

  const state = await requestAccountDeletion({
    accountId: PERSONAL_ID,
    requestedByUserId: USER_ID,
  });

  expect(state.deletionStatus).toBe("pending_deletion");
  expect(state.billingCancellation).toEqual({ status: "not_applicable", reason: null });
  expect(stripeCalls).toHaveLength(0);
});

it("the subscription lookup is keyed on the account being deleted, never on the user", async () => {
  const billingRepo = jest.requireMock("@/repositories/accountBilling");
  await requestAccountDeletion({ accountId: PERSONAL_ID, requestedByUserId: USER_ID });

  // Only the deleted account is ever looked up — there is no user→subscription path.
  for (const call of billingRepo.getStripeAttachmentServiceRole.mock.calls) {
    expect(call[0]).toBe(PERSONAL_ID);
  }
  expect(billingRepo.getStripeAttachmentServiceRole).not.toHaveBeenCalledWith(TEAM_ID);
  expect(billingRepo.getStripeAttachmentServiceRole).not.toHaveBeenCalledWith(USER_ID);
});

it("repeating the deletion request cancels at most once more and never fans out to other accounts", async () => {
  await requestAccountDeletion({ accountId: PERSONAL_ID, requestedByUserId: USER_ID });
  stripeCalls.length = 0;

  // Second request: the account is now already pending. The retry runs, but the
  // subscription is gone, so it is a no-op — and no second freeze/audit row occurs.
  mockGetByIdServiceRole.mockImplementation(async (id: string) =>
    accountRow(id, typeFor(id), "pending_deletion"),
  );
  const again = await requestAccountDeletion({
    accountId: PERSONAL_ID,
    requestedByUserId: USER_ID,
  });

  expect(again.deletionStatus).toBe("pending_deletion");
  // No second freeze / second audit row.
  expect(mockScheduleAtomic).toHaveBeenCalledTimes(1);
  // Still strictly scoped.
  expect(stripeCalls.some((c) => c.path.includes(TEAM_SUB))).toBe(false);
});
