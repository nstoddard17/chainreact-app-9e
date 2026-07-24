/**
 * @jest-environment node
 *
 * Fleetio manifest honesty + shape (FLEETIO-1).
 *
 * Business rules protected:
 *   - Manifest honesty (authoring rule 15): Slice 1 ships CONNECT ONLY, so
 *     actions / webhookTrigger / pollingTrigger must all be false. A true
 *     here would surface Fleetio nodes in the builder with no handlers.
 *   - The auth contract Fleetio depends on: credential_paste, non-refreshable,
 *     API version pinned to 2025-05-05, and BOTH credential fields declared
 *     secret + required (the form renders from exactly this metadata).
 *   - fleetio is classified an ACCOUNT credential (a company fleet), which
 *     drives the owner/admin connect gate.
 */
import { fleetioManifest } from "@/integrations/fleetio/manifest";
import { getProvider } from "@/integrations/_registry";
import {
  credentialSharingForProvider,
  hasExplicitCredentialSharing,
} from "@/core/integrations/credentialSharing";

describe("fleetio manifest (FLEETIO-1 — connect-only slice)", () => {
  it("is registered under the stable id 'fleetio' matching its folder", () => {
    expect(fleetioManifest.id).toBe("fleetio");
    expect(getProvider("fleetio")).toBe(fleetioManifest);
  });

  it("declares credential_paste auth, non-refreshable, pinned 2025-05-05", () => {
    expect(fleetioManifest.authFlow).toBe("credential_paste");
    expect(fleetioManifest.refreshable).toBe(false);
    expect(fleetioManifest.apiVersion).toBe("2025-05-05");
  });

  it("is capability-honest: connect + actions exist (FLEETIO-2 get_vehicle), no triggers yet", () => {
    expect(fleetioManifest.capabilities.oauth).toBe(true);
    // FLEETIO-2 registered the first real handler (get_vehicle), so actions is
    // now honestly true; triggers stay false until a later slice ships them.
    expect(fleetioManifest.capabilities.actions).toBe(true);
    expect(fleetioManifest.capabilities.webhookTrigger).toBe(false);
    expect(fleetioManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("is PUBLISHED to the production catalog (owner flip, 2026-07-24)", () => {
    expect(fleetioManifest.isEnabled).toBe(true);
    // isExperimental:false is what reveals Fleetio in the Apps grid
    // (app/apps/_shared.ts isCatalogVisible). Native provider → the manifest is
    // the only gate; there is no preview-flag path.
    expect(fleetioManifest.isExperimental).toBe(false);
  });

  it("declares exactly the two wire credentials, both secret and required, with locate-it help", () => {
    const fields = fleetioManifest.credentialFields!;
    expect(fields.map((f) => f.id)).toEqual(["apiKey", "accountToken"]);
    for (const f of fields) {
      expect(f.secret).toBe(true);
      expect(f.required).toBe(true);
      expect(f.help).toBeTruthy();
    }
  });

  it("ships a connect guide with least-privilege + plan-requirement note", () => {
    expect(fleetioManifest.credentialGuide?.intro).toBeTruthy();
    expect(fleetioManifest.credentialGuide?.steps.length).toBeGreaterThan(0);
    expect(fleetioManifest.credentialGuide?.note).toMatch(/least-privilege/i);
    expect(fleetioManifest.credentialGuide?.note).toMatch(/Professional or Premium/);
  });

  it("declares honest empty scopes (role-based access, no scope negotiation)", () => {
    expect(fleetioManifest.scopes.required).toEqual([]);
  });

  it("is explicitly classified an ACCOUNT credential (owner/admin connect gate)", () => {
    expect(hasExplicitCredentialSharing("fleetio")).toBe(true);
    expect(credentialSharingForProvider("fleetio")).toBe("account");
  });
});
