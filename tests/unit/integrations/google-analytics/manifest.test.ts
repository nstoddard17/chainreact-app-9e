/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — GA4 provider manifest invariants.
 */
import { googleAnalyticsManifest } from "@/integrations/google-analytics/manifest";
import { ProviderManifestSchema } from "@/contracts/integration";
import { getProvider, providerSupports } from "@/integrations/_registry";

import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
describe("google-analytics manifest — structural", () => {
  it("parses against ProviderManifestSchema", () => {
    expect(() =>
      ProviderManifestSchema.parse(googleAnalyticsManifest),
    ).not.toThrow();
  });

  it("is registered in the provider registry under id 'google-analytics'", () => {
    expect(getProvider("google-analytics")).toBe(googleAnalyticsManifest);
  });

  it("displayName 'Google Analytics'; tokenScope user; accountIdField email; refreshable; oauthFlows v2", () => {
    expect(googleAnalyticsManifest.displayName).toBe("Google Analytics");
    expect(googleAnalyticsManifest.tokenScope).toBe("user");
    expect(googleAnalyticsManifest.accountIdField).toBe("email");
    expect(googleAnalyticsManifest.refreshable).toBe(true);
    expect(googleAnalyticsManifest.oauthFlows).toEqual(["v2"]);
  });

  it("pins GA4 API version v1beta", () => {
    expect(googleAnalyticsManifest.apiVersion).toBe("v1beta");
  });

  it("uses 6h health-check interval (Google cohort)", () => {
    expect(googleAnalyticsManifest.healthCheckIntervalMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe("google-analytics manifest — scopes (D-GA2)", () => {
  it("requires analytics.readonly + analytics.edit + userinfo.email", () => {
    expect(googleAnalyticsManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics.edit",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  });

  it("has no optional or deprecated scopes; no Ads/Marketing scope creep", () => {
    expect(googleAnalyticsManifest.scopes.optional).toEqual([]);
    expect(googleAnalyticsManifest.scopes.deprecated).toEqual([]);
    for (const s of googleAnalyticsManifest.scopes.required) {
      expect(s).not.toMatch(/adwords|dfp|doubleclick|content/);
    }
  });
});

describe("google-analytics manifest — capabilities (actions-only, D-GA3)", () => {
  it("oauth + actions true; webhookTrigger + pollingTrigger false", () => {
    expect(googleAnalyticsManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("google-analytics", "oauth")).toBe(true);
    expect(providerSupports("google-analytics", "actions")).toBe(true);
    expect(providerSupports("google-analytics", "webhookTrigger")).toBe(false);
    expect(providerSupports("google-analytics", "pollingTrigger")).toBe(false);
  });
});

describe("google-analytics manifest — secret-shape guard", () => {
  it("exposes no token / secret / clientSecret manifest field", () => {
    const serialized = JSON.stringify(googleAnalyticsManifest).toLowerCase();
    expect(serialized).not.toMatch(/client_secret/);
    expect(serialized).not.toMatch(/access_token/);
    expect(serialized).not.toMatch(/refresh_token/);
    expect(serialized).not.toMatch(/api_secret/);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling _registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Slice 3.GOOGLE-ANALYTICS-2 — GA4 handler-registry wiring. The registry
// exposes EXACTLY the 6 accepted GA actions; the deferred/excluded handlers
// (create_measurement_secret, get_user_activity) and any triggers are NOT
// registered.
// ---------------------------------------------------------------------------

describe("google-analytics handler registry wiring", () => {
  const ga = () =>
    listRegisteredHandlers().filter((h) => h.provider === "google-analytics");

  it("registers exactly 6 GA action handlers", () => {
    expect(ga()).toHaveLength(6);
  });

  it("exposes the 6 expected (provider,type) keys with no duplicates", () => {
    const keys = ga().map((h) => `${h.provider}:${h.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([
      "google-analytics:create_conversion_event",
      "google-analytics:find_conversion",
      "google-analytics:get_realtime_data",
      "google-analytics:run_pivot_report",
      "google-analytics:run_report",
      "google-analytics:send_event",
    ]);
  });

  it("does NOT register the deferred/excluded handlers (create_measurement_secret, get_user_activity)", () => {
    const types = ga().map((h) => h.type);
    expect(types).not.toContain("create_measurement_secret");
    expect(types).not.toContain("get_user_activity");
  });
});
