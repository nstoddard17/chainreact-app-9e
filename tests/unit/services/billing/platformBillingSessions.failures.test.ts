/**
 * @jest-environment node
 *
 * BILLING-CHECKOUT-PROD-1 — Stripe failure classification + stale-customer repair.
 *
 * The production incident (account checkout → HTTP 500, "Could not start checkout.") came
 * from the route catching EVERY throw and returning an opaque 500 with no log line, so the
 * failing operation was unknowable. These tests pin the replacement behavior: every Stripe
 * fault leaves the service as a TYPED reason naming the operation, a dead customer
 * attachment self-heals instead of failing forever, and no secret / Stripe id escapes.
 *
 * Mocks only the Stripe network boundary (the platform client) and the repositories; the
 * real service, real price resolution from env, and real classification logic all run.
 */

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetAttachment = jest.fn();
const mockAttachCustomer = jest.fn();
const mockReplaceStaleCustomer = jest.fn();
const mockGetBillingMode = jest.fn();
const mockGetPlanState = jest.fn();
const mockClaimTrial = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getStripeAttachmentServiceRole: (...a: unknown[]) => mockGetAttachment(...a),
  attachStripeCustomerIfAbsentServiceRole: (...a: unknown[]) => mockAttachCustomer(...a),
  replaceStaleStripeCustomerServiceRole: (...a: unknown[]) => mockReplaceStaleCustomer(...a),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetBillingMode(...a),
  getPlanStateServiceRole: (...a: unknown[]) => mockGetPlanState(...a),
  claimAccountTrialServiceRole: (...a: unknown[]) => mockClaimTrial(...a),
}));

const mockGetClient = jest.fn();
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => mockGetClient(),
}));

import { createCheckoutSession } from "@/services/billing/platformBillingSessions";
import { PlatformStripeApiError } from "@/services/billing/platformStripeClient";

const ACCOUNT = "acct-1";
const SECRET = "sk_live_do_not_leak";

interface StripeCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

/** Stripe rejection with the machine-readable facts the classifier branches on. */
function stripeError(
  status: number,
  code: string | null,
  type: string | null = null,
  param: string | null = null,
): PlatformStripeApiError {
  return new PlatformStripeApiError(
    `Platform Stripe call failed (${SECRET})`,
    status,
    code,
    type,
    param,
  );
}

/** Records every Stripe call and answers per path via the supplied handlers. */
function client(handlers: Record<string, (call: StripeCall) => unknown>): {
  request: jest.Mock;
  calls: StripeCall[];
} {
  const calls: StripeCall[] = [];
  const request = jest.fn(async (input: StripeCall) => {
    calls.push(input);
    const handler = handlers[input.path];
    if (!handler) throw new Error(`unexpected path ${input.path}`);
    return handler(input);
  });
  return { request, calls };
}

const origEnv = { ...process.env };
let errorLogs: string[];
let warnLogs: string[];
let infoLogs: string[];
let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  mockGetAccount.mockReset();
  mockGetAttachment.mockReset();
  mockAttachCustomer.mockReset();
  mockReplaceStaleCustomer.mockReset();
  mockGetClient.mockReset();
  mockGetBillingMode.mockReset();
  mockGetPlanState.mockReset();
  mockClaimTrial.mockReset();

  mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "personal", deletionStatus: null });
  mockGetBillingMode.mockResolvedValue("standard");
  // Default: a Free account with no stored paid plan, so the duplicate-subscription guard
  // never blocks unless a test opts in.
  mockGetPlanState.mockResolvedValue({ plan: "free", planStatus: "active" });
  mockClaimTrial.mockResolvedValue({ claimed: true, trialEndsAt: null, originPlan: "pro" });

  process.env = { ...origEnv };
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";
  process.env.PLATFORM_TRIAL_PERIOD_DAYS = "14";

  errorLogs = [];
  warnLogs = [];
  infoLogs = [];
  errorSpy = jest.spyOn(console, "error").mockImplementation((m) => {
    errorLogs.push(String(m));
  });
  warnSpy = jest.spyOn(console, "warn").mockImplementation((m) => {
    warnLogs.push(String(m));
  });
  logSpy = jest.spyOn(console, "log").mockImplementation((m) => {
    infoLogs.push(String(m));
  });
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  logSpy.mockRestore();
});
afterAll(() => {
  process.env = { ...origEnv };
});

function checkoutPro() {
  return createCheckoutSession({
    accountId: ACCOUNT,
    requestedPlan: "pro",
    contactEmail: "owner@x.test",
  });
}

describe("an eligible Free personal account starts Pro monthly checkout", () => {
  beforeEach(() => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
  });

  it("creates a subscription Checkout Session carrying the 14-day trial and correct URLs", async () => {
    const c = client({
      "/v1/customers": () => ({ id: "cus_new" }),
      "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/s" }),
    });
    mockGetClient.mockReturnValue(c);

    const result = await checkoutPro();

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/s" });
    const session = c.calls.find((x) => x.path === "/v1/checkout/sessions");
    const body = session?.body as Record<string, unknown>;
    expect(body.mode).toBe("subscription");
    expect(body.customer).toBe("cus_new");
    expect(body.line_items).toEqual([{ price: "price_pro_monthly", quantity: 1 }]);
    expect(body.success_url).toBe("https://app.test/account?billing=success");
    expect(body.cancel_url).toBe("https://app.test/account?billing=canceled");
    // Metadata identifies the paying ChainReact account, and nothing else.
    expect(body.metadata).toEqual({ accountId: ACCOUNT, plan: "pro" });
    expect(
      (body.subscription_data as Record<string, unknown>).trial_period_days,
    ).toBe(14);
  });

  it("attaches the new customer to the account that is checking out", async () => {
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_new" }),
        "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/s" }),
      }),
    );
    await checkoutPro();
    expect(mockAttachCustomer).toHaveBeenCalledWith(ACCOUNT, "cus_new");
  });
});

describe("an account that already has a Stripe customer", () => {
  it("reuses it and does not create a second customer", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    const c = client({
      "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/s" }),
    });
    mockGetClient.mockReturnValue(c);

    const result = await checkoutPro();

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/s" });
    expect(c.calls.some((x) => x.path === "/v1/customers")).toBe(false);
    expect(mockAttachCustomer).not.toHaveBeenCalled();
    const session = c.calls.find((x) => x.path === "/v1/checkout/sessions");
    expect((session?.body as Record<string, unknown>).customer).toBe("cus_existing");
  });
});

describe("Stripe rejects the request", () => {
  beforeEach(() => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
  });

  it("reports a rejected secret key as a configuration fault, not a checkout fault", async () => {
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => {
          throw stripeError(401, "api_key_expired", "authentication_error");
        },
      }),
    );
    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_not_configured",
    });
  });

  it("names customer creation as the failing operation when Stripe rejects it", async () => {
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => {
          throw stripeError(500, null, "api_error");
        },
      }),
    );
    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_customer_create_failed",
    });
  });

  it("does not create a customer when the customer call fails, and never claims the trial", async () => {
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => {
          throw stripeError(500, null, "api_error");
        },
      }),
    );
    await checkoutPro();
    expect(mockAttachCustomer).not.toHaveBeenCalled();
    expect(mockClaimTrial).not.toHaveBeenCalled();
  });

  it("reports an unknown price id as a price-configuration fault (test/live mode mismatch)", async () => {
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_new" }),
        "/v1/checkout/sessions": () => {
          throw stripeError(
            400,
            "resource_missing",
            "invalid_request_error",
            "line_items[0][price]",
          );
        },
      }),
    );
    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_price_invalid",
    });
  });

  it("names Checkout Session creation as the failing operation for other Stripe errors", async () => {
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_new" }),
        "/v1/checkout/sessions": () => {
          throw stripeError(503, null, "api_error");
        },
      }),
    );
    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_checkout_create_failed",
    });
  });

  it("keeps a freshly created customer attached when the Checkout Session then fails", async () => {
    // Partial failure must leave REUSABLE state: the customer is persisted before the session
    // is created, so the next attempt reuses it instead of minting a duplicate.
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_new" }),
        "/v1/checkout/sessions": () => {
          throw stripeError(503, null, "api_error");
        },
      }),
    );

    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_checkout_create_failed",
    });
    expect(mockAttachCustomer).toHaveBeenCalledWith(ACCOUNT, "cus_new");
    // Nothing repaired or detached — the attachment stays valid for the retry.
    expect(mockReplaceStaleCustomer).not.toHaveBeenCalled();
  });

  it("reuses the same idempotency key per account so double-clicks cannot fork a customer", async () => {
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
    const c = client({
      "/v1/customers": () => ({ id: "cus_new" }),
      "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/s" }),
    });
    mockGetClient.mockReturnValue(c);

    await checkoutPro();
    await checkoutPro();

    const keys = c.calls
      .filter((x) => x.path === "/v1/customers")
      .map((x) => x.idempotencyKey);
    expect(keys).toEqual([`platform-customer:${ACCOUNT}`, `platform-customer:${ACCOUNT}`]);
  });

  it("classifies a bare network failure as a checkout failure rather than throwing", async () => {
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_new" }),
        "/v1/checkout/sessions": () => {
          throw new TypeError("fetch failed");
        },
      }),
    );
    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_checkout_create_failed",
    });
  });
});

describe("the account's stored Stripe customer no longer exists", () => {
  const staleAttachment = {
    stripeCustomerId: "cus_stale",
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  };

  it("mints a replacement customer and completes checkout instead of failing forever", async () => {
    mockGetAttachment.mockResolvedValue(staleAttachment);
    mockReplaceStaleCustomer.mockResolvedValue({ replaced: true, customerId: "cus_fresh" });
    let sessionAttempts = 0;
    const c = client({
      "/v1/customers": () => ({ id: "cus_fresh" }),
      "/v1/checkout/sessions": (call) => {
        sessionAttempts += 1;
        if ((call.body as Record<string, unknown>).customer === "cus_stale") {
          throw stripeError(400, "resource_missing", "invalid_request_error", "customer");
        }
        return { url: "https://checkout.stripe.test/s" };
      },
    });
    mockGetClient.mockReturnValue(c);

    const result = await checkoutPro();

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/s" });
    expect(sessionAttempts).toBe(2);
    // The repair is a compare-and-set against the exact dead id.
    expect(mockReplaceStaleCustomer).toHaveBeenCalledWith(ACCOUNT, "cus_stale", "cus_fresh");
  });

  it("retries only once, so a persistently broken customer cannot loop", async () => {
    mockGetAttachment.mockResolvedValue(staleAttachment);
    mockReplaceStaleCustomer.mockResolvedValue({ replaced: true, customerId: "cus_fresh" });
    let sessionAttempts = 0;
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_fresh" }),
        "/v1/checkout/sessions": () => {
          sessionAttempts += 1;
          throw stripeError(400, "resource_missing", "invalid_request_error", "customer");
        },
      }),
    );

    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "stripe_checkout_create_failed",
    });
    expect(sessionAttempts).toBe(2);
  });

  it("refuses to detach a customer from an account that already has a subscription", async () => {
    mockGetAttachment.mockResolvedValue({
      ...staleAttachment,
      stripeSubscriptionId: "sub_live",
    });
    mockGetClient.mockReturnValue(
      client({
        "/v1/checkout/sessions": () => {
          throw stripeError(400, "resource_missing", "invalid_request_error", "customer");
        },
      }),
    );

    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "billing_attachment_invalid",
    });
    expect(mockReplaceStaleCustomer).not.toHaveBeenCalled();
  });

  it("does not repair a customer it just created (that would mask a real Stripe fault)", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockAttachCustomer.mockResolvedValue({ stored: true, customerId: "cus_new" });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_new" }),
        "/v1/checkout/sessions": () => {
          throw stripeError(400, "resource_missing", "invalid_request_error", "customer");
        },
      }),
    );

    await expect(checkoutPro()).resolves.toEqual({
      ok: false,
      reason: "billing_attachment_invalid",
    });
    expect(mockReplaceStaleCustomer).not.toHaveBeenCalled();
  });
});

describe("an account already live on the plan it is buying", () => {
  beforeEach(() => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_live",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
  });

  it.each(["active", "trialing"] as const)(
    "refuses a second subscription while the plan is %s",
    async (planStatus) => {
      mockGetPlanState.mockResolvedValue({ plan: "pro", planStatus });
      const c = client({});
      mockGetClient.mockReturnValue(c);

      await expect(checkoutPro()).resolves.toEqual({
        ok: false,
        reason: "already_on_plan",
      });
      // The refusal happens before Stripe is contacted and before the trial is claimed.
      expect(c.calls).toHaveLength(0);
      expect(mockClaimTrial).not.toHaveBeenCalled();
    },
  );

  it.each(["past_due", "canceled", "incomplete"] as const)(
    "still lets a %s subscription be restarted",
    async (planStatus) => {
      mockGetPlanState.mockResolvedValue({ plan: "pro", planStatus });
      mockGetClient.mockReturnValue(
        client({ "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/s" }) }),
      );
      await expect(checkoutPro()).resolves.toEqual({
        ok: true,
        url: "https://checkout.stripe.test/s",
      });
    },
  );

  it("still allows a genuine upgrade to a different tier", async () => {
    // A paid Team account buying Business is an UPGRADE, not a duplicate.
    mockGetAccount.mockResolvedValue({ id: ACCOUNT, type: "team", deletionStatus: null });
    mockGetPlanState.mockResolvedValue({ plan: "team", planStatus: "active" });
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_business_monthly";
    mockGetClient.mockReturnValue(
      client({ "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/biz" }) }),
    );

    await expect(
      createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "business" }),
    ).resolves.toEqual({ ok: true, url: "https://checkout.stripe.test/biz" });
  });
});

describe("checkout telemetry", () => {
  it("records the failing operation and Stripe's error identifiers without leaking secrets", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => {
          throw stripeError(402, "card_declined", "card_error", "customer");
        },
      }),
    );

    await checkoutPro();

    const line = errorLogs.find((l) => l.includes("billing.checkout"));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string);
    expect(parsed.op).toBe("customer_create");
    expect(parsed.outcome).toBe("failed");
    expect(parsed.reason).toBe("stripe_customer_create_failed");
    expect(parsed.accountId).toBe(ACCOUNT);
    expect(parsed.stripeStatus).toBe(402);
    expect(parsed.stripeCode).toBe("card_declined");
    expect(parsed.stripeType).toBe("card_error");
    expect(typeof parsed.elapsedMs).toBe("number");
  });

  it("records a completed checkout, so a working production path is verifiable from logs", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockGetClient.mockReturnValue(
      client({ "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/s" }) }),
    );

    await checkoutPro();

    const parsed = JSON.parse(
      infoLogs.find((l) => l.includes("billing.checkout")) as string,
    );
    expect(parsed.op).toBe("completed");
    expect(parsed.outcome).toBe("ok");
    expect(parsed.customer).toBe("reused");
    expect(parsed.plan).toBe("pro");
  });

  it("flags a self-healed customer attachment as an anomaly worth investigating", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: "cus_stale",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockReplaceStaleCustomer.mockResolvedValue({ replaced: true, customerId: "cus_fresh" });
    mockGetClient.mockReturnValue(
      client({
        "/v1/customers": () => ({ id: "cus_fresh" }),
        "/v1/checkout/sessions": (call) => {
          if ((call.body as Record<string, unknown>).customer === "cus_stale") {
            throw stripeError(400, "resource_missing", "invalid_request_error", "customer");
          }
          return { url: "https://checkout.stripe.test/s" };
        },
      }),
    );

    await checkoutPro();

    const parsed = JSON.parse(
      warnLogs.find((l) => l.includes("customer_repair")) as string,
    );
    expect(parsed.op).toBe("customer_repair");
    expect(parsed.stripeCode).toBe("resource_missing");
    expect(parsed.stripeParam).toBe("customer");
  });

  it("never writes the secret key, a Stripe id, or the Checkout URL to logs", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockGetClient.mockReturnValue(
      client({
        "/v1/checkout/sessions": () => ({ url: "https://checkout.stripe.test/secret-session" }),
      }),
    );

    await checkoutPro();

    const all = [...errorLogs, ...warnLogs, ...infoLogs].join("\n");
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain("sk_");
    expect(all).not.toContain("cus_existing");
    expect(all).not.toContain("secret-session");
    expect(all).not.toContain("price_pro_monthly");
  });
});
