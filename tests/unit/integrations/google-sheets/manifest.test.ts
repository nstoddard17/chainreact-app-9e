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
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

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

  it("declares honest capabilities for Slice 5 Commit 4 (oauth + actions + webhookTrigger)", () => {
    // Commit 2 landed manifest + OAuth + dispatcher registration. Commit 3
    // landed actions + flipped `actions: true`. Commit 4 (this) lands the
    // row_changed watch trigger + flips `webhookTrigger: true`. Slice 5
    // Batch 1 is now feature-complete by manifest.
    expect(googleSheetsManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("google-sheets", "oauth")).toBe(true);
    expect(providerSupports("google-sheets", "actions")).toBe(true);
    expect(providerSupports("google-sheets", "webhookTrigger")).toBe(true);
    expect(providerSupports("google-sheets", "pollingTrigger")).toBe(false);
  });

  it("when actions: true, the action-handler registry contains all 5 Sheets actions", () => {
    if (googleSheetsManifest.capabilities.actions) {
      const registered = listRegisteredHandlers().filter(
        (h) => h.provider === "google-sheets",
      );
      expect(registered.map((r) => r.type).sort()).toEqual([
        "append_row",
        "clear_range",
        "get_sheet_metadata",
        "read_rows",
        "update_row",
      ]);
    }
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
