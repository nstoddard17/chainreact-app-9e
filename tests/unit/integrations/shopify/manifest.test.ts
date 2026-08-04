/** @jest-environment node */
import { ProviderManifestSchema } from "@/contracts/integration";
import { shopifyManifest } from "@/integrations/shopify/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

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
  });

  it("declares read_locations as OPTIONAL — picker-only, no reconnect forced on existing stores", () => {
    // RESOLVERS-2. `shopify:locations` (GET /locations.json) backs the
    // update_inventory location picker. It MUST stay optional: no action
    // handler needs it, and making it required would force every existing
    // Shopify connection to reconnect. Same posture as the optional
    // MailboxSettings.Read scope on microsoft-outlook. Existing tokens
    // predate it → the resolver surfaces PROVIDER_REAUTH_REQUIRED and
    // manual entry keeps the field usable.
    expect(shopifyManifest.scopes.optional).toEqual(["read_locations"]);
    expect(shopifyManifest.scopes.required).not.toContain("read_locations");
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

  it("declares a connectInput descriptor for the per-shop domain prompt", () => {
    // Per-shop OAuth needs the merchant's *.myshopify.com domain BEFORE the
    // redirect — the Apps UI prompts for it and sends it as providerHint.shop.
    // hintKey MUST be 'shop' to match shopifyOAuth.readShopFromHint.
    expect(shopifyManifest.connectInput).toEqual({
      hintKey: "shop",
      label: "Shopify store domain",
      placeholder: "your-store.myshopify.com",
      help: expect.stringContaining("myshopify.com"),
    });
  });

  it("declares actions: true and the action-handler registry contains EXACTLY the 11 Shopify actions", () => {
    // TEST-REDUNDANCY-REMOVAL-1 — Shopify had NO registry pin in this file;
    // its handler inventory was only covered centrally. This EXACT-SET pin
    // moves that contract to the provider it belongs to and strengthens it:
    // it fails when a shipped handler disappears AND when an unapproved one
    // appears, so replaces the old suite's `registers all 11 Shopify actions` +
  // `registers update_product_variant` presence pins.
    expect(shopifyManifest.capabilities.actions).toBe(true);
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "shopify",
    );
    expect(registered.map((h) => h.type).sort()).toEqual([
      "add_order_note",
      "create_customer",
      "create_fulfillment",
      "create_order",
      "create_product",
      "create_product_variant",
      "update_customer",
      "update_inventory",
      "update_order_status",
      "update_product",
      "update_product_variant",
    ]);
  });
});
