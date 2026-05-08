/**
 * @jest-environment node
 *
 * Tests for the Google Sheets provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on import
 * if malformed); these tests assert the specific manifest values that
 * downstream code depends on.
 */
import { googleSheetsManifest } from "@/integrations/google-sheets/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";

describe("google-sheets manifest", () => {
  it("is registered in the provider registry under id 'google-sheets'", () => {
    expect(getProvider("google-sheets")).toBe(googleSheetsManifest);
  });

  it("declares Sheets' required scopes — full spreadsheets + OIDC userinfo (Slice 5 confirmed scope)", () => {
    expect(googleSheetsManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
    expect(googleSheetsManifest.scopes.optional).toEqual([]);
    expect(googleSheetsManifest.scopes.deprecated).toEqual([]);
  });

  it("is refreshable: true (matches other Google providers)", () => {
    expect(googleSheetsManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (multi-account ready)", () => {
    expect(googleSheetsManifest.tokenScope).toBe("user");
    expect(googleSheetsManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 5 Commit 2 (oauth only)", () => {
    // Commit 2 lands manifest + OAuth + dispatcher registration. Action
    // handlers (Commit 3) flip `actions: true`; the watch-based trigger
    // (Commit 4) flips `webhookTrigger: true`. Until then the flags MUST
    // stay false per the honest-state convention — capability != true
    // unless the corresponding handler/trigger is registered.
    expect(googleSheetsManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
    expect(providerSupports("google-sheets", "oauth")).toBe(true);
    expect(providerSupports("google-sheets", "actions")).toBe(false);
    expect(providerSupports("google-sheets", "webhookTrigger")).toBe(false);
    expect(providerSupports("google-sheets", "pollingTrigger")).toBe(false);
  });

  it("uses 6h health-check interval matching V1 Google cadence", () => {
    expect(googleSheetsManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v4 (Sheets API v4)", () => {
    expect(googleSheetsManifest.apiVersion).toBe("v4");
  });
});
