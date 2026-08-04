/**
 * @jest-environment node
 *
 * Tests for the Microsoft OneNote provider manifest —
 * Slice 3.ONENOTE-2.
 */
import { microsoftOneNoteManifest } from "@/integrations/microsoft-onenote/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

import { listProviders } from "@/integrations/_registry";
describe("microsoft-onenote manifest", () => {
  it("is registered in the provider registry under id 'microsoft-onenote'", () => {
    expect(getProvider("microsoft-onenote")).toBe(microsoftOneNoteManifest);
  });

  it("declares the OneNote-only Graph scopes — exactly the two approved for ONENOTE-2", () => {
    // ONENOTE-1 §4.3 + ONENOTE-2 confirmed scope decision:
    // offline_access + Notes.ReadWrite. NO Notes.Read (Microsoft
    // permissions are hierarchical — ReadWrite includes Read). NO
    // Notes.ReadWrite.All (V1's broader choice — grants tenant-wide
    // notebook access; deferred per scope until a real consumer asks).
    expect(microsoftOneNoteManifest.scopes.required).toEqual([
      "offline_access",
      "Notes.ReadWrite",
    ]);
    expect(microsoftOneNoteManifest.scopes.optional).toEqual([]);
    expect(microsoftOneNoteManifest.scopes.deprecated).toEqual([]);
  });

  it("does NOT include Notes.ReadWrite.All — ONENOTE-2 stays scoped to personal notebooks", () => {
    expect(microsoftOneNoteManifest.scopes.required).not.toContain(
      "Notes.ReadWrite.All",
    );
    expect(microsoftOneNoteManifest.scopes.required).not.toContain(
      "Notes.Read.All",
    );
    expect(microsoftOneNoteManifest.scopes.required).not.toContain(
      "Notes.Read",
    );
  });

  it("does NOT include Mail / Calendars / Files / Teams scopes — those belong to sibling Microsoft providers", () => {
    for (const wrongScope of [
      "Mail.Send",
      "Mail.Read",
      "Mail.ReadWrite",
      "Calendars.Read",
      "Calendars.ReadWrite",
      "Files.ReadWrite",
      "Files.Read",
      "Chat.Read",
      "Channel.Message.Read.All",
    ]) {
      expect(microsoftOneNoteManifest.scopes.required).not.toContain(
        wrongScope,
      );
    }
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftOneNoteManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches sibling Microsoft providers)", () => {
    expect(microsoftOneNoteManifest.tokenScope).toBe("user");
    expect(microsoftOneNoteManifest.accountIdField).toBe("email");
  });

  it("declares ONENOTE-5 honest capabilities (oauth + actions + pollingTrigger; webhookTrigger false permanently)", () => {
    expect(microsoftOneNoteManifest.capabilities).toEqual({
      oauth: true,
      // False PERMANENTLY — Graph deprecated OneNote subscriptions in
      // May 2023. V2-native triggers use polling, not webhooks.
      webhookTrigger: false,
      // True — ONENOTE-5 shipped new_note + updated_note section-scoped
      // polling triggers via the shared pollingRegistry.
      pollingTrigger: true,
      actions: true,
    });
    expect(providerSupports("microsoft-onenote", "oauth")).toBe(true);
    expect(providerSupports("microsoft-onenote", "actions")).toBe(true);
    expect(providerSupports("microsoft-onenote", "webhookTrigger")).toBe(false);
    expect(providerSupports("microsoft-onenote", "pollingTrigger")).toBe(true);
  });

  it("declares actions: true and the action-handler registry contains all 12 OneNote actions", () => {
    // Fail-closed: assert the capability itself — a regression that flips
    // it to false must FAIL here, not silently skip the registry pin.
    expect(microsoftOneNoteManifest.capabilities.actions).toBe(true);
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    expect(registered.map((r) => r.type).sort()).toEqual([
      "copy_page",
      "create_notebook",
      "create_page",
      "create_section",
      "delete_page",
      "get_notebook_details",
      "get_page_content",
      "get_section_details",
      "list_notebooks",
      "list_pages",
      "list_sections",
      "update_page",
    ]);
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftOneNoteManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable, same as every Microsoft sibling)", () => {
    expect(microsoftOneNoteManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftOneNoteManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftOneNoteManifest.isEnabled).toBe(true);
    expect(microsoftOneNoteManifest.isExperimental).toBe(false);
  });

  it("uses a distinct provider id from other Microsoft siblings", () => {
    expect(microsoftOneNoteManifest.id).toBe("microsoft-onenote");
    for (const siblingId of [
      "microsoft-outlook",
      "microsoft-outlook-calendar",
      "microsoft-onedrive",
      "microsoft-excel",
      "microsoft-teams",
    ]) {
      expect(getProvider(siblingId)).not.toBe(microsoftOneNoteManifest);
    }
  });

  it("displayName is 'OneNote' (user-friendly — drops the 'Microsoft' prefix per the established convention)", () => {
    expect(microsoftOneNoteManifest.displayName).toBe("OneNote");
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling _registry.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Slice 3.ONENOTE-2 — Microsoft OneNote handler-registry coverage.
// Pins:
// - All 12 V1-manifest-declared action handlers register.
// - No duplicates.
// - The OAuth dispatcher resolves the OneNote provider.
// - The provider manifest registry returns the OneNote manifest.
// ---------------------------------------------------------------------------

const EXPECTED_ACTION_TYPES = [
  "create_page",
  "create_notebook",
  "create_section",
  "update_page",
  "get_page_content",
  "list_pages",
  "copy_page",
  "delete_page",
  "list_notebooks",
  "list_sections",
  "get_notebook_details",
  "get_section_details",
].sort();

describe("microsoft-onenote handler registry", () => {
  it("registers exactly 12 action handlers (full V1 manifest port)", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    expect(handlers).toHaveLength(12);
  });

  it("registers every expected action type", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    expect(handlers.map((h) => h.type).sort()).toEqual(EXPECTED_ACTION_TYPES);
  });

  it("registers no duplicate (provider, type) pairs", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    const keys = handlers.map((h) => `${h.provider}:${h.type}`);
    // Fail-closed floor: an empty registry would make the set/length
    // comparison vacuously true (PROVIDER-CONTRACT-CONSOLIDATION-1B).
    expect(keys).toHaveLength(EXPECTED_ACTION_TYPES.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("microsoft-onenote provider registry", () => {
  it("returns the OneNote manifest under id 'microsoft-onenote'", () => {
    expect(getProvider("microsoft-onenote")).toBe(microsoftOneNoteManifest);
  });

  it("listProviders includes 'microsoft-onenote'", () => {
    expect(listProviders().some((p) => p.id === "microsoft-onenote")).toBe(
      true,
    );
  });

  it("providerSupports correctly reports OneNote capabilities (ONENOTE-5: pollingTrigger now true)", () => {
    expect(providerSupports("microsoft-onenote", "oauth")).toBe(true);
    expect(providerSupports("microsoft-onenote", "actions")).toBe(true);
    // webhookTrigger stays false permanently — Graph deprecated OneNote
    // subscriptions May 2023.
    expect(providerSupports("microsoft-onenote", "webhookTrigger")).toBe(false);
    // pollingTrigger flipped true in ONENOTE-5 (new_note + updated_note).
    expect(providerSupports("microsoft-onenote", "pollingTrigger")).toBe(true);
  });
});
