# GOOGLE-DRIVE-RESTRICTED-SCOPE-ESCAPE-1 — feasibility audit (planning only)

**Date:** 2026-08-07 · **Status:** audit complete, NO runtime changes · **Owner:** Marcus
**Question:** can ChainReact replace the two restricted Drive scopes (`drive`,
`drive.metadata.readonly`) with non-restricted mechanisms (`drive.file`, Google
Picker, resource-scoped watches, Workspace Events folder subscriptions) without
gutting the product?

**Answer in one line:** `drive.metadata.readonly` — YES, unconditionally, via
Picker + `drive.file` (architectural but contained, no product loss).
`drive` — PLAUSIBLY, via Workspace Events folder subscriptions (GA since
2026-05-18, `drive.file`-scoped), but two load-bearing behaviors are
officially undocumented and MUST be proven by a live spike before committing;
whole-Drive semantics (watch-everything, search-everything) do not survive in
any narrow-scope design.

## 1. Current restricted-scope dependency map (from registered runtime, 2026-08-07)

### `https://www.googleapis.com/auth/drive` (google-drive + google-docs)

| Consumer | Endpoint | Why broad today |
| --- | --- | --- |
| drive:upload_file / create_folder | files.create (+multipart) | writes anywhere; destination folder chosen via files.list picker |
| drive:list_files / search_files | files.list | whole-Drive enumeration/search |
| drive:move_file / delete_file / get_file_metadata | files.get/update/delete | arbitrary ids (picker or upstream variables) |
| drive:file_changed trigger | files.watch (default `root`) + whole-drive changes.list | monitors ANY change; folder scoping is a post-fetch filter |
| drive resolvers (files, folders) | files.list | whole-Drive listing |
| docs:share_document | permissions.create | arbitrary existing docs |
| docs:export_document | files.export | arbitrary existing docs |
| docs:create_document folder placement | files.update addParents | arbitrary folder |
| docs:new_document / document_updated triggers | files.watch + whole-drive changes.list | monitors all of Drive, filters to Docs mimeType |
| docs resolver (documents) | files.list | whole-Drive listing |
| analytics dashboard sources (drive, docs) | files.list | corpus counts |

### `https://www.googleapis.com/auth/drive.metadata.readonly` (google-sheets)

| Consumer | Endpoint | Why today |
| --- | --- | --- |
| sheets:spreadsheets resolver | Drive files.list (spreadsheet mimeType) | enumeration for the picker |
| sheets:row_changed + new_worksheet triggers | Drive files.watch on the CONFIGURED spreadsheetId (+ vestigial changes.getStartPageToken, channels.stop) | Sheets has no native push; watch needs a Drive scope |
| connected-app Analytics source `google-sheets` — **CORRECTION added by CLOSEOUT-1 (2026-08-08); missed by this audit and by §7's "not blocked by any unconfirmed behavior" claim** | flat metadata-only Drive files.list scan (`services/analytics/sources/google-sheets/` + `_shared/googleWorkspaceFiles.ts`) | dashboard Spreadsheets count / created-over-time / modified-over-time widgets; under a narrow token the scan silently shrinks to app-granted files (forbidden silent truncation) — the escape needs an explicit dataset disposition (scope-aware unavailable state · retire · keep scope) BEFORE the scope can drop |

Poll paths for both Sheets triggers read ONLY the Sheets API (`spreadsheets`
scope). The persisted Drive page token is never consumed.

## 2. Product requirement vs implementation (§3 classification)

Every Drive-family resource field in the builder is a *selection* field
(resolver-backed dropdown, manual-ID fallback). The product requirement is
"pick a resource"; Drive-wide `files.list` is only the current implementation
of the pick. Genuine whole-Drive semantics exist in exactly three places:
`drive:search_files` / `drive:list_files` (whole-Drive discovery) and the
default (`root`) watch of `drive:file_changed` / `docs:new_document`.

## 3. External findings (official Google docs, fetched 2026-08-07)

**`drive.file` (non-sensitive, "recommended"):** grants durable per-file access
to files the app CREATES or the user PICKS (Google Picker / Drive "Open with");
grants persist server-side across refresh-token use until app access is
revoked. Picker pairing needs the user's OAuth token + `setAppId` (Cloud
project number) + API key. Views filter to spreadsheets/documents/folders;
shared drives + multiselect supported. Sources:
`developers.google.com/workspace/drive/api/guides/api-specific-auth`,
`…/picker/guides/web-picker`, `…/picker/reference/*`.

**UNCONFIRMED (docs silent — must spike):**
1. Whether picking a FOLDER under `drive.file` grants access to existing or
   future descendants (no folder-inheritance language anywhere; the 2024
   pre-selection grant feature is file-level only).
2. The `changes.list` / `files.list` corpus under a `drive.file`-only token
   (expected: app-granted items only; not doc-stated).
3. Whether a `drive.file`-scoped Workspace Events folder subscription with
   `includeDescendants: true` delivers events for descendants the app has no
   per-file grant to.

**Workspace Events API — Drive subscriptions: GA since 2026-05-18** (Drive API
release notes; one stale-looking "Developer Preview" fragment remains on the
create-subscription page — verify visually). Targets: files AND folders
(`//drive.googleapis.com/files/{id}`), shared drives; NO whole-My-Drive
target documented. `driveOptions.includeDescendants: true` fires events for
files nested arbitrarily deep; event types include
`google.workspace.drive.file.v3.created/.moved/.contentChanged/.renamed/
.deleted/.trashed/.untrashed` + permission/comment/reply families. Accepted
scopes include **`drive.file`** (auth page scope table). Delivery is
**Pub/Sub-only** (topic + publisher grant to
`drive-api-event-push@system.gserviceaccount.com`; no HTTP webhook). TTL max
7 days (no resource data) with patch-to-renew; **one subscription per (target,
user)** (`ALREADY_EXISTS` on duplicates). Old `changes.watch` remains
whole-corpus only (no folder restriction).

## 4. Action matrix under the narrow model

Classes: A works unchanged under `drive.file` · B works if resource explicitly
picked · C works because ChainReact created it · D minor UX/config change ·
E fundamentally needs broad Drive.

| Provider | Action | Current endpoint | `drive.file` viable? | UX change | Class |
| --- | --- | --- | --- | --- | --- |
| drive | upload_file | files.create multipart | yes | destination folder → Picker | C/B (D) |
| drive | create_folder | files.create | yes | parent → Picker | C/B (D) |
| drive | move_file | files.get + files.update | picked file + picked destination | both fields → Picker | B (D) |
| drive | delete_file | files.delete / trash patch | picked or chain-created file | field → Picker | B/C (D) |
| drive | get_file_metadata | files.get | picked/created/granted file | field → Picker | B/C (D) |
| drive | list_files | files.list(folder) | corpus = app-granted only (UNCONFIRMED exact) | semantics change: "files this app can see" | **E** as shipped |
| drive | search_files | files.list(q) | whole-Drive search impossible | would become app-corpus search | **E** as shipped |
| docs | create_document | documents.create (+addParents) | yes (`documents` scope; folder → Picker) | folder → Picker | A/C (D) |
| docs | update_document / get_document | documents.batchUpdate/get | **A — no Drive scope involved** (`documents` covers arbitrary ids) | none | A |
| docs | share_document | permissions.create | accepts drive.file; picked/created docs | field → Picker | B/C (D) |
| docs | export_document | files.export | accepts drive.file; picked/created docs | field → Picker | B/C (D) |
| sheets | all 12 actions | Sheets API only | **A — `spreadsheets` scope, arbitrary ids keep working** | none | A |

## 5. Trigger matrix under the narrow model

| Provider | Trigger | Current semantics | Narrow alternative | Mechanism | Product change | Production-ready? |
| --- | --- | --- | --- | --- | --- | --- |
| sheets | row_changed | watch ONE configured spreadsheet | same, spreadsheet picked via Picker | files.watch on picked file under drive.file (grant documented) — or Events file subscription | none (picker swap) | **YES — RESOURCE-SCOPED REPLACEMENT** |
| sheets | new_worksheet | watch ONE configured spreadsheet | same | same | none | **YES — RESOURCE-SCOPED REPLACEMENT** |
| docs | document_updated (documentId set) | watch one doc | same, doc picked | files.watch / Events file subscription | none | **YES — RESOURCE-SCOPED REPLACEMENT** |
| docs | document_updated (folder/root) | any doc under folder/Drive | picked-folder subscription | Events + includeDescendants under drive.file | "choose folder" required; root mode retired | **GATED — spike required (descendant semantics unconfirmed)** |
| docs | new_document | any new doc (folder/root) | picked-folder subscription | Events file.v3.created + includeDescendants | same | **GATED — spike required** |
| drive | file_changed (folderId set) | changes under folder (post-filter) | picked-folder subscription | Events + includeDescendants | roughly equivalent, likely better (true folder scoping) | **GATED — spike required** |
| drive | file_changed (default root) | ANYTHING in My Drive | none (no whole-My-Drive Events target documented) | — | whole-Drive mode retired → "choose a folder" | **NO VIABLE REPLACEMENT for literal whole-Drive** |

Also required for any Events adoption: Pub/Sub ingestion infrastructure (topic,
push-subscription → ChainReact receipt route, ordering, renewal at ≤7-day TTL —
fits the existing subscription-renewal handler pattern) and per-(target,user)
subscription multiplexing (dedupe across workflows watching the same folder).

## 6. Dynamic upstream file IDs (§9 challenge)

Realistic origins: (A) chain-created files — authorized under drive.file;
(B) picked files — authorized; (C) ids emitted by Drive/Docs folder triggers —
authorized ONLY IF descendant grants exist (the unconfirmed behavior; if
events arrive but API reads 403, the flagship "new file in folder → process
it" chain still breaks); (D) manually pasted arbitrary ids — NOT authorized
under drive.file; this power-user fallback becomes "pick it instead".
(E) totally-unknown external ids — no registered source produces these.
Conclusion: arbitrary-id support is NOT by itself a reason to keep `drive`;
the folder-trigger→downstream-action chain is, until the spike proves grants.

## 7. Verdicts

> **DONE (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2, 2026-08-08).** The
> `drive.metadata.readonly` verdict below was executed: Picker foundation +
> Sheets migration shipped locally, the Drive-enumerating resolver is deleted,
> and the scope is replaced by `drive.file`. The Sheets connected-app analytics
> dataset (the CORRECTION above) degrades honestly for narrow connections
> instead of reporting a partial total. The `drive` verdict below is UNCHANGED
> and still gated on the blocked folder-grant spike — Drive/Docs keep `drive`,
> which is now ChainReact's only restricted scope besides `gmail.modify`.
> Final state: `docs/slices/phase-5/google-oauth/scope-minimization.md` §10.

- **`drive.metadata.readonly` → ELIMINATE — ARCHITECTURAL** (Picker foundation
  + Sheets picker/trigger swap). No product loss: the pick UX is equivalent or
  better; watch-on-picked-file is documented-safe; poll paths already
  Sheets-only. Not blocked by any unconfirmed behavior.
- **`drive` → ELIMINATE — ARCHITECTURAL, GATED on a feasibility spike** proving
  (a) Events folder subscriptions under drive.file deliver descendant events
  for non-granted files, and (b) the emitted file is readable afterwards
  (files.get / export under drive.file or via event payload). If the spike
  fails: **KEEP — REQUIRED** (folder-inbox automation is core), and land
  Scenario B only. Independent of the spike: whole-Drive watch (`root`) and
  whole-Drive search retire or stay broad — no narrow mechanism exists.

## 8. Scenarios

- **A — Current:** restricted gmail.modify + drive + drive.metadata.readonly.
  No work. Broad-access privacy posture; heaviest verification.
- **B — Remove metadata only (unconditional):** restricted gmail.modify +
  drive. Work: Picker foundation (builder field + token/appId plumbing) +
  Sheets resolver/trigger swap + `drive.file` added to Sheets manifest.
  MEDIUM. No product loss. Sheets leaves restricted-land.
- **C — Resource-scoped Drive (gated):** restricted gmail.modify only.
  Adds: Events/Pub/Sub trigger infra, Picker across Drive/Docs fields,
  folder-scoped trigger semantics, retire whole-Drive watch + whole-Drive
  search (or re-scope search to picked folders if corpus behavior allows).
  LARGE. Product change: explicit "choose folder/file" everywhere (mostly
  ROUGHLY EQUIVALENT or BETTER; search_files = MINOR–MAJOR loss to decide).
- **D — Conservative non-preview:** identical to C in ambition, and — since
  Drive Events is GA (2026-05-18) — C *is* the conservative scenario provided
  the stale preview fragment is visually confirmed; if one treats Events as
  not-yet-trustworthy, D degrades to B plus per-file-only triggers (Sheets +
  document_updated), with folder/new-file triggers keeping `drive`.

Comparison (summary): scopes 3/2/1/1–2 restricted; existing workflows keep
working in ALL scenarios via grandfathered broad tokens (see §9); builder UX
improves under C (true folder scoping, explicit authorization); implementation
S/M/L = none / medium / large / medium-large.

## 9. Existing-workflow migration (conceptual — not implemented)

Facts: granted scopes live per-integration row (`integrations.scopes`);
narrowing `manifest.scopes.required` never flags old rows (required ⊆ granted
gap check); old refresh tokens KEEP broad grants until revoked; a reconnect
under the narrow manifest REPLACES the grant — previously configured resources
lose Drive-side access until re-picked. Strategy: (1) new connections narrow;
(2) existing broad integrations grandfathered — code branches on the granted
scopes already stored per row (broad → legacy files.list/changes paths;
narrow → Picker/Events paths); (3) reconnect flows surface "re-authorize the
resources these workflows use" (Picker pre-selection grant supports
file-level re-grants); (4) compatibility window until broad-token population
ages out; (5) no forced disconnects ever.

## 10. Security/verification consequence

Narrow model: ChainReact can touch only app-created + user-picked resources —
token-compromise blast radius drops from "entire Drive" to that explicit set;
restricted-data handling shrinks to Gmail only; CASA remains (Gmail) but the
Drive/Sheets/Docs portion of restricted verification disappears. Final scope
picture if C ships: restricted = gmail.modify ONLY; sensitive = calendar.events,
calendar.calendarlist.readonly, spreadsheets, documents, analytics.readonly,
analytics.edit; non-sensitive = userinfo.email + drive.file.

## 11. Recommended path (single recommendation)

Adopt the resource-scoped direction, staged with a decision gate:

0. **Spike (small, throwaway, test account + test GCP project):** prove the
   three unconfirmed behaviors (§3). Also visually confirm the GA/preview
   fragment on the create-subscription page.
1. **Batch 1 — Picker foundation:** builder "Choose from Google Drive" field
   type (token/appId/API-key plumbing, file+folder+mimeType modes), stored
   stable ids, no scope changes yet.
2. **Batch 2 — Sheets escape (Scenario B):** swap sheets:spreadsheets resolver
   + trigger spreadsheet fields to Picker; add `drive.file` to Sheets manifest,
   drop `drive.metadata.readonly` for new connections; grandfather broad rows;
   remove the vestigial changes.getStartPageToken activation call.
3. **Batch 3+ (only if spike passes) — Drive/Docs re-architecture:** Pub/Sub
   ingestion + Events subscription lifecycle (create/renew/delete, multiplex
   per target); folder-scoped file_changed/new_document/document_updated;
   Picker on all Drive/Docs fields; product decision on search_files; retire
   whole-Drive watch; drop `drive` for new connections; migration UX;
   review-template + verification updates last.

If the spike fails, stop after Batch 2 (Scenario B) and keep `drive` with the
documented justification (folder-inbox automation has no narrow mechanism).

## 12. Spike status (GOOGLE-DRIVE-FOLDER-GRANT-SPIKE-1, 2026-08-07)

**BLOCKED — no safe non-production Google environment exists on this machine;
the live pass was NOT run and no behavioral claims were added.** The only
Google OAuth client available locally is the PRODUCTION client (forbidden for
the spike); there is no throwaway Google Cloud project, no test Google
accounts, no gcloud. The consent, Picker, and second-account steps also
inherently require a human in a browser.

What DID ship: a complete, self-contained, lint/type-clean spike harness at
[`scripts/spikes/google-drive-folder-grant/`](../../../../scripts/spikes/google-drive-folder-grant/README.md)
— narrow-grant OAuth (drive.file only, contamination check on the granted
scope string, refuses the production client id), real Google Picker
authorization (folder + control-file), Events subscription with
`includeDescendants: true`, a Pub/Sub listener that auto-probes every
delivered event with the narrow token (`event → files.get → content read`,
one sanitized result row per event = the §7 matrix evidence), direct probes
for pre-existing children / `files.list` / `changes.list` corpus, the
picked-file control subscription (Sheets-escape analogue), and cleanup.
State/tokens live outside the repo (OS temp dir); no secret is printed.

GA status re-verified 2026-08-07 from the Drive API release notes: Drive
subscriptions Developer Preview 2025-07-07 → **"Generally Available:
Subscriptions are now generally available for Google Drive events"
2026-05-18**.

**SPIKE-2 addendum (2026-08-08) — "use the existing dev Google connection"
traced and ruled out as the spike vehicle.** The dev deployment
(dev.chainreact.app + chainreact-dev Supabase) is non-production on the
ChainReact side only: its Google side IS the production OAuth client in the
production Google Cloud project. Evidence: (a) the transplant runbook's
shared-OAuth-client rule — transplanted tokens refresh in dev only when dev
runs the SAME provider OAuth app as production, and the transplanted Google
connections do work in dev; (b) no Google client exists in
`.env.development.local` (Vercel dev env carries the shared client); (c) a
read-only query of the dev project's `integrations` rows shows all six Google
providers connected with the BROAD pre-minimization grants (`drive` on
drive/docs, `drive.metadata.readonly` on sheets, the 4-scope Gmail quad) —
usable as Account A's identity, but contaminated as proof tokens, and their
client is production's. A fresh `drive.file`-only grant on that client would
require adding a localhost redirect URI (a production Cloud Console change),
and Workspace Events + Pub/Sub would have to be enabled/created in the
production project — all forbidden. Conclusion: the spike still needs a
throwaway Google-side environment; the dev-connected Google account itself is
a fine Account A once that exists.

Minimal owner setup to unblock (detail in the harness README): throwaway GCP
project (Drive + Workspace Events + Picker + Pub/Sub APIs enabled), testing-
mode OAuth client with `http://localhost:8765/callback`, API key, Pub/Sub
topic `drive-spike-events` (publisher grant to
`drive-api-event-push@system.gserviceaccount.com`) + pull subscription, two
throwaway Google accounts (A authorizes + owns the spike folder; B has editor
access), gcloud login for Pub/Sub pull. Then run scripts 01→05 per README.
