/**
 * @jest-environment node
 *
 * Tests for `integrations/shopify/options/variants.ts` — RESOLVERS-2.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration shape. **No
 *     requiredDeps** — update_product_variant has no sibling product field
 *     to depend on, so this is deliberately a flat product-qualified picker.
 *   - Auth pinned to the integration row's shop.
 *   - Label = "Product - Variant - SKU x - price"; string value; id only in
 *     `description`.
 *   - q filter + alpha sort (groups a product's variants); hasMore honest.
 *   - Disconnected / 401 / 403 / provider-error sanitization (no leak).
 */
const mockRefreshAndRetry = jest.fn();
const mockProductVariantsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});
jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  __esModule: true,
  productVariantsList: (...args: unknown[]) => mockProductVariantsList(...args),
}));

import { shopifyVariantsResolver } from "@/integrations/shopify/options/variants";
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
  mockProductVariantsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("shpat-tok"),
  );
});

describe("shopifyVariantsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields and NO deps", () => {
    expect(shopifyVariantsResolver.source).toBe("shopify:variants");
    expect(shopifyVariantsResolver.provider).toBe("shopify");
    expect(shopifyVariantsResolver.requiresIntegration).toBe(true);
    // Flat by design — the runtime schema has no product field to cascade from.
    expect(shopifyVariantsResolver.requiredDeps).toBeUndefined();
  });

  it("resolves with no deps supplied", async () => {
    mockProductVariantsList.mockResolvedValueOnce({ variants: [], truncated: false });
    await expect(shopifyVariantsResolver.resolve(ctx({ deps: {} }))).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });
});

describe("shopifyVariantsResolver — auth pinning", () => {
  it("pins refreshAndRetry + the wrapper to the integration row's shop domain", async () => {
    mockProductVariantsList.mockResolvedValueOnce({ variants: [], truncated: false });
    await shopifyVariantsResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        provider: "shopify",
        providerAccountId: "acme.myshopify.com",
      }),
    );
    expect(mockProductVariantsList).toHaveBeenCalledWith({
      shopDomain: "acme.myshopify.com",
      accessToken: "shpat-tok",
    });
  });
});

describe("shopifyVariantsResolver — labels", () => {
  it("builds `Product - Variant - SKU x - price`; id only in description", async () => {
    mockProductVariantsList.mockResolvedValueOnce({
      variants: [
        {
          id: 808950810,
          productTitle: "Acme Tee",
          variantTitle: "Small / Blue",
          sku: "ABC-1",
          price: "19.00",
        },
      ],
      truncated: false,
    });
    const result = await shopifyVariantsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "808950810",
        label: "Acme Tee - Small / Blue - SKU ABC-1 - 19.00",
        description: "808950810",
      },
    ]);
  });

  it("drops missing parts cleanly; falls back to the id when nothing is labelable", async () => {
    mockProductVariantsList.mockResolvedValueOnce({
      variants: [
        {
          id: 2,
          productTitle: "Acme Mug",
          variantTitle: "Default Title",
          sku: "",
          price: "12.00",
        },
        { id: 3, productTitle: "", variantTitle: "", sku: "", price: "" },
      ],
      truncated: false,
    });
    const result = await shopifyVariantsResolver.resolve(ctx());
    expect(result.items.map((i) => i.label).sort()).toEqual([
      "3",
      "Acme Mug - Default Title - 12.00",
    ]);
  });
});

describe("shopifyVariantsResolver — filtering + hasMore", () => {
  it("filters case-insensitively on the label (matches SKU too) and alpha-sorts", async () => {
    mockProductVariantsList.mockResolvedValueOnce({
      variants: [
        { id: 2, productTitle: "Zeta Tee", variantTitle: "L", sku: "Z-1", price: "9.00" },
        { id: 1, productTitle: "Acme Tee", variantTitle: "S", sku: "A-1", price: "9.00" },
      ],
      truncated: true,
    });
    const all = await shopifyVariantsResolver.resolve(ctx());
    expect(all.items.map((i) => i.value)).toEqual(["1", "2"]);
    expect(all.hasMore).toBe(true);

    mockProductVariantsList.mockResolvedValueOnce({
      variants: [
        { id: 2, productTitle: "Zeta Tee", variantTitle: "L", sku: "Z-1", price: "9.00" },
        { id: 1, productTitle: "Acme Tee", variantTitle: "S", sku: "A-1", price: "9.00" },
      ],
      truncated: false,
    });
    const filtered = await shopifyVariantsResolver.resolve(ctx({ q: "z-1" }));
    expect(filtered.items.map((i) => i.value)).toEqual(["2"]);
    expect(filtered.hasMore).toBe(false);
  });
});

describe("shopifyVariantsResolver — error sanitization (leak-free)", () => {
  it("throws INTEGRATION_DISCONNECTED without an integration (no call)", async () => {
    await expect(
      shopifyVariantsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps a 401 / refresh-not-supported to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(shopifyVariantsResolver.resolve(ctx())).rejects.toMatchObject({
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
    await expect(shopifyVariantsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps an insufficient-scope 403 to PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("403", "shopify"),
    );
    await expect(shopifyVariantsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_REAUTH_REQUIRED",
    });
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy, no token/shop/body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        "Shopify GET /products.json failed: raw body token=shpat-tok shop=acme.myshopify.com",
      ),
    );
    const err = await shopifyVariantsResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toMatch(
      /shpat-tok|raw body|myshopify/,
    );
    expect((err as OptionsResolverError).message).toMatch(
      /couldn't load shopify product variants/i,
    );
  });
});
