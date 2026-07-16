/**
 * @jest-environment node
 *
 * Tests for the Microsoft Outlook provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on import
 * if malformed); these tests assert the specific manifest values that
 * downstream code depends on.
 */
import { microsoftOutlookManifest } from "@/integrations/microsoft-outlook/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("microsoft-outlook manifest", () => {
  it("is registered in the provider registry under id 'microsoft-outlook'", () => {
    expect(getProvider("microsoft-outlook")).toBe(microsoftOutlookManifest);
  });

  it("declares the mail-only Graph scopes — exactly the four approved through Outlook Mail 2.1", () => {
    // Slice 6 confirmed scope decision #4 + Outlook Mail 2.1 P-O1
    // widening (accepted 2026-05-15, see
    // docs/slices/parity/outlook-mail-2-1-compose-drafts-plan.md §2):
    // offline_access, Mail.Send, Mail.Read, Mail.ReadWrite. NO Calendar
    // / Files / Teams / Contacts scopes (V1 rot fix #3 — V1's auth.ts
    // asks for 8 scopes up front; we narrow strictly to mail-only).
    expect(microsoftOutlookManifest.scopes.required).toEqual([
      "offline_access",
      "Mail.Send",
      "Mail.Read",
      "Mail.ReadWrite",
    ]);
    expect(microsoftOutlookManifest.scopes.optional).toEqual([]);
    expect(microsoftOutlookManifest.scopes.deprecated).toEqual([]);
  });

  it("declares Mail.ReadWrite as REQUIRED, not optional (Outlook Mail 2.1 P-O1)", () => {
    // P-O1 widening (accepted 2026-05-15) ships Mail.ReadWrite as a
    // required scope so create_draft_email (2.1) and 2.2's move /
    // delete / add_categories actions have the Graph permissions they
    // need at first call rather than discovering scope gaps at runtime.
    // Mail.ReadWrite must be in `required` — never demoted to optional.
    expect(microsoftOutlookManifest.scopes.required).toContain(
      "Mail.ReadWrite",
    );
    expect(microsoftOutlookManifest.scopes.optional).not.toContain(
      "Mail.ReadWrite",
    );
  });

  it("does NOT include Calendar scopes — those land in Slice 7", () => {
    // Explicit anti-test. Slice 7 will additively widen via re-auth.
    // If this test starts failing because Calendar scopes leaked in,
    // STOP and revisit the slice plan rather than rubber-stamping.
    expect(microsoftOutlookManifest.scopes.required).not.toContain(
      "Calendars.Read",
    );
    expect(microsoftOutlookManifest.scopes.required).not.toContain(
      "Calendars.ReadWrite",
    );
    expect(microsoftOutlookManifest.scopes.required).not.toContain(
      "Files.Read",
    );
    expect(microsoftOutlookManifest.scopes.required).not.toContain("User.Read");
  });

  it("is refreshable: true (Microsoft v2 + offline_access issues refresh tokens)", () => {
    expect(microsoftOutlookManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (matches Gmail)", () => {
    expect(microsoftOutlookManifest.tokenScope).toBe("user");
    expect(microsoftOutlookManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities for Slice 6 Commit 4 (oauth + actions + webhookTrigger)", () => {
    // Slice 6 Commit 2 landed manifest + OAuth + dispatcher. Commit 3
    // landed send_email + flipped actions: true. Commit 4 (this) lands
    // the new_email subscription trigger + flips webhookTrigger: true.
    // Slice 6 is now feature-complete by manifest.
    expect(microsoftOutlookManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: true,
      pollingTrigger: false,
      actions: true,
    });
    expect(providerSupports("microsoft-outlook", "oauth")).toBe(true);
    expect(providerSupports("microsoft-outlook", "actions")).toBe(true);
    expect(providerSupports("microsoft-outlook", "webhookTrigger")).toBe(true);
    expect(providerSupports("microsoft-outlook", "pollingTrigger")).toBe(false);
  });

  it("when actions: true, the action-handler registry contains the full 2.1 + 2.2 + 2.3 set", () => {
    // Outlook Mail 2.3 Commit 4 — get_attachment joins the 2.2 set
    // (move_email / delete_email / add_categories / fetch_emails) and
    // 2.1's compose set (send_email / reply_to_email / forward_email /
    // create_draft_email). 2.3 also adds email_sent + email_flagged
    // triggers, but this registry pins only ACTIONS — triggers register
    // through activationRegistry / subscriptionRegistry.
    if (microsoftOutlookManifest.capabilities.actions) {
      const registered = listRegisteredHandlers().filter(
        (h) => h.provider === "microsoft-outlook",
      );
      expect(registered.map((r) => r.type).sort()).toEqual([
        "add_categories",
        "create_draft_email",
        "delete_email",
        "fetch_emails",
        "forward_email",
        "get_attachment",
        // Later additions to the registered set (stale pin caught by the
        // CONFIG-UX-SETUP-ADVANCED-1 gate run — these handlers shipped
        // with the profile/folders slices, not with that sweep).
        "get_profile",
        "list_folders",
        "move_email",
        "reply_to_email",
        "send_email",
      ]);
    }
  });

  it("uses 6h health-check interval matching Microsoft cadence (CLAUDE.md)", () => {
    expect(microsoftOutlookManifest.healthCheckIntervalMs).toBe(
      6 * 60 * 60 * 1000,
    );
  });

  it("declares apiVersion v1.0 (Graph API stable)", () => {
    expect(microsoftOutlookManifest.apiVersion).toBe("v1.0");
  });

  it("declares oauthFlows: ['v2'] (Microsoft identity platform v2.0)", () => {
    expect(microsoftOutlookManifest.oauthFlows).toEqual(["v2"]);
  });

  it("isEnabled: true (no experimental flag)", () => {
    expect(microsoftOutlookManifest.isEnabled).toBe(true);
    expect(microsoftOutlookManifest.isExperimental).toBe(false);
  });
});
