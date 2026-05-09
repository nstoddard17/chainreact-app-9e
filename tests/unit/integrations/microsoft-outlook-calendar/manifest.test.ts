/**
 * @jest-environment node
 *
 * Tests for the Microsoft Outlook Calendar provider manifest. Validation
 * against ProviderManifestSchema happens at module load (it would throw
 * on import if malformed); these tests assert the specific manifest
 * values that downstream code depends on.
 */
import { microsoftOutlookCalendarManifest } from "@/integrations/microsoft-outlook-calendar/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";

describe("microsoft-outlook-calendar manifest", () => {
  it("is registered in the provider registry under id 'microsoft-outlook-calendar'", () => {
    expect(getProvider("microsoft-outlook-calendar")).toBe(
      microsoftOutlookCalendarManifest,
    );
  });

  it("declares the calendar-only Graph scopes — exactly the two approved for Slice 7", () => {
    // Slice 7 confirmed scope decision #5: offline_access +
    // Calendars.ReadWrite. NO Calendars.Read (Microsoft permissions are
    // hierarchical — ReadWrite includes Read). NO Mail / Files / Teams
    // scopes (V1 rot fix — Slice 6 narrowed mail to its own scopes,
    // Calendar follows the same pattern).
    expect(microsoftOutlookCalendarManifest.scopes.required).toEqual([
      "offline_access",
      "Calendars.ReadWrite",
    ]);
    expect(microsoftOutlookCalendarManifest.scopes.optional).toEqual([]);
    expect(microsoftOutlookCalendarManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include Mail scopes — those belong to microsoft-outlook (Slice 6)", () => {
    // Explicit anti-test. Slice 6's no-scope-bloat principle holds.
    expect(microsoftOutlookCalendarManifest.scopes.required).not.toContain(
      "Mail.Send",
    );
    expect(microsoftOutlookCalendarManifest.scopes.required).not.toContain(
      "Mail.Read",
    );
    expect(microsoftOutlookCalendarManifest.scopes.required).not.toContain(
      "Mail.ReadWrite",
    );
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftOutlookCalendarManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches mail provider)", () => {
    expect(microsoftOutlookCalendarManifest.tokenScope).toBe("user");
    expect(microsoftOutlookCalendarManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 7 Commit 2 (oauth-only)", () => {
    // Slice 7 Commit 2 lands manifest + OAuth + dispatcher. Calendar
    // actions land in Commit 3 (flips actions: true); event_changed
    // trigger lands in Commit 4 (flips webhookTrigger: true). Honest-
    // state convention means flags flip in lockstep with the
    // registrations they describe.
    expect(microsoftOutlookCalendarManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
    expect(providerSupports("microsoft-outlook-calendar", "oauth")).toBe(true);
    expect(providerSupports("microsoft-outlook-calendar", "actions")).toBe(
      false,
    );
    expect(
      providerSupports("microsoft-outlook-calendar", "webhookTrigger"),
    ).toBe(false);
    expect(
      providerSupports("microsoft-outlook-calendar", "pollingTrigger"),
    ).toBe(false);
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftOutlookCalendarManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable, same as mail)", () => {
    expect(microsoftOutlookCalendarManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftOutlookCalendarManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftOutlookCalendarManifest.isEnabled).toBe(true);
    expect(microsoftOutlookCalendarManifest.isExperimental).toBe(false);
  });

  it("uses a distinct provider id from microsoft-outlook (sibling, not extension)", () => {
    // Slice 7 decision: separate provider per surface, matching V2's
    // Google split. If this assertion ever drifts, the
    // _registry duplicate-id check throws at module load anyway —
    // belt-and-suspenders.
    expect(microsoftOutlookCalendarManifest.id).toBe(
      "microsoft-outlook-calendar",
    );
    expect(getProvider("microsoft-outlook")).not.toBe(
      microsoftOutlookCalendarManifest,
    );
  });
});
