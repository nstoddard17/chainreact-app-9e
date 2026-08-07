/**
 * @jest-environment node
 *
 * Tests for the Gmail provider manifest. Validation against
 * ProviderManifestSchema happens at module load (it would throw on import
 * if malformed); these tests assert the specific manifest values that
 * downstream code depends on.
 */
import { gmailManifest } from "@/integrations/gmail/manifest";
import { getProvider, providerSupports } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("gmail manifest", () => {
  it("is registered in the provider registry under id 'gmail'", () => {
    expect(getProvider("gmail")).toBe(gmailManifest);
  });

  it("declares gmail.modify as the ONLY scope (GOOGLE-OAUTH-SCOPE-MINIMIZATION-1)", () => {
    // gmail.modify authorizes every endpoint the registered surface calls
    // (getProfile, history/messages/labels reads, messages.send,
    // drafts.create, messages.modify/trash, labels.create). The former
    // quad (readonly + send + modify + compose) was redundant — three
    // restricted scopes + one sensitive where one restricted suffices.
    // A second Gmail scope reappearing here means the consent screen and
    // the Google verification surface grew — that needs an explicit
    // owner decision, not a convenience addition.
    expect(gmailManifest.scopes.required).toEqual([
      "https://www.googleapis.com/auth/gmail.modify",
    ]);
    expect(gmailManifest.scopes.optional).toEqual([]);
    expect(gmailManifest.scopes.deprecated).toEqual([]);
  });

  it("is refreshable: true (first refreshable provider in V2)", () => {
    expect(gmailManifest.refreshable).toBe(true);
  });

  it("uses tokenScope: user with accountIdField: email (multi-account ready)", () => {
    expect(gmailManifest.tokenScope).toBe("user");
    expect(gmailManifest.accountIdField).toBe("email");
  });

  it("declares honest capabilities post-Slice 2e (oauth + actions + pollingTrigger)", () => {
    // Slice 2d shipped sendEmail handler → actions: true.
    // Slice 2e shipped newEmail polling trigger → pollingTrigger: true.
    expect(gmailManifest.capabilities).toEqual({
      oauth: true,
      webhookTrigger: false,
      pollingTrigger: true,
      actions: true,
    });
    expect(providerSupports("gmail", "oauth")).toBe(true);
    expect(providerSupports("gmail", "actions")).toBe(true);
    expect(providerSupports("gmail", "pollingTrigger")).toBe(true);
    expect(providerSupports("gmail", "webhookTrigger")).toBe(false);
  });

  it("declares actions: true and the action-handler registry contains EXACTLY the 15 Gmail actions", () => {
    // Honest-capability invariant: the manifest only claims `actions: true`
    // when there's at least one corresponding handler registered.
    // Fail-closed: assert the capability itself — a regression that flips
    // it to false must FAIL here, not silently skip the registry pin.
    expect(gmailManifest.capabilities.actions).toBe(true);
    const registered = listRegisteredHandlers().filter(
      (h) => h.provider === "gmail",
    );
    // TEST-REDUNDANCY-REMOVAL-1 — this EXACT-SET pin replaces the central
    // per-slice presence tests that used to live in
    // tests/unit/services/execution/handlers/registry.test.ts. It is
    // strictly stronger than those: it fails both when a shipped handler
    // DISAPPEARS and when an unapproved one APPEARS, which is what the old
    // suite's negative assertions covered one action at a time —
    // `gmail:advanced_search` (folded into search_emails, parity decision 1)
    // and `gmail:download_attachment` (folded into get_attachment, Gmail 2.3
    // plan §8 decision 13.1) can never register without failing here.
    expect(registered.map((h) => h.type).sort()).toEqual([
      "add_label",
      "archive_email",
      "create_draft",
      "create_draft_reply",
      "create_label",
      "delete_email",
      "get_attachment",
      "get_profile",
      "list_labels",
      "mark_as_read",
      "mark_as_unread",
      "remove_label",
      "reply_to_email",
      "search_emails",
      "send_email",
    ]);
  });

  it("uses 6h health-check interval matching V1 Google cadence", () => {
    expect(gmailManifest.healthCheckIntervalMs).toBe(6 * 60 * 60 * 1000);
  });
});
