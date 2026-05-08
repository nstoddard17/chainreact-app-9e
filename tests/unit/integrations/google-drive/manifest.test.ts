/**
 * @jest-environment node
 *
 * Tests for the Google Drive provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on import
 * if malformed); these tests assert the specific manifest values that
 * downstream code depends on.
 */
import { googleDriveManifest } from "@/integrations/google-drive/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";

describe("google-drive manifest", () => {
  it("is registered in the provider registry under id 'google-drive'", () => {
    expect(getProvider("google-drive")).toBe(googleDriveManifest);
  });

  it("declares Drive's required scopes — full drive + OIDC userinfo (Slice 4 confirmed scope)", () => {
    expect(googleDriveManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
    expect(googleDriveManifest.scopes.optional).toEqual([]);
    expect(googleDriveManifest.scopes.deprecated).toEqual([]);
  });

  it("is refreshable: true (matches Gmail/Calendar)", () => {
    expect(googleDriveManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (multi-account ready)", () => {
    expect(googleDriveManifest.tokenScope).toBe("user");
    expect(googleDriveManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 4 Commit 2 (oauth only)", () => {
    // Commit 2 lands manifest + OAuth + dispatcher registration. Action
    // handlers (Commit 3) flip `actions: true`; the watch-based trigger
    // (Commit 4) flips `webhookTrigger: true`. Until then the flags MUST
    // stay false per the honest-state convention — capability != true
    // unless the corresponding handler/trigger is registered.
    expect(googleDriveManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
    expect(providerSupports("google-drive", "oauth")).toBe(true);
    expect(providerSupports("google-drive", "actions")).toBe(false);
    expect(providerSupports("google-drive", "webhookTrigger")).toBe(false);
    expect(providerSupports("google-drive", "pollingTrigger")).toBe(false);
  });

  it("uses 6h health-check interval matching V1 Google cadence", () => {
    expect(googleDriveManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });
});
