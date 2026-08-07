# GOOGLE-OAUTH-SCOPE-MINIMIZATION-1 — audit, reductions, and verification posture

**Date:** 2026-08-07 · **Status:** implemented locally (unpushed) · **Owner:** Marcus
**Context:** Google's Third Party Data Safety Team review of Cloud project
`chainreact-462214` (number `380110053434`). All six Google providers share ONE
OAuth client (`GOOGLE_CLIENT_ID` via `integrations/_shared/google/oauth.ts`), so one
consent screen / one verification request carries the union of every requested scope.

## 1. What changed

| Provider | Before (required) | After |
| --- | --- | --- |
| gmail | `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.compose` | **`gmail.modify` only** |
| google-calendar | `calendar.events`, `calendar.readonly`, `userinfo.email` | required: `calendar.events`, `userinfo.email` · **optional: `calendar.calendarlist.readonly`** |
| google-drive | `drive`, `userinfo.email` | unchanged |
| google-sheets | `spreadsheets`, `drive.metadata.readonly`, `userinfo.email` | unchanged |
| google-docs | `documents`, `drive`, `userinfo.email` | unchanged |
| google-analytics | `analytics.readonly`, `analytics.edit`, `userinfo.email` | unchanged |

Requested-scope count for the shared client drops **13 → 9**; restricted scopes drop
**5 → 3** (`gmail.readonly` and `gmail.compose` removed; `gmail.send` — sensitive —
also removed). No capability was removed: every registered action, trigger, and
resolver was traced to its exact Google endpoint and the endpoint's documented
accepted-scope list before any scope was cut.

## 2. Evidence — why each change is safe

**Gmail → `gmail.modify` alone.** Google's method reference authorizes ALL of the
registered surface under `gmail.modify`: `users.getProfile` (callback identity +
trigger seeds), `users.history.list` / `messages.list/get` / `attachments.get` /
`labels.list` (3 polling triggers + read actions), `users.messages.send`
(send_email, reply_to_email), `users.drafts.create` (create_draft,
create_draft_reply), `users.messages.modify` / `trash` / `labels.create` (label,
read-state, archive, trash actions). The former quad was redundant — `modify` is
"all read/write except immediate permanent deletion."

**Pre-existing gap surfaced (NOT introduced by this change):** `gmail:delete_email`'s
`permanent: true` mode calls `users.messages.delete`, which Google authorizes ONLY
under `https://mail.google.com/` — never requested by ChainReact. That mode 403s in
production under the old quad too. Recommended follow-up: remove the permanent mode
(or map it to a typed capability error). Trash mode is fully covered.

**Calendar → granular calendarlist scope, as `optional`.** The whole action/trigger
surface (`events.insert/list/get/patch/delete/watch`) runs on `calendar.events`. The
ONLY `calendar.readonly` consumer was `calendarList.list` behind the
`google-calendar:calendars` picker, and Google's method reference accepts
`calendar.calendarlist.readonly` for it — the user's calendar list only, instead of
read access to every event on every calendar. It sits in `optional` because:

- the OAuth dispatcher requests `required + optional` in one authorize URL
  (`services/oauth/dispatcher.ts:486`), so new connects still get the picker;
- connection health/readiness compares granted scopes against `required` only
  (`services/integrations/connectionDiagnosis.ts` scope-gap), so pre-existing tokens
  (granted `calendar.readonly`, which also satisfies `calendarList.list`) are never
  flagged `MISSING_SCOPES` and never forced to reconnect;
- a token holding neither scope already degrades gracefully: resolver 403 →
  `InsufficientScopeError` → `PROVIDER_REAUTH_REQUIRED` + manual-id fallback.

## 3. Scope decision matrix (full audit result)

Classifications per current Google docs (Workspace scope pages + verification
help). R = restricted, S = sensitive, N = non-sensitive.

| Provider | Scope | Class | Actual dependency (traced) | Narrower candidate | Sufficient? | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| gmail | gmail.readonly | R | reads (history/messages/labels/profile) | gmail.modify already required | yes — subset | **REMOVE** (redundant) |
| gmail | gmail.send | S | messages.send | gmail.modify already required | yes — covered | **REMOVE** (redundant) |
| gmail | gmail.compose | R | drafts.create | gmail.modify already required | yes — covered | **REMOVE** (redundant) |
| gmail | gmail.modify | R | label/read-state/archive/trash mutations + everything above | gmail.labels (N) + narrower set | no — no non-modify scope covers messages.modify/trash | **KEEP — REQUIRED** |
| google-calendar | calendar.events | S | 5 actions + events.watch trigger + events picker | calendar.events.owned | no — users target shared calendars | **KEEP — REQUIRED** |
| google-calendar | calendar.readonly | S | calendarList.list (picker only) | calendar.calendarlist.readonly | yes — method accepts it | **REPLACE + SPLIT/OPTIONALIZE** |
| google-drive | drive | R | whole-Drive watch (`files.watch` default `root`) + whole-drive `changes.list` + arbitrary upstream fileIds (move/delete/metadata/search) + analytics source | drive.file | no — app-created/picked files only | **KEEP — REQUIRED** |
| google-sheets | spreadsheets | S | 12 actions (values/spreadsheets read+write) incl. arbitrary upstream spreadsheetIds | drive.file (via Picker) | no for arbitrary ids; actions need it | **KEEP — REQUIRED** |
| google-sheets | drive.metadata.readonly | R | spreadsheet picker (Drive `files.list`) **and** both triggers' Drive `files.watch` on the spreadsheet fileId + `changes.getStartPageToken` | drive.file + Google Picker | only with a Picker-based UX redesign | **KEEP — REQUIRED** now; **DEFER — ARCHITECTURAL** (Picker) |
| google-docs | documents | S | create/update/get (documents.\*) | documents.readonly | no — writes | **KEEP — REQUIRED** |
| google-docs | drive | R | share_document (permissions.create incl. anyone/link + ownership transfer), export_document (files.export), folder placement (files.update addParents), both triggers' whole-Drive watch + changes feed, documents picker (files.list) | drive.file | no — arbitrary existing docs + whole-Drive watch | **KEEP — REQUIRED** |
| google-analytics | analytics.readonly | S | runReport/runPivotReport/runRealtimeReport/conversionEvents.list + 5 resolvers + dashboard source | none narrower exists | — | **KEEP — REQUIRED** |
| google-analytics | analytics.edit | S | conversionEvents.create (sole consumer; send_event is Measurement Protocol, non-OAuth) | none — it is the ONLY accepted scope for that method | — | **KEEP — REQUIRED** |
| drive/sheets/docs/calendar/analytics | userinfo.email | N | OIDC userinfo → providerAccountId at callback | none needed | — | **KEEP — REQUIRED** |

**Connect-time model note:** the manifests support `scopes.optional` and the
dispatcher already requests required+optional in one consent; there is no
incremental-auth (`include_granted_scopes`) flow. Capability-driven consent (e.g.
send-only Gmail) would be an OAuth-dispatcher architectural change — evaluated and
classified **architectural redesign / not worthwhile now**; the Calendar change above
is the safe, small version of that idea and is the pattern to reuse.

## 4. Cloud Console changes (owner runbook)

On the OAuth consent screen of `chainreact-462214` ("Data access" / scopes list):

**Remove:**
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/calendar.readonly`

**Add:**
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

**Keep (final list, 9):** `gmail.modify` · `calendar.events` ·
`calendar.calendarlist.readonly` · `drive` · `drive.metadata.readonly` ·
`spreadsheets` · `documents` · `analytics.readonly` · `analytics.edit` ·
plus `userinfo.email` (non-sensitive; may show under basic scopes).

Order of operations: deploy the code change to production FIRST (so the app never
requests a scope missing from the console), then edit the console scope list, then
update/resubmit the verification request so Google reviews only the 9-scope set.

## 5. Existing-connection impact

- Removing scopes from a manifest never breaks existing tokens: granted supersets
  still satisfy `required ⊆ granted` (the only comparison, in
  `connectionDiagnosis`), refresh does not depend on scopes, and Google keeps
  previously-granted scopes on the refresh-token grant until revoked.
- No reconnect campaign needed. New connections simply see the smaller consent.
- Least-privilege for existing users arrives naturally on their next reconnect.

## 6. Verification burden after remediation

- **Restricted (CASA/security assessment still applies):** `gmail.modify` (whole
  Gmail feature set), `drive` (Drive + Docs providers), `drive.metadata.readonly`
  (Sheets picker + watch transport). ChainReact stores restricted data transiently
  (attachment FileRefs in V2 storage; message metadata in trigger payloads/run
  outputs) → restricted verification + annual CASA remain required.
- **Sensitive:** `calendar.events`, `calendar.calendarlist.readonly`,
  `spreadsheets`, `documents`, `analytics.readonly`, `analytics.edit`.
- **Non-sensitive:** `userinfo.email`.
- A reviewer demonstration video is therefore still required, but now covers 9
  scopes instead of 13, with one Gmail scope instead of four.

The seeded reviewer templates (`20260810000000_seed_official_templates_google_review.sql`,
GOOGLE-REVIEW-CERTIFICATION-2) still demonstrate every remaining scope;
`tests/unit/migrations/googleReviewTemplate.test.ts` enforces scope↔template
coverage against the live manifests and was updated with the new mapping
(gmail.modify demonstrated via new_email / send_email / add_label /
create_draft_reply; calendarlist via the create_event calendar picker).

## 7. Durable lessons

- Scope lists live ONLY in manifests (verified: zero runtime drift). Tests that pin
  exact scope lists: gmail manifest test, registry-honesty (calendar), the
  googleReviewTemplate coverage gate, and the gmail e2e walkthrough.
- A Google scope must be traced to a method's documented accepted-scope list before
  it earns a place in `required`; redundant supersets/subsets get pruned.
- Picker-convenience scopes belong in `optional` when the surface degrades
  gracefully without them — that keeps existing connections healthy when the scope
  set changes.
- Do not edit the applied reviewer-template migration; its header scope map is
  historical. This doc is the current map.

## 8. Deferred follow-ups (owner decisions)

1. **Sheets off restricted entirely** — adopt Google Picker + `drive.file` to
   replace `drive.metadata.readonly` (picker + watch would then only cover
   picker-granted files). UX change; would leave Gmail/Drive/Docs as the only
   restricted providers.
2. **`gmail:delete_email` permanent mode** — remove or re-scope (currently 403s;
   requires `mail.google.com`, which we will not request).
3. Optional-scope pattern for other convenience pickers if future scope adds recur.
