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
  ...records("LIVE_PASS", "live read verified", LIVE, [
    ["slack", "list_channels"],
    ["slack", "list_users"],
    ["slack", "list_scheduled_messages"],
    ["slack", "get_channel_info"],
    ["slack", "get_messages"],
    ["slack", "get_user_info"],
    ["slack", "get_thread_messages"],
    ["slack", "get_file_info"],
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
  // copy_item is NOT certified — BLOCKED (async-by-design): the handler returns
  // {status:"pending", monitorUrl} with NO copied-item id and does not poll (Slice 8
  // V1-rot fix). The copy's id is only obtainable by polling the monitor URL (non-
  // deterministic timing) AND the harness has no mechanism to feed a read-back-
  // discovered id into the cleanup ledger, so a verified copy would LEAK. Stays
  // MISSING_FIXTURE; see docs/runbooks/action-smoke-cli.md (OneDrive write coverage).
  ...records("LIVE_PASS_CLEANED", "live setup+move/rename+verify, items deleted to OneDrive recycle bin (recoverable)", SMOKE_WRITE_FILE, [
    ["microsoft-onedrive", "move_item"],
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
];
