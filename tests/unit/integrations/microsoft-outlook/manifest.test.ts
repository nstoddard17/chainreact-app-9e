/**
 * @jest-environment node
 *
 * Tests for the Microsoft Outlook provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on import
 * if malformed); these tests assert the specific manifest values that
 * downstream code depends on.
 */
import { microsoftOutlookManifest } from "@/integrations/microsoft-outlook/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";

describe("microsoft-outlook manifest", () => {
  it("is registered in the provider registry under id 'microsoft-outlook'", () => {
    expect(getProvider("microsoft-outlook")).toBe(microsoftOutlookManifest);
  });

  it("declares the mail-only Graph scopes — exactly the three approved for Slice 6", () => {
    // Slice 6 confirmed scope decision #4: offline_access, Mail.Send,
    // Mail.Read. NO Calendar / Files / Teams scopes (V1 rot fix #3 —
    // V1's auth.ts asks for 8 scopes up front; we narrow strictly).
    expect(microsoftOutlookManifest.scopes.required).toEqual([
      "offline_access",
      "Mail.Send",
      "Mail.Read",
    ]);
    expect(microsoftOutlookManifest.scopes.optional).toEqual([]);
    expect(microsoftOutlookManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include Calendar scopes — those land in Slice 7", () => {
    // Explicit anti-test. Slice 7 will additively widen via re-auth.
    // If this test starts failing because Calendar scopes leaked in,
    // STOP and revisit the slice plan rather than rubber-stamping.
    expect(microsoftOutlookManifest.scopes.required).not.toContain(
      "Calendars.Read",
    );
    expect(microsoftOutlookManifest.scopes.required).not.toContain(
      "Calendars.ReadWrite",
    );
    expect(microsoftOutlookManifest.scopes.required).not.toContain(
      "Files.Read",
    );
    expect(microsoftOutlookManifest.scopes.required).not.toContain("User.Read");
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftOutlookManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches Gmail)", () => {
    expect(microsoftOutlookManifest.tokenScope).toBe("user");
    expect(microsoftOutlookManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 6 Commit 2 (oauth-only)", () => {
    // Slice 6 Commit 2 lands manifest + OAuth + dispatcher. send_email
    // (actions: true) lands in Commit 3; new_email subscription
    // (webhookTrigger: true) lands in Commit 4. Honest-state convention
    // means flags flip in lockstep with the registrations they describe.
    expect(microsoftOutlookManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
    expect(providerSupports("microsoft-outlook", "oauth")).toBe(true);
    expect(providerSupports("microsoft-outlook", "actions")).toBe(false);
    expect(providerSupports("microsoft-outlook", "webhookTrigger")).toBe(false);
    expect(providerSupports("microsoft-outlook", "pollingTrigger")).toBe(false);
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftOutlookManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable)", () => {
    expect(microsoftOutlookManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftOutlookManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftOutlookManifest.isEnabled).toBe(true);
    expect(microsoftOutlookManifest.isExperimental).toBe(false);
  });
});
