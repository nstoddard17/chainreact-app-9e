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

  it("starts with actions + triggers off (flips when handlers register later in batch)", () => {
    // Honest-state convention: capability flags reflect what's actually
    // wired up. The 5 action handlers and the watch-based event_changed
    // trigger flip these to true in subsequent commits in this batch.
    expect(googleCalendarManifest.capabilities.actions).toBe(false);
    expect(googleCalendarManifest.capabilities.webhookTrigger).toBe(false);
    expect(googleCalendarManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("reports oauth capability via providerSupports", () => {
    expect(providerSupports("google-calendar", "oauth")).toBe(true);
    expect(providerSupports("google-calendar", "actions")).toBe(false);
    expect(providerSupports("google-calendar", "webhookTrigger")).toBe(false);
  });
});
