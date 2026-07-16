/**
 * @jest-environment node
 *
 * Tests for `integrations/shopify/options/products.ts` — RESOLVERS-1.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration shape (no deps).
 *   - Auth via refreshAndRetry pinned to the integration row's shop
 *     (providerAccountId = shopDomain — config can never override).
 *   - Maps numeric id → string value; label = title (id fallback);
 *     Draft/Archived hint; NO prices / variants / inventory in the result.
 *   - Case-insensitive q filter + alpha sort; hasMore from truncated.
 *   - Disconnected guard, 401 → INTEGRATION_DISCONNECTED (non-refreshable),
 *     provider-error sanitization (static copy).
 */
const mockRefreshAndRetry = jest.fn();
const mockProductsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});
jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  __esModule: true,
  productsList: (...args: unknown[]) => mockProductsList(...args),
}));

import { shopifyProductsResolver } from "@/integrations/shopify/options/products";
import {
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
  scopes: ["read_products", "write_products"],
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

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockProductsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("shpat-tok"),
  );
});

describe("shopifyProductsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(shopifyProductsResolver.source).toBe("shopify:products");
    expect(shopifyProductsResolver.provider).toBe("shopify");
    expect(shopifyProductsResolver.requiresIntegration).toBe(true);
    expect(shopifyProductsResolver.requiredDeps).toBeUndefined();
  });
});

describe("shopifyProductsResolver — auth pinning", () => {
  it("pins refreshAndRetry + the wrapper to the integration row's shop domain", async () => {
    mockProductsList.mockResolvedValueOnce({ products: [], truncated: false });
    await shopifyProductsResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        provider: "shopify",
        providerAccountId: "acme.myshopify.com",
      }),
    );
    expect(mockProductsList).toHaveBeenCalledWith({
      shopDomain: "acme.myshopify.com",
      accessToken: "shpat-tok",
    });
  });
});

describe("shopifyProductsResolver — mapping", () => {
  it("maps numeric ids to STRING values; label = title; Draft/Archived hint; no price leak", async () => {
    mockProductsList.mockResolvedValueOnce({
      products: [
        { id: 632910392, title: "Widget", status: "active" },
        { id: 632910393, title: "Old Widget", status: "archived" },
        { id: 632910394, title: "Unreleased", status: "draft" },
        // Title missing → id fallback.
        { id: 632910395, title: "", status: "active" },
      ],
      truncated: false,
    });
    const result = await shopifyProductsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "632910395", label: "632910395" },
      { value: "632910393", label: "Old Widget", description: "Archived" },
      { value: "632910394", label: "Unreleased", description: "Draft" },
      { value: "632910392", label: "Widget" },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/price|variant|inventory/i);
  });

  it("filters case-insensitively on q and propagates truncated → hasMore", async () => {
    mockProductsList.mockResolvedValueOnce({
      products: [
        { id: 1, title: "Blue Shirt", status: "active" },
        { id: 2, title: "Red Mug", status: "active" },
      ],
      truncated: true,
    });
    const result = await shopifyProductsResolver.resolve(ctx({ q: "SHIRT" }));
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
    expect(result.hasMore).toBe(true);
  });
});

describe("shopifyProductsResolver — error sanitization (leak-free)", () => {
  it("throws INTEGRATION_DISCONNECTED without an integration (no call)", async () => {
    await expect(
      shopifyProductsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps a 401 / refresh-not-supported to INTEGRATION_DISCONNECTED (reconnect fix)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(shopifyProductsResolver.resolve(ctx())).rejects.toMatchObject({
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
    await expect(shopifyProductsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy, no raw leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Shopify GET /products.json failed: raw body token=shpat-tok"),
    );
    const err = await shopifyProductsResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toMatch(/shpat-tok|raw body/);
    expect((err as OptionsResolverError).message).toMatch(
      /couldn't load shopify products/i,
    );
  });
});
