# GOOGLE-OAUTH-SCOPE-DISCREPANCY-CLOSEOUT-1 — least-privilege reconciliation

**Date:** 2026-08-16 · **Status:** code reconciled — Console action + one video clip pending
**Baseline:** branch `google-oauth-scope-discrepancy-closeout-1` cut from `origin/v2-main`
(`47d49b263`). Supersedes the scope tables in `scope-minimization.md` and the 12-scope union
in `final-console-reconciliation.md` (unpushed docs commit `fd9d9b11f`): **the union is now
11 scopes** — `documents` is retired.

Google's findings: (1) scope justifications don't bridge backend operations to the maximum
user-facing feature; (2) requested/Console/consent/video scope sets must match exactly. This
batch re-proved every scope endpoint-by-endpoint, removed the one redundant scope, pinned the
union with a dedicated guard test, and produced reviewer-ready justifications.

## 1. Final scope matrix

| Scope | Classification | Requested by | User-facing purpose | Keep/remove | Why |
|---|---|---|---|---|---|
| `gmail.modify` | restricted | gmail | Email triggers + send/reply/draft/label/trash actions | KEEP | Only scope covering read+send+modify without full-mailbox `mail.google.com`; permanent delete deliberately unsupported |
| `calendar.events` | sensitive | google-calendar | Event trigger (watch) + list/create/update/add-attendees/delete on any accessible calendar incl. shared | KEEP | `*.readonly` blocks writes; `*.owned` blocks shared calendars the picker legitimately offers |
| `calendar.calendarlist.readonly` | non-sensitive | google-calendar (optional) | Calendar picker (names/ids only) | KEEP | `calendar.events` does not authorize calendarList.list; granular replacement for retired `calendar.readonly` |
| `drive` | restricted | google-drive, google-docs | Whole-Drive search/list/organize/upload/move/delete + change-feed trigger; the complete Docs surface (see §3) | KEEP | `drive.file` can't reach pre-existing/unpicked files, search, or the whole-Drive changes feed; `drive.readonly` blocks writes |
| `spreadsheets` | sensitive | google-sheets | Read/write actions on spreadsheets referenced by Picker, pasted ID, or upstream variable | KEEP | `drive.file` alone fails pasted IDs, variable IDs, and pre-Picker saved workflows (§4) |
| `drive.file` | non-sensitive | google-sheets | Picker per-file grant + `files.watch` for the two Sheets triggers | KEEP | The only Drive call Sheets makes; Picker pick = the grant |
| `analytics.readonly` | sensitive | google-analytics | GA4 standard/pivot/realtime reports into workflows + account/property/stream/key-event pickers | KEEP | No narrower scope authorizes Data API report methods |
| `analytics.edit` | sensitive | google-analytics | Exactly one action: Create Conversion Event (GA4 key event) | KEEP | `conversionEvents.create` is Admin-API write; Google offers no narrower GA4 admin-write scope |
| `userinfo.email` | non-sensitive | 5 manifests + sign-in | Connected-account identity at callback (OIDC userinfo) | KEEP | Providers lack a profile endpoint under their data scopes (Gmail excepted — it uses its own profile endpoint and requests no identity scope) |
| `documents` | sensitive | ~~google-docs~~ | — | **REMOVED** | Redundant: every Docs API method we call accepts `drive` (§3) |
| `openid`, `userinfo.profile` | non-sensitive | Supabase "Continue with Google" | App sign-in (id_token, name/avatar) | KEEP | Same Google client as integrations (owner-confirmed, FINAL-CONSOLE-RECONCILIATION-1); not integration data scopes |

**Final integration union (9):** `gmail.modify` · `calendar.events` · `calendar.calendarlist.readonly` ·
`drive` · `spreadsheets` · `drive.file` · `analytics.readonly` · `analytics.edit` · `userinfo.email`
**Final Console union (11):** the 9 above + `openid` + `userinfo.profile`.
Pinned by `tests/unit/integrations/googleScopeUnion.test.ts` (union both directions, per-provider
request sets, retired-scope prohibition incl. `documents`).

## 2. Endpoint-to-scope evidence (per provider)

- **gmail** — `gmail.googleapis.com/v1/users/me/*` (history/messages/labels/drafts/send/trash) — all under `gmail.modify`; identity via Gmail's own `users/me/profile` (no OIDC scope requested). Retired scopes appear only in "never requested" commentary.
- **google-calendar** — `calendar/v3/calendars/{id}/events[...]` insert/patch/get/list/delete/watch (`calendar.events`); `calendar/v3/users/me/calendarList` (picker — `calendar.calendarlist.readonly`); `channels/stop`.
- **google-drive** — `drive/v3/files` list/get/create/multipart-upload/update(move)/delete, `changes/*` + `files.watch` trigger, `permissions.create`, `files.export` (consumed by Docs actions) — full `drive` required for pre-existing-file search/mutation + whole-Drive watch.
- **google-sheets** — `sheets.googleapis.com/v4/spreadsheets*` values get/append/update/batchUpdate/clear, spreadsheets get/create/batchUpdate (`spreadsheets`); Drive `files.watch` on the selected file (`drive.file`). Spreadsheet field: Picker **or pasted ID or upstream variable** (`appendRow.meta.ts` placeholder "Choose a spreadsheet, or paste its ID").
- **google-docs** — Docs API `documents.create/get/batchUpdate`; Drive `permissions.create` (share), `files.export` (export), `files.update` (folder placement), `files.list` (documents picker), Drive watch (both triggers). Google's documented authorization for each Docs API method accepts `drive` → `documents` was pure widening.
- **google-analytics** — Data API `properties/{p}:runReport|runPivotReport|runRealtimeReport` (`analytics.readonly`); Admin API reads `accountSummaries`, `properties/{p}/dataStreams`, `conversionEvents.list` (`analytics.readonly`); the sole write `conversionEvents.create` (`analytics.edit`); `send_event` uses Measurement Protocol (api_secret — no OAuth).

## 3. Narrower-scope alternatives considered

| Considered | Verdict |
|---|---|
| Calendar `events.readonly` / `events.owned(.readonly)` | Rejected — writes exist; shared-calendar workflows exist (picker lists the full calendarList) |
| Sheets `drive.file`-only (drop `spreadsheets`) | Rejected — breaks pasted-ID, upstream-variable IDs, and pre-Picker saved workflows; those are shipped paths |
| Sheets `spreadsheets.readonly` | Rejected — 9 of 12 actions write |
| Drive `drive.file` | Rejected — no whole-Drive search/list, no pre-existing-file mutation, no changes-feed trigger |
| Drive `drive.readonly` | Rejected — upload/move/delete/share/folder-placement write |
| Docs keep `documents` | **Rejected — REMOVED.** All three Docs-API methods accept `drive`, which Docs needs anyway for share/export/placement/picker/watch |
| Analytics narrower write | None exists for `conversionEvents.create` |

## 4. Cloud Console exact delta (owner action)

Google Cloud Console → APIs & Services → OAuth consent screen (Google Auth Platform) → **Data Access**:

**REMOVE FROM CONSOLE**
- `https://www.googleapis.com/auth/documents`

**ADD TO CONSOLE** — none.

**KEEP IN CONSOLE (11)**
- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/analytics.edit`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/gmail.modify`

**Stale justification text to DELETE/REPLACE wherever it appears in Console:** any mention of
broad `calendar`; the Contacts justification ("we fetch contacts so users can quickly select
recipients" — no Contacts scope is requested anywhere); `gmail.settings.basic`; `gmail.compose`
and older Gmail scope combinations (Gmail's only scope is `gmail.modify`); the `documents`
justification (scope removed); any `drive.metadata.readonly` reference (retired by
PRODUCTION-SCOPE-CLOSEOUT-2). Replace with §5's texts.

## 5. Final Console justifications (paste-ready)

Formatted per Google's requested bridge: scope → maximum user-facing feature → why narrower fails.
(Final texts also in the Owner Report; keep the two in sync if edited.)
See Owner Report sections 5–10 of GOOGLE-OAUTH-SCOPE-DISCREPANCY-CLOSEOUT-1.

## 6. Fresh-grant verification (dev project, throwaway review account — read-only)

Freshest per-provider grants (video-day 2026-08-14 captures; older 2026-08-08 rows are an
earlier throwaway account's legacy accumulations and are disconnected):

| Provider | Fresh granted (short names) | Expected request (final) | Verdict |
|---|---|---|---|
| gmail | `gmail.modify` | `gmail.modify` | PASS (no identity scope — matches single-scope request) |
| google-calendar | `calendar.events calendar.calendarlist.readonly openid userinfo.email` | events + calendarlist.readonly + userinfo.email | PASS (`openid` is Google's automatic OIDC companion) |
| google-drive | `drive openid userinfo.email` | drive + userinfo.email | PASS |
| google-sheets | `spreadsheets drive.file openid userinfo.email` | same | PASS |
| google-analytics | `analytics.readonly analytics.edit openid userinfo.email` | same | PASS |
| google-docs | `documents drive openid userinfo.email` | **drive + userinfo.email** | EXPECTED-STALE — grant predates the `documents` removal; needs one owner reconnect after deploy |

No legacy scope survives in any fresh grant. The pre-change accumulated grants
(gmail.compose/readonly/send, calendar.readonly, drive.metadata.readonly) exist only on
disconnected 2026-08-08 rows — exactly the "old accumulated consent" trap Google's checker
warns about, and not what the app requests.

## 7. Video impact

**VIDEO CLIP REPLACEMENT REQUIRED — google-docs authorization clip ONLY.** Its consent screen
shows the Docs permission line (from `documents`) that the app no longer requests; a reviewer
comparing consent to Console after the removal would see a discrepancy. The other five
providers' request sets are byte-identical to what the video shows — those consent clips and
ALL functional footage (including every Docs feature demo — features are unchanged) remain
valid. Re-capture flow: the existing VIDEO-5 harness (revoke → capture → verify) on branch
`google-oauth-verification-video-1`; update `scripts/google-review-video/verify-provider-grant.ts`'s
`google-docs` expectation to `required: ["drive", "userinfo.email"]` (and move `documents` to
`forbidden`) when re-capturing. Not done in this batch (video work not authorized).

## 8. Remaining manual owner actions

1. Authorize push/deploy of this commit through the certified release flow.
2. Apply the Console delta in §4 and replace stale justifications with §5.
3. After deploy: reconnect Google Docs with the review account (clean revoke → connect) to
   produce the fresh `drive + userinfo.email` grant, and re-capture the one Docs consent clip.
4. Resubmit verification (separate, owner-gated step).
