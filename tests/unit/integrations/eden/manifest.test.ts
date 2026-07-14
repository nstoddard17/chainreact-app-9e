/**
 * @jest-environment node
 *
 * Eden manifest (EDEN-3). Asserts the honest capability posture + the new
 * `token_paste` auth flow + non-refreshable / personal-scope invariants.
 */
import { edenManifest } from "@/integrations/eden/manifest";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { categoryFor, descriptionFor } from "@/lib/apps/providerCategories";

describe("edenManifest", () => {
  it("declares token_paste auth, non-refreshable, user-scoped", () => {
    expect(edenManifest.id).toBe("eden");
    expect(edenManifest.authFlow).toBe("token_paste");
    expect(edenManifest.refreshable).toBe(false);
    expect(edenManifest.tokenScope).toBe("user");
  });

  it("is connect-capable but ships no actions/triggers yet (honest capabilities)", () => {
    expect(edenManifest.capabilities.oauth).toBe(true); // the paste flow IS the connect path
    expect(edenManifest.capabilities.actions).toBe(false);
    expect(edenManifest.capabilities.webhookTrigger).toBe(false);
    expect(edenManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("is experimental until live-certified (kept out of the default Apps catalog)", () => {
    expect(edenManifest.isExperimental).toBe(true);
    expect(edenManifest.isEnabled).toBe(true);
  });

  it("declares at least one required scope (OAuth-capable invariant)", () => {
    expect(edenManifest.scopes.required.length).toBeGreaterThan(0);
  });

  it("is classified as a personal credential", () => {
    expect(credentialSharingForProvider("eden")).toBe("personal");
  });

  it("has explicit Apps catalog metadata (category + non-empty description)", () => {
    expect(categoryFor("eden")).toBe("Social");
    expect(descriptionFor("eden").length).toBeGreaterThan(0);
  });
});
