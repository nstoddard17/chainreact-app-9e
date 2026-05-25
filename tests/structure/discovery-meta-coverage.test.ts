/**
 * Structure test: every action handler registered for a covered provider
 * has a matching ActionMeta entry in the discovery registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.0:
 *   - The discovery registry expands one provider at a time.
 *   - This test maintains an explicit COVERED_PROVIDERS list — only the
 *     listed providers are required to have full meta coverage.
 *   - Subsequent Phase-3 commits add the next provider's metas + add
 *     that provider id to COVERED_PROVIDERS. The test then enforces
 *     coverage for that provider going forward, preventing accidental
 *     handler/meta drift inside the covered scope.
 *
 * Coverage scope: native (Slice 3.0) + GitHub (Slice 3.0b) + Gmail
 * (Slice 3.15) + Microsoft Outlook Mail (Slice 3.17) + Slack
 * (Slices 3.26 → 3.38) + Notion (Slices 3.41 → 3.42) + Stripe
 * (Slices 3.45 → 3.46).
 *
 * This test does NOT block adding new handlers for uncovered providers —
 * adding a handler in an uncovered provider can land without an action
 * meta file, but a handler landing in any covered provider without a
 * meta file will fail.
 */
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { listAllActionMetas } from "@/services/discovery/_registry";

const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
  // Slack added in Slice 3.38 once all 31 registered Slack action
  // handlers have a matching meta. From here on, adding a new Slack
  // handler without a meta (or vice-versa) fails this structural test.
  "slack",
  // Notion added in Slice 3.42 once all 16 registered Notion action
  // handlers have a matching meta (pages+databases in 3.41,
  // blocks+comments+users in 3.42). Adding a new Notion handler
  // without a meta (or vice-versa) fails this structural test.
  "notion",
  // Stripe added in Slice 3.46 once all 16 registered Stripe action
  // handlers have a matching meta (customer + payment lifecycle in
  // 3.45, subscriptions + commerce in 3.46). Adding a new Stripe
  // handler without a meta (or vice-versa) fails this structural test.
  // Trigger meta (`stripe:event_received`) is deferred — trigger
  // coverage is NOT enforced by this test.
  "stripe",
  // Google Sheets added in Slice 3.GSHEETS-4 once all 12 registered
  // Google Sheets action handlers have a matching meta (read +
  // simple-write in GSHEETS-3; destructive + bulk + formatting in
  // GSHEETS-4) AND both trigger metas (new_worksheet + row_changed)
  // are registered alongside. Adding a new Google Sheets handler
  // without a meta (or vice-versa) fails this structural test from
  // here on.
  "google-sheets",
  // HubSpot added in Slice 3.HUBSPOT-6 once all 26 registered HubSpot
  // action handlers have a matching meta (contacts + companies in
  // HUBSPOT-3, deals + tickets + owners in HUBSPOT-4, engagements +
  // lists + commerce in HUBSPOT-5) AND the single consolidated
  // `webhook_received` trigger meta is registered alongside in
  // HUBSPOT-6. Adding a new HubSpot handler without a meta (or
  // vice-versa) fails this structural test from here on. Trigger
  // coverage is not enforced by this test, but trigger-meta-
  // activation-invariant.test.ts pins the activation-registry side.
  "hubspot",
  // Mailchimp added in Slice 3.MAILCHIMP-4 once all 14 registered
  // Mailchimp action handlers have a matching meta (12 non-campaign
  // actions in MAILCHIMP-3; the 2 `get_campaign*` reads in MAILCHIMP-4)
  // AND all 7 trigger metas (`audience_event` webhook + 6 polling
  // triggers) ship in the same slice. Field-name variance is preserved
  // 1:1 with the runtime schemas — drift in either direction fails this
  // test. Trigger-meta-activation-invariant.test.ts pins the
  // 7 activation-registry registrations on the polling/webhook side.
  "mailchimp",
  // Discord added in Slice 3.DISCORD-4 with the actions-only scope
  // accepted by Marcus's product decision. All 5 V1-manifest-declared
  // action handlers (send_message, edit_message, delete_message,
  // fetch_messages, assign_role) have a matching meta — 1:1 drift is
  // enforced from here on. **Discord triggers are intentionally NOT
  // shipped in this slice** per Slice 3.DISCORD-1 §2.3 decision
  // D-DC1: V1's 3 Discord triggers depended on persistent gateway
  // WebSocket infrastructure (lib/integrations/discordGateway.ts) and
  // V2's trigger contract has no activation mode for that pattern.
  // Trigger coverage is NOT enforced by this test (precedent set by
  // Stripe — see comment at lines 41-46 above). The trigger arc is
  // gated under DISCORD-N-triggers and does not block this slice's
  // action-coverage flip.
  "discord",
  // Google Docs added in Slice 3.GDOCS-4 with the actions-only scope
  // accepted in the GDOCS arc plan. All 5 registered Google Docs
  // action handlers (create_document, update_document, share_document,
  // get_document, export_document) have a matching meta — 1:1 drift
  // is enforced from here on. **Google Docs triggers are
  // intentionally NOT shipped in this slice.** Google Docs has no
  // native trigger surface; both planned triggers (`new_document` +
  // `document_updated`) are implemented via Drive's `files.watch`
  // push channel filtered by the Docs mimeType per GDOCS-1 §3.5
  // D-GD2 and land in GDOCS-5. Trigger coverage is NOT enforced by
  // this test (same precedent as Stripe / Discord); this is a
  // deliberate staged provider arc, not an accidental gap.
  "google-docs",
  // Microsoft OneNote added in Slice 3.ONENOTE-4 with the
  // actions-only scope accepted in the ONENOTE arc plan. All 12
  // registered OneNote action handlers (create_page, update_page,
  // copy_page, get_page_content, list_pages, delete_page,
  // create_section, list_sections, get_section_details,
  // create_notebook, list_notebooks, get_notebook_details) have a
  // matching meta — 1:1 drift is enforced from here on.
  // **OneNote triggers are intentionally NOT shipped in this slice.**
  // Microsoft Graph deprecated OneNote subscriptions in May 2023
  // (no webhook option exists; the manifest's
  // `capabilities.webhookTrigger` is permanently `false`). V2-native
  // OneNote triggers ship as polling (`new_note` + `updated_note`)
  // in ONENOTE-5 via the shared Excel-style polling-trigger
  // infrastructure. Trigger coverage is NOT enforced by this test
  // (same precedent as Stripe / Discord / Google Docs); this is a
  // deliberate staged provider arc, not an accidental gap.
  "microsoft-onenote",
  // Monday.com added in Slice 3.MONDAY-6 once all 24 registered Monday
  // action handlers have a matching meta (10 core in MONDAY-2, the
  // remaining 14 in MONDAY-4; metas + COVERED_PROVIDERS flip in
  // MONDAY-6). 1:1 handler↔meta drift is enforced from here on.
  // **Monday triggers are intentionally NOT shipped in this slice.**
  // The 5 V1 webhook triggers (new_item, column_changed, item_moved,
  // new_subitem, new_update) land in MONDAY-7 via Monday's
  // `create_webhook` lifecycle (`capabilities.webhookTrigger` stays
  // `false` on the manifest until then). Trigger coverage is NOT
  // enforced by this test (same precedent as Stripe / Discord /
  // Google Docs / OneNote); this is a deliberate staged provider arc,
  // not an accidental gap.
  "monday",
  // Dropbox added in Slice 3.DROPBOX-4 once all 11 registered Dropbox
  // action handlers have a matching meta (upload_file, download_file,
  // get_file_metadata, list_folder, search_files, create_folder,
  // move_file, copy_file, delete_file, create_shared_link,
  // get_temporary_link — all ported in DROPBOX-2; metas +
  // COVERED_PROVIDERS flip in DROPBOX-4). 1:1 handler↔meta drift is
  // enforced from here on. **Dropbox triggers are intentionally NOT
  // shipped in this slice.** The single `new_file` trigger lands in
  // DROPBOX-5 via Dropbox's app-level webhook + per-account cursor
  // reconciliation (NOT the per-workflow create_webhook pattern); the
  // manifest's `capabilities.webhookTrigger` stays `false` until then.
  // Trigger coverage is NOT enforced by this test (same precedent as
  // Stripe / Discord / Google Docs / OneNote / Monday); this is a
  // deliberate staged provider arc, not an accidental gap.
  "dropbox",
  // Facebook added in Slice 3.FACEBOOK-4 once all 8 registered Facebook
  // action handlers have a matching meta (create_post, update_post,
  // comment_on_post, upload_photo, upload_video, get_page_insights,
  // send_message, delete_post — all ported in FACEBOOK-2; metas +
  // COVERED_PROVIDERS flip in FACEBOOK-4). 1:1 handler↔meta drift is
  // enforced from here on. **Facebook triggers are intentionally NOT
  // shipped in this slice.** The 2 `new_post` / `new_comment` triggers
  // land in FACEBOOK-5 via Facebook's app-level webhook + per-page
  // `subscribed_apps` activation (the manifest's
  // `capabilities.webhookTrigger` stays `false` until then). Trigger
  // coverage is NOT enforced by this test (same precedent as Stripe /
  // Discord / Google Docs / OneNote / Monday / Dropbox); this is a
  // deliberate staged provider arc, not an accidental gap.
  "facebook",
]);

describe("discovery meta coverage (covered providers)", () => {
  it("every registered handler in a covered provider has an ActionMeta entry", () => {
    const handlerKeys = new Set<string>();
    for (const h of listRegisteredHandlers()) {
      if (COVERED_PROVIDERS.has(h.provider)) {
        handlerKeys.add(`${h.provider}:${h.type}`);
      }
    }

    const metaKeys = new Set(listAllActionMetas().map((m) => m.key));

    const missingMeta: string[] = [];
    for (const key of handlerKeys) {
      if (!metaKeys.has(key)) {
        missingMeta.push(key);
      }
    }
    expect(missingMeta).toEqual([]);
  });

  it("every ActionMeta has a registered handler (no orphan meta)", () => {
    const handlerKeys = new Set(
      listRegisteredHandlers().map((h) => `${h.provider}:${h.type}`),
    );

    const orphanMeta: string[] = [];
    for (const meta of listAllActionMetas()) {
      if (!handlerKeys.has(meta.key)) {
        orphanMeta.push(meta.key);
      }
    }
    expect(orphanMeta).toEqual([]);
  });

  it("every covered provider has at least one ActionMeta", () => {
    const metaProviders = new Set(
      listAllActionMetas().map((m) => m.provider),
    );
    const uncoveredButListed: string[] = [];
    for (const provider of COVERED_PROVIDERS) {
      if (!metaProviders.has(provider)) {
        uncoveredButListed.push(provider);
      }
    }
    expect(uncoveredButListed).toEqual([]);
  });
});
