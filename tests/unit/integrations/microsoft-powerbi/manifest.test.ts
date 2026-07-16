/**
 * @jest-environment node
 *
 * Tests for the Microsoft Power BI provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * downstream code depends on.
 */
import { microsoftPowerBiManifest } from "@/integrations/microsoft-powerbi/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";

const PBI = "https://analysis.windows.net/powerbi/api";

describe("microsoft-powerbi manifest", () => {
  it("is registered in the provider registry under id 'microsoft-powerbi'", () => {
    expect(getProvider("microsoft-powerbi")).toBe(microsoftPowerBiManifest);
  });

  it("declares OIDC identity scopes + the Power BI resource scope set", () => {
    // Identity comes from the id_token (openid/profile/email) because the
    // Power BI-audience access token cannot call Graph /me. offline_access
    // is required for refresh tokens.
    for (const scope of ["openid", "profile", "email", "offline_access"]) {
      expect(microsoftPowerBiManifest.scopes.required).toContain(scope);
    }
    for (const scope of [
      `${PBI}/Dataset.ReadWrite.All`,
      `${PBI}/Report.ReadWrite.All`,
      `${PBI}/Dashboard.Read.All`,
      `${PBI}/Content.Create`,
      `${PBI}/Workspace.ReadWrite.All`,
      `${PBI}/Dataflow.ReadWrite.All`,
      `${PBI}/Pipeline.ReadWrite.All`,
      `${PBI}/Pipeline.Deploy`,
      `${PBI}/Capacity.ReadWrite.All`,
    ]) {
      expect(microsoftPowerBiManifest.scopes.required).toContain(scope);
    }
    expect(microsoftPowerBiManifest.scopes.optional).toEqual([]);
    expect(microsoftPowerBiManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include admin-consent-gated tenant scopes — they would break non-admin connects", () => {
    for (const scope of microsoftPowerBiManifest.scopes.required) {
      expect(scope).not.toMatch(/Tenant\./);
    }
  });

  it("takes only the READ dashboard scope — no shipped node writes a dashboard", () => {
    // GET /groups/{id}/dashboards documents "Dashboard.ReadWrite.All or
    // Dashboard.Read.All"; the workspace_item_* triggers only list them.
    expect(microsoftPowerBiManifest.scopes.required).toContain(
      `${PBI}/Dashboard.Read.All`,
    );
    expect(microsoftPowerBiManifest.scopes.required).not.toContain(
      `${PBI}/Dashboard.ReadWrite.All`,
    );
  });

  it("does NOT include Graph scopes — Power BI is not a Graph provider", () => {
    for (const wrongScope of [
      "Files.ReadWrite",
      "Mail.Send",
      "Calendars.ReadWrite",
      "User.Read",
    ]) {
      expect(microsoftPowerBiManifest.scopes.required).not.toContain(
        wrongScope,
      );
    }
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftPowerBiManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches sibling Microsoft providers)", () => {
    expect(microsoftPowerBiManifest.tokenScope).toBe("user");
    expect(microsoftPowerBiManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities — oauth + actions + pollingTrigger, no webhooks", () => {
    expect(microsoftPowerBiManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: true,
      actions: true,
    });
    expect(providerSupports("microsoft-powerbi", "oauth")).toBe(true);
    expect(providerSupports("microsoft-powerbi", "actions")).toBe(true);
    expect(providerSupports("microsoft-powerbi", "pollingTrigger")).toBe(true);
    expect(providerSupports("microsoft-powerbi", "webhookTrigger")).toBe(false);
  });
});
