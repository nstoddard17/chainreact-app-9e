/**
 * @jest-environment node
 *
 * RESOLVERS-2 — Stripe payment-method + charge option resolvers.
 *
 * Covers: raw-id values with human labels (brand + last4 + expiry;
 * amount + who + date), NEVER a full PAN, the three dep-name variants
 * of the payment-method family, two-hop customer resolution, honest
 * empty-picker degradation, sanitized provider errors (no leak), local
 * q filtering, and honest hasMore.
 */
const mockRefreshAndRetry = jest.fn();
const mockPaymentMethodsList = jest.fn();
const mockSubscriptionsGet = jest.fn();
const mockPaymentIntentsGet = jest.fn();
const mockChargesListExpanded = jest.fn();

class FakeNotFoundError extends Error {
  readonly resource: string;
  constructor(resource = "thing") {
    super(`Stripe resource '${resource}' not found.`);
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class Unauthorized401Error extends Error {},
  IntegrationActionRequiredError: class IntegrationActionRequiredError extends Error {},
  InsufficientScopeError: class InsufficientScopeError extends Error {},
}));
jest.mock("@/integrations/_shared/stripe/errors", () => ({
  NotFoundError: FakeNotFoundError,
}));
jest.mock("@/integrations/stripe/api/paymentMethods", () => ({
  paymentMethodsList: (...args: unknown[]) => mockPaymentMethodsList(...args),
}));
jest.mock("@/integrations/stripe/api/subscriptions", () => ({
  subscriptionsGet: (...args: unknown[]) => mockSubscriptionsGet(...args),
}));
jest.mock("@/integrations/stripe/api/paymentIntents", () => ({
  paymentIntentsGet: (...args: unknown[]) => mockPaymentIntentsGet(...args),
}));
jest.mock("@/integrations/stripe/api/charges", () => ({
  chargesListExpanded: (...args: unknown[]) => mockChargesListExpanded(...args),
}));

import { OptionsResolverError } from "@/services/options/types";
import {
  stripePaymentMethodsResolver,
  stripeSubscriptionPaymentMethodsResolver,
  stripePaymentIntentPaymentMethodsResolver,
} from "@/integrations/stripe/options/paymentMethods";
import { stripeChargesResolver } from "@/integrations/stripe/options/charges";

const INTEGRATION = {
  id: "int-1",
  accountId: "acct-1",
  provider: "stripe",
  providerAccountId: "acct_stripe_1",
  accountMetadata: {},
};

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acct-1",
    userId: "u-1",
    q: "",
    deps: {},
    integration: INTEGRATION,
    ...overrides,
  } as never;
}

const VISA = {
  id: "pm_visa",
  object: "payment_method",
  type: "card",
  created: 1,
  card: { brand: "visa", last4: "4242", exp_month: 8, exp_year: 2027 },
};
const AMEX = {
  id: "pm_amex",
  object: "payment_method",
  type: "card",
  created: 2,
  card: { brand: "amex", last4: "0005", exp_month: 12, exp_year: 2030 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("stripe:payment_methods (dep: customerId)", () => {
  it("declares the customerId dep so create_subscription's picker resolves", () => {
    expect(stripePaymentMethodsResolver.source).toBe("stripe:payment_methods");
    expect(stripePaymentMethodsResolver.requiredDeps).toEqual(["customerId"]);
    expect(stripePaymentMethodsResolver.requiresIntegration).toBe(true);
  });

  it("labels brand + last4 + expiry, values the pm_ id", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [VISA, AMEX],
      has_more: false,
    });
    const result = await stripePaymentMethodsResolver.resolve(
      ctx({ deps: { customerId: "cus_1" } }),
    );
    expect(result.items).toEqual([
      { value: "pm_amex", label: "Amex ending 0005 — exp 12/2030", description: "pm_amex" },
      { value: "pm_visa", label: "Visa ending 4242 — exp 08/2027", description: "pm_visa" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("scopes the listing to the dep customer and asks for ALL types (not just card)", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [],
      has_more: false,
    });
    await stripePaymentMethodsResolver.resolve(
      ctx({ deps: { customerId: "cus_7" } }),
    );
    expect(mockPaymentMethodsList).toHaveBeenCalledWith({
      accessToken: "tok",
      customer: "cus_7",
      limit: 100,
    });
    // `type` omitted → ACH / SEPA / Link methods are not silently hidden.
    expect(mockPaymentMethodsList.mock.calls[0][0]).not.toHaveProperty("type");
  });

  it("NEVER surfaces a full PAN — only last4 reaches the label", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          ...VISA,
          // Belt-and-braces: even if Stripe ever echoed extra card /
          // billing detail, none of it may reach an option item.
          card: { ...VISA.card, fingerprint: "fp_secret", iin: "424242" },
          billing_details: {
            name: "Jane Doe",
            email: "jane@secret.test",
            phone: "+15551234567",
            address: { line1: "1 Secret Way" },
          },
        },
      ],
      has_more: false,
    });
    const result = await stripePaymentMethodsResolver.resolve(
      ctx({ deps: { customerId: "cus_1" } }),
    );
    const text = JSON.stringify(result.items);
    expect(text).toContain("4242");
    expect(text).not.toContain("4242424242424242");
    expect(text).not.toContain("424242");
    expect(text).not.toContain("fp_secret");
    expect(text).not.toContain("jane@secret.test");
    expect(text).not.toContain("+15551234567");
    expect(text).not.toContain("1 Secret Way");
    expect(text).not.toContain("Jane Doe");
  });

  it("labels non-card types without inventing a card", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "pm_bank",
          object: "payment_method",
          type: "us_bank_account",
          created: 1,
          us_bank_account: { bank_name: "STRIPE TEST BANK", last4: "6789" },
        },
        {
          id: "pm_sepa",
          object: "payment_method",
          type: "sepa_debit",
          created: 2,
          sepa_debit: { last4: "3000" },
        },
        { id: "pm_link", object: "payment_method", type: "link", created: 3 },
      ],
      has_more: false,
    });
    const result = await stripePaymentMethodsResolver.resolve(
      ctx({ deps: { customerId: "cus_1" } }),
    );
    expect(result.items.map((i) => i.label)).toEqual([
      "Link",
      "SEPA Direct Debit ending 3000",
      "STRIPE TEST BANK ending 6789",
    ]);
  });

  it("filters locally on ctx.q and reports hasMore honestly", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [VISA, AMEX],
      has_more: true,
    });
    const result = await stripePaymentMethodsResolver.resolve(
      ctx({ deps: { customerId: "cus_1" }, q: "visa" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["pm_visa"]);
    expect(result.hasMore).toBe(true);
  });

  it("throws MISSING_DEPENDENCY when no customer is selected", async () => {
    await expect(
      stripePaymentMethodsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when no integration row exists", async () => {
    await expect(
      stripePaymentMethodsResolver.resolve(
        ctx({ integration: null, deps: { customerId: "cus_1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });

  it("maps provider failures to a sanitized PROVIDER_ERROR (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        "Stripe GET /v1/payment_methods failed: sk_live_abc123 rejected for cus_1",
      ),
    );
    let caught: unknown;
    try {
      await stripePaymentMethodsResolver.resolve(
        ctx({ deps: { customerId: "cus_1" } }),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const message = (caught as Error).message;
    expect(message).not.toContain("sk_live_abc123");
    expect(message).not.toContain("/v1/payment_methods");
    expect(message).toBe("Couldn't load Stripe payment methods. Try again.");
  });

  it("maps a 401 that escaped refresh to INTEGRATION_DISCONNECTED", async () => {
    const { Unauthorized401Error } = jest.requireMock(
      "@/services/oauth/refreshAndRetry",
    ) as { Unauthorized401Error: new () => Error };
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      stripePaymentMethodsResolver.resolve(ctx({ deps: { customerId: "cus_1" } })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("returns an empty picker (not an error) when the customer is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new FakeNotFoundError("customer cus_x"));
    const result = await stripePaymentMethodsResolver.resolve(
      ctx({ deps: { customerId: "cus_x" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("stripe:subscription_payment_methods (dep: subscriptionId)", () => {
  it("mirrors payment_methods on the subscriptionId dep name", () => {
    expect(stripeSubscriptionPaymentMethodsResolver.source).toBe(
      "stripe:subscription_payment_methods",
    );
    expect(stripeSubscriptionPaymentMethodsResolver.requiredDeps).toEqual([
      "subscriptionId",
    ]);
  });

  it("resolves the subscription's customer, then lists that customer's methods", async () => {
    mockSubscriptionsGet.mockResolvedValueOnce({
      id: "sub_1",
      object: "subscription",
      customer: "cus_42",
    });
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [VISA],
      has_more: false,
    });
    const result = await stripeSubscriptionPaymentMethodsResolver.resolve(
      ctx({ deps: { subscriptionId: "sub_1" } }),
    );
    expect(mockSubscriptionsGet).toHaveBeenCalledWith({
      accessToken: "tok",
      subscriptionId: "sub_1",
    });
    expect(mockPaymentMethodsList).toHaveBeenCalledWith({
      accessToken: "tok",
      customer: "cus_42",
      limit: 100,
    });
    expect(result.items).toEqual([
      { value: "pm_visa", label: "Visa ending 4242 — exp 08/2027", description: "pm_visa" },
    ]);
  });

  it("throws MISSING_DEPENDENCY before any call when no subscription is selected", async () => {
    await expect(
      stripeSubscriptionPaymentMethodsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockSubscriptionsGet).not.toHaveBeenCalled();
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });

  it("returns an empty picker when the subscription no longer exists", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new FakeNotFoundError("subscription sub_x"));
    const result = await stripeSubscriptionPaymentMethodsResolver.resolve(
      ctx({ deps: { subscriptionId: "sub_x" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });

  it("sanitizes a lookup failure (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Stripe GET /v1/subscriptions/sub_1 failed: sk_live_zzz"),
    );
    let caught: unknown;
    try {
      await stripeSubscriptionPaymentMethodsResolver.resolve(
        ctx({ deps: { subscriptionId: "sub_1" } }),
      );
    } catch (err) {
      caught = err;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as Error).message).not.toContain("sk_live_zzz");
  });
});

describe("stripe:payment_intent_payment_methods (dep: paymentIntentId)", () => {
  it("mirrors payment_methods on the paymentIntentId dep name", () => {
    expect(stripePaymentIntentPaymentMethodsResolver.source).toBe(
      "stripe:payment_intent_payment_methods",
    );
    expect(stripePaymentIntentPaymentMethodsResolver.requiredDeps).toEqual([
      "paymentIntentId",
    ]);
  });

  it("resolves the intent's customer, then lists that customer's methods", async () => {
    mockPaymentIntentsGet.mockResolvedValueOnce({
      id: "pi_1",
      object: "payment_intent",
      customer: "cus_9",
      client_secret: "pi_1_secret_SHOULD_NEVER_LEAK",
    });
    mockPaymentMethodsList.mockResolvedValueOnce({
      object: "list",
      data: [VISA],
      has_more: false,
    });
    const result = await stripePaymentIntentPaymentMethodsResolver.resolve(
      ctx({ deps: { paymentIntentId: "pi_1" } }),
    );
    expect(mockPaymentIntentsGet).toHaveBeenCalledWith({
      accessToken: "tok",
      paymentIntentId: "pi_1",
    });
    expect(mockPaymentMethodsList).toHaveBeenCalledWith({
      accessToken: "tok",
      customer: "cus_9",
      limit: 100,
    });
    // The intent's client_secret is read but must never reach an item.
    expect(JSON.stringify(result.items)).not.toContain("secret");
  });

  it("returns an empty picker for a customer-less (guest) intent", async () => {
    mockPaymentIntentsGet.mockResolvedValueOnce({
      id: "pi_guest",
      object: "payment_intent",
      customer: null,
    });
    const result = await stripePaymentIntentPaymentMethodsResolver.resolve(
      ctx({ deps: { paymentIntentId: "pi_guest" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });

  it("returns an empty picker when the intent id doesn't exist", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new FakeNotFoundError("payment_intent pi_x"));
    const result = await stripePaymentIntentPaymentMethodsResolver.resolve(
      ctx({ deps: { paymentIntentId: "pi_x" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws MISSING_DEPENDENCY when no intent is set", async () => {
    await expect(
      stripePaymentIntentPaymentMethodsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockPaymentIntentsGet).not.toHaveBeenCalled();
  });
});

describe("stripe:charges", () => {
  it("is account-scoped with no deps (create_refund has no customer field)", () => {
    expect(stripeChargesResolver.source).toBe("stripe:charges");
    expect(stripeChargesResolver.requiredDeps).toBeUndefined();
    expect(stripeChargesResolver.requiresIntegration).toBe(true);
  });

  it("labels 'amount — who — date' with the ch_ id as value", async () => {
    mockChargesListExpanded.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "ch_1",
          object: "charge",
          amount: 4200,
          currency: "usd",
          status: "succeeded",
          created: 1782864000, // 2026-07-01
          description: null,
          customer: { id: "cus_1", name: "Acme Corp", email: "no@leak.test" },
        },
        {
          id: "ch_2",
          object: "charge",
          amount: 150000,
          currency: "usd",
          status: "succeeded",
          created: 1782864000,
          description: "Invoice INV-9",
          customer: "cus_2",
        },
      ],
      has_more: false,
    });
    const result = await stripeChargesResolver.resolve(ctx());
    // Shared `filterAndSortByLabel` sorts alphabetically (every Stripe
    // picker does), so the $1,500 row leads the $42 row — see the
    // ordering caveat in charges.ts. `ctx.q` is the real find path.
    expect(result.items).toEqual([
      {
        value: "ch_2",
        label: "$1,500.00 — Invoice INV-9 — 2026-07-01",
        description: "ch_2",
      },
      {
        value: "ch_1",
        label: "$42.00 — Acme Corp — 2026-07-01",
        description: "ch_1",
      },
    ]);
    // Customer NAME only — never the expanded customer's email.
    expect(JSON.stringify(result.items)).not.toContain("no@leak.test");
  });

  it("requests one bounded expanded page", async () => {
    mockChargesListExpanded.mockResolvedValueOnce({
      object: "list",
      data: [],
      has_more: false,
    });
    await stripeChargesResolver.resolve(ctx());
    expect(mockChargesListExpanded).toHaveBeenCalledWith({
      accessToken: "tok",
      limit: 100,
      expandCustomer: true,
    });
  });

  it("formats zero-decimal currencies without the 100x error", async () => {
    mockChargesListExpanded.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "ch_jpy",
          object: "charge",
          amount: 1000, // JPY has no minor unit — this is ¥1,000, not ¥10.00
          currency: "jpy",
          status: "succeeded",
          created: 1782864000,
          description: "Tokyo order",
          customer: null,
        },
      ],
      has_more: false,
    });
    const result = await stripeChargesResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("¥1,000 — Tokyo order — 2026-07-01");
  });

  it("omits the middle segment when a charge has neither description nor named customer", async () => {
    mockChargesListExpanded.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "ch_bare",
          object: "charge",
          amount: 500,
          currency: "usd",
          status: "succeeded",
          created: 1782864000,
          description: null,
          customer: null,
        },
      ],
      has_more: false,
    });
    const result = await stripeChargesResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("$5.00 — 2026-07-01");
  });

  it("filters locally on ctx.q (label or ch_ id) and reports hasMore honestly", async () => {
    mockChargesListExpanded.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "ch_abc",
          object: "charge",
          amount: 100,
          currency: "usd",
          status: "succeeded",
          created: 1782864000,
          description: "Acme order",
          customer: null,
        },
        {
          id: "ch_xyz",
          object: "charge",
          amount: 200,
          currency: "usd",
          status: "succeeded",
          created: 1782864000,
          description: "Beta order",
          customer: null,
        },
      ],
      has_more: true,
    });
    const byLabel = await stripeChargesResolver.resolve(ctx({ q: "acme" }));
    expect(byLabel.items.map((i) => i.value)).toEqual(["ch_abc"]);
    expect(byLabel.hasMore).toBe(true);
  });

  it("throws INTEGRATION_DISCONNECTED without an integration row", async () => {
    await expect(
      stripeChargesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockChargesListExpanded).not.toHaveBeenCalled();
  });

  it("maps provider failures to a sanitized PROVIDER_ERROR (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Stripe GET /v1/charges failed: sk_live_deadbeef unauthorized"),
    );
    let caught: unknown;
    try {
      await stripeChargesResolver.resolve(ctx());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const message = (caught as Error).message;
    expect(message).not.toContain("sk_live_deadbeef");
    expect(message).not.toContain("/v1/charges");
    expect(message).toBe("Couldn't load Stripe charges. Try again.");
  });
});
