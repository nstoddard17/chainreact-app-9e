/**
 * @jest-environment node
 *
 * Tests for the Airtable provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on
 * import if malformed); these tests assert the specific manifest values
 * that downstream code depends on.
 */
import { airtableManifest } from "@/integrations/airtable/manifest";
import {
  getProvider,
  providerSupports,
} from "@/integrations/_registry";
import { ProviderManifestSchema } from "@/contracts/integration";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";

describe("airtable manifest", () => {
  it("validates against ProviderManifestSchema", () => {
    expect(() => ProviderManifestSchema.parse(airtableManifest)).not.toThrow();
  });

  it("is registered in the provider registry under id 'airtable'", () => {
    expect(getProvider("airtable")).toBe(airtableManifest);
  });

  it("declares the four Slice 10 Batch 1 scopes — exactly the approved set", () => {
    // Slice 10 confirmed scope decision #6:
    //   data.records:read, data.records:write, schema.bases:read,
    //   webhook:manage. NO schema.bases:write (no schema-mutation
    //   actions in Batch 1) and NO user.email:read (V2 surfaces
    //   userId as accountIdField, not email).
    expect(airtableManifest.scopes.required).toEqual([
      "data.records:read",
      "data.records:write",
      "schema.bases:read",
      "webhook:manage",
    ]);
    expect(airtableManifest.scopes.optional).toEqual([]);
    expect(airtableManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include schema.bases:write or user.email:read (deferred per Slice 10 Batch 1 scope)", () => {
    // Explicit anti-test. V1 includes schema.bases:write but V2 has
    // no schema-mutation actions in Batch 1.
    expect(airtableManifest.scopes.required).not.toContain(
      "schema.bases:write",
    );
    expect(airtableManifest.scopes.required).not.toContain(
      "user.email:read",
    );
  });

  it("is refreshable: true (Airtable issues refresh tokens; ROTATED on every refresh)", () => {
    // Slice 10's load-bearing test for V2's rotated-refresh-token
    // contract. V1's `refreshTokenExpirationSupported: false` flag at
    // oauthConfig.ts:414 means "no explicit expiration metadata," NOT
    // "refresh isn't supported." V2 declares refreshable: true.
    expect(airtableManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: 'user' with accountIdField: 'userId'", () => {
    // Single Airtable integration per (user, providerAccountId). The
    // userId from /v0/meta/whoami is the stable discriminator.
    expect(airtableManifest.tokenScope).toBe("user");
    expect(airtableManifest.accountIdField).toBe("userId");
  });

  it("declares honest capabilities for Slice 10 Commit 4 (oauth + actions + webhookTrigger)", () => {
    // Slice 10 Commit 2 landed manifest + OAuth + dispatcher
    // registration. Commit 3 landed 8 action handlers + flipped
    // `actions: true`. Commit 4 (this) lands the record_changed
    // subscription trigger + flips `webhookTrigger: true`.
    // Honest-state convention: flags flip in lockstep with the
    // registrations they describe.
    expect(airtableManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("airtable", "oauth")).toBe(true);
    expect(providerSupports("airtable", "actions")).toBe(true);
    expect(providerSupports("airtable", "webhookTrigger")).toBe(true);
    expect(providerSupports("airtable", "pollingTrigger")).toBe(false);
  });

  it("when webhookTrigger: true, record_changed activation + deactivation hooks are registered", () => {
    if (airtableManifest.capabilities.webhookTrigger) {
      expect(findActivation("airtable", "record_changed")).not.toBeNull();
      expect(findDeactivation("airtable", "record_changed")).not.toBeNull();
    }
  });

  it("when actions: true, the action-handler registry contains all 10 Airtable actions", () => {
    if (airtableManifest.capabilities.actions) {
      const registered = listRegisteredHandlers().filter(
        (h) => h.provider === "airtable",
      );
      expect(registered.map((r) => r.type).sort()).toEqual([
        "add_attachment",
        "create_multiple_records",
        "create_record",
        "delete_record",
        "find_record",
        "get_base_schema",
        "get_record",
        "get_table_schema",
        "list_records",
        "update_record",
      ]);
    }
  });

  it("declares apiVersion 'v0' (Airtable REST API version)", () => {
    expect(airtableManifest.apiVersion).toBe("v0");
  });

  it("declares 12h health-check interval (matches V2's 'other providers' tier — Notion/Slack/Discord)", () => {
    expect(airtableManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("declares oauthFlows: ['v2'] (Airtable's current OAuth 2.0 with PKCE)", () => {
    expect(airtableManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(airtableManifest.isEnabled).toBe(true);
    expect(airtableManifest.isExperimental).toBe(false);
  });

  it("uses provider id 'airtable'", () => {
    expect(airtableManifest.id).toBe("airtable");
    expect(airtableManifest.displayName).toBe("Airtable");
  });
});
