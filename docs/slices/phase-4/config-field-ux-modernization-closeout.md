# 4.CONFIG-FIELD-UX-MODERNIZATION — Closeout

**Type:** Closeout / handoff (docs only — no source, test, migration, or UI change in this
slice). **Nothing pushed by this closeout.**
**Date:** 2026-06-22
**Branch:** `v2-main`
**Audit / plan of record:**
[config-field-ux-modernization-audit.md](./config-field-ux-modernization-audit.md) (the live
ledger; §14 tracks per-sweep status).
**Status:** **Launch-accepted by Marcus. Deployed.** Scope-portal changes (Google / HubSpot /
Slack) were made by Marcus and the app is deployed. See §10 for the honest live-smoke caveat.

---

## 1. Summary

The config-field UX modernization arc replaced the builder's "raw text + a format hint"
config fields with real, credential-aware controls: a native date/time family, a UTC-instant
picker, a server-proxied address autocomplete, and a set of searchable provider-resource
pickers (calendars, channels, users, group DMs, files, portal enums) — each storing exactly
the value the handler already expects, with a manual-id / free-text fallback so a power user is
never trapped by a slow or scope-blocked picker.

Per slice:
- **CS-1** — added the `date` / `time` / `datetime` / `timezone` field-type family + renderers;
  adopted on Google Calendar create/update event.
- **CS-2** — Slack **trigger** channel fields → `slack:channels` searchable combobox + manual ID.
- **CS-2b** — Slack **action** channel comboboxes gained the same manual-ID paste parity.
- **CONFIG-FIELD-UX-SWEEP** — temporal adoption on Outlook Calendar + Google Analytics; Google
  Calendar `colorId` text → static `select`; built `slack:users` + wired single-value Slack
  user-id fields.
- **SWEEP-2** — `ComboboxField` variable insertion; `StringArrayField` per-chip option picker;
  built `google-drive:files`; wired Gmail `add_label.labelIds` to a per-chip label picker.
- **SWEEP-3** — `datetime-utc` (UTC instant) field type; Geoapify server-proxied `location`
  field type; HubSpot deal `dealtype` portal property-options resolver.
- **SWEEP-4** — Google Calendar `calendars` picker; HubSpot contact/company/ticket portal
  property-options; Slack group-DM (mpim) picker; three new OAuth scopes; insufficient-scope →
  reconnect behavior; a launch-clean structure/discovery test cleanup.

---

## 2. Completed commit chain

Real commits (`git log`, marker `CONFIG-FIELD-UX-*`), chronological:

- `e50a56815` — docs(builder): config menu / field UX modernization audit (CONFIG-FIELD-UX-MODERNIZATION) _(2026-06-22)_
- `e42fcb96c` — feat(builder): datetime/date/time/timezone field family + GCal adoption (CONFIG-FIELD-UX-CS1) _(2026-06-22)_
- `b8f1a5bc9` — feat(builder): Slack channel fields as searchable name-or-ID comboboxes (CONFIG-FIELD-UX-CS2) _(2026-06-22)_
- `2d7d6e61e` — feat(builder): Slack action channel comboboxes accept manual ID paste too (CONFIG-FIELD-UX-CS2B) _(2026-06-22)_
- `61c5875b6` — feat(builder): config-field UX sweep — temporal/enum adoption + slack:users picker (CONFIG-FIELD-UX-SWEEP) _(2026-06-22)_
- `98fdbc3c6` — feat(builder): config-field UX sweep-2 — buildable no-decision follow-ups (CONFIG-FIELD-UX-SWEEP-2) _(2026-06-22)_
- `cadf39cba` — feat(builder): config-field UX sweep-3 — instant datetime, Geoapify location, HubSpot dealtype enum (CONFIG-FIELD-UX-SWEEP-3) _(2026-06-22)_
- `6582d4d5c` — feat(builder): config-field UX sweep-4 — Marcus-approved scope adds (gcal calendars, hubspot enums, slack mpim) + launch-clean test sweep (CONFIG-FIELD-UX-SWEEP-4) _(2026-06-22)_

All eight are on `v2-main` and pushed to `origin/v2-main` (`6582d4d5c` confirmed an ancestor of
the remote). The closeout commit itself is a later docs-only commit (hash in the final report).

---

## 3. Field types added

Added to `FieldTypeSchema` ([contracts/actionMeta.ts](../../../contracts/actionMeta.ts)); each
maps to exactly one renderer in
[config-modal/fields/_registry.ts](../../../features/workflow-builder/config-modal/fields/_registry.ts).
All store the **same schema-expected string** the handler already validated — no new value
object shape, no silent timezone coercion.

| Type | Renderer | Stored string | Notes |
|---|---|---|---|
| `date` | `TemporalField` | `YYYY-MM-DD` | native date picker |
| `time` | `TemporalField` | `HH:MM[:SS]` | native time picker |
| `datetime` | `TemporalField` | `YYYY-MM-DDTHH:MM:SS` | **offset-less local** wall-clock, paired with a separate `timezone` field |
| `datetime-utc` (instant) | `TemporalField` | `YYYY-MM-DDTHH:MM:SSZ` | picked wall-clock treated **as UTC** (no local-zone shift), labeled UTC |
| `timezone` | `TimezoneField` | IANA name (e.g. `America/New_York`) | native `<select>` of IANA zones; preserves unknown legacy values |
| `location` | `LocationField` | formatted address **string** | Geoapify autocomplete + free-text fallback (§6) |

**Robustness (all temporal kinds):** a value that doesn't match its kind's pattern (a
`{{variable}}` token, an offset-bearing instant, a Unix-epoch integer, garbage) falls back to a
raw text input and is preserved verbatim — never silently reinterpreted. `datetime-utc`
strips/append the trailing `Z` for display/storage respectively.

---

## 4. Resolver / option-source improvements

Registered in
[services/options/_registry.ts](../../../services/options/_registry.ts); resolved through the
single credential-policy-aware path
([resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts)). Every resolver
returns sanitized `{value, label, description?}` only — value = the id/name the handler stores,
label = display.

| Source | Slice | What it does | Manual-ID fallback |
|---|---|---|---|
| `slack:channels` (manual-entry consistency) | CS-2 / CS-2b | All eligible Slack channel fields (triggers + actions) are searchable comboboxes that also accept a pasted `C…/G…` id | yes |
| `slack:users` | SWEEP | Single-value Slack user-id pickers (`send_direct_message`, `get_user_info`, `remove_user_from_channel`, DM-sender filter). `users.list` on already-granted `users:read`; returns id + `@displayName` only — **no email** | yes |
| `slack:group_dms` (mpim) | SWEEP-4 | Group-DM (mpim) filter on the `new_group_direct_message` trigger. `conversations.list types=mpim`; displays Slack's conversation `name` only, never expands the `members` array | yes |
| `google-drive:files` | SWEEP-2 | File pickers on `get_file_metadata` / `delete_file` / `move_file`. Reuses `filesList`; **metadata only** (id + name), folders excluded, no content | yes |
| `google-calendar:calendars` | SWEEP-4 | Calendar picker on all 5 Calendar actions + the event_changed trigger. `calendarList.list`; stores calendar id, shows summary, `primary` default | yes |
| `hubspot:deal_dealtype` | SWEEP-3 | Deal-type portal enum on `create_deal` / `update_deal`. Reads the portal's REAL options via the CRM properties API | yes |
| `hubspot:{contact_lifecyclestage, contact_lead_status, company_lifecyclestage, ticket_category, ticket_source_type}` | SWEEP-4 | Portal-customizable enum pickers on contact / company / ticket create+update (10 fields). Generic `makeHubspotPropertyOptionsResolver(source, objectType, propertyName)` factory | yes |
| `gmail:labels` (string-array picker) | SWEEP-2 | `add_label.labelIds` became a per-chip `gmail:labels` picker (stores ids, shows names) via `string-array` gaining `optionsSource` | yes (per-chip) |

Also SWEEP-2: `ComboboxField` gained the shared `VariablePickerButton` (one-click
`{{node.field}}` insertion when `allowManualEntry` + upstream variables exist).

---

## 5. Provider UX changes (by provider)

- **Google Calendar** — `startDateTime`/`endDateTime` → `datetime`; `startDate`/`endDate` →
  `date`; `timezone` → IANA select; `list_events` `timeMin`/`timeMax` → `datetime-utc`;
  `colorId` text → static 11-color `select`; `location` → Geoapify `location`; `calendarId` →
  `google-calendar:calendars` combobox + manual id (all actions + event_changed trigger).
- **Outlook Calendar** — create/update event `startDateTime`/`endDateTime` → `datetime`,
  `startTimeZone`/`endTimeZone` → `timezone`; `list_events` window → `datetime-utc`; event
  `location` → Geoapify `location`.
- **Google Analytics** — `run_report` `startDate`/`endDate` → `date` (custom range).
- **Slack** — channel fields (triggers + actions) → `slack:channels` combobox + manual id;
  single-value user fields → `slack:users` combobox; group-DM trigger filter → `slack:group_dms`
  combobox.
- **Gmail** — `add_label.labelIds` → per-chip `gmail:labels` picker.
- **Google Drive** — `get_file_metadata` / `delete_file` / `move_file` `fileId` →
  `google-drive:files` combobox + manual id.
- **HubSpot** — deal `dealtype`, contact `lifecyclestage`/`hs_lead_status`, company
  `lifecyclestage`, ticket `hs_ticket_category`/`source_type` → portal property-options
  comboboxes + manual id; engagement timestamp fields (`hs_timestamp`, meeting start/end) →
  `datetime-utc`; `hs_meeting_location` → Geoapify `location`.
- **Mailchimp** — `create_custom_event.occurred_at` → `datetime-utc`.
- **Trello** — `create_card` / `update_card` `due` / `start` → `datetime-utc`.

---

## 6. Geoapify location architecture

The `location` field type is a **server-proxied** address autocomplete with a free-text
fallback. Built in SWEEP-3.

- **Server proxy.** Browser → `/api/geoapify/autocomplete?q=…`
  ([app/api/geoapify/autocomplete/route.ts](../../../app/api/geoapify/autocomplete/route.ts))
  → server calls Geoapify with the key. The client helper
  ([lib/api/geoapify.ts](../../../lib/api/geoapify.ts)) talks only to our route.
- **`GEOAPIFY_API_KEY` is server env only.** Read inside
  [services/geoapify/autocomplete.ts](../../../services/geoapify/autocomplete.ts) and attached
  to the outbound Geoapify request only. **Never** bundled, imported, logged, or returned to the
  browser. The structural client/server boundary test prevents `features/`/`lib/api/` from
  importing `services/*`.
- **Sanitized suggestions only.** The route returns `{ label, placeId?, lat?, lon? }` — the
  formatted address (+ optional id / coords). No raw Geoapify payload, attribution, or geometry.
- **Free-text fallback.** Debounced; skips very short (< 3 chars) and `{{variable}}` queries;
  degrades to a plain text field when the key is missing, the route errors, or there are no
  matches. The control is never dead.
- **Stored value = formatted address string** — exactly what Google/Outlook Calendar `location`
  and HubSpot `hs_meeting_location` already accept (no handler/schema change). `place_id` /
  lat-lon are NOT required for launch and are not stored.
- **No feature flag.** Behavior is gated by the presence of `GEOAPIFY_API_KEY`, not an
  `ENABLE_*` flag.

---

## 7. OAuth scope / reconnect changes (SWEEP-4)

Three new scopes were added to the manifests (Marcus enabled them in the provider portals;
existing connections need a one-time reconnect):

| Provider | Scope added | Backs |
|---|---|---|
| Google Calendar | `https://www.googleapis.com/auth/calendar.readonly` | `google-calendar:calendars` (`calendarList.list`) |
| HubSpot | `crm.schemas.contacts.read` + `crm.schemas.companies.read` | contact/company property-options |
| Slack | `mpim:read` | `slack:group_dms` (`conversations.list types=mpim`) |

- HubSpot **deals** used the already-present `crm.schemas.deals.read` (SWEEP-3); HubSpot
  **tickets** needed no new scope — HubSpot has no granular `crm.schemas.tickets.read`; ticket
  property reads ride on the existing broad `tickets` scope (see §11).
- **The requested scope list is built from the manifest at authorize time**
  ([services/oauth/dispatcher.ts:364](../../../services/oauth/dispatcher.ts)
  `[...manifest.scopes.required, ...manifest.scopes.optional]`), and the callback stores the
  provider's **granted** scopes. So a reconnect picks up a new scope only when it runs against a
  build that already includes the SWEEP-4 manifests.
- **Old connections may require reconnect.** Existing Google Calendar / HubSpot / Slack
  connections lack the new scopes until they reconnect.
- **Missing-scope → reconnect state.** A new shared `InsufficientScopeError` (HTTP 403) lives in
  [services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts). Google + HubSpot
  wrappers throw it on 403; the resolvers map it (and Slack's existing `missing_scope`) to
  `PROVIDER_REAUTH_REQUIRED`. The client renders the `needs-reconnect` state ("Reconnect
  {provider} in Apps") **inside the picker popover**, so the search input + manual-ID entry +
  variable picker stay usable. A token refresh never silently masks a missing scope (403 doesn't
  enter the refresh path).

---

## 8. Safety / no-leak boundaries (enforced across the arc)

- **No raw provider payloads.** Resolvers return only `{value, label, description?}`; no token,
  scope, raw response body, or attribution crosses to the client.
- **No tokens / secrets / credential IDs.** Error messages are sanitized static strings; the
  raw Slack error code / HubSpot 403 body / Google 403 body are never surfaced.
- **No file contents.** `google-drive:files` returns id + name only (folders excluded); no
  bytes, no download.
- **No member PII.** `slack:users` returns id + `@displayName` (no email); `slack:group_dms`
  shows Slack's own conversation name and never expands the `members` array.
- **No Geoapify key in the client.** Server-only env; structural boundary test enforces it (§6).
- **No handler/schema semantic breaks.** Every change is metadata/renderer-only; stored value
  shapes are unchanged (selectors store the same id/string the handler already validated;
  temporal fields store the same ISO/date strings). Credential-policy resolution stays on the
  shared sanitized path (no co-member personal-credential enumeration).
- **Manual fallback where appropriate.** Every new combobox keeps `allowManualEntry`; temporal
  and location fields keep a free-text path. A slow, incomplete, or scope-blocked picker never
  traps the user.

---

## 9. Verification baseline

**Newly measured THIS session** (during SWEEP-4, `6582d4d5c`):
- `npm run typecheck` → **clean** (tsc --noEmit, no errors).
- `npm run lint:structure` → **OK** (every leaf folder ≤ 50 files).
- `npx eslint` on all touched source files → **clean**.
- Broad `npx jest` across `tests/structure`, `tests/unit/services/discovery`,
  `tests/unit/integrations/{google-calendar,hubspot,slack,_shared/hubspot}`,
  `tests/unit/integrations/config-field-ux-sweep`, `tests/unit/services/options`,
  `tests/unit/services/ai-guidance`, `tests/unit/core/workflows`,
  `tests/unit/features/workflow-builder`, `tests/unit/services/analytics/sources/slack`,
  `tests/unit/smoke-actions/workflow-live-mode` → **354 suites passed, 4591 tests passed, 1
  skipped, 0 failed.**
- This closeout also runs `npm run lint:structure` after adding the doc (result in the final
  report) — docs add no source files.

**Inherited from earlier slice reports** (not re-measured field-by-field this session):
- CS-1..SWEEP-2 per-slice targeted suites (e.g. SWEEP-2 reported ~3062 workflow-builder + drive
  + gmail + slack + options tests green at `98fdbc3c6`); SWEEP-3 reported its targeted temporal /
  geoapify / hubspot suites green at `cadf39cba`. These numbers are carried from those commits'
  reports, superseded by the broad SWEEP-4 run above.

**Not run this session:** the full `npm test` tree; any **live** provider smoke against the
deployed build (see §10). No migrations were authored by this arc, so there is nothing to
`db:push`. **No feature flags** were added by this arc (the Geoapify field is gated by
`GEOAPIFY_API_KEY` presence, not an `ENABLE_*` flag).

> A final broad pre-push / batch verification (full `npm test`) can still be run if a release
> gate wants it; the SWEEP-4 broad run above is the strongest measured baseline to date.

---

## 10. Honest status

- **Launch-accepted by Marcus** and **deployed.** Scope-portal changes were made by Marcus.
- **NOT every scope-dependent picker was manually live-smoked field-by-field after deploy.** The
  resolvers, wiring, scopes, and reconnect behavior are all unit-tested and the mechanism is
  verified in code, but the post-deploy "open the picker, confirm it lists real options" check
  was not exhaustively performed per field. Marcus accepted this and moved on.
- **Fallback / reconnect behavior exists** for the un-verified paths: an un-reconnected or
  scope-missing connection surfaces a Reconnect prompt and the field stays usable via manual-ID /
  free-text. So an unverified picker degrades gracefully rather than dead-ending.
- **Deploy-timing caveat (carried from the SWEEP-4 verification report):** because requested
  scopes come from the deployed manifest, any reconnect that happened *before* `6582d4d5c` was
  the serving build would have stored the old scope set. The practical post-deploy check is to
  open one picker per provider — populated = grants good; "Reconnect" = reconnect again on the
  deployed build.

---

## 11. Remaining non-blocking notes

- **HubSpot ticket property picker — runtime assumption (still relevant).** `ticket_category` /
  `ticket_source_type` read `GET /crm/v3/properties/tickets/*` under the **existing `tickets`
  scope** (no granular `crm.schemas.tickets.read` exists in HubSpot's catalog). Expected to
  work. If HubSpot 403s, the resolver maps to `PROVIDER_REAUTH_REQUIRED` and manual entry still
  works — but note a reconnect would NOT fix it (the scope is already granted), so for tickets
  the real fallback is free-text and it'd be a follow-up (different scope or accept free-text on
  those two fields). Confirm during any future ticket smoke.
- **Line-cap note.** `ComboboxField.tsx` is ~570 lines (over the 500-line house guideline);
  `StringArrayField.tsx` ~386. The structural lint (`lint:structure`) enforces leaf-folder file
  counts (≤ 50), **not** per-file line counts, so this is an accepted size for the central
  picker renderer, not a lint override. A future split is optional cleanup, not a blocker.
- **Intentionally left manual / free-text:**
  - HubSpot ticket enums fall back to free-text if the `tickets`-scope assumption fails (above).
  - `invite_users_to_channel.users` (Slack, multi-value) stays a free-text chip list — the
    single-select combobox has no multi-select; a multi-select picker is a future option.
  - `StringArrayField` free-text chip lists with no `optionsSource` (e.g. Gmail `from[]`,
    Calendar `attendees`) have no per-chip variable picker yet (renderer-only follow-up).
  - Record pickers (e.g. Airtable `recordId`) were intentionally rejected for v1; trigger/
    upstream-fed ids (`eventId`, `messageId`) and opaque Stripe ids stay raw text by design.
  - `place_id` / lat-lon for `location` are not stored (formatted text only) for launch.

---

## 12. Recommended next workstream

1. **Post-deploy picker smoke pass (cheap, high-confidence).** Open one config per provider on
   the deployed build, confirm each new picker lists real options, and reconnect any that show
   "Reconnect." Settles §10 + the HubSpot ticket assumption in minutes; promotes
   "launch-accepted" to "launch-verified." (No code.)
2. **Conditional-visibility (`visibleWhen`) for the builder.** The audit (§4) flagged
   `allDay`-style toggles that should show date-vs-datetime fields. Additive, optional,
   default-visible — unblocks cleaner temporal UX without touching handlers.
3. **Per-chip pickers / variable insertion for `StringArrayField`** (Gmail recipients, Calendar
   attendees) + a multi-select combobox for `invite_users_to_channel.users`. Renderer-only.
4. **`ComboboxField` split** (optional cleanup) to bring the central picker under the 500-line
   guideline as it keeps absorbing states.
5. **Contact/user resolvers (PII-reviewed)** for Calendar attendees / mail recipients — the last
   audit category still on free-text; needs a scope + PII review per provider.

---

## Closeout confirmation

Docs-only. Nothing pushed. Doc:
[docs/slices/phase-4/config-field-ux-modernization-closeout.md](./config-field-ux-modernization-closeout.md).
