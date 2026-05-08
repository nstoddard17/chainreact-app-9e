/**
 * Structure test: Google Calendar provider is registered correctly.
 *
 * Asserts that the manifest is in the registry, validates against the
 * ProviderManifestSchema (which the registry already enforces at module
 * load — but this is an explicit assertion), and surfaces the Calendar
 * scopes / capabilities / accountId field at the right shape for
 * downstream consumers.
 */
import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";
import {
  getProvider,
  listProviders,
  PROVIDERS,
  providerSupports,
} from "@/integrations/_registry";
import { googleCalendarManifest } from "@/integrations/google-calendar/manifest";

describe("Google Calendar manifest registration", () => {
  it("is present in the frozen PROVIDERS registry", () => {
    expect(PROVIDERS["google-calendar"]).toBeDefined();
    expect(PROVIDERS["google-calendar"]).toBe(googleCalendarManifest);
  });

  it("is returned by getProvider('google-calendar')", () => {
    const m = getProvider("google-calendar");
    expect(m).toBeDefined();
    expect(m?.id).toBe("google-calendar");
  });

  it("appears in listProviders()", () => {
    const ids = listProviders().map((m: ProviderManifest) => m.id);
    expect(ids).toContain("google-calendar");
  });

  it("validates against ProviderManifestSchema", () => {
    expect(() =>
      ProviderManifestSchema.parse(googleCalendarManifest),
    ).not.toThrow();
  });

  it("declares OAuth + refresh + user-scoped tokens", () => {
    expect(googleCalendarManifest.capabilities.oauth).toBe(true);
    expect(googleCalendarManifest.refreshable).toBe(true);
    expect(googleCalendarManifest.tokenScope).toBe("user");
    expect(googleCalendarManifest.accountIdField).toBe("email");
  });

  it("declares the narrow Batch 1 scope set (calendar.events + userinfo.email)", () => {
    expect(googleCalendarManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
    expect(googleCalendarManifest.scopes.optional).toEqual([]);
    expect(googleCalendarManifest.scopes.deprecated).toEqual([]);
  });

  it("has actions=true (handlers registered) and triggers still off (this batch)", () => {
    // Honest-state convention: capability flags reflect what's actually
    // wired up. The 5 action handlers are registered in
    // services/execution/handlers/_registry.ts as of the action-handlers
    // commit; the watch trigger lands in a later batch.
    expect(googleCalendarManifest.capabilities.actions).toBe(true);
    expect(googleCalendarManifest.capabilities.webhookTrigger).toBe(false);
    expect(googleCalendarManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("reports oauth + actions capability via providerSupports", () => {
    expect(providerSupports("google-calendar", "oauth")).toBe(true);
    expect(providerSupports("google-calendar", "actions")).toBe(true);
    expect(providerSupports("google-calendar", "webhookTrigger")).toBe(false);
  });
});
