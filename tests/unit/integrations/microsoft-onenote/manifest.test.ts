/**
 * @jest-environment node
 *
 * Tests for the Microsoft OneNote provider manifest —
 * Slice 3.ONENOTE-2.
 */
import { microsoftOneNoteManifest } from "@/integrations/microsoft-onenote/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

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

  it("declares ONENOTE-2 honest capabilities (oauth + actions; webhookTrigger false permanently; pollingTrigger false until ONENOTE-5)", () => {
    expect(microsoftOneNoteManifest.capabilities).toEqual({
      oauth: true,
      // False PERMANENTLY — Graph deprecated OneNote subscriptions in
      // May 2023. V2-native triggers will use polling (pollingTrigger
      // flag flips in ONENOTE-5).
      webhookTrigger: false,
      // False until ONENOTE-5 ships new_note + updated_note polling.
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("microsoft-onenote", "oauth")).toBe(true);
    expect(providerSupports("microsoft-onenote", "actions")).toBe(true);
    expect(providerSupports("microsoft-onenote", "webhookTrigger")).toBe(false);
    expect(providerSupports("microsoft-onenote", "pollingTrigger")).toBe(false);
  });

  it("when actions: true, the action-handler registry contains all 12 OneNote actions", () => {
    if (microsoftOneNoteManifest.capabilities.actions) {
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
    }
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
