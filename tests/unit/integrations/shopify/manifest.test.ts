import { ProviderManifestSchema } from "@/contracts/integration";
import { shopifyManifest } from "@/integrations/shopify/manifest";

/**
 * Slice 12 Commit 2: Shopify manifest validates against the V2 schema
 * AND declares the honest capability state — `oauth: true`, others
 * `false`. Subsequent commits flip `actions` (Commit 3) and
 * `webhookTrigger` (Commit 4); this test acts as the freeze-point for
 * Commit 2's expected shape.
 */

describe("shopifyManifest", () => {
  it("validates against ProviderManifestSchema (zod)", () => {
    expect(() => ProviderManifestSchema.parse(shopifyManifest)).not.toThrow();
  });

  it("identifies as 'shopify' with display name 'Shopify'", () => {
    expect(shopifyManifest.id).toBe("shopify");
    expect(shopifyManifest.displayName).toBe("Shopify");
    expect(shopifyManifest.isEnabled).toBe(true);
  });

  it("declares oauth + actions + webhookTrigger capability for Commit 4 (full Slice 12 surface)", () => {
    expect(shopifyManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
  });

  it("non-refreshable + tokenScope=user + accountIdField=shopDomain", () => {
    expect(shopifyManifest.refreshable).toBe(false);
    expect(shopifyManifest.tokenScope).toBe("user");
    expect(shopifyManifest.accountIdField).toBe("shopDomain");
  });

  it("declares 11 required scopes covering Slice 12 actions + triggers", () => {
    expect(shopifyManifest.scopes.required).toEqual(
      expect.arrayContaining([
        "read_orders",
        "write_orders",
        "read_products",
        "write_products",
        "read_customers",
        "write_customers",
        "read_inventory",
        "write_inventory",
        "read_checkouts",
        "read_fulfillments",
        "write_fulfillments",
      ]),
    );
    expect(shopifyManifest.scopes.required).toHaveLength(11);
    expect(shopifyManifest.scopes.optional).toEqual([]);
  });

  it("pins API version 2024-10 (matches V1's pinned version)", () => {
    expect(shopifyManifest.apiVersion).toBe("2024-10");
  });

  it("uses 12h health-check interval (matches V2 'other providers' tier)", () => {
    expect(shopifyManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("declares oauthFlows: ['v2']", () => {
    expect(shopifyManifest.oauthFlows).toEqual(["v2"]);
  });
});
