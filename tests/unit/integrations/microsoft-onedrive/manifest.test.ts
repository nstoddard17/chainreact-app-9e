/**
 * @jest-environment node
 *
 * Tests for the Microsoft OneDrive provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * that downstream code depends on.
 */
import { microsoftOneDriveManifest } from "@/integrations/microsoft-onedrive/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";

describe("microsoft-onedrive manifest", () => {
  it("is registered in the provider registry under id 'microsoft-onedrive'", () => {
    expect(getProvider("microsoft-onedrive")).toBe(microsoftOneDriveManifest);
  });

  it("declares the OneDrive-only Graph scopes — exactly the two approved for Slice 8", () => {
    // Slice 8 confirmed scope decision #5: offline_access + Files.ReadWrite.
    // NO Files.Read (Microsoft permissions are hierarchical — ReadWrite
    // includes Read). NO Files.ReadWrite.All (V1's choice — broader,
    // grants SharePoint shared-drive access; deferred per scope).
    // NO Mail / Calendars / Sites scopes (Slice 6/7 + 8 no-scope-bloat
    // principle holds — each Microsoft provider declares only what its
    // own actions / triggers need).
    expect(microsoftOneDriveManifest.scopes.required).toEqual([
      "offline_access",
      "Files.ReadWrite",
    ]);
    expect(microsoftOneDriveManifest.scopes.optional).toEqual([]);
    expect(microsoftOneDriveManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include Files.ReadWrite.All — Slice 8 stays scoped to personal drive", () => {
    // Explicit anti-test. V1 used the broader .All scope; Slice 8
    // narrows to personal-drive only (SharePoint sites + shared drives
    // deferred to a follow-up slice).
    expect(microsoftOneDriveManifest.scopes.required).not.toContain(
      "Files.ReadWrite.All",
    );
    expect(microsoftOneDriveManifest.scopes.required).not.toContain(
      "Files.Read.All",
    );
    expect(microsoftOneDriveManifest.scopes.required).not.toContain(
      "Sites.ReadWrite.All",
    );
  });

  it("does NOT include Mail or Calendars scopes — those belong to sibling Microsoft providers", () => {
    // Anti-test. Slice 6 / 7 / 8 each declare only their own scopes.
    for (const wrongScope of [
      "Mail.Send",
      "Mail.Read",
      "Mail.ReadWrite",
      "Calendars.Read",
      "Calendars.ReadWrite",
    ]) {
      expect(microsoftOneDriveManifest.scopes.required).not.toContain(
        wrongScope,
      );
    }
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftOneDriveManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches sibling Microsoft providers)", () => {
    expect(microsoftOneDriveManifest.tokenScope).toBe("user");
    expect(microsoftOneDriveManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 8 Commit 2 (oauth only)", () => {
    // Slice 8 Commit 2 (this) lands manifest + OAuth + dispatcher.
    // Commit 3 will land the 7 OneDrive actions + flip actions: true.
    // Commit 4 will land file_changed subscription trigger + flip
    // webhookTrigger: true. Honest-state convention means flags flip
    // in lockstep with the registrations they describe.
    expect(microsoftOneDriveManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: false,
      actions: false,
    });
    expect(providerSupports("microsoft-onedrive", "oauth")).toBe(true);
    expect(providerSupports("microsoft-onedrive", "actions")).toBe(false);
    expect(providerSupports("microsoft-onedrive", "webhookTrigger")).toBe(
      false,
    );
    expect(providerSupports("microsoft-onedrive", "pollingTrigger")).toBe(
      false,
    );
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftOneDriveManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable, same as Slice 6 + 7)", () => {
    expect(microsoftOneDriveManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftOneDriveManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftOneDriveManifest.isEnabled).toBe(true);
    expect(microsoftOneDriveManifest.isExperimental).toBe(false);
  });

  it("uses a distinct provider id from microsoft-outlook and microsoft-outlook-calendar (sibling, not extension)", () => {
    // Slice 8 decision: separate provider per surface, matching Slice
    // 6 + 7 pattern. If this assertion ever drifts, the _registry
    // duplicate-id check throws at module load anyway —
    // belt-and-suspenders.
    expect(microsoftOneDriveManifest.id).toBe("microsoft-onedrive");
    expect(getProvider("microsoft-outlook")).not.toBe(
      microsoftOneDriveManifest,
    );
    expect(getProvider("microsoft-outlook-calendar")).not.toBe(
      microsoftOneDriveManifest,
    );
  });
});
