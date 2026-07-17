/**
 * @jest-environment node
 *
 * MOTIVE-1 — manifest capability + scope + credential-class pins.
 */
import { motiveManifest } from "@/integrations/motive/manifest";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";

describe("motive manifest", () => {
  it("declares the honest capability set (actions + webhook + polling)", () => {
    expect(motiveManifest.id).toBe("motive");
    expect(motiveManifest.displayName).toBe("Motive");
    expect(motiveManifest.isEnabled).toBe(true);
    expect(motiveManifest.apiVersion).toBe("v1");
    expect(motiveManifest.accountIdField).toBe("companyId");
    expect(motiveManifest.refreshable).toBe(true);
    expect(motiveManifest.capabilities).toMatchObject({
      oauth: true,
      actions: true,
      webhookTrigger: true,
      pollingTrigger: true,
    });
  });

  it("requests only the scopes the shipped nodes use", () => {
    expect(motiveManifest.scopes.required).toEqual(
      expect.arrayContaining([
        "companies.read",
        "users.read",
        "users.manage",
        "vehicles.read",
        "vehicles.manage",
        "fuel_purchases.read",
        "fuel_purchases.manage",
        "messages.manage",
      ]),
    );
    // No unused broad scopes.
    expect(motiveManifest.scopes.required).not.toContain("dispatches.manage");
    expect(motiveManifest.scopes.required).not.toContain("locations.vehicle_locations_list");
  });

  it("is an ACCOUNT credential provider (shared company fleet)", () => {
    expect(isAccountCredentialProvider("motive")).toBe(true);
  });
});
