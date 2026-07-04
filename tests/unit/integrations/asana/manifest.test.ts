/**
 * @jest-environment node
 *
 * Manifest + registry + credential-class tests for Asana — Slice
 * 5.ASANA-1.
 */
import { ProviderManifestSchema } from "@/contracts/integration";
import { asanaManifest } from "@/integrations/asana/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import {
  credentialSharingForProvider,
  hasExplicitCredentialSharing,
} from "@/core/integrations/credentialSharing";

describe("asana manifest", () => {
  it("parses against the ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(asanaManifest)).not.toThrow();
  });

  it("declares the exact minimum scope set for the first slice", () => {
    expect([...asanaManifest.scopes.required].sort()).toEqual(
      [
        "projects:read",
        "stories:write",
        "tasks:read",
        "tasks:write",
        "users:read",
        "webhooks:delete",
        "webhooks:write",
        "workspaces:read",
      ].sort(),
    );
    expect(asanaManifest.scopes.optional).toEqual([]);
    expect(asanaManifest.scopes.deprecated).toEqual([]);
  });

  it("capabilities are honest: oauth + actions + webhookTrigger true, polling false", () => {
    expect(asanaManifest.capabilities).toEqual({
      oauth: true,
      actions: true,
      webhookTrigger: true,
      pollingTrigger: false,
    });
  });

  it("is a refreshable user-scoped code-callback provider keyed by email", () => {
    expect(asanaManifest.refreshable).toBe(true);
    expect(asanaManifest.tokenScope).toBe("user");
    expect(asanaManifest.authFlow).toBe("code_callback");
    expect(asanaManifest.accountIdField).toBe("email");
  });

  it("is registered in the provider registry", () => {
    expect(getProvider("asana")).toBe(asanaManifest);
    expect(providerSupports("asana", "oauth")).toBe(true);
    expect(providerSupports("asana", "actions")).toBe(true);
    expect(providerSupports("asana", "webhookTrigger")).toBe(true);
    expect(providerSupports("asana", "pollingTrigger")).toBe(false);
  });

  it("is explicitly classified as a PERSONAL credential provider", () => {
    expect(hasExplicitCredentialSharing("asana")).toBe(true);
    expect(credentialSharingForProvider("asana")).toBe("personal");
  });
});
