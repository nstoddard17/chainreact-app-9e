/**
 * Action smoke harness — Provider Action CERTIFICATION matrix SEED DATA.
 *
 * The durable, version-controlled list of which provider/action smoke fixtures
 * have passed LIVE verification. Split out of `certification.ts` (structure-only
 * — behavior unchanged) so the growing data list has its own home and the logic
 * module stays under the leaf-line cap. Re-exported by `certification.ts`, so all
 * existing `import { CERTIFICATIONS } from ".../certification"` call sites keep
 * working.
 *
 * SAFETY — this is a committed artifact, so it holds SAFE FACTS ONLY: the
 * provider/action key, a status enum, an optional ISO date / git short-commit,
 * and an optional SHORT sanitized note. It MUST NEVER contain secrets, tokens,
 * selector values, account/run/workflow ids, provider payloads, message/cell
 * bodies, records, or PII. A unit test guards this.
 *
 * Pure + dependency-free (same charter as `core.ts` / `certification.ts`): the
 * type is imported type-only, so there is no runtime import cycle.
 */
import type { CertificationRecord, CertificationStatus } from "./certification";

/** Compact builder for a batch of records that share status/note/date. */
function records(
  status: CertificationStatus,
  note: string,
  date: string,
  keys: readonly (readonly [string, string])[],
): CertificationRecord[] {
  return keys.map(([provider, action]) => ({ provider, action, status, date, note }));
}

const LIVE = "2026-06-20";
const LIVE_AUTODISCOVERY = "2026-06-21";
const SMOKE_WRITE = "2026-06-22";
const SMOKE_WRITE_FILE = "2026-06-23";
const SMOKE_WRITE_SHEETS = "2026-06-24";
const SMOKE_WRITE_SHEETS_DELETE = "2026-06-25";
const SMOKE_WRITE_COPY = "2026-06-25";
const SMOKE_WRITE_ONENOTE = "2026-06-25";
const SMOKE_WRITE_GDOCS = "2026-06-26";
const SMOKE_WRITE_EXCEL = "2026-06-26";
const LIVE_NATIVE = "2026-06-26";
const LIVE_DROPBOX_SEARCH = "2026-06-26";
const SMOKE_WRITE_BATCH_0629 = "2026-06-29";
const LIVE_MONDAY_READS = "2026-06-30";
const SMOKE_WRITE_MONDAY = "2026-06-30";
const LIVE_NOTION_BLOCKS = "2026-07-01";
const SMOKE_WRITE_ONENOTE_COPY = "2026-07-03";
const SMOKE_WRITE_SLACK = "2026-07-03";
const SMOKE_WRITE_SLACK_MEMBERSHIP = "2026-07-03";
const SMOKE_WRITE_SLACK_SCHEDULED = "2026-07-03";
const SMOKE_WRITE_SLACK_DM = "2026-07-03";
const SMOKE_WRITE_SLACK_BLOCKS = "2026-07-03";
const SMOKE_WRITE_SLACK_FILES = "2026-07-03";
const SMOKE_WRITE_SLACK_PINS = "2026-07-03";
const SMOKE_WRITE_GMAIL_DRAFT_LABEL = "2026-07-04";
const SMOKE_WRITE_GMAIL_STATE = "2026-07-04";
const SMOKE_WRITE_GMAIL_SEND = "2026-07-04";
const SMOKE_WRITE_GMAIL_REPLY = "2026-07-04";
const SMOKE_WRITE_GMAIL_ATTACHMENT = "2026-07-04";
const SMOKE_WRITE_HUBSPOT_CRM = "2026-07-04";
const SMOKE_WRITE_HUBSPOT_ENGAGE = "2026-07-04";
const SMOKE_WRITE_HUBSPOT_LINEITEM = "2026-07-04";
const SMOKE_WRITE_HUBSPOT_CALLMEET = "2026-07-04";

/**
 * The certification matrix seed. Actions NOT listed here are derived at read
 * time: a registered action with a fixture defaults to `LIVE_NOT_RUN`; one with
 * no fixture defaults to `MISSING_FIXTURE` (a gap). Conservative by design —
 * over-listing `LIVE_PASS` would wrongly skip; under-listing only re-runs (safe).
 *
 * `native:format_transformer` is deliberately NOT certified — it is the
 * always-run baseline that proves the live harness path is real every sweep.
 */
export const CERTIFICATIONS: readonly CertificationRecord[] = [
  // Monday.com read-only batch — LIVE-certified after Marcus connected Monday
  // (provider was previously not-connected, so these were NOT_RUN). All read-only
  // (no mutation, no cleanup); resource-scoped reads ran via the harness's safe
  // selector auto-discovery (board/item/user ids resolved from the connected
  // account). `search_items` (board id auto-discovered) ran with a synthetic
  // no-match `SMOKE_MONDAY_QUERY` so it returns zero items but still proves the
  // handler + Monday API call execute (the fixture asserts terminal status only).
  // ALL 10 Monday read actions are now certified.
  ...records("LIVE_PASS", "live read verified", LIVE_MONDAY_READS, [
    ["monday", "list_boards"],
    ["monday", "list_users"],
    ["monday", "get_board"],
    ["monday", "get_item"],
    ["monday", "get_user"],
    ["monday", "list_groups"],
    ["monday", "list_items"],
    ["monday", "list_subitems"],
    ["monday", "list_updates"],
    ["monday", "search_items"],
  ]),
  // Monday.com item-tree WRITE — first certified Monday mutation. create_item
  // creates a smoke-marked item on a board/group AUTO-DISCOVERED from the throwaway
  // smoke account (connection proven from the DB row, not a SMOKE_MONDAY_CONNECTED
  // env; a pinned SMOKE_MONDAY_BOARD_ID still wins). Verified by an INDEPENDENT
  // get_item read-back (marker on the item name), then removed via the registered
  // delete_item. Monday's delete is a soft delete (UI-recoverable from the recycle
  // bin) but the smoke object is gone from the board -> artifact "cleaned", 0 leaked.
  ...records("LIVE_PASS_CLEANED", "live write+verify, item deleted (soft delete, recycle-bin recoverable)", SMOKE_WRITE_MONDAY, [
    ["monday", "create_item"],
  ]),
  // Monday item-tree reuse batch — each reuses a fresh smoke create_item parent and
  // cleans via the registered delete_item (0 leaked each). update_item renames the
  // item (columnId "name") verified by get_item marker+"updated". create_update /
  // create_subitem post an update / add a subitem verified by list_updates /
  // list_subitems; neither has a dedicated delete action, so the child is removed
  // transitively when the parent item is deleted. delete_item is the disposition
  // itself (executeIsCleanup), verified by list_items proving the marker is absent.
  ...records("LIVE_PASS_CLEANED", "live write+verify, item renamed then deleted (soft delete)", SMOKE_WRITE_MONDAY, [
    ["monday", "update_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, child removed via parent-item delete (soft delete)", SMOKE_WRITE_MONDAY, [
    ["monday", "create_update"],
    ["monday", "create_subitem"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live delete+verify, item removed and absent from list (soft delete)", SMOKE_WRITE_MONDAY, [
    ["monday", "delete_item"],
  ]),
  // Monday item lifecycle batch — move / archive / duplicate, each on a fresh smoke
  // item and cleaned via registered delete_item (0 leaked each). move_item moves the
  // item into a SECOND auto-discovered group, verified by get_item groupId==target.
  // archive_item archives, verified by get_item state=="archived", then delete_item
  // disposes of the archived item (recycle bin). duplicate_item clones the item
  // (captured as a distinct ledger resource) and deletes BOTH the original and the
  // duplicate. create_group / add_column stay MISSING_FIXTURE (no registered
  // group/column delete for a guaranteed 0-leak teardown).
  ...records("LIVE_PASS_CLEANED", "live move+verify (groupId==target), item deleted (soft delete)", SMOKE_WRITE_MONDAY, [
    ["monday", "move_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live archive+verify (state==archived), then deleted (soft delete)", SMOKE_WRITE_MONDAY, [
    ["monday", "archive_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live duplicate+verify, original and clone both deleted (soft delete)", SMOKE_WRITE_MONDAY, [
    ["monday", "duplicate_item"],
  ]),
  ...records("LIVE_PASS", "live read verified", LIVE, [
    ["slack", "list_channels"],
    ["slack", "list_users"],
    ["slack", "list_scheduled_messages"],
    // NOTE: slack:get_channel_info + get_user_info + get_file_info moved to their own
    // 2026-07-03 entries below — their 2026-06-20 "pass" was STALE (conversations.info /
    // users.info / files.info were actually broken; fixed + re-verified after the
    // JSON->form transport fix).
    ["slack", "get_messages"],
    ["slack", "get_thread_messages"],
    ["airtable", "get_base_schema"],
    ["airtable", "get_table_schema"],
    ["airtable", "list_records"],
    ["airtable", "find_record"],
    ["airtable", "get_record"],
    ["google-sheets", "get_sheet_metadata"],
    ["google-sheets", "read_rows"],
    ["google-sheets", "get_cell_value"],
    ["google-sheets", "find_row"],
    ["google-drive", "list_files"],
    ["google-drive", "get_file_metadata"],
    ["google-drive", "search_files"],
    ["gmail", "list_labels"],
    ["gmail", "get_profile"],
    ["gmail", "search_emails"],
    ["microsoft-outlook", "list_folders"],
    ["microsoft-outlook", "get_profile"],
    ["microsoft-outlook", "fetch_emails"],
    ["notion", "search"],
    ["notion", "list_users"],
    ["notion", "query_database"],
    ["notion", "get_page"],
    ["microsoft-teams", "get_channel_details"],
    ["microsoft-teams", "get_team_members"],
    ["microsoft-teams", "list_teams"],
    ["microsoft-teams", "list_channels"],
    ["microsoft-teams", "list_channel_messages"],
    // Excel verified after fixing the get_workbooks OneDrive $filter bug (the
    // failure was an unsupported server-side `$filter` on /drive/root/children,
    // NOT a missing drive — see workbooksList.ts).
    ["microsoft-excel", "get_workbooks"],
    ["microsoft-excel", "get_worksheets"],
    ["microsoft-excel", "read_range"],
    ["microsoft-excel", "read_table_rows"],
    ["microsoft-excel", "find_row"],
  ]),
  ...records("LIVE_PASS", "live write verified (dedicated smoke channel)", LIVE, [
    ["slack", "send_channel_message"],
  ]),
  // Notion block reads — newly fixtured + LIVE-certified. Both take a blockId; in
  // Notion a page id is a valid block id (get_block returns the page's block object;
  // get_block_children's blockId is dual-meaning and lists the page's child blocks),
  // so both reuse SMOKE_NOTION_PAGE_ID. Read-only, terminal-status only (no content).
  ...records("LIVE_PASS", "live read verified (page id as block id)", LIVE_NOTION_BLOCKS, [
    ["notion", "get_block"],
    ["notion", "get_block_children"],
  ]),
  // Tier-1 selector auto-discovery slice — these read live-verified after the
  // harness gained real connection checks + selector auto-discovery (no manual
  // SMOKE_<PROVIDER>_* selector env needed). Connected providers on the smoke
  // account; selectors auto-discovered from each provider's own list/search APIs.
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", LIVE_AUTODISCOVERY, [
    ["hubspot", "get_companies"],
    ["hubspot", "get_contacts"],
    ["hubspot", "get_deals"],
    ["hubspot", "get_line_items"],
    ["hubspot", "get_owners"],
    ["hubspot", "get_products"],
    ["hubspot", "get_tickets"],
    ["dropbox", "list_folder"],
    ["dropbox", "get_file_metadata"],
    ["google-calendar", "list_events"],
    ["google-docs", "get_document"],
    ["mailchimp", "get_campaign"],
    ["mailchimp", "get_campaign_stats"],
    ["mailchimp", "get_subscribers"],
    ["microsoft-onedrive", "list_items"],
    ["microsoft-onenote", "list_notebooks"],
    ["microsoft-onenote", "list_sections"],
    ["microsoft-onenote", "list_pages"],
    ["microsoft-onenote", "get_notebook_details"],
    ["microsoft-onenote", "get_section_details"],
    ["microsoft-onenote", "get_page_content"],
    ["microsoft-outlook-calendar", "list_events"],
    // FB-FIX: was a BUG (live 400 code=100). Root cause was the fixture's default
    // metric `page_impressions`, removed by Meta's 2024 Page Insights deprecation
    // — NOT a selector or permission issue (pageId auto-discovers, read_insights
    // is granted). Switched to the still-valid `page_post_engagements`; now live-
    // verified on the smoke page (day window).
    ["facebook", "get_page_insights"],
    // TIER1-CLEANUP: new option-source pickers let these auto-discover their
    // previously env-only selectors — mailchimp:members (audience→member email),
    // notion:users (workspace user id), notion:pages (search→page/block id). All
    // live-verified after wiring; reuse existing read wrappers, no new transport.
    ["mailchimp", "get_subscriber"],
    ["notion", "get_user"],
    ["notion", "list_comments"],
    // ONEDRIVE-GETFILE-DISCOVERY: get_file's itemId now auto-discovers via the
    // flat `microsoft-onedrive:files` picker (root files first + bounded folder
    // descent), replacing the folder->items cascade that landed on an empty
    // first folder. Live-verified — discovers a real file with no manual env.
    ["microsoft-onedrive", "get_file"],
  ]),
  // SMOKE-WRITE pilots — live write+verify+cleanup verified (each created one
  // marker-stamped smoke-owned object, confirmed the marker, then ran cleanup).
  //
  // CLEANED (object DELETED, gone):
  //   - airtable:create_record -> delete_record (dedicated smoke base).
  //   - airtable:update_record  -> setup create -> update -> delete (smoke base).
  ...records("LIVE_PASS_CLEANED", "live write+verify, object deleted", SMOKE_WRITE, [
    ["airtable", "create_record"],
    ["airtable", "update_record"],
  ]),
  // LEFT_ARTIFACT (a harmless marked object remains — archived / no hard delete).
  // Verify confirms the crsmoke-* marker on the resource (Trello via the create/
  // update response name; Notion via a get_page read-back title) — not just that
  // the id exists:
  //   - trello:create_card / update_card -> archive_card (reversible; card persists).
  //   - notion:create_page -> archive_page (reversible; page persists). Parent page
  //     auto-discovered (smoke/test-named preferred) on the throwaway account.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + marker verify, object archived", SMOKE_WRITE, [
    ["trello", "create_card"],
    ["trello", "update_card"],
    ["notion", "create_page"],
  ]),
  // SMOKE-WRITE-6 — Notion content batch. Each: setup create_page -> action ->
  // INDEPENDENT read-back confirms the crsmoke-* marker (update_page via get_page
  // title; append_block_children via get_block_children blocks; create_comment via
  // list_comments) -> archive_page. Object archived (persists), reversible.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + read-back marker verify, archived", SMOKE_WRITE, [
    ["notion", "update_page"],
    ["notion", "append_block_children"],
    ["notion", "create_comment"],
  ]),
  // SMOKE-WRITE-7 — trello:add_comment, previously deferred for weak verification
  // (the add_comment output echoed config.text). Now verified via an INDEPENDENT
  // smoke-only read-back (cardsListComments GET) that confirms the crsmoke-* marker
  // in the PROVIDER-persisted comment text — input echo can no longer satisfy it.
  // create card -> comment -> read-back comments -> archive card.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + independent comment read-back, archived", SMOKE_WRITE, [
    ["trello", "add_comment"],
  ]),
  // SMOKE-WRITE-17/18 — Google Drive write batch. Fixtures + the runbook write-cert
  // table landed in those slices, but the durable CERTIFICATIONS rows were missed;
  // the SMOKE-WRITE-AUDIT slice re-ran all 4 LIVE end-to-end and records them here so
  // the matrix matches reality (was: NOT_RUN). Each creates a marker-named smoke-owned
  // Drive object, confirms it on an INDEPENDENT get_file_metadata read-back (marker on
  // `name`; `trashed==true` for delete_file's trash side effect; `parents` contains the
  // target for move_file), then PERMANENTLY deletes every created object (true erase,
  // not trash — Drive's delete_file supports permanent:true). Smoke-owned throughout
  // (My Drive root, no target discovery).
  ...records("LIVE_PASS_CLEANED", "live write+verify, object permanently deleted", SMOKE_WRITE_FILE, [
    ["google-drive", "create_folder"],
    ["google-drive", "upload_file"],
    ["google-drive", "delete_file"],
    ["google-drive", "move_file"],
  ]),
  // SMOKE-WRITE-19 — Dropbox + OneDrive file-provider batch. Each created one
  // marker-named smoke-owned folder at the provider root, confirmed it on an
  // INDEPENDENT read-back, then deleted exactly that folder. Object removed from
  // the active namespace (get-by-path/id then NotFound) -> reported "cleaned".
  // HONESTY: neither provider exposes a hard permanent-delete on these actions —
  // Dropbox delete moves to TRASH (recoverable ~30d), OneDrive delete to the
  // RECYCLE BIN (recoverable). The smoke object is gone from the active drive,
  // but the disposition is reversible (disclosed here, not hidden).
  //
  //   create_folder: create -> get read-back (marker on persisted name +
  //     isFolder/kind state) -> delete. delete (the verb action): setup create ->
  //     delete -> INDEPENDENT existence probe exists==false (typed NotFound
  //     distinguishes deleted from a permission error; the delete echo is never
  //     trusted).
  ...records("LIVE_PASS_CLEANED", "live write+verify, deleted to Dropbox trash (recoverable ~30d)", SMOKE_WRITE_FILE, [
    ["dropbox", "create_folder"],
    ["dropbox", "delete_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_FILE, [
    ["microsoft-onedrive", "create_folder"],
    ["microsoft-onedrive", "delete_item"],
  ]),
  // SMOKE-WRITE-20 — Dropbox + OneDrive upload_file follow-up. Each uploaded one
  // marker-named smoke-owned FILE at the provider root, confirmed it on an
  // INDEPENDENT get read-back (marker on the persisted name + isFolder==false /
  // kind=="file"), then deleted exactly that file. Same reversible disposition as
  // SMOKE-WRITE-19 (Dropbox trash / OneDrive recycle bin), disclosed not hidden.
  //   - dropbox:upload_file consumes a FileRef -> bytes staged in OUR workflow-files
  //     bucket as a v2_storage FileRef (self-contained, never an invented URL).
  //   - microsoft-onedrive:upload_file takes INLINE content -> no staging needed.
  ...records("LIVE_PASS_CLEANED", "live upload+verify, deleted to Dropbox trash (recoverable ~30d)", SMOKE_WRITE_FILE, [
    ["dropbox", "upload_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload+verify, deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_FILE, [
    ["microsoft-onedrive", "upload_file"],
  ]),
  // SMOKE-WRITE-21 — Google Calendar create/update/delete batch. Each creates a
  // marker-titled smoke-owned event on the PRIMARY calendar with NO attendees +
  // sendNotifications:"none" (zero invites/notifications leave the account), confirms
  // it on an INDEPENDENT events.get read-back (marker on the persisted `summary`;
  // update requires the "updated" suffix so a no-op patch fails; delete asserts
  // exists==false via a typed 404 OR status=="cancelled"), then HARD-deletes the
  // event (events.delete is a true erase — gone, NOT trash/recycle). Smoke-owned
  // throughout (primary calendar, no target discovery). The events.get smoke reader
  // is bounded (exists + summary + status) + refresh-safe.
  ...records("LIVE_PASS_CLEANED", "live write+verify, event hard-deleted (true erase)", SMOKE_WRITE_FILE, [
    ["google-calendar", "create_event"],
    ["google-calendar", "update_event"],
    ["google-calendar", "delete_event"],
  ]),
  // SMOKE-WRITE-23 — Google Docs + Sheets create batch (FIRST cross-provider
  // cleanup). A Google Doc / Sheet IS a Drive file, so its documentId /
  // spreadsheetId is a Drive file id and the created artifact is torn down via the
  // certified google-drive:delete_file (neither Docs nor Sheets has its own delete).
  // Each: create a marker-titled smoke-owned artifact -> confirm the marker on the
  // PERSISTED title via an INDEPENDENT get read-back (the create `title` output falls
  // back to config, so it is never used for verification) -> permanent Drive delete
  // (true erase). Cross-provider cleanup is declared via crossProviderCleanup (the
  // harness refuses it otherwise); the smoke-owned guard still applies.
  ...records("LIVE_PASS_CLEANED", "live write+verify, hard-deleted via cross-provider Drive delete", SMOKE_WRITE_FILE, [
    ["google-docs", "create_document"],
    ["google-sheets", "create_spreadsheet"],
  ]),
  // SMOKE-WRITE-24 — certification checkpoint DRIFT FIX. These 10 write actions were
  // live-certified in SMOKE-WRITE-4..16 and recorded in the runbook write-cert table,
  // but their durable CERTIFICATIONS rows were never added — the matrix reported them
  // NOT_RUN (same class as the SMOKE-WRITE-AUDIT Google Drive gap). All 10 were RE-RUN
  // LIVE end-to-end in this checkpoint (airtable / notion / trello fully connected,
  // targets auto-discovered) and PASSED with 0 leaked, so they are recorded here to
  // make the durable matrix match reality.
  //   Airtable: delete_record / create_multiple_records / update_multiple_records /
  //     add_attachment — object DELETED (gone). create/update_multiple use verifyEach;
  //     add_attachment verifies a non-empty rehosted attachment array; delete_record
  //     verifies absence via recordsList. All independent read-backs.
  ...records("LIVE_PASS_CLEANED", "live re-verified in cert checkpoint, object deleted", SMOKE_WRITE_FILE, [
    ["airtable", "delete_record"],
    ["airtable", "create_multiple_records"],
    ["airtable", "update_multiple_records"],
    ["airtable", "add_attachment"],
  ]),
  //   Notion + Trello: object ARCHIVED / LEFT (reversible, persists on the throwaway
  //     account). create_database_entry (query_database marker), add_label_to_card
  //     (idLabels membership), move_card (idList target) verified by INDEPENDENT
  //     read-back; archive_page / archive_card prove archived==true / closed==true;
  //     restore_page proves archived==false.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live re-verified in cert checkpoint, archived/left (reversible)", SMOKE_WRITE_FILE, [
    ["notion", "create_database_entry"],
    ["notion", "archive_page"],
    ["notion", "restore_page"],
    ["trello", "add_label_to_card"],
    ["trello", "move_card"],
    ["trello", "archive_card"],
  ]),
  // SMOKE-WRITE-24 (Part 2) — Microsoft Outlook Calendar create/update/delete batch.
  // Mirrors the certified google-calendar set: each creates a marker-subject smoke-owned
  // event on the user's DEFAULT calendar with NO attendees + responseRequested:false
  // (zero invitations leave the account), confirms it on an INDEPENDENT events.get smoke
  // read-back (marker on the persisted `subject`; update requires the "updated" suffix so
  // a no-op patch fails; delete asserts exists==false via a typed 404 NotFoundError), then
  // HARD-deletes the event (Graph delete is a true erase). The events.get smoke reader is
  // bounded (exists + subject) + refresh-safe. Builder-shaped flat start/end fields satisfy
  // the engine readiness gate. add_attendees deferred (send-like / invite-generating).
  ...records("LIVE_PASS_CLEANED", "live write+verify, event hard-deleted (true erase)", SMOKE_WRITE_FILE, [
    ["microsoft-outlook-calendar", "create_event"],
    ["microsoft-outlook-calendar", "update_event"],
    ["microsoft-outlook-calendar", "delete_event"],
  ]),
  // SMOKE-WRITE-25 — Dropbox copy_file + move_file (file relocation batch). Each
  // SETS UP its own smoke-owned source via dropbox:upload_file (bytes staged in OUR
  // workflow-files bucket as a v2_storage FileRef — self-contained, never an
  // invented URL), then exercises the relocation:
  //   - copy_file: copy the source to a DISTINCT marker path -> confirm the COPY on
  //     an INDEPENDENT get_file_metadata read-back (marker + suffix "copy" on the
  //     PERSISTED name, so it can't pass on the SOURCE name; isFolder==false) ->
  //     delete BOTH files (source + copy) via cleanupEach. created 2 / cleaned 2.
  //   - move_file: move the source to a DISTINCT marker path, re-capturing the new
  //     path into the SAME ledger key (one physical file, current address — never a
  //     stale path) -> confirm on an INDEPENDENT get read-back (marker + suffix
  //     "moved"; isFolder==false) -> delete the one file. created 1 / cleaned 1.
  // HONESTY: Dropbox delete moves to TRASH (recoverable ~30d), not a hard erase —
  // the files are gone from the active namespace ("cleaned"), disposition disclosed
  // not hidden. Verified live end-to-end (0 leaked).
  ...records("LIVE_PASS_CLEANED", "live setup+copy/move+verify, files deleted to Dropbox trash (recoverable ~30d)", SMOKE_WRITE_FILE, [
    ["dropbox", "copy_file"],
    ["dropbox", "move_file"],
  ]),
  // SMOKE-WRITE-26 — OneDrive move_item (atomic move + rename). Setup uploads a
  // smoke-owned source file (INLINE content, no FileRef) AND creates a smoke-owned
  // destination folder — the FILE is captured BEFORE the FOLDER so cleanup deletes
  // the moved child before its parent (deleting the folder first would recursively
  // remove the file inside and the follow-up delete would 404 -> CLEANUP_FAILED).
  // execute relocates + renames the file into the smoke folder in one Graph PATCH
  // (the driveItem id is stable, so the moved id re-captures into the same key).
  // Verified by an INDEPENDENT get_file read-back proving THREE things the handler
  // echo cannot: marker + suffix "moved" on the persisted name (rename landed),
  // kind=="file", and parentReference.id == the captured smoke folder id (move
  // landed in OUR folder). Both items deleted via cleanupEach (file then folder).
  // HONESTY: OneDrive delete moves to the RECYCLE BIN (recoverable); the items leave
  // the active drive ("cleaned"), disposition disclosed. Verified live (0 leaked).
  //
  ...records("LIVE_PASS_CLEANED", "live setup+move/rename+verify, items deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_FILE, [
    ["microsoft-onedrive", "move_item"],
  ]),
  // copy_item — async blocker RESOLVED + LIVE-VERIFIED (SMOKE-WRITE-33). The handler
  // still returns {status:"pending", monitorUrl} and does NOT poll (production
  // unchanged). The write harness `completeAsync` phase polls the TRUSTED Graph copy
  // monitor URL to terminal completion (bounded, smoke-only; the real monitor host is
  // a Microsoft operation host, e.g. *.svc.ms, not graph.microsoft.com) and captures
  // the copied item's real `resourceId` into the cleanup ledger. Live run created the
  // smoke folder + source, copied into the folder, polled to completion, verified the
  // copy by INDEPENDENT get_file (name marker+suffix "copy", kind==file,
  // parentReference.id==smoke folder), then deleted all three -> created 3 / cleaned 3
  // / 0 leaked. (An earlier live run with a too-strict URL gate exercised the FAILURE
  // path live: copy uncaptured -> VERIFY_FAILED, folder+source still cleaned, 0 leaked
  // — the copy lands inside the smoke folder, so the folder-delete cascade covers it.)
  ...records("LIVE_PASS_CLEANED", "live setup+copy+monitor-poll+verify, all three deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_COPY, [
    ["microsoft-onedrive", "copy_item"],
  ]),
  // SMOKE-WRITE-27 — Google Sheets row/range mutators inside a SAME-RUN smoke-owned
  // spreadsheet. Each fixture's setup creates a WHOLE smoke spreadsheet with a PINNED
  // first-sheet name ("Data") so cell addresses are deterministic and never depend on
  // Google's localized default, then mutates ONLY that sheet — never a pre-existing /
  // shared sheet, no positional ambiguity. Verified by an INDEPENDENT get_cell_value
  // read-back of the LIVE cell `value` (the handlers' updated/updatedRange are echoes,
  // never trusted), with a marker suffix proving the SPECIFIC written value:
  //   - update_cell: write Data!A1=<marker>cell (RAW) -> read A1 == "<marker>cell".
  //   - append_row: append [<marker>row,...] to the EMPTY sheet (lands at row 1) ->
  //     read A1 == "<marker>row".
  //   - update_row: SEED A1=<marker>seed, overwrite A1:B1=<marker>updated -> read
  //     A1 == "<marker>updated" (the seed would fail the "updated" suffix, proving the
  //     overwrite actually landed).
  // Cleanup is a CROSS-PROVIDER google-drive:delete_file (permanent) of the WHOLE
  // spreadsheet — a spreadsheetId IS a Drive file id, and Sheets has no own delete.
  // The whole artifact is a TRUE erase (gone, not trash) -> LIVE_PASS_CLEANED.
  // Verified live end-to-end (0 leaked). The create_spreadsheet + Drive-delete
  // pattern (SMOKE-WRITE-23) is what unblocks the previously-deferred row mutators.
  ...records("LIVE_PASS_CLEANED", "live create-sheet + mutate + independent read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", SMOKE_WRITE_SHEETS, [
    ["google-sheets", "update_cell"],
    ["google-sheets", "append_row"],
    ["google-sheets", "update_row"],
  ]),
  // SMOKE-WRITE-28 — Google Sheets clear_range. Same same-run smoke-spreadsheet
  // pattern, but proves a CLEAR (blank) side effect that no marker can show. Setup
  // creates a WHOLE smoke spreadsheet (pinned "Data") and SEEDS Data!A1=<marker>seed
  // (a certified update_cell write) so the clear is provably a change — empty->empty
  // would pass vacuously. execute clears Data!A1; the handler's `clearedRange` is a
  // write echo, never trusted. Verified by an INDEPENDENT get_cell_value read-back
  // asserting the cell `value` is PRESENT-but-EMPTY (null) via the new `expectEmpty`
  // primitive: the read-back contract always EXPOSES the `value` key, so a missing
  // path can never vacuously pass; a still-set value -> VERIFY_FAILED, and a
  // permission/API error fails the read-back STEP before the assertion runs (never
  // read as "cleared"). Cleanup is the same CROSS-PROVIDER google-drive:delete_file
  // (permanent) of the whole spreadsheet -> TRUE erase -> LIVE_PASS_CLEANED. Verified
  // live end-to-end (0 leaked).
  ...records("LIVE_PASS_CLEANED", "live create-sheet + seed + clear + independent empty read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", SMOKE_WRITE_SHEETS, [
    ["google-sheets", "clear_range"],
  ]),
  // SMOKE-WRITE-29 — Google Sheets format_range. Same same-run smoke-spreadsheet
  // pattern, but proves a FORMATTING side effect that no value read-back can show.
  // Setup creates a WHOLE smoke spreadsheet (pinned "Data") and seeds Data!A1 so the
  // formatted cell is a real populated cell whose fresh state carries no bold. execute
  // applies a DETERMINISTIC NON-DEFAULT format (bold:true) to Data!A1; the handler's
  // `appliedFormat` is a CONFIG echo, never trusted. No user-facing Sheets action reads
  // cell format (get_cell_value/read_rows use values.get), so verification uses a NEW
  // bounded smoke-only read-back seam `google-sheets:cell_format` (cellFormatGet): a
  // spreadsheets.get with includeGridData on the SINGLE smoke cell + a tight `fields`
  // mask that returns ONLY userEnteredFormat sub-fields (textFormat.bold/italic +
  // horizontalAlignment) — no cell values / payload / PII — sanitized to scalars, run
  // through refreshAndRetry. The verify asserts bold==true (a fresh cell reads
  // bold:null, so it can only pass if format_range set it); a permission/API error
  // fails the read-back STEP, never read as formatted. Cleanup is the same
  // CROSS-PROVIDER google-drive:delete_file (permanent) of the whole spreadsheet ->
  // TRUE erase -> LIVE_PASS_CLEANED. Verified live end-to-end (0 leaked).
  ...records("LIVE_PASS_CLEANED", "live create-sheet + seed + format + independent bounded format read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", SMOKE_WRITE_SHEETS, [
    ["google-sheets", "format_range"],
  ]),
  // SMOKE-WRITE-30 — Google Sheets batch_update. NOT a raw/arbitrary requests[]
  // passthrough (V1's raw mode is rejected at parse time) — it is a TYPED multi-range
  // VALUE write (spreadsheets.values.batchUpdate, updates: Array<{range, values}>). So
  // the narrowest deterministic request — ONE entry writing ONE cell — is an
  // update_cell shaped through the batch path and is verified the same way: setup
  // creates a WHOLE smoke spreadsheet (pinned "Data", starts EMPTY so A1 is blank),
  // execute writes "<marker>batch" to the single cell Data!A1 (RAW), then an INDEPENDENT
  // get_cell_value read-back confirms the marker on the live A1 value (the handler's
  // responses/totalUpdated counters are echoes, never trusted; only our write could
  // place the unique marker in a fresh sheet). Cleanup is the same CROSS-PROVIDER
  // google-drive:delete_file (permanent) of the whole spreadsheet -> TRUE erase ->
  // LIVE_PASS_CLEANED. Verified live end-to-end (0 leaked).
  ...records("LIVE_PASS_CLEANED", "live create-sheet + one-cell batch write + independent value read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", SMOKE_WRITE_SHEETS, [
    ["google-sheets", "batch_update"],
  ]),
  // SMOKE-WRITE-31 — Google Sheets delete_row (closes Sheets writes). delete_row
  // removes a row by POSITION (sheetName + 1-indexed rowNumber); positional deletion
  // is only ambiguous on a SHARED sheet — inside a SAME-RUN spreadsheet WE own + seed,
  // the delete and the row SHIFT it causes are fully deterministic. setup creates a
  // WHOLE smoke spreadsheet (pinned "Data") and seeds three KNOWN rows
  // (A1=<marker>keep-before, A2=<marker>delete-me, A3=<marker>keep-after). execute
  // deletes row 2. Verified by the NEW verifyAll primitive — THREE independent
  // get_cell_value reads that together pin EXACTLY which row was removed (no single
  // cell could): A1 == keep-before (row 1 untouched), A2 == keep-after (old row 3
  // shifted UP into row 2 -> row 2 deleted, delete-me gone), A3 present-and-empty (the
  // sheet shrank from 3 data rows to 2). The handler's `deleted:true` echo is never
  // trusted. Cleanup is the same CROSS-PROVIDER google-drive:delete_file (permanent) of
  // the whole spreadsheet -> TRUE erase -> LIVE_PASS_CLEANED. Verified live (0 leaked).
  // Google Sheets writes are now COMPLETE: all 8 mutating actions certified.
  ...records("LIVE_PASS_CLEANED", "live create-sheet + seed 3 rows + delete row 2 + 3 independent shift read-backs, whole spreadsheet hard-deleted via cross-provider Drive delete", SMOKE_WRITE_SHEETS_DELETE, [
    ["google-sheets", "delete_row"],
  ]),
  // SMOKE-WRITE-32 — Microsoft OneNote page lifecycle. The smoke-owned resource is the
  // PAGE (created + HARD-deleted by the run; Graph DELETE is a true erase). The SECTION
  // is a borrowed container — the live test discovers a SAFE one whose section OR
  // notebook name is smoke/test-named (never the user's real notebook; absent one ->
  // BLOCKED_ENV). create_page creates a marker-TITLED page -> INDEPENDENT
  // get_page_content read-back confirms the marker on the persisted `title` -> delete_page
  // hard-deletes. update_page appends "<marker>updated" to the body -> get_page_content
  // read-back confirms marker+suffix on the rendered `content` (the seeded body lacks
  // "updated", so a no-op fails). delete_page is executeIsCleanup -> absence proven by the
  // bounded smoke-only `page_metadata` probe (`exists == false` via a typed 404
  // NotFoundError; any other error re-throws -> VERIFY_FAILED). The handlers' `success`
  // echoes are never trusted. Every engine step threads the required `notebookId` +
  // `sectionId` cascade parents (the meta marks them required for readiness even though
  // the handlers ignore them). Verified live (0 leaked).
  ...records("LIVE_PASS_CLEANED", "live create page in a smoke-named section + independent read-back + hard delete", SMOKE_WRITE_ONENOTE, [
    ["microsoft-onenote", "create_page"],
    ["microsoft-onenote", "update_page"],
    ["microsoft-onenote", "delete_page"],
  ]),
  // SMOKE-WRITE-35 UNBLOCKED (2026-07-03) — copy_page now certifies after the durable-copy
  // discovery fix. Root cause of the prior blocker: OneNote copyToSection's async operation
  // Location surfaces an EPHEMERAL/staging page id Graph later reports as deleted, so the old
  // seam's captured id made verify + cleanup non-deterministic (one run orphaned a real
  // crsmoke- copy). Fix is SMOKE-ONLY: after the poll confirms completion, the copy_monitor
  // seam re-lists the target smoke section and captures the DURABLE page carrying the run
  // marker whose id != sourcePageId (bounded list-retry; ambiguity fails fast, never guesses).
  // Flow: setup create_page (source) -> copy_page (async) -> completeAsync polls + durable-
  // discovers the copy id -> get_page_content read-back confirms the marker on the copy's
  // persisted title -> delete_page hard-deletes BOTH source + copy (cleanupEach). Verified
  // live TWICE consecutively (created 2 / cleaned 2 / 0 leaked each run); the durable id is
  // deterministic. Production copy_page is UNCHANGED (still returns {operationLocation,
  // success:true}; polling + discovery are smoke-only).
  ...records("LIVE_PASS_CLEANED", "live copy in a smoke-named section, durable-copy discovery + independent read-back + hard delete of source and copy", SMOKE_WRITE_ONENOTE_COPY, [
    ["microsoft-onenote", "copy_page"],
  ]),
  // SLACK-DELETE-MESSAGE (2026-07-03) — first destructive Slack write, certified after
  // Marcus reconnected Slack (throwaway smoke workspace; destructive actions allowed).
  // Flow: setup join_channel (bot self-joins the public smoke channel via channels:join
  // so conversations.history works; idempotent) -> send_channel_message posts one
  // crsmoke- message (bot-posted, capture ts) -> execute delete_message (chat.delete,
  // executeIsCleanup) -> INDEPENDENT get_messages read-back proves the run marker is
  // ABSENT from conversations.history (the delete echo is never trusted). The smoke
  // channel is auto-discovered (smoke/test/chainreact-named public/member channel; never
  // an arbitrary channel). Verified live: created 1 / cleaned 1 / 0 leaked (artifact
  // cleaned). NOTE: chat:write.public lets the bot post without membership, but history
  // needs membership -> hence the join_channel setup step.
  ...records("LIVE_PASS_CLEANED", "live post smoke message + delete it + independent get_messages marker-absent read-back", SMOKE_WRITE_SLACK, [
    ["slack", "delete_message"],
  ]),
  // SLACK-MESSAGE-LIFECYCLE (2026-07-03) — update + reaction actions on a smoke-owned
  // message, each verified against THAT message via the slack:message_state smoke seam
  // (conversations.history filtered to the captured ts -> sanitized { found, text,
  // reactions }; a whole-window substring would false-positive on a common reaction).
  // Each: setup join_channel + send_channel_message (capture ts) -> execute -> read-back
  // -> delete_message cleanup. Verified live (created 1 / cleaned 1 / 0 leaked each):
  //   - update_message   -> message_state proves text now carries marker+"updated" AND no
  //     longer "orig" (a no-op edit fails).
  //   - add_reaction     -> message_state proves the message's `reactions` CONTAINS
  //     white_check_mark.
  //   - remove_reaction  -> setup also add_reaction; execute removes it; message_state
  //     proves `reactions` no longer contains white_check_mark.
  // NOTE (2026-07-03): pin_message / unpin_message are NOW certified below — `pins:write`
  // was granted on reconnect (confirmed via the token's x-oauth-scopes). `pins:read` is
  // still NOT granted, so verification reads the message's `pinned_to` from
  // conversations.history (channels:history) instead of pins.list.
  ...records("LIVE_PASS_CLEANED", "live smoke message + update/reaction + per-message message_state read-back + delete cleanup", SMOKE_WRITE_SLACK, [
    ["slack", "update_message"],
    ["slack", "add_reaction"],
    ["slack", "remove_reaction"],
  ]),
  // SLACK-CHANNEL-LIFECYCLE (2026-07-03) — full channel lifecycle on smoke-CREATED public
  // channels (never a pre-existing user channel). Each fixture creates its own
  // crsmoke-<run>-<suffix> channel, mutates it, verifies via the slack:channel_state smoke
  // seam, then archives it (Slack has no hard channel delete -> archive is the terminal
  // disposition; each run leaves archived-channel artifacts, deterministically named).
  // Verified live (0 ACTIVE leaked; all created channels archived):
  //   - create_channel      -> channel_state proves the marker `name`.
  //   - rename_channel       -> name carries marker+"after" AND not "before".
  //   - set_channel_topic    -> `topic` carries marker+"topicset".
  //   - set_channel_purpose  -> `purpose` carries marker+"purposeset".
  //   - archive_channel (executeIsCleanup) -> is_archived == true.
  // READ-BACK uses conversations.list (finds the channel by id, archived included) because
  // conversations.info is UNUSABLE: Slack rejects its JSON-body transport with
  // invalid_arguments (this likely also breaks the certified slack:get_channel_info action
  // in production -> flagged as a follow-up bug; not fixed in this write slice). CAVEAT:
  // Slack rate-limits conversations.create, so running the batch repeatedly in rapid
  // succession can transiently fail a create; a single run at normal cadence passes.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create smoke channel + rename/topic/purpose/archive + channel_state read-back (archived-channel artifact; no hard delete)", SMOKE_WRITE_SLACK, [
    ["slack", "create_channel"],
    ["slack", "rename_channel"],
    ["slack", "set_channel_topic"],
    ["slack", "set_channel_purpose"],
    ["slack", "archive_channel"],
  ]),
  // SLACK JSON->FORM TRANSPORT FIX (2026-07-03). Two certified reads were STALE (their
  // 2026-06-20 "pass" was false): the Slack Web API rejects an application/json body for
  // these single-item read methods, so both were actually broken in production:
  //   - conversations.info (get_channel_info): JSON -> invalid_arguments; form/GET -> ok.
  //   - users.info (get_user_info): JSON -> user_not_found (the `user` param is not parsed);
  //     form -> ok. Both re-verified live: the actions FAILed through the engine before the
  //     fix and PASS after. Fix routes ONLY these two wrappers through a new form-encoded
  //     transport (slackApiRequestForm); every other Slack method keeps JSON (Block Kit
  //     `blocks` etc. need it). Output/response shapes unchanged.
  ...records("LIVE_PASS", "live read re-verified after JSON->form transport fix (conversations.info / users.info)", SMOKE_WRITE_SLACK, [
    ["slack", "get_channel_info"],
    ["slack", "get_user_info"],
  ]),
  // SLACK-MEMBERSHIP-BATCH (2026-07-03) — self-contained membership / channel-state
  // write actions on smoke-CREATED public channels (never a pre-existing user channel).
  // Each creates its own crsmoke-<run>-<suffix> channel, mutates membership, verifies via
  // an INDEPENDENT read-back seam, then archives (Slack has no hard channel delete ->
  // archived-channel artifact). Verified live (created 1 / archived 1 / 0 ACTIVE leaked
  // each):
  //   - join_channel   -> setup create + LEAVE (a genuine non-member), then join; the new
  //     slack:channel_state seam (conversations.list) proves is_member==true.
  //   - leave_channel  -> setup create (bot auto-member), leave; channel_state proves
  //     is_member==false. Disposition is the new multi-step cleanupAll [join, archive]:
  //     conversations.archive returns not_in_channel once the bot has left (verified
  //     live), so the bot REJOINS before archiving.
  //   - invite_users_to_channel  -> invite a REAL throwaway-workspace human discovered
  //     from users.list (never invented, never a bot, never Slackbot); the new
  //     slack:channel_members seam (conversations.members, form transport) proves the
  //     members array CONTAINS the invited id.
  //   - remove_user_from_channel -> setup create + invite, then kick; channel_members
  //     proves the members array no longer contains the id.
  // Seams added: channel_state now also returns is_member; channel_members is a new
  // form-encoded conversations.members read-back. Second user discovered live:
  // discoverSlackSmokeUser (users.list, first eligible human).
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live membership write + independent read-back on a smoke channel, archived (no hard delete)", SMOKE_WRITE_SLACK_MEMBERSHIP, [
    ["slack", "join_channel"],
    ["slack", "leave_channel"],
    ["slack", "invite_users_to_channel"],
    ["slack", "remove_user_from_channel"],
  ]),
  // SLACK-SCHEDULED-MESSAGE-BATCH (2026-07-03) — schedule + cancel a future message on
  // the smoke channel (SMOKE_SLACK_CHANNEL_ID; the bot self-joins via join_channel).
  // post_at is a LIVE-COMPUTED future Unix-second timestamp (~7 days out, inside Slack's
  // 120-day window) overlaid as SMOKE_SLACK_POST_AT, so the message never delivers
  // mid-test and the fixture never goes stale (a hardcoded timestamp would eventually be
  // time_in_past). Each verified by an INDEPENDENT chat.scheduledMessages.list read-back
  // (the action echo is never trusted). Verified live (created 1 / cleaned 1 / 0 leaked
  // each):
  //   - schedule_message -> list_scheduled_messages proves the run marker is QUEUED;
  //     cancel_scheduled_message cleanup removes it (cleanupKind delete -> gone).
  //   - cancel_scheduled_message -> setup schedules, execute cancels (executeIsCleanup);
  //     list_scheduled_messages proves the marker is ABSENT.
  // No scheduled message is left to ever deliver (0 scheduled-message leaks).
  ...records("LIVE_PASS_CLEANED", "live schedule/cancel + independent scheduledMessages.list read-back (scheduled message cancelled, none left to deliver)", SMOKE_WRITE_SLACK_SCHEDULED, [
    ["slack", "schedule_message"],
    ["slack", "cancel_scheduled_message"],
  ]),
  // SLACK-DIRECT-MESSAGE (2026-07-03) — send_direct_message to a REAL throwaway-workspace
  // user discovered from users.list (discoverSlackSmokeUser; never invented, never a bot,
  // never Slackbot). The handler opens the 1:1 DM (conversations.open, idempotent) then
  // chat.postMessage. Verified by an INDEPENDENT get_messages (conversations.history) read
  // of the opened DM channel proving the run marker delivered (im:history scope; the send
  // echo is never trusted). sendSafe: a sent DM is DELIVERED, so there is no provider
  // cleanup - each run leaves ONE clearly-marked crsmoke- DM to the throwaway user (an
  // accepted artifact, not a leak). chat.delete is not attempted because the write harness
  // captures only one id per step (channel OR ts) and a DM delete needs both. Verified live
  // (created 1 / delivered-DM artifact left).
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live DM send + independent get_messages read-back of the opened DM (delivered-DM artifact; sendSafe, no cleanup)", SMOKE_WRITE_SLACK_DM, [
    ["slack", "send_direct_message"],
  ]),
  // SLACK-INTERACTIVE-BLOCKS (2026-07-03) — post_interactive_blocks posts a minimal valid
  // Block Kit message (one `section` block) to the smoke channel (SMOKE_SLACK_CHANNEL_ID;
  // the bot self-joins via join_channel). The crsmoke- marker lives ONLY inside the block
  // text (NO top-level fallback `text`), so an INDEPENDENT get_messages (conversations.
  // history) read-back hit proves the Block Kit payload actually rendered + is readable,
  // not merely a notification string (the chat.postMessage echo is never trusted). blocks
  // ride the JSON transport (chat.postMessage sends application/json), so Block Kit needs
  // no form-encoding. Cleanup deletes the message (delete_message). Verified live (created
  // 1 / cleaned 1 / 0 leaked).
  ...records("LIVE_PASS_CLEANED", "live Block Kit post + independent get_messages read-back of the block marker, message deleted", SMOKE_WRITE_SLACK_BLOCKS, [
    ["slack", "post_interactive_blocks"],
  ]),
  // SLACK-FILE-BATCH (2026-07-03) — upload_file + download_file, plus a JSON->form
  // transport fix that also re-certifies get_file_info.
  //
  // TRANSPORT BUG FOUND + FIXED: `files.getUploadURLExternal` AND `files.info` both reject
  // the application/json body with `invalid_arguments` (same class as conversations.info /
  // users.info). Both wrappers were migrated to the form-encoded transport
  // (slackApiRequestForm). This silently broke upload_file (getUploadURLExternal) and made
  // get_file_info / download_file FAIL through the engine; all three PASS after the fix.
  // get_file_info's 2026-06-20 "pass" was STALE (files.info was never actually reachable
  // via JSON) -> re-certified here.
  //
  //   - upload_file (sendSafe): stage a tiny PNG in OUR workflow-files bucket -> a
  //     v2_storage FileRef source -> Slack 3-step external upload -> capture fileId ->
  //     INDEPENDENT get_file_info (files.info) proves the marker on the persisted
  //     fileName. Output is FileRef(provider_url), NO bytes. Slack has no registered
  //     delete-file action -> the uploaded file is a throwaway artifact (left).
  //   - download_file (writeSafe): setup upload (get a real fileId) -> files.info + byte
  //     fetch (bot bearer) + stageFileToStorage -> FileRef(v2_storage), NO bytes.
  //     markerEchoPath proves the returned fileName + the staged_file smoke seam reads
  //     OUR bucket back and proves the object EXISTS (only { exists, sizeBytes }, never
  //     bytes). No registered delete for a v2_storage object -> staged object left.
  //   - get_file_info: re-verified live via the upload_file read-back after the files.info
  //     transport fix.
  // Artifacts (throwaway, documented): each run leaves ~2 Slack files + 1 staged object;
  // no registered Slack/v2_storage delete action exists to clean them.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live upload + independent files.info read-back (uploaded-file artifact; no registered Slack delete)", SMOKE_WRITE_SLACK_FILES, [
    ["slack", "upload_file"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live download + FileRef(v2_storage) staging + independent staged-object read-back (no bytes in output)", SMOKE_WRITE_SLACK_FILES, [
    ["slack", "download_file"],
  ]),
  ...records("LIVE_PASS", "live read re-verified after files.info JSON->form transport fix (2026-06-20 pass was stale)", SMOKE_WRITE_SLACK_FILES, [
    ["slack", "get_file_info"],
  ]),
  // SLACK-PIN-BATCH (2026-07-03) — pin_message + unpin_message on a smoke-owned message.
  // `pins:write` is granted (verified via the token's x-oauth-scopes); `pins:read` is NOT,
  // so pins.list is unavailable. Verification instead reads the message's `pinned_to` array
  // from conversations.history (granted `channels:history`) via the slack:message_state
  // seam, which now exposes a `pinned` boolean. Verified live (created 1 / cleaned 1 / 0
  // leaked each):
  //   - pin_message   -> post -> pin -> message_state proves pinned==true -> delete_message
  //     (deleting the message also removes the pin, so no pinned artifact survives).
  //   - unpin_message -> post -> pin (setup) -> unpin -> message_state proves pinned==false
  //     -> delete_message.
  ...records("LIVE_PASS_CLEANED", "live pin/unpin + independent conversations.history pinned_to read-back (no pins:read needed), message deleted", SMOKE_WRITE_SLACK_PINS, [
    ["slack", "pin_message"],
    ["slack", "unpin_message"],
  ]),
  // BLOCKED (not certified): slack:unarchive_channel. conversations.archive REMOVES the
  // bot from the channel, and conversations.unarchive then returns `not_in_channel` for a
  // bot token (xoxb) — verified live: create -> archive OK, unarchive -> not_in_channel,
  // and the archived channel cannot be re-joined (it is archived) so the bot is stuck.
  // This is a documented Slack platform limitation: unarchiving requires a USER token
  // (xoxp), which V2's bot-token-only Slack model (manifest scopes are all bot scopes)
  // does not use. The handler + wrapper are correct; the action simply cannot succeed on
  // a bot token. A valid fixture exists (stays NOT_RUN). Unblock: a Slack user-token model
  // (out of scope for the current bot-only integration). Marcus product note: the
  // user-facing unarchive_channel action will always fail on the current bot-token setup.
  // SMOKE-WRITE-34 — Google Docs update_document. setup create_document (marker
  // title+body) -> execute update_document APPENDS "<marker>updated" (insertLocation
  // "end" — additive, never the body-wiping "replace" mode) -> INDEPENDENT
  // get_document read-back confirms marker+suffix "updated" on the flattened body
  // `content` (the seed body "<marker>body" lacks "updated", so a no-op update fails;
  // the handler's documentId/contentLength echoes are never trusted) -> the WHOLE Doc
  // is hard-deleted via cross-provider google-drive:delete_file (permanent:true; a
  // documentId IS a Drive file id, and Docs has no own delete). Live-verified end to
  // end (created 1 / cleaned 1 / 0 leaked). google-docs writes: create_document +
  // update_document certified; share_document (sharing) + export_document (bytes) are
  // policy-excluded.
  ...records("LIVE_PASS_CLEANED", "live create doc + append update + independent read-back, whole doc hard-deleted via cross-provider Drive delete", SMOKE_WRITE_GDOCS, [
    ["google-docs", "update_document"],
  ]),
  // GMAIL-DRAFT-LABEL-BATCH (2026-07-04) — reversible draft + label lifecycle, no email
  // ever sent. Drafts are addressed to the connected account's OWN inbox
  // (SMOKE_GMAIL_SELF, discovered live via users.getProfile) and are never delivered.
  // Verified live via the new gmail:message_labels smoke seam (users.messages.get ->
  // sanitized { found, labelIds, subject }; the action echo is never trusted). Verified
  // live that draft messages accept messages.modify labels and that trashing a draft's
  // message removes it from in:drafts.
  //   - create_draft (writeSafe): message_labels proves labelIds contains DRAFT + the
  //     marker on subject -> delete_email(trash) removes the draft (cleaned, to Trash).
  //   - add_label (writeSafe): setup create_draft (a labelable smoke message) -> add the
  //     reversible SYSTEM label STARRED -> message_labels proves labelIds contains STARRED
  //     -> delete_email(trash). STARRED avoids leaking a user label per run.
  //   - remove_label (writeSafe): setup create_draft + add STARRED -> remove STARRED ->
  //     message_labels proves labelIds no longer contains STARRED -> delete_email(trash).
  //   - create_label (writeSafe): list_labels read-back proves the marker name. NO
  //     registered Gmail delete-label action (no users.labels.delete wrapper) -> each run
  //     leaves one crsmoke- label (throwaway artifact, documented).
  ...records("LIVE_PASS_CLEANED", "live draft/label modify + independent message_labels read-back, draft trashed (no email sent)", SMOKE_WRITE_GMAIL_DRAFT_LABEL, [
    ["gmail", "create_draft"],
    ["gmail", "add_label"],
    ["gmail", "remove_label"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create label + independent list_labels read-back (label artifact; no registered Gmail delete-label action)", SMOKE_WRITE_GMAIL_DRAFT_LABEL, [
    ["gmail", "create_label"],
  ]),
  // GMAIL-STATE-BATCH (2026-07-04) — flag/state + delete lifecycle on smoke-owned drafts,
  // no email sent. All are users.messages.modify system-label toggles verified via the
  // gmail:message_labels read-back; drafts are trashed each run (recoverable ~30d, gone
  // from active). Verified live that a draft accepts INBOX add/remove and that trashing a
  // draft yields labelIds ["DRAFT","TRASH"] (so each transition is real, not vacuous).
  //   - mark_as_unread (writeSafe): create_draft -> add UNREAD -> labelIds contains UNREAD.
  //   - mark_as_read (writeSafe): create_draft + add UNREAD (setup) -> remove UNREAD ->
  //     labelIds no longer contains UNREAD.
  //   - archive_email (writeSafe): create_draft + add INBOX (setup) -> remove INBOX ->
  //     labelIds no longer contains INBOX.
  //   - delete_email (destructiveSafe, executeIsCleanup): create_draft -> trash ->
  //     labelIds contains TRASH. `deleteMode: "trash"` (recoverable) so the read-back can
  //     positively prove state; "permanent" shares the handler + delete wrapper and is not
  //     separately smoke-certified (it 404s on read-back).
  ...records("LIVE_PASS_CLEANED", "live message state toggle + independent message_labels read-back, draft trashed (no email sent)", SMOKE_WRITE_GMAIL_STATE, [
    ["gmail", "mark_as_unread"],
    ["gmail", "mark_as_read"],
    ["gmail", "archive_email"],
    ["gmail", "delete_email"],
  ]),
  // GMAIL-SEND (2026-07-04) — send_email to the smoke account ITSELF (SMOKE_GMAIL_SELF,
  // discovered live via users.getProfile). Gmail collapses a self-send into a SINGLE
  // message carrying ["UNREAD","SENT","INBOX"] (verified live) returned synchronously, so
  // delivery is immediate (no polling) and there is exactly ONE copy to clean. Verified via
  // the gmail:message_labels read-back: labelIds contains SENT + the marker on subject (the
  // send echo is never trusted). delete_email(trash) removes the single self-message (both
  // sent + inbox view), so 0 active copies remain (cleaned, to Trash, recoverable ~30d).
  ...records("LIVE_PASS_CLEANED", "live self-send + independent message_labels read-back (SENT + subject marker), single message trashed", SMOKE_WRITE_GMAIL_SEND, [
    ["gmail", "send_email"],
  ]),
  // GMAIL-REPLY-BATCH (2026-07-04) — reply_to_email + create_draft_reply, each seeded by a
  // certified self-send (send_email to SMOKE_GMAIL_SELF). A first message's id equals its
  // threadId, so the captured seed id IS the thread id; the gmail:message_labels seam now
  // also returns threadId so the read-back can prove the reply/draft joined the SAME thread.
  //   - reply_to_email (writeSafe): reply in the seed thread -> message_labels proves
  //     labelIds contains SENT, threadId == seed id, and the "Re: {{marker}}" subject.
  //   - create_draft_reply (writeSafe): draft-reply in the seed thread -> message_labels
  //     proves labelIds contains DRAFT (not sent), threadId == seed id, and the Re: marker.
  // cleanupAll trashes BOTH the seed and the reply/draft (each self-message is one copy).
  // Verified live (created 2 / cleaned 2 / 0 leaked each). Threading correct (no bug found).
  ...records("LIVE_PASS_CLEANED", "live threaded reply/draft-reply + independent message_labels read-back (SENT/DRAFT + threadId==seed + Re: marker), seed + reply trashed", SMOKE_WRITE_GMAIL_REPLY, [
    ["gmail", "reply_to_email"],
    ["gmail", "create_draft_reply"],
  ]),
  // GMAIL-ATTACHMENT (2026-07-04) — get_attachment, plus a real production bug fix that
  // the smoke uncovered. send_email has no attachments field, so a smoke-only multipart
  // helper self-sends a seed email with one tiny text attachment (marker filename) and
  // resolves the attachmentId; get_attachment fetches the bytes, stages to v2_storage, and
  // returns FileRef(v2_storage) + metadata (NO data/base64/content/bytes key -- contract
  // enforced by the handler unit tests). Verified via markerEchoPath (fileName carries the
  // run marker -> OUR attachment) + the staged_file seam (the object EXISTS in our bucket).
  //
  // BUG FOUND + FIXED: Gmail attachment ids are NOT stable across users.messages.get calls
  // (verified live: two back-to-back gets return different attachmentIds for the same part).
  // get_attachment re-gets the message and hard-required the caller's id to be in THAT fresh
  // response, so a valid id from an earlier get (e.g. the new_attachment trigger's own get)
  // failed with "attachment not found" -- breaking the trigger->action composition. Fix:
  // match by id, else fall back to the SOLE attachment when unambiguous, and fetch bytes
  // with the fresh id from the current get. Ambiguous (id-miss + multiple attachments) still
  // throws.
  //
  // DISPOSITION: the staged v2_storage object has no registered delete action -> harmless
  // artifact (like slack:download_file). The Gmail seed message is trashed by the dev test.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live attachment fetch + FileRef(v2_storage) staging + staged-object read-back (no bytes in output); fixed unstable-attachment-id bug", SMOKE_WRITE_GMAIL_ATTACHMENT, [
    ["gmail", "get_attachment"],
  ]),
  // SMOKE-WRITE-36 — Microsoft Excel create_worksheet. Excel has no create_workbook
  // action, so the smoke brings its OWN smoke-owned workbook: setup uploads a frozen
  // minimal .xlsx (one "Sheet1", 1898 bytes, hand-built OOXML — verified live as
  // openable by Graph's workbook API) via the certified microsoft-onedrive:upload_file
  // (inline base64), capturing the drive-item id as the workbookId. execute
  // create_worksheet adds a "<marker>ws" sheet -> INDEPENDENT excel:get_worksheets
  // read-back confirms the marker(+suffix "ws") on a persisted worksheet name (the
  // seeded "Sheet1" lacks the marker, so a no-op fails; the handler echo is never
  // trusted) -> the WHOLE workbook file is removed via microsoft-onedrive:delete_item
  // (SAME provider that created it — not cross-provider). Live-verified end to end
  // (created 1 / cleaned 1 / 0 leaked). HONESTY: delete_item moves the file to the
  // OneDrive recycle bin (recoverable), not a hard erase — it is gone from the active
  // drive (get/list 404s). A workbook-session delete lock is absorbed by the bounded
  // OneDrive delete retry (smoke-harness only).
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + add worksheet + independent get_worksheets read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_EXCEL, [
    ["microsoft-excel", "create_worksheet"],
  ]),
  // SMOKE-WRITE-37 — Microsoft Excel rename_worksheet. Same smoke-owned-workbook
  // bootstrap as SMOKE-WRITE-36: setup uploads the frozen minimal .xlsx (seeded
  // "Sheet1") via microsoft-onedrive:upload_file (capture itemId). execute
  // rename_worksheet renames "Sheet1" -> "<marker>renamed" -> INDEPENDENT
  // excel:get_worksheets read-back confirms the marker(+suffix "renamed") on a persisted
  // worksheet name (the pre-rename "Sheet1" lacks the marker, so a no-op fails; the
  // handler's renamed echo is never trusted) -> the WHOLE workbook file is removed via
  // microsoft-onedrive:delete_item (same provider that created it). Live-verified end to
  // end (created 1 / cleaned 1 / 0 leaked). HONESTY: delete_item moves the file to the
  // OneDrive recycle bin (recoverable), not a hard erase; the bounded OneDrive delete
  // retry (smoke-harness only) absorbs a workbook-session delete lock.
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + rename worksheet + independent get_worksheets read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_EXCEL, [
    ["microsoft-excel", "rename_worksheet"],
  ]),
  // SMOKE-ACTIONS-NATIVE-CERT — the native logic actions live-verified via the
  // workflow-live read sweep (SMOKE_PROVIDER=native): each ran as a real TERMINAL
  // workflow run in engine REAL mode (5 pass / 0 fail / 0 skip). They take NO provider
  // credentials and create NO external resource, so there is nothing to verify-by-
  // read-back, clean up, or leak (read-class): `delay` is an in-process sleep,
  // `if_then_condition` / `router` are pure boolean/route evals (authored to land on
  // the null branch so a single terminal node is engine-safe), and `http_request`
  // makes ONE outbound GET to a public https URL (no credential; the egress guard
  // blocks private/loopback/metadata hosts; URL via SMOKE_NATIVE_HTTP_URL).
  // `native:format_transformer` is deliberately NOT listed — it stays the always-run
  // uncertified baseline that proves the live harness path is real every sweep.
  ...records("LIVE_PASS", "live verified via workflow-live sweep (native action, no provider credential)", LIVE_NATIVE, [
    ["native", "delay"],
    ["native", "if_then_condition"],
    ["native", "router"],
    ["native", "http_request"],
  ]),
  // SMOKE-ACTIONS-DROPBOX-SEARCH — dropbox:search_files live-verified via the
  // workflow-live read sweep (SMOKE_PROVIDER=dropbox) against the connected smoke
  // Dropbox. Its free-text query is the one Dropbox selector with no safe
  // auto-discovery, so it ran with a benign SMOKE_DROPBOX_QUERY ("test") — a
  // name-search returning one bounded page of file METADATA (no bytes, no signed URLs,
  // no file content). Read-only; nothing created/cleaned/leaked. This was the only
  // connected, runnable read on the remaining NOT_RUN frontier — discord / monday /
  // stripe report "not connected" on the smoke account, and google-analytics is
  // connected but exposes no usable GA account/property (selector auto-discovery finds
  // nothing). Completes Dropbox's read surface: list_folder + get_file_metadata +
  // search_files all LIVE_PASS.
  ...records("LIVE_PASS", "live read verified (search via SMOKE_DROPBOX_QUERY)", LIVE_DROPBOX_SEARCH, [
    ["dropbox", "search_files"],
  ]),
  // SMOKE-WRITE-38/42 — Microsoft Excel delete_worksheet + add_table_row. Both reuse the
  // SMOKE-WRITE-36 smoke-owned-workbook bootstrap (a frozen minimal .xlsx uploaded via the
  // certified microsoft-onedrive:upload_file, then the whole file removed via
  // microsoft-onedrive:delete_item — SAME provider). delete_worksheet: setup uploads the
  // workbook + adds a throwaway "<marker>victim" sheet (so the delete is not the last-sheet
  // 400) -> execute delete_worksheet removes the victim -> INDEPENDENT get_worksheets proves
  // the victim ABSENT and count == 1 (seeded "Sheet1" survived, workbook still valid).
  // add_table_row: setup uploads a frozen table-bearing .xlsx (one defined table "SmokeTable",
  // header + one non-marker seed row) -> execute add_table_row appends "<marker>trow" ->
  // INDEPENDENT read_table_rows confirms the marker(+suffix "trow") among the table rows (the
  // seed row lacks the marker, so a no-op append fails; the handler echo is never trusted).
  // Both live-verified end to end (created 1 / cleaned 1 / 0 leaked). HONESTY: delete_item
  // moves the file to the OneDrive recycle bin (recoverable), not a hard erase — gone from
  // the active drive (get/list 404s); the bounded OneDrive delete retry absorbs a
  // workbook-session delete lock.
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + worksheet/table-row mutation + independent read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_BATCH_0629, [
    ["microsoft-excel", "delete_worksheet"],
    ["microsoft-excel", "add_table_row"],
  ]),
  // SMOKE-WRITE-45/46 — Calendar add_attendees (Google Calendar + Outlook Calendar). setup
  // create_event (certified) makes a marker-titled event at a FIXED far-future time (2030)
  // with NO attendees and notifications suppressed (gcal sendNotifications:"none";
  // outlook-calendar has no notify toggle, so the attendee address is the safeguard) ->
  // execute add_attendees adds a single reserved RFC-6761 non-deliverable
  // "<marker>attendee@example.invalid" (zero real invitations — gcal suppressed, .invalid
  // bounces at the sending server) -> INDEPENDENT list_events read-back over the fixed 2030
  // window confirms the unique attendee email at events[].attendees[].address (a no-op add
  // leaves the event without it; the handler echo is never trusted) -> cleanup delete_event
  // (certified) hard-erases the event (TRUE erase) removing the attendee with it. Both
  // live-verified end to end (created 1 / cleaned 1 / 0 leaked / 0 invites). Same provider
  // throughout, smoke-owned.
  ...records("LIVE_PASS_CLEANED", "live create event + add reserved-.invalid attendee (no invites) + independent list_events read-back, event hard-deleted (true erase)", SMOKE_WRITE_BATCH_0629, [
    ["google-calendar", "add_attendees"],
    ["microsoft-outlook-calendar", "add_attendees"],
  ]),
  // SMOKE-WRITE-43 — Microsoft Outlook create_draft_email. A DRAFT is NOT a send: execute
  // create_draft_email POSTs /me/messages (201, isDraft) into the Drafts folder and never
  // delivers (the "to" is a reserved non-deliverable .invalid address as defense in depth) ->
  // INDEPENDENT fetch_emails (certified) lists Drafts and confirms the marker(+suffix "draft")
  // subject among the messages (the run token makes the subject unique; the handler echo is
  // never trusted) -> cleanup delete_email (deleteMode "permanent", smoke-owned guard restricts
  // it to the captured draft id) discards it. Live-verified end to end (created 1 / cleaned 1 /
  // 0 leaked). Same provider throughout.
  ...records("LIVE_PASS_CLEANED", "live create Drafts-folder draft (never sent, .invalid recipient) + independent fetch_emails read-back, draft permanently deleted", SMOKE_WRITE_BATCH_0629, [
    ["microsoft-outlook", "create_draft_email"],
  ]),
  // SMOKE-WRITE-39/40/41 — Microsoft Excel add_row / update_row / delete_row, LIVE-CERTIFIED
  // after the add_row empty-sheet handler bugfix (2026-06-29). The 2026-06-29 batch first
  // surfaced a real production bug: on a genuinely EMPTY worksheet Graph's usedRange returns
  // the lone cell as an empty STRING (not null), so add_row's null-only isEmpty guard appended
  // at A2 (not A1), and anchoring on the usedRange ROW COUNT (not the absolute last row) made
  // repeated appends collide at row 2 — breaking add_row (verify reads A1), update_row (header
  // lookup at empty A1 threw), and delete_row (seed rows collided). Fixed in
  // integrations/microsoft-excel/actions/addRow.ts (isBlankCell treats ""/null/undefined as
  // blank but NOT 0/false; lastUsedRow parses the absolute last row from the range address).
  // All three then passed live, same smoke-owned-workbook bootstrap as create_worksheet
  // (upload frozen minimal .xlsx via microsoft-onedrive:upload_file -> Excel row mutation ->
  // INDEPENDENT read_range read-back (marker+suffix; delete_row uses a 3-read shift proof +
  // expectAbsent) -> whole workbook removed via microsoft-onedrive:delete_item). Live-verified
  // end to end (created 1 / cleaned 1 / 0 leaked each). HONESTY: delete_item moves the file to
  // the OneDrive recycle bin (recoverable), not a hard erase. This completes Excel writes:
  // create/rename/delete_worksheet + add_row/update_row/delete_row + add_table_row all
  // LIVE_PASS_CLEANED; only export_sheet remains MISSING (policy-excluded raw bytes).
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + row add/update/delete + independent read_range read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_BATCH_0629, [
    ["microsoft-excel", "add_row"],
    ["microsoft-excel", "update_row"],
    ["microsoft-excel", "delete_row"],
  ]),
  // HUBSPOT-CRM (2026-07-04) — first HubSpot writes: contact/company/deal create+update.
  // Each create captures the object id + echoes the marker; each update seeds via the
  // create action then PATCHes a marker property (verify pins the suffixed value, so a
  // no-op update fails). Every verify is an INDEPENDENT GET-by-id via the smoke-only
  // seam (contact_state / company_state / deal_state) — never the registered /search
  // reads, which are eventually consistent and would flake on a seconds-old object.
  // Deal pipeline/stage ids are auto-discovered from the portal's deal pipelines
  // (never invented). HONESTY: HubSpot has NO registered delete/archive action for
  // contacts/companies/deals and the smoke seam is read-only by invariant, so each
  // run leaves ONE crsmoke-marked object per fixture on the throwaway portal
  // (artifact "left" — harmless, recognizable).
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live CRM create/update + independent GET-by-id seam read-back; no delete action exists so the marked object stays on the throwaway portal", SMOKE_WRITE_HUBSPOT_CRM, [
    ["hubspot", "create_contact"],
    ["hubspot", "update_contact"],
    ["hubspot", "create_company"],
    ["hubspot", "update_company"],
    ["hubspot", "create_deal"],
    ["hubspot", "update_deal"],
  ]),
  // HUBSPOT-ENGAGE (2026-07-04) — engagement/object batch: note, task, ticket,
  // product (create+update for tickets/products). Same recipe as HUBSPOT-CRM:
  // marker-carrying create -> INDEPENDENT GET-by-id seam read-back (note_state /
  // task_state / ticket_state / product_state; never /search), updates pin the
  // suffixed value. Ticket pipeline/stage auto-discovered from
  // /crm/v3/pipelines/tickets (never invented). Surfaced + fixed a REAL
  // production bug: create_task omitted hs_timestamp when the author left it
  // blank, but HubSpot's tasks API REQUIRES it (live 400 "Some required
  // properties were not set") — the handler now defaults it to now() exactly
  // like create_note always did; re-certified live after the fix. HONESTY: no
  // registered delete/archive action for any of these objects, so each run
  // leaves ONE crsmoke-marked object per fixture on the throwaway portal.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live engagement/object create+update + independent GET-by-id seam read-back; create_task hs_timestamp default bug fixed then re-certified; no delete action", SMOKE_WRITE_HUBSPOT_ENGAGE, [
    ["hubspot", "create_note"],
    ["hubspot", "create_task"],
    ["hubspot", "create_ticket"],
    ["hubspot", "update_ticket"],
    ["hubspot", "create_product"],
    ["hubspot", "update_product"],
  ]),
  // HUBSPOT-LINEITEM (2026-07-04) — line-item lifecycle, the FIRST HubSpot flows
  // with REAL delete cleanup (remove_line_item is HubSpot's only registered
  // delete-shaped action). Free-form line items (no product link, no price ->
  // zero revenue weight) on a STAGED parent deal: the dev test creates ONE
  // crsmoke deal outside the harness (Gmail attachment-seed precedent), overlays
  // its id via SMOKE_HUBSPOT_LINEITEM_DEAL_ID, and archives it in the finally
  // (dealsArchive -> recycle bin, restorable) — keeping the deal out of the run
  // ledger so cleaned==created holds. Verifies via the line_item_state seam
  // GET-by-id; remove_line_item proves deletion by an independent exists==false
  // read-back (typed 404 only; other errors fail honestly), never {deleted:true}.
  ...records("LIVE_PASS_CLEANED", "live line-item lifecycle on a staged parent deal; independent GET-by-id read-back, remove proves exists==false via typed 404; staged deal archived", SMOKE_WRITE_HUBSPOT_LINEITEM, [
    ["hubspot", "create_line_item"],
    ["hubspot", "update_line_item"],
    ["hubspot", "remove_line_item"],
  ]),
  // HUBSPOT-CALLMEET (2026-07-04) — call + meeting engagement RECORDS (CRM
  // entries, not telephony / calendar invites; no owner, no associations, no
  // attendees -> nobody pinged). Marker on hs_call_title / hs_meeting_title;
  // INDEPENDENT GET-by-id verify via the call_state / meeting_state seam
  // readers. Both handlers already default the REQUIRED hs_timestamp to now()
  // (the create_task bug pattern was checked and does NOT apply here). HONESTY:
  // no registered delete/archive action for calls/meetings, so each run leaves
  // ONE crsmoke-marked record per fixture on the throwaway portal.
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live engagement record create + independent GET-by-id seam read-back (marker on title); no telephony/invites; no delete action so the marked record stays", SMOKE_WRITE_HUBSPOT_CALLMEET, [
    ["hubspot", "create_call"],
    ["hubspot", "create_meeting"],
  ]),
];
