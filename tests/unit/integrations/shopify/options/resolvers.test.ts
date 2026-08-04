/**
 * @jest-environment node
 *
 * shopify options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockCustomersList = jest.fn();
const mockLocationsList = jest.fn();
const mockOrdersList = jest.fn();
const mockProductsList = jest.fn();
const mockProductVariantsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

jest.mock("@/integrations/_shared/shopify/api/customers", () => ({
  customersList: (...args: unknown[]) => mockCustomersList(...args),
}));

jest.mock("@/integrations/_shared/shopify/api/locations", () => ({
  __esModule: true,
  locationsList: (...args: unknown[]) => mockLocationsList(...args),
}));

jest.mock("@/integrations/_shared/shopify/api/orders", () => ({
  __esModule: true,
  ordersList: (...args: unknown[]) => mockOrdersList(...args),
}));

jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  __esModule: true,
  productsList: (...args: unknown[]) => mockProductsList(...args),
  productVariantsList: (...args: unknown[]) => mockProductVariantsList(...args),
}));

import { shopifyCustomersResolver } from "@/integrations/shopify/options/customers";
import { IntegrationActionRequiredError, Unauthorized401Error, InsufficientScopeError } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { shopifyLocationsResolver } from "@/integrations/shopify/options/locations";
import { shopifyOrdersResolver } from "@/integrations/shopify/options/orders";
import { shopifyProductsResolver } from "@/integrations/shopify/options/products";
import { shopifyVariantsResolver } from "@/integrations/shopify/options/variants";

// ---------------------------------------------------------------------------
// Merged from the former customers.test.ts
// Tests for `integrations/shopify/options/customers.ts` — RESOLVERS-1.
// Value = customer id (string); labels are display names (first+last)
// with id fallback — NEVER email / phone / spend / order counts. One
// bounded page (limit 100) via the shop pinned on the integration row;
// sanitized error mapping (Shopify tokens are non-refreshable →
// reconnect); meta wiring pin for update_customer.customer_id.
// ---------------------------------------------------------------------------
describe("customers (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "shopify",
  providerAccountId: "test-shop.myshopify.com",
  displayName: "Test Shop",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["read_customers", "write_customers"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Pass-through so the mocked api wrapper sees the real call params.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("shopifyCustomersResolver — shape", () => {
  it("declares source/provider/requiresIntegration with no deps (top-level picker)", () => {
    expect(shopifyCustomersResolver.source).toBe("shopify:customers");
    expect(shopifyCustomersResolver.provider).toBe("shopify");
    expect(shopifyCustomersResolver.requiresIntegration).toBe(true);
    expect(shopifyCustomersResolver.requiredDeps).toBeUndefined();
  });
});

describe("shopifyCustomersResolver — mapping (id values, display-name labels, NO PII)", () => {
  it("labels are first+last display names with the id in description; alpha-sorted", async () => {
    mockCustomersList.mockResolvedValueOnce([
      {
        id: 207119551,
        first_name: "Zoe",
        last_name: "Zhang",
        email: "zoe@secret.test",
        phone: "+15551234567",
        total_spent: "199.99",
        orders_count: 7,
      },
      { id: 42, first_name: "Ada", last_name: "Lovelace" },
    ]);
    const result = await shopifyCustomersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "42", label: "Ada Lovelace", description: "42" },
      { value: "207119551", label: "Zoe Zhang", description: "207119551" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the id-only label when the customer has no name parts", async () => {
    mockCustomersList.mockResolvedValueOnce([
      { id: 99, first_name: null, last_name: "  " },
      { id: 100, first_name: "OnlyFirst" },
    ]);
    const result = await shopifyCustomersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "99", label: "99" },
      { value: "100", label: "OnlyFirst", description: "100" },
    ]);
  });

  it("no-PII pin — email / phone / spend / order counts NEVER appear anywhere in the result", async () => {
    mockCustomersList.mockResolvedValueOnce([
      {
        id: 1,
        first_name: "Pat",
        last_name: "Doe",
        email: "pat.doe@leak.test",
        phone: "+15550000000",
        total_spent: "12345.67",
        orders_count: 99,
        note: "VIP — do not share",
      },
    ]);
    const result = await shopifyCustomersResolver.resolve(ctx());
    // Fail-closed floor: an empty result would make every not.toContain and
    // the per-item shape loop pass vacuously (PROVIDER-CONTRACT-CONSOLIDATION-1D).
    expect(result.items).toHaveLength(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("pat.doe@leak.test");
    expect(serialized).not.toContain("+15550000000");
    expect(serialized).not.toContain("12345.67");
    expect(serialized).not.toContain("VIP");
    // Every item is exactly {value, label, description?} — nothing else.
    for (const item of result.items) {
      expect(
        Object.keys(item).every((k) =>
          ["value", "label", "description"].includes(k),
        ),
      ).toBe(true);
    }
  });

  it("filters locally on q (case-insensitive, against labels)", async () => {
    mockCustomersList.mockResolvedValueOnce([
      { id: 1, first_name: "Ada", last_name: "Lovelace" },
      { id: 2, first_name: "Grace", last_name: "Hopper" },
    ]);
    const result = await shopifyCustomersResolver.resolve(ctx({ q: "hop" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });

  it("pins the shop from the integration row and requests one bounded page (limit 100)", async () => {
    mockCustomersList.mockResolvedValueOnce([]);
    await shopifyCustomersResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-user-1",
        provider: "shopify",
        providerAccountId: "test-shop.myshopify.com",
      }),
    );
    expect(mockCustomersList).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: "test-shop.myshopify.com",
        limit: 100,
      }),
    );
  });

  it("hasMore is honest — true only on a full page", async () => {
    mockCustomersList.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        first_name: "C",
        last_name: String(i + 1),
      })),
    );
    const full = await shopifyCustomersResolver.resolve(ctx());
    expect(full.hasMore).toBe(true);

    mockCustomersList.mockResolvedValueOnce([
      { id: 1, first_name: "Solo", last_name: "Customer" },
    ]);
    const partial = await shopifyCustomersResolver.resolve(ctx());
    expect(partial.hasMore).toBe(false);
  });
});

describe("shopifyCustomersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      shopifyCustomersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockCustomersList).not.toHaveBeenCalled();
  });

  it("maps leaked 401s → INTEGRATION_DISCONNECTED", async () => {
    mockCustomersList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(shopifyCustomersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps IntegrationActionRequiredError (non-refreshable token) → INTEGRATION_DISCONNECTED", async () => {
    mockCustomersList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "shopify",
        providerAccountId: "test-shop.myshopify.com",
        reason: "refresh_not_supported",
      }),
    );
    await expect(shopifyCustomersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("sanitizes provider failures to PROVIDER_ERROR (static copy — no raw body / token leak)", async () => {
    mockCustomersList.mockRejectedValueOnce(
      new Error('customers GET failed: {"errors":"secret shop state"} tok-xyz'),
    );
    const err = await shopifyCustomersResolver
      .resolve(ctx())
      .catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toContain("secret");
    expect((err as OptionsResolverError).message).not.toContain("tok-xyz");
  });
});

describe("shopify meta wiring — update_customer.customer_id picker (RESOLVERS-1)", () => {
  it("customer_id → shopify:customers combobox with manual entry, no deps", async () => {
    const { shopifyUpdateCustomerMeta } = await import(
      "@/integrations/shopify/actions/updateCustomer.meta"
    );
    const f = shopifyUpdateCustomerMeta.fields.find(
      (x) => x.name === "customer_id",
    )!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("shopify:customers");
    expect(f.allowManualEntry).toBe(true);
    expect(f.dependsOn).toBeUndefined();
    expect(f.required).toBe(true);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former locations.test.ts
// Tests for `integrations/shopify/options/locations.ts` — RESOLVERS-2.
// Pin:
// - Canonical source / provider / requiresIntegration shape (no deps).
// - Auth pinned to the integration row's shop.
// - Label = "Warehouse - Brooklyn, NY" (name + city/locality); NO street
// address / zip / phone; Inactive hint.
// - THE SCOPE CASE: a token predating the OPTIONAL `read_locations` add
// gets 403 → PROVIDER_REAUTH_REQUIRED (Reconnect), not an empty box.
// - Disconnected / 401 / provider-error sanitization (no leak).
// ---------------------------------------------------------------------------
describe("locations (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former orders.test.ts
// Tests for `integrations/shopify/options/orders.ts` — RESOLVERS-2.
// Pin:
// - Canonical source / provider / requiresIntegration shape (no deps).
// - Auth via refreshAndRetry pinned to the integration row's shop
// (providerAccountId = shopDomain — config can never override).
// - Business label (`#1001 - Jane Smith - 84.20 USD - paid`), string
// value, id only in `description`; NO customer email / phone / address.
// - Most-recent-first order PRESERVED through the q filter (no alpha sort).
// - hasMore from truncated.
// - Disconnected guard, 401 → INTEGRATION_DISCONNECTED, 403 →
// PROVIDER_REAUTH_REQUIRED, other → sanitized PROVIDER_ERROR (no leak).
// ---------------------------------------------------------------------------
describe("orders (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former products.test.ts
// Tests for `integrations/shopify/options/products.ts` — RESOLVERS-1.
// Pin:
// - Canonical source / provider / requiresIntegration shape (no deps).
// - Auth via refreshAndRetry pinned to the integration row's shop
// (providerAccountId = shopDomain — config can never override).
// - Maps numeric id → string value; label = title (id fallback);
// Draft/Archived hint; NO prices / variants / inventory in the result.
// - Case-insensitive q filter + alpha sort; hasMore from truncated.
// - Disconnected guard, 401 → INTEGRATION_DISCONNECTED (non-refreshable),
// provider-error sanitization (static copy).
// ---------------------------------------------------------------------------
describe("products (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former variants.test.ts
// Tests for `integrations/shopify/options/variants.ts` — RESOLVERS-2.
// Pin:
// - Canonical source / provider / requiresIntegration shape. **No
// requiredDeps** — update_product_variant has no sibling product field
// to depend on, so this is deliberately a flat product-qualified picker.
// - Auth pinned to the integration row's shop.
// - Label = "Product - Variant - SKU x - price"; string value; id only in
// `description`.
// - q filter + alpha sort (groups a product's variants); hasMore honest.
// - Disconnected / 401 / 403 / provider-error sanitization (no leak).
// ---------------------------------------------------------------------------
describe("variants (options)", () => {

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

});
