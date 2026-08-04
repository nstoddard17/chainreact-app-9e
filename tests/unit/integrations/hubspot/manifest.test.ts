/**
 * @jest-environment node
 *
 * Tests for the HubSpot provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * that downstream code depends on.
 */
import { hubspotManifest } from "@/integrations/hubspot/manifest";
import {
  getProvider,
  providerSupports,
} from "@/integrations/_registry";
import { ProviderManifestSchema } from "@/contracts/integration";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("hubspot manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(hubspotManifest)).not.toThrow();
  });

  it("is registered in the provider registry under id 'hubspot'", () => {
    expect(getProvider("hubspot")).toBe(hubspotManifest);
  });

  it("declares the 20 scopes (18 V1 + contacts/companies schema-read for property pickers)", () => {
    // Slice 13 ported V1's 18-scope list; CONFIG-FIELD-UX-SWEEP-4 (Marcus-
    // approved pre-launch) added `crm.schemas.contacts.read` +
    // `crm.schemas.companies.read` so the portal property-options pickers
    // (lifecyclestage / hs_lead_status) can read real enum options. Tickets
    // needs no add — HubSpot has no granular `crm.schemas.tickets.read`; the
    // broad `tickets` scope covers ticket property reads. The 'oauth' scope is
    // mandatory; 'webhooks' stays intentionally omitted.
    expect(hubspotManifest.scopes.required).toEqual([
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.objects.line_items.read",
      "crm.objects.line_items.write",
      "crm.objects.products.read",
      "crm.objects.products.write",
      "crm.objects.owners.read",
      "crm.lists.read",
      "crm.lists.write",
      "crm.schemas.deals.read",
      "crm.schemas.contacts.read",
      "crm.schemas.companies.read",
      "tickets",
      "automation",
      "forms",
      "oauth",
    ]);
    expect(hubspotManifest.scopes.optional).toEqual([]);
    expect(hubspotManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include the 'webhooks' scope (per Slice 13 §3 decision)", () => {
    // Anti-test: webhooks scope is OPTIONAL per HubSpot's docs and V1
    // omits it in oauthConfig.ts:399-402. Including it here would
    // force users to re-authorize if the app's HubSpot configuration
    // doesn't whitelist it.
    expect(hubspotManifest.scopes.required).not.toContain("webhooks");
  });

  it("is refreshable: true (HubSpot issues refresh tokens; preserve-or-replace semantics)", () => {
    // Slice 13 inherits Stripe's preserve-or-replace contract:
    // refresh tokens are stable by default; the per-provider
    // refreshToken() PRESERVES the original when the response omits a
    // new one and PERSISTS the new value when present. Contrasts
    // with Airtable's mandatory rotation.
    expect(hubspotManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: 'user' with accountIdField: 'hubId'", () => {
    // Single HubSpot integration per (user, hub_id). The hub_id
    // (numeric portal id, string-cast at the OAuth boundary) is the
    // stable portal discriminator.
    expect(hubspotManifest.tokenScope).toBe("user");
    expect(hubspotManifest.accountIdField).toBe("hubId");
  });

  it("declares honest capabilities for Slice 13 Commit 5 (oauth + actions + webhookTrigger)", () => {
    // Honest-state convention: Commit 2 landed oauth-only; Commit 3
    // flipped `actions: true` after registering 10 Batch 1 handlers;
    // Commit 4 kept actions flipped while adding 12 Batch 2 handlers;
    // Commit 5 flips `webhookTrigger: true` after registering the
    // consolidated `webhook_received` trigger + V3 signature
    // verification + shared-subscription lifecycle.
    expect(hubspotManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("hubspot", "oauth")).toBe(true);
    expect(providerSupports("hubspot", "actions")).toBe(true);
    expect(providerSupports("hubspot", "webhookTrigger")).toBe(true);
    expect(providerSupports("hubspot", "pollingTrigger")).toBe(false);
  });

  it("declares actions: true and the action-handler registry contains all 26 actions (22 Slice 13 + 4 HubSpot 2.1 parity)", () => {
    // Fail-closed: assert the capability itself — a regression that flips
    // it to false must FAIL here, not silently skip the registry pin.
    expect(hubspotManifest.capabilities.actions).toBe(true);
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "hubspot",
    );
    expect(registered.map((r) => r.type).sort()).toEqual([
      // Sorted alphabetically — covers Slice 13 Batch 1 (10) + Batch 2 (12)
      // + HubSpot 2.1 parity (4: get_line_items, get_products,
      // remove_from_list, remove_line_item).
      "add_contact_to_list",
      "create_call",
      "create_company",
      "create_contact",
      "create_deal",
      "create_line_item",
      "create_meeting",
      "create_note",
      "create_product",
      "create_task",
      "create_ticket",
      "get_companies",
      "get_contacts",
      "get_deals",
      "get_line_items",
      "get_owners",
      "get_products",
      "get_tickets",
      "remove_from_list",
      "remove_line_item",
      "update_company",
      "update_contact",
      "update_deal",
      "update_line_item",
      "update_product",
      "update_ticket",
    ]);
    expect(registered).toHaveLength(26);
  });

  it("declares apiVersion 'v3' (HubSpot CRM REST + Webhooks API version)", () => {
    expect(hubspotManifest.apiVersion).toBe("v3");
  });

  it("declares 4h health-check interval (mid-tier between Google/MS 6h and others 12h)", () => {
    expect(hubspotManifest.healthCheckIntervalMs).toBe(4 * 60 * 60 * 1000);
  });

  it("declares oauthFlows: ['v2'] (HubSpot's current OAuth 2.0 flow, no PKCE)", () => {
    expect(hubspotManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(hubspotManifest.isEnabled).toBe(true);
    expect(hubspotManifest.isExperimental).toBe(false);
  });

  it("uses provider id 'hubspot'", () => {
    expect(hubspotManifest.id).toBe("hubspot");
    expect(hubspotManifest.displayName).toBe("HubSpot");
  });
});
