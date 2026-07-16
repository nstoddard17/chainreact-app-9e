/**
 * @jest-environment node
 *
 * Tests for `integrations/shopify/options/customers.ts` — RESOLVERS-1.
 * Value = customer id (string); labels are display names (first+last)
 * with id fallback — NEVER email / phone / spend / order counts. One
 * bounded page (limit 100) via the shop pinned on the integration row;
 * sanitized error mapping (Shopify tokens are non-refreshable →
 * reconnect); meta wiring pin for update_customer.customer_id.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockCustomersList = jest.fn();
jest.mock("@/integrations/_shared/shopify/api/customers", () => ({
  customersList: (...args: unknown[]) => mockCustomersList(...args),
}));

import { shopifyCustomersResolver } from "@/integrations/shopify/options/customers";
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
