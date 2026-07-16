/**
 * @jest-environment node
 *
 * PRO-TEAM-TRIAL-ENFORCEMENT-1 — trial behavior of createCheckoutSession.
 *
 * Inspects the GENERATED Stripe Checkout request and proves:
 *   - an ELIGIBLE Pro/Team account (trials on, atomic claim wins) → subscription_data carries
 *     exactly the approved trial_period_days;
 *   - an INELIGIBLE Pro/Team account (claim lost — already consumed) → NO trial config;
 *   - Business NEVER carries trial config (and never even attempts a claim);
 *   - the dark default (days=0) → no claim, no trial config;
 *   - two concurrent claims can't both win (first gets the trial, second subscribes without one);
 *   - the claim is keyed on the requested Pro/Team plan as origin.
 *
 * Uses the REAL price resolver (env-driven) + the real trial config resolver; mocks the account
 * repo, the atomic claim, and the Stripe client.
 */

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetAttachment = jest.fn();
const mockAttachCustomer = jest.fn();
const mockGetBillingMode = jest.fn();
const mockClaimTrial = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getStripeAttachmentServiceRole: (...a: unknown[]) => mockGetAttachment(...a),
  attachStripeCustomerIfAbsentServiceRole: (...a: unknown[]) => mockAttachCustomer(...a),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetBillingMode(...a),
  claimAccountTrialServiceRole: (...a: unknown[]) => mockClaimTrial(...a),
}));

const mockGetClient = jest.fn();
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => mockGetClient(),
}));

import { createCheckoutSession } from "@/services/billing/platformBillingSessions";
import { PLATFORM_TRIAL_PERIOD_DAYS_ENV } from "@/services/billing/platformTrialPolicy";

const ACCOUNT = "acct-1";

interface StripeCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}
function clientReturning(): { request: jest.Mock; calls: StripeCall[] } {
  const calls: StripeCall[] = [];
  const request = jest.fn(async (input: StripeCall) => {
    calls.push(input);
    if (input.path === "/v1/customers") return { id: "cus_new" };
    if (input.path === "/v1/checkout/sessions") return { url: "https://stripe.test/checkout" };
    throw new Error(`unexpected path ${input.path}`);
  });
  return { request, calls };
}

function account(type: string) {
  return { id: ACCOUNT, type, deletionStatus: "active", name: "X", ownerUserId: "u1" };
}

/** Wire an existing-customer account of `type` and return the recorded Stripe calls. */
function withCustomer(type: string): StripeCall[] {
  mockGetAccount.mockResolvedValueOnce(account(type));
  mockGetAttachment.mockResolvedValueOnce({
    stripeCustomerId: "cus_x",
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
  const { request, calls } = clientReturning();
  mockGetClient.mockReturnValueOnce({ apiBase: "x", apiVersion: "v", request });
  return calls;
}

function subData(calls: StripeCall[]): Record<string, unknown> {
  const checkout = calls.find((c) => c.path === "/v1/checkout/sessions")!;
  return checkout.body!.subscription_data as Record<string, unknown>;
}

const origEnv = { ...process.env };
beforeEach(() => {
  mockGetAccount.mockReset();
  mockGetAttachment.mockReset();
  mockAttachCustomer.mockReset();
  mockGetBillingMode.mockReset().mockResolvedValue("standard");
  mockClaimTrial.mockReset();
  mockGetClient.mockReset();
  process.env = { ...origEnv };
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.STRIPE_PRICE_PRO = "price_pro";
  process.env.STRIPE_PRICE_TEAM = "price_team";
  process.env.STRIPE_PRICE_BUSINESS = "price_biz";
  process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV] = "14"; // trials ON for these tests
});
afterAll(() => {
  process.env = { ...origEnv };
});

describe("eligible Pro/Team → approved trial config only", () => {
  it("Pro: claim wins → subscription_data.trial_period_days = 14 (claim keyed on 'pro')", async () => {
    mockClaimTrial.mockResolvedValueOnce({ claimed: true, trialEndsAt: "x", originPlan: "pro" });
    const calls = withCustomer("personal");
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(r.ok).toBe(true);
    expect(mockClaimTrial).toHaveBeenCalledWith(ACCOUNT, "pro", expect.any(String));
    expect(subData(calls)).toMatchObject({ trial_period_days: 14 });
  });

  it("Team: claim wins → trial_period_days = 14 (claim keyed on 'team')", async () => {
    mockClaimTrial.mockResolvedValueOnce({ claimed: true, trialEndsAt: "x", originPlan: "team" });
    const calls = withCustomer("team");
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "team" });
    expect(mockClaimTrial).toHaveBeenCalledWith(ACCOUNT, "team", expect.any(String));
    expect(subData(calls)).toMatchObject({ trial_period_days: 14 });
  });
});

describe("ineligible Pro/Team (already consumed) → NO trial config", () => {
  it("Pro: claim lost → subscription_data has NO trial_period_days", async () => {
    mockClaimTrial.mockResolvedValueOnce({ claimed: false, trialEndsAt: null, originPlan: "team" });
    const calls = withCustomer("personal");
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(subData(calls)).not.toHaveProperty("trial_period_days");
  });

  it("Team: claim lost → no trial config", async () => {
    mockClaimTrial.mockResolvedValueOnce({ claimed: false, trialEndsAt: null, originPlan: "pro" });
    const calls = withCustomer("team");
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "team" });
    expect(subData(calls)).not.toHaveProperty("trial_period_days");
  });
});

describe("Business NEVER trials", () => {
  it("Business checkout carries no trial config and never attempts a claim (even with trials on)", async () => {
    const calls = withCustomer("organization"); // org buys business directly
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "business" });
    expect(mockClaimTrial).not.toHaveBeenCalled();
    expect(subData(calls)).not.toHaveProperty("trial_period_days");
  });

  it("Team → Business upgrade also carries no trial config / no claim", async () => {
    const calls = withCustomer("team");
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "business" });
    expect(mockClaimTrial).not.toHaveBeenCalled();
    expect(subData(calls)).not.toHaveProperty("trial_period_days");
  });
});

describe("dark default (days = 0) → nothing claimed, nothing granted", () => {
  it("Pro with trials off never claims and sends no trial config", async () => {
    delete process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV];
    const calls = withCustomer("personal");
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(mockClaimTrial).not.toHaveBeenCalled();
    expect(subData(calls)).not.toHaveProperty("trial_period_days");
  });
});

describe("concurrency / duplicate submissions", () => {
  it("two racing checkouts: the atomic claim gives the trial to exactly one", async () => {
    // The RPC (compare-and-set) returns claimed:true to the first caller, false to the second.
    mockClaimTrial
      .mockResolvedValueOnce({ claimed: true, trialEndsAt: "x", originPlan: "pro" })
      .mockResolvedValueOnce({ claimed: false, trialEndsAt: null, originPlan: "pro" });
    const callsA = withCustomer("personal");
    const callsB = withCustomer("personal");
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(subData(callsA)).toMatchObject({ trial_period_days: 14 });
    expect(subData(callsB)).not.toHaveProperty("trial_period_days");
  });
});
