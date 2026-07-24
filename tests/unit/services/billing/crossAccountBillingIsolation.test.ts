/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-2 — cross-account billing isolation for ONE user who
 * owns BOTH a paid personal account and a paid team account.
 *
 * This is the scenario the product requirement is written around: the two accounts are
 * independent, and "same owner" must never become a path from one subscription to the other.
 * It wires the REAL cancellation service and mocks only the repositories and Stripe.
 *
 * Every assertion here is about a property that would be invisible in a single-account test:
 * that the *other* account's subscription is never read, never written, and never reachable.
 */

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

/** Account-keyed billing fakes: lookups must be keyed on account id, never on user id. */
const ATTACHMENTS: Record<string, string | null> = {};
const USAGE: Record<string, Record<string, unknown>> = {};
const mockGetUsage = jest.fn(async (accountId: string) => USAGE[accountId] ?? null);
const mockGetAttachment = jest.fn(async (accountId: string) => ({
  stripeCustomerId: `cus_${accountId}`,
  stripeSubscriptionId: ATTACHMENTS[accountId] ?? null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
}));
const mockGetBillingMode = jest.fn(async () => "standard");
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: (...a: unknown[]) => mockGetUsage(...(a as [string])),
  getStripeAttachmentServiceRole: (...a: unknown[]) => mockGetAttachment(...(a as [string])),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetBillingMode(),
}));

/** The ONLY external boundary mocked. Records every call for isolation assertions. */
const stripeCalls: Array<{ method: string; path: string }> = [];
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => ({
    apiBase: "https://api.stripe.test",
    apiVersion: "2025-03-31.basil",
    request: async (input: { method: string; path: string }) => {
      stripeCalls.push({ method: input.method, path: input.path });
      return {
        id: "sub",
        status: "active",
        cancel_at_period_end: input.method === "POST",
        current_period_end: 1_785_000_000,
      };
    },
  }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cancelSubscriptionForAccountDeletion,
  resumeSubscription,
  scheduleSubscriptionCancellation,
} from "@/services/billing/subscriptionCancellation";

const PERSONAL_ID = "acct-personal";
const TEAM_ID = "acct-team";
const PERSONAL_SUB = "sub_personal";
const TEAM_SUB = "sub_team";
const OWNER_ID = "user-owner";

function usageRow(plan: string) {
  return {
    tasksUsed: 0,
    tasksLimit: 100,
    periodStartedAt: "2026-07-01T00:00:00.000Z",
    plan,
    planStatus: "active",
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  };
}

/** Stripe paths that name the OTHER account's subscription. */
function touched(sub: string): boolean {
  return stripeCalls.some((c) => c.path.includes(sub));
}

beforeEach(() => {
  stripeCalls.length = 0;
  mockGetUsage.mockClear();
  mockGetAttachment.mockClear();
  mockGetBillingMode.mockClear();

  for (const k of Object.keys(ATTACHMENTS)) delete ATTACHMENTS[k];
  for (const k of Object.keys(USAGE)) delete USAGE[k];
  ATTACHMENTS[PERSONAL_ID] = PERSONAL_SUB;
  ATTACHMENTS[TEAM_ID] = TEAM_SUB;
  USAGE[PERSONAL_ID] = usageRow("pro");
  USAGE[TEAM_ID] = usageRow("team");

  // One user owns both accounts — the whole point of the isolation requirement.
  mockGetAccount.mockReset().mockImplementation(async (id: string) => ({
    id,
    type: id === TEAM_ID ? "team" : "personal",
    name: id,
    ownerUserId: OWNER_ID,
    deletionStatus: "active",
  }));
});

describe("the two accounts are genuinely distinct billing roots", () => {
  it("resolve to different account ids and different Stripe subscriptions", async () => {
    expect(PERSONAL_ID).not.toBe(TEAM_ID);
    expect(ATTACHMENTS[PERSONAL_ID]).not.toBe(ATTACHMENTS[TEAM_ID]);

    await scheduleSubscriptionCancellation(PERSONAL_ID);
    expect(mockGetAttachment).toHaveBeenCalledWith(PERSONAL_ID);
    expect(mockGetAttachment).not.toHaveBeenCalledWith(TEAM_ID);
  });
});

describe("cancelling PERSONAL billing", () => {
  it("targets only the personal subscription and never reads the team's", async () => {
    const r = await scheduleSubscriptionCancellation(PERSONAL_ID);
    expect(r.ok).toBe(true);

    expect(touched(PERSONAL_SUB)).toBe(true);
    expect(touched(TEAM_SUB)).toBe(false);
    // The team's billing row is never even loaded.
    expect(mockGetAttachment).not.toHaveBeenCalledWith(TEAM_ID);
    expect(mockGetUsage).not.toHaveBeenCalledWith(TEAM_ID);
  });

  it("is period-end, not immediate — no DELETE is issued", async () => {
    await scheduleSubscriptionCancellation(PERSONAL_ID);
    expect(stripeCalls.some((c) => c.method === "DELETE")).toBe(false);
    expect(
      stripeCalls.some(
        (c) => c.method === "POST" && c.path.includes(PERSONAL_SUB),
      ),
    ).toBe(true);
  });

  it("resuming affects only the personal subscription", async () => {
    ATTACHMENTS[PERSONAL_ID] = PERSONAL_SUB;
    await resumeSubscription(PERSONAL_ID);
    expect(touched(PERSONAL_SUB)).toBe(true);
    expect(touched(TEAM_SUB)).toBe(false);
  });
});

describe("cancelling TEAM billing", () => {
  it("targets only the team subscription and never reads the personal one", async () => {
    const r = await scheduleSubscriptionCancellation(TEAM_ID);
    expect(r.ok).toBe(true);

    expect(touched(TEAM_SUB)).toBe(true);
    expect(touched(PERSONAL_SUB)).toBe(false);
    expect(mockGetAttachment).not.toHaveBeenCalledWith(PERSONAL_ID);
  });
});

describe("two accounts owned by one user cannot cross-cancel", () => {
  it("cancelling one, then the other, keeps each call scoped to its own subscription", async () => {
    await scheduleSubscriptionCancellation(PERSONAL_ID);
    const afterPersonal = [...stripeCalls];
    stripeCalls.length = 0;
    await scheduleSubscriptionCancellation(TEAM_ID);

    for (const c of afterPersonal) expect(c.path).toContain(PERSONAL_SUB);
    for (const c of stripeCalls) expect(c.path).toContain(TEAM_SUB);
  });

  it("DELETION of the personal account never reaches the team subscription", async () => {
    mockGetAccount.mockImplementation(async (id: string) => ({
      id,
      type: id === TEAM_ID ? "team" : "personal",
      name: id,
      ownerUserId: OWNER_ID,
      // Deletion runs on a FROZEN account.
      deletionStatus: id === PERSONAL_ID ? "pending_deletion" : "active",
    }));

    const r = await cancelSubscriptionForAccountDeletion(PERSONAL_ID);
    expect(r).toEqual({ ok: true, outcome: "canceled" });

    expect(touched(PERSONAL_SUB)).toBe(true);
    expect(touched(TEAM_SUB)).toBe(false);
    // Deletion cancels IMMEDIATELY — and only for the personal account.
    const deletes = stripeCalls.filter((c) => c.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.path).toContain(PERSONAL_SUB);
  });
});

describe("no user-to-subscription lookup exists", () => {
  it("every billing lookup is keyed by ACCOUNT id — the user id is never a key", async () => {
    await scheduleSubscriptionCancellation(PERSONAL_ID);
    await scheduleSubscriptionCancellation(TEAM_ID);

    const keys = mockGetAttachment.mock.calls.map((c) => c[0]);
    expect(keys.every((k) => k === PERSONAL_ID || k === TEAM_ID)).toBe(true);
    expect(keys).not.toContain(OWNER_ID);
    // And no Stripe path is ever built from a user id.
    for (const c of stripeCalls) expect(c.path).not.toContain(OWNER_ID);
  });

  it("the cancellation service source contains no owner/user-keyed billing lookup", () => {
    // Guards against a future refactor reintroducing "find this user's subscription".
    const src = readFileSync(
      join(process.cwd(), "services/billing/subscriptionCancellation.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/byUser|ownerUserId|userId/);
  });
});
