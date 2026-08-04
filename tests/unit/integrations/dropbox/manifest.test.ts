/**
 * @jest-environment node
 *
 * Tests for the Dropbox provider manifest — Slice 3.DROPBOX-2.
 */
import { dropboxManifest } from "@/integrations/dropbox/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

import { listProviders } from "@/integrations/_registry";
describe("dropbox manifest", () => {
  it("is registered in the provider registry under id 'dropbox'", () => {
    expect(getProvider("dropbox")).toBe(dropboxManifest);
  });

  it("declares the 6 accepted DROPBOX-2 scopes (4 V1 + sharing.read/write)", () => {
    expect(dropboxManifest.scopes.required).toEqual([
      "account_info.read",
      "files.metadata.read",
      "files.content.read",
      "files.content.write",
      "sharing.read",
      "sharing.write",
    ]);
    expect(dropboxManifest.scopes.optional).toEqual([]);
    expect(dropboxManifest.scopes.deprecated).toEqual([]);
  });

  it("includes sharing scopes required by create_shared_link / list_shared_links", () => {
    expect(dropboxManifest.scopes.required).toContain("sharing.write");
    expect(dropboxManifest.scopes.required).toContain("sharing.read");
  });

  it("is refreshable: true", () => {
    expect(dropboxManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: account_id (webhook-routing key)", () => {
    expect(dropboxManifest.tokenScope).toBe("user");
    expect(dropboxManifest.accountIdField).toBe("account_id");
  });

  it("declares capabilities (oauth + actions + webhookTrigger after DROPBOX-5; no polling)", () => {
    expect(dropboxManifest.capabilities).toEqual({
      oauth: true,
      // DROPBOX-5 flipped this true — the new_file app-level webhook trigger.
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("dropbox", "oauth")).toBe(true);
    expect(providerSupports("dropbox", "actions")).toBe(true);
    expect(providerSupports("dropbox", "webhookTrigger")).toBe(true);
    expect(providerSupports("dropbox", "pollingTrigger")).toBe(false);
  });

  it("registers the full 11-action Dropbox surface", () => {
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "dropbox",
    );
    expect(registered.map((r) => r.type).sort()).toEqual([
      "copy_file",
      "create_folder",
      "create_shared_link",
      "delete_file",
      "download_file",
      "get_file_metadata",
      "get_temporary_link",
      "list_folder",
      "move_file",
      "search_files",
      "upload_file",
    ]);
  });

  it("uses a 12h health-check interval (Others bucket)", () => {
    expect(dropboxManifest.healthCheckIntervalMs).toBe(12 * 60 * 60 * 1000);
  });

  it("displayName is 'Dropbox'; isEnabled true; oauthFlows ['v2']", () => {
    expect(dropboxManifest.displayName).toBe("Dropbox");
    expect(dropboxManifest.isEnabled).toBe(true);
    expect(dropboxManifest.isExperimental).toBe(false);
    expect(dropboxManifest.oauthFlows).toEqual(["v2"]);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling _registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Dropbox registry wiring — Slice 3.DROPBOX-2. Pins manifest registration
// + the full 11-action handler-registry surface (no duplicates, all
// functions).
// ---------------------------------------------------------------------------

const EXPECTED_DROPBOX_ACTIONS = [
  "upload_file",
  "download_file",
  "get_file_metadata",
  "list_folder",
  "search_files",
  "create_folder",
  "move_file",
  "copy_file",
  "delete_file",
  "create_shared_link",
  "get_temporary_link",
];

describe("dropbox provider registry", () => {
  it("returns the Dropbox manifest under id 'dropbox'", () => {
    expect(getProvider("dropbox")).toBe(dropboxManifest);
  });

  it("listProviders includes 'dropbox'", () => {
    expect(listProviders().some((p) => p.id === "dropbox")).toBe(true);
  });
});

describe("dropbox handler registry", () => {
  it("registers exactly the 11 accepted Dropbox actions", () => {
    const types = listRegisteredHandlers()
      .filter((h) => h.provider === "dropbox")
      .map((h) => h.type);
    expect(types.sort()).toEqual([...EXPECTED_DROPBOX_ACTIONS].sort());
    expect(types).toHaveLength(11);
  });

  it("registers no duplicate (provider, type) pairs for Dropbox", () => {
    const keys = listRegisteredHandlers()
      .filter((h) => h.provider === "dropbox")
      .map((h) => `${h.provider}:${h.type}`);
    // Fail-closed floor: an empty registry would make the set/length
    // comparison vacuously true (PROVIDER-CONTRACT-CONSOLIDATION-1B).
    expect(keys).toHaveLength(EXPECTED_DROPBOX_ACTIONS.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
