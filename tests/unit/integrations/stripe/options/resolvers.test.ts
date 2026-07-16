/**
 * @jest-environment node
 *
 * RESOLVERS-1 — Stripe options resolvers: raw-id values with PII-safe
 * labels (customer names — never emails/phones/balances; price catalog
 * labels), disconnected guard, sanitized provider errors, local q
 * filtering, and honest hasMore.
 */
const mockRefreshAndRetry = jest.fn();
const mockCustomersList = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockPricesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class Unauthorized401Error extends Error {},
  IntegrationActionRequiredError: class IntegrationActionRequiredError extends Error {},
  InsufficientScopeError: class InsufficientScopeError extends Error {},
}));
jest.mock("@/integrations/stripe/api/customers", () => ({
  customersList: (...args: unknown[]) => mockCustomersList(...args),
}));
jest.mock("@/integrations/stripe/api/subscriptions", () => ({
  subscriptionsList: (...args: unknown[]) => mockSubscriptionsList(...args),
}));
jest.mock("@/integrations/stripe/api/prices", () => ({
  pricesList: (...args: unknown[]) => mockPricesList(...args),
}));

import { OptionsResolverError } from "@/services/options/types";
import { stripeCustomersResolver } from "@/integrations/stripe/options/customers";
import { stripeSubscriptionsResolver } from "@/integrations/stripe/options/subscriptions";
import { stripePricesResolver } from "@/integrations/stripe/options/prices";

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

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("stripe:customers", () => {
  it("returns cus_ id values with NAME-ONLY labels (no emails/phones/balances)", async () => {
    mockCustomersList.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "cus_2",
          name: "Acme Corp",
          email: "secret@acme.test",
          phone: "+1555",
          balance: 999,
        },
        { id: "cus_1", name: null, email: "hidden@x.test" },
      ],
      has_more: false,
    });
    const result = await stripeCustomersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "cus_2", label: "Acme Corp", description: "cus_2" },
      // Unnamed customer falls back to its id (still pickable).
      { value: "cus_1", label: "cus_1", description: undefined },
    ]);
    const text = JSON.stringify(result.items);
    expect(text).not.toContain("secret@acme.test");
    expect(text).not.toContain("hidden@x.test");
    expect(text).not.toContain("999");
    expect(text).not.toContain("+1555");
    expect(result.hasMore).toBe(false);
  });

  it("filters locally on ctx.q across label and id", async () => {
    mockCustomersList.mockResolvedValueOnce({
      object: "list",
      data: [
        { id: "cus_a", name: "Acme Corp" },
        { id: "cus_b", name: "Beta LLC" },
      ],
      has_more: true,
    });
    const result = await stripeCustomersResolver.resolve(ctx({ q: "acme" }));
    expect(result.items.map((i) => i.value)).toEqual(["cus_a"]);
    expect(result.hasMore).toBe(true);
  });

  it("throws INTEGRATION_DISCONNECTED when no integration row exists", async () => {
    await expect(
      stripeCustomersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockCustomersList).not.toHaveBeenCalled();
  });

  it("maps provider failures to a sanitized PROVIDER_ERROR (no Stripe internals)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Stripe GET /v1/customers failed: sk_live_ leaked detail"),
    );
    let caught: unknown;
    try {
      await stripeCustomersResolver.resolve(ctx());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as Error).message).not.toContain("sk_live_");
  });
});

describe("stripe:subscriptions", () => {
  it("labels by expanded customer name + status; sub id in description + value", async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "sub_1",
          object: "subscription",
          status: "active",
          customer: { id: "cus_1", name: "Acme Corp", email: "no@leak.test" },
          created: 1,
        },
        {
          id: "sub_2",
          object: "subscription",
          status: "canceled",
          customer: "cus_9",
          created: 2,
        },
      ],
      has_more: false,
    });
    const result = await stripeSubscriptionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sub_1", label: "Acme Corp — active", description: "sub_1" },
      { value: "sub_2", label: "cus_9 — canceled", description: "sub_2" },
    ]);
    expect(JSON.stringify(result.items)).not.toContain("no@leak.test");
  });

  it("requests one bounded expanded page across all statuses", async () => {
    mockSubscriptionsList.mockResolvedValueOnce({ object: "list", data: [], has_more: false });
    await stripeSubscriptionsResolver.resolve(ctx());
    expect(mockSubscriptionsList).toHaveBeenCalledWith({
      accessToken: "tok",
      limit: 100,
      status: "all",
      expandCustomer: true,
    });
  });

  it("q filters on the sub id in description too (power users paste fragments)", async () => {
    mockSubscriptionsList.mockResolvedValueOnce({
      object: "list",
      data: [
        { id: "sub_abc", object: "subscription", status: "active", customer: "cus_1", created: 1 },
        { id: "sub_xyz", object: "subscription", status: "active", customer: "cus_2", created: 2 },
      ],
      has_more: false,
    });
    const result = await stripeSubscriptionsResolver.resolve(ctx({ q: "xyz" }));
    expect(result.items.map((i) => i.value)).toEqual(["sub_xyz"]);
  });

  it("throws INTEGRATION_DISCONNECTED without an integration row", async () => {
    await expect(
      stripeSubscriptionsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("stripe:prices", () => {
  it("labels 'product — amount/interval' with the price_ id as value", async () => {
    mockPricesList.mockResolvedValueOnce({
      object: "list",
      data: [
        {
          id: "price_1",
          object: "price",
          active: true,
          nickname: null,
          currency: "usd",
          unit_amount: 2900,
          recurring: { interval: "month", interval_count: 1 },
          product: { id: "prod_1", name: "Pro Plan" },
        },
        {
          id: "price_2",
          object: "price",
          active: true,
          nickname: "Legacy",
          currency: "eur",
          unit_amount: null,
          recurring: null,
          product: "prod_2",
        },
      ],
      has_more: false,
    });
    const result = await stripePricesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "price_2", label: "Legacy — custom pricing", description: "price_2" },
      { value: "price_1", label: "Pro Plan — 29.00 USD/month", description: "price_1" },
    ]);
  });

  it("requests only ACTIVE prices with product expansion", async () => {
    mockPricesList.mockResolvedValueOnce({ object: "list", data: [], has_more: false });
    await stripePricesResolver.resolve(ctx());
    expect(mockPricesList).toHaveBeenCalledWith({
      accessToken: "tok",
      limit: 100,
      active: true,
      expandProduct: true,
    });
  });

  it("maps a 401 that escaped refresh to INTEGRATION_DISCONNECTED", async () => {
    const { Unauthorized401Error } = jest.requireMock(
      "@/services/oauth/refreshAndRetry",
    ) as { Unauthorized401Error: new () => Error };
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(stripePricesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });
});
