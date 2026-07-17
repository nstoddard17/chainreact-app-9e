/**
 * @jest-environment node
 *
 * Tests for `integrations/shopify/options/locations.ts` — RESOLVERS-2.
 *
 * Pin:
 *   - Canonical source / provider / requiresIntegration shape (no deps).
 *   - Auth pinned to the integration row's shop.
 *   - Label = "Warehouse - Brooklyn, NY" (name + city/locality); NO street
 *     address / zip / phone; Inactive hint.
 *   - THE SCOPE CASE: a token predating the OPTIONAL `read_locations` add
 *     gets 403 → PROVIDER_REAUTH_REQUIRED (Reconnect), not an empty box.
 *   - Disconnected / 401 / provider-error sanitization (no leak).
 */
const mockRefreshAndRetry = jest.fn();
const mockLocationsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});
jest.mock("@/integrations/_shared/shopify/api/locations", () => ({
  __esModule: true,
  locationsList: (...args: unknown[]) => mockLocationsList(...args),
}));

import { shopifyLocationsResolver } from "@/integrations/shopify/options/locations";
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
  // Deliberately WITHOUT read_locations — the pre-RESOLVERS-2 token shape.
  scopes: ["read_inventory", "write_inventory"],
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
  mockLocationsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("shpat-tok"),
  );
});

describe("shopifyLocationsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(shopifyLocationsResolver.source).toBe("shopify:locations");
    expect(shopifyLocationsResolver.provider).toBe("shopify");
    expect(shopifyLocationsResolver.requiresIntegration).toBe(true);
    expect(shopifyLocationsResolver.requiredDeps).toBeUndefined();
  });
});

describe("shopifyLocationsResolver — auth pinning", () => {
  it("pins refreshAndRetry + the wrapper to the integration row's shop domain", async () => {
    mockLocationsList.mockResolvedValueOnce({ locations: [], truncated: false });
    await shopifyLocationsResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        provider: "shopify",
        providerAccountId: "acme.myshopify.com",
      }),
    );
    expect(mockLocationsList).toHaveBeenCalledWith({
      shopDomain: "acme.myshopify.com",
      accessToken: "shpat-tok",
    });
  });
});

describe("shopifyLocationsResolver — labels", () => {
  it("labels `Name - City, ST`, hints Inactive, and alpha-sorts", async () => {
    mockLocationsList.mockResolvedValueOnce({
      locations: [
        { id: 2, name: "Warehouse", city: "Brooklyn", provinceCode: "NY", active: true },
        { id: 1, name: "Annex", city: "", provinceCode: "", active: false },
      ],
      truncated: false,
    });
    const result = await shopifyLocationsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "1", label: "Annex", description: "Inactive" },
      { value: "2", label: "Warehouse - Brooklyn, NY" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("never surfaces a street address / zip / phone, even if the wrapper regressed", async () => {
    mockLocationsList.mockResolvedValueOnce({
      locations: [
        {
          id: 2,
          name: "Warehouse",
          city: "Brooklyn",
          provinceCode: "NY",
          active: true,
          // Not part of LocationOption — proves the label is built from a
          // fixed key set, never a spread of the provider row.
          address1: "1 Main St",
          zip: "11201",
          phone: "+15551234567",
        },
      ],
      truncated: false,
    });
    const result = await shopifyLocationsResolver.resolve(ctx());
    expect(JSON.stringify(result)).not.toMatch(/Main St|11201|5551234567/);
  });

  it("filters case-insensitively on q and reports hasMore from truncated", async () => {
    mockLocationsList.mockResolvedValueOnce({
      locations: [
        { id: 1, name: "Warehouse", city: "Brooklyn", provinceCode: "NY", active: true },
        { id: 2, name: "Retail", city: "Austin", provinceCode: "TX", active: true },
      ],
      truncated: true,
    });
    const result = await shopifyLocationsResolver.resolve(ctx({ q: "austin" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
    expect(result.hasMore).toBe(true);
  });
});

describe("shopifyLocationsResolver — read_locations scope case", () => {
  it("maps an insufficient-scope 403 to PROVIDER_REAUTH_REQUIRED with reconnect copy (never an empty picker)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError(
        "Shopify GET /locations.json returned HTTP 403 (insufficient scope)",
        "shopify",
      ),
    );
    const err = await shopifyLocationsResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect((err as OptionsResolverError).message).toMatch(/reconnect/i);
    // Sanitized: no endpoint, status, scope name, or shop domain in the copy.
    expect((err as OptionsResolverError).message).not.toMatch(
      /403|locations\.json|read_locations|myshopify/,
    );
  });
});

describe("shopifyLocationsResolver — error sanitization (leak-free)", () => {
  it("throws INTEGRATION_DISCONNECTED without an integration (no call)", async () => {
    await expect(
      shopifyLocationsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps a 401 / refresh-not-supported to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(shopifyLocationsResolver.resolve(ctx())).rejects.toMatchObject({
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
    await expect(shopifyLocationsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy, no token/shop/body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        "Shopify GET /locations.json failed: raw body token=shpat-tok shop=acme.myshopify.com",
      ),
    );
    const err = await shopifyLocationsResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toMatch(
      /shpat-tok|raw body|myshopify/,
    );
    expect((err as OptionsResolverError).message).toMatch(
      /couldn't load shopify locations/i,
    );
  });
});
