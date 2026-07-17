/**
 * @jest-environment node
 *
 * Tests for `integrations/shopify/options/orders.ts` — RESOLVERS-2.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration shape (no deps).
 *   - Auth via refreshAndRetry pinned to the integration row's shop
 *     (providerAccountId = shopDomain — config can never override).
 *   - Business label (`#1001 - Jane Smith - 84.20 USD - paid`), string
 *     value, id only in `description`; NO customer email / phone / address.
 *   - Most-recent-first order PRESERVED through the q filter (no alpha sort).
 *   - hasMore from truncated.
 *   - Disconnected guard, 401 → INTEGRATION_DISCONNECTED, 403 →
 *     PROVIDER_REAUTH_REQUIRED, other → sanitized PROVIDER_ERROR (no leak).
 */
const mockRefreshAndRetry = jest.fn();
const mockOrdersList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});
jest.mock("@/integrations/_shared/shopify/api/orders", () => ({
  __esModule: true,
  ordersList: (...args: unknown[]) => mockOrdersList(...args),
}));

import { shopifyOrdersResolver } from "@/integrations/shopify/options/orders";
import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "shopify",
  providerAccountId: "acme.myshopify.com",
  displayName: "acme.myshopify.com",
  accessTokenEncrypted: "enc:shpat-cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["read_orders", "write_orders"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: {},
  ...o,
});

const order = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 450789469,
  name: "#1001",
  orderNumber: 1001,
  customerName: "Jane Smith",
  totalPrice: "84.20",
  currency: "USD",
  financialStatus: "paid",
  createdAt: "2026-07-10T00:00:00Z",
  ...o,
});

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOrdersList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("shpat-tok"),
  );
});

describe("shopifyOrdersResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(shopifyOrdersResolver.source).toBe("shopify:orders");
    expect(shopifyOrdersResolver.provider).toBe("shopify");
    expect(shopifyOrdersResolver.requiresIntegration).toBe(true);
    expect(shopifyOrdersResolver.requiredDeps).toBeUndefined();
  });
});

describe("shopifyOrdersResolver — auth pinning", () => {
  it("pins refreshAndRetry + the wrapper to the integration row's shop domain", async () => {
    mockOrdersList.mockResolvedValueOnce({ orders: [], truncated: false });
    await shopifyOrdersResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        provider: "shopify",
        providerAccountId: "acme.myshopify.com",
      }),
    );
    expect(mockOrdersList).toHaveBeenCalledWith({
      shopDomain: "acme.myshopify.com",
      accessToken: "shpat-tok",
    });
  });
});

describe("shopifyOrdersResolver — labels", () => {
  it("builds a business label: name - customer - total+currency - status; id only in description", async () => {
    mockOrdersList.mockResolvedValueOnce({ orders: [order()], truncated: false });
    const result = await shopifyOrdersResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "450789469",
        label: "#1001 - Jane Smith - 84.20 USD - paid",
        description: "450789469",
      },
    ]);
  });

  it("drops missing parts cleanly and falls back name → #orderNumber → id", async () => {
    mockOrdersList.mockResolvedValueOnce({
      orders: [
        order({ name: "", customerName: "", totalPrice: "", currency: "" }),
        order({
          id: 7,
          name: "",
          orderNumber: null,
          customerName: "",
          totalPrice: "",
          currency: "",
          financialStatus: "",
          createdAt: "2026-07-09T00:00:00Z",
        }),
      ],
      truncated: false,
    });
    const result = await shopifyOrdersResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["#1001 - paid", "7"]);
  });

  it("never surfaces a customer email / phone / address, even if the wrapper regressed", async () => {
    mockOrdersList.mockResolvedValueOnce({
      orders: [
        {
          ...order(),
          // Not part of OrderOption — proves the resolver builds labels from a
          // fixed key set rather than spreading whatever it is handed.
          email: "jane@example.com",
          phone: "+15551234567",
          shipping_address: { address1: "1 Main St", zip: "11201" },
        },
      ],
      truncated: false,
    });
    const result = await shopifyOrdersResolver.resolve(ctx());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/jane@example\.com|5551234567|Main St|11201/);
  });
});

describe("shopifyOrdersResolver — ordering, filtering, hasMore", () => {
  it("preserves the wrapper's most-recent-first order (no alpha sort) through a q filter", async () => {
    mockOrdersList.mockResolvedValueOnce({
      orders: [
        order({ id: 3, name: "#1003", customerName: "Zoe Ash", createdAt: "2026-07-12T00:00:00Z" }),
        order({ id: 2, name: "#1002", customerName: "Al Brown", createdAt: "2026-07-11T00:00:00Z" }),
        order({ id: 1, name: "#1001", customerName: "Mia Cole", createdAt: "2026-07-10T00:00:00Z" }),
      ],
      truncated: false,
    });
    const result = await shopifyOrdersResolver.resolve(ctx());
    // Newest first — NOT alphabetical by customer ("Al Brown" would lead.)
    expect(result.items.map((i) => i.value)).toEqual(["3", "2", "1"]);
  });

  it("filters case-insensitively on the label and propagates truncated → hasMore", async () => {
    mockOrdersList.mockResolvedValueOnce({
      orders: [
        order({ id: 3, name: "#1003", customerName: "Zoe Ash" }),
        order({ id: 2, name: "#1002", customerName: "Al Brown" }),
      ],
      truncated: true,
    });
    const result = await shopifyOrdersResolver.resolve(ctx({ q: "zoe" }));
    expect(result.items.map((i) => i.value)).toEqual(["3"]);
    expect(result.hasMore).toBe(true);
  });
});

describe("shopifyOrdersResolver — error sanitization (leak-free)", () => {
  it("throws INTEGRATION_DISCONNECTED without an integration (no call)", async () => {
    await expect(
      shopifyOrdersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps a 401 / refresh-not-supported to INTEGRATION_DISCONNECTED (reconnect fix)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(shopifyOrdersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "shopify",
        providerAccountId: "acme.myshopify.com",
        reason: "refresh_not_supported",
      }),
    );
    await expect(shopifyOrdersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps an insufficient-scope 403 to PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("403", "shopify"),
    );
    await expect(shopifyOrdersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_REAUTH_REQUIRED",
    });
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy, no token/shop/body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        "Shopify GET /orders.json failed: raw body token=shpat-tok shop=acme.myshopify.com",
      ),
    );
    const err = await shopifyOrdersResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toMatch(
      /shpat-tok|raw body|myshopify/,
    );
    expect((err as OptionsResolverError).message).toMatch(
      /couldn't load shopify orders/i,
    );
  });
});
