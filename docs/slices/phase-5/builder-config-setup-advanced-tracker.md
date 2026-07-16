# Builder Config Setup/Advanced Usability Audit — Tracker (CONFIG-UX-SETUP-ADVANCED-1)

**Date:** 2026-07-15 · **Branch:** `v2-main` · **Local commits only, nothing pushed.**
**Predecessors (untouched):** CONFIG-FIELD-UX-MODERNIZATION (phase-4), CONFIG-UX-AUDIT-1/2,
SPREADSHEET-CONFIG-REDESIGN-1 (phase-5).

## 1. Scope and method

Complete usability audit of **every registered builder-visible node configuration
experience**: the inventory was generated from the live discovery registry
(`services/discovery/_registry.ts` via `listAllActionMetas()` / `listAllTriggerMetas()`),
not from docs or filenames.

- **424 nodes** (360 actions + 64 triggers) across 30 providers + native logic/control nodes.
- **1,571 fields** audited individually against the 12 audit questions
  (normal-user need, power-user value, inferability, derivability, safe default,
  wording, input mode, helper-text voice, conditional relevance, Advanced fit,
  warning need, first-time completability) and classified into the 10 categories
  (core user decision · provider resource selection · upstream data mapping ·
  structured composition · safe default · derived value · conditional option ·
  advanced user control · internal implementation detail · unsupported raw configuration).

**Every node appears in the per-group audit reports** (including no-finding nodes),
kept as appendices in [`config-ux-audit/`](./config-ux-audit/):

| Group | Providers | Nodes | Fields | Report |
|---|---|---|---|---|
| A | slack, eden | 77 | 210 | [audit-A-slack-eden.md](./config-ux-audit/audit-A-slack-eden.md) |
| B | monday, hubspot | 56 | 274 | [audit-B-monday-hubspot.md](./config-ux-audit/audit-B-monday-hubspot.md) |
| C | mailchimp, stripe, quickbooks, shopify | 61 | 264 | [audit-C-commerce.md](./config-ux-audit/audit-C-commerce.md) |
| D | gmail, microsoft-outlook, google-docs, google-sheets | 53 | 193 | [audit-D-mail-docs.md](./config-ux-audit/audit-D-mail-docs.md) |
| E | microsoft-excel/-onedrive/-teams/-onenote/-outlook-calendar | 55 | 172 | [audit-E-microsoft.md](./config-ux-audit/audit-E-microsoft.md) |
| F | notion, airtable, trello, asana, typeform, calendly | 59 | 192 | [audit-F-pm-tools.md](./config-ux-audit/audit-F-pm-tools.md) |
| G | google-calendar/-drive/-analytics, facebook, discord, dropbox, github | 56 | 243 | [audit-G-google-social.md](./config-ux-audit/audit-G-google-social.md) |
| H | native (logic/control + triggers) | 7 | 17 | [audit-H-native.md](./config-ux-audit/audit-H-native.md) |

Each appendix carries the per-field rows this tracker requires (current field +
placement, why it fails/succeeds for a normal user, power-user value, classification,
proposed Setup experience, proposed Advanced experience, default/derivation, runtime
preservation, compatibility risk). This index adds the systemic synthesis and the
implementation status per change.

## 2. Product model implemented

**Setup** (default tab): plain-language, outcome-oriented decisions — pickers,
toggles, structured editors, safe visible defaults, conditional sections.
**Advanced** (tab, only when the node has advanced fields): organized power-user
controls with explicit override indication and one-click return to standard
behavior. **Internal details**: derived or defaulted, not shown.

### Shared infrastructure shipped (commit `feat(builder): Setup/Advanced config tabs…`)

| Piece | Behavior |
|---|---|
| Advanced tab | `ConfigModalShell` renders `advanced: true` fields in a real Advanced tab (the tab-model slot reserved by BUILDER-CONFIG-TABS-1 and hardcoded off until now). No advanced fields → no tab. |
| One shared draft | Setup and Advanced render over the same pending draft (`configSlice`); switching tabs never discards edits; a Setup edit can never erase an unrelated Advanced value (per-field writes only). Saved values hydrate into whichever tab owns the field. |
| Override visibility | Advanced fields with a custom value show "Custom value — overrides standard behavior" + **Reset to standard** (clears the stored key; the runtime default/derived behavior takes back over). The Advanced tab label carries a count chip of custom values, visible from Setup. |
| `visibleWhen` | New top-level FieldMeta condition (`valueIn`/`valueTruthy`, known-sibling, no chains). Specialized-mode fields appear only when relevant; a controller change that hides a field clears its value (mirrors `dependsOn` + the spreadsheet mode toggle, and keeps XOR/refine runtime contracts satisfiable). |
| Readiness | `core/workflows/requiredFields.ts` (shared client + server) skips required fields hidden by an unmet `visibleWhen` (required-when-visible). Optional Advanced fields never count toward setup-needed. A (rare) required Advanced field is listed as "Fill in X (in the Advanced tab)". |
| `object` field type | Single fixed-key flat object edited as labeled sub-fields (`itemFields`); commits the real `Record` shape; preserves unknown saved keys; empty → `undefined`. Replaces flat-object JSON entry (Mailchimp audience contact/campaign defaults, Shopify addresses, Stripe automaticTax). |
| copy-guard update | `advanced: true` now means "power-user control" (any type), not only the JSON escape hatch; `json` fields still require an explicit array/object shape and remain advanced-only by contract. |
| Cron schedule presets | `CronField` builds the schedule from presets (every hour / day / weekdays / week / month + native time-day inputs) over the SAME stored 5-field UTC cron string; "Custom (cron)" keeps the raw input; unrecognized saved expressions hydrate as Custom and are never rewritten; the next-fire preview adds the viewer's local time. Pure mapping in `_cronPresets.ts` with exact round-trip tests. |

### Advanced-tab semantics (defined behavior)

- One pending config state for both tabs; per-field dispatch only.
- Setup-owned multi-value choices: composite editors declare ownership via
  `batchRowsField`/`renderedBy` (unchanged from SPREADSHEET-CONFIG-REDESIGN-1).
- Override = advanced value set AND ≠ declared default (deep-equal → standard, no chip).
- Reset = remove the stored key (never writes a guessed value).
- Setup-needed counts = unfinished required user decisions only (defaults, derivation,
  and hidden-mode fields never count; optional Advanced never counts).
- Required Advanced is rare and must be either revealed by a mode (`visibleWhen`) or
  labeled with its tab location in the readiness checklist.

## 3. Systemic findings (cross-provider patterns)

1. **Advanced concept existed but was dead** — the tab was hardcoded off
   (`hasAdvancedOptions = false`) with a stale "no advanced-field concept" comment while
   41 fields already carried `advanced: true` in a collapsed in-form disclosure. Fixed at
   the shell (one place).
2. **Runtime-broken metas** (UI let users save configs the runtime rejects):
   if/then operator enum drift (`greater_than_or_equal` vs `greater_equal`);
   github create_issue labels/assignees text vs `z.array`; trello `pos` string vs
   `top|bottom|number`; stripe checkout `lineItems` optional in meta but required by the
   payment/subscription modes; mailchimp `audience_event.eventTypes` free text vs a closed
   6-value activation enum. All fixed with parity/meta tests.
3. **Mode-scoped fields shown unconditionally** (~45 fields; gmail search modes, stripe
   collection modes, GA date ranges, discord filters, docs/onenote modes, native if/then +
   http body) — adopted `visibleWhen`.
4. **Plumbing in the common path** (~35 fields: pagination cursors/offsets, time-window
   tuners, developer toggles, timeouts) — moved to the Advanced tab.
5. **Existing pickers left unwired** — gmail labels (5 fields), outlook folders (4),
   slack users (1), notion pages (7), discord messages/members — wired to their already-
   registered resolvers with manual-entry fallback preserved.
6. **Implementation-voice copy** (~120 descriptions: Graph/`$filter` jargon, endpoints,
   scope names, wire-format phrasing, slice IDs, "the handler…") — rewritten to outcome
   language; copy-guard keeps JSON words out of normal-path copy.
7. **Silent runtime defaults invisible in the UI** (hubspot statuses, slack list flags,
   facebook `published`, monday limits) — surfaced as `defaultValue` so readiness and the
   form show what will happen (Q11 fields deliberately excluded — behavior-switching
   choices stay explicit, e.g. stripe invoice `autoAdvance` became a required explicit
   choice instead).
8. **Flat objects behind raw JSON** — converted to the `object` editor where the runtime
   shape is a verified flat record; nested/union grammars (Notion DSL, Block Kit,
   Airtable typed maps, Sheets batch ranges, stripe afterCompletion) deliberately remain
   validated `json` escape hatches pending purpose-built editors (see §6).

## 4. Classification counts (from the eight group audits)

- Fields already sound for their audience (core decisions, resource pickers, mappings,
  honest defaults): **~1,150 / 1,571** (~73%) — the earlier modernization arcs did real work.
- Findings resolved this slice: see §5 (implementation status) — counts below are
  finalized in the owner report accompanying the closing commit.
- Unsupported-raw-configuration fields that keep the validated JSON escape hatch:
  **33** (was 35; −2 converted to `object`), all `advanced: true`, all Save-gate validated.

## 5. Implementation status (all eight groups swept)

Every appendix "Change list" was implemented this slice except the explicitly-skipped
classes in §6 (new resolvers, purpose-built DSL editors, infra extensions, and items
whose value sets aren't verifiable in-repo). Highlights by group:

| Group | Applied (summary) | Notable skips (see appendix + §6) |
|---|---|---|
| A slack/eden | `slack:users` per-chip picker on invite_users; list_channels defaults surfaced; 6 slack window + 7 eden cursor/tuning fields → Advanced; eden platform select (verified 7-value set); `since` → date; ts/threadTs copy standardized (8 actions); publish-now `timezone` → Advanced | archived-channels + files resolvers; eden enum selects lacking in-repo value evidence (copy-only interim); platforms-array visibleWhen (needs array-contains condition) |
| B monday/hubspot | 9 pagination/`properties` fields → Advanced; get-family `filterValue` visibleWhen; `limit` defaults (25/100); closedate → datetime-utc; SCREAMING_SNAKE labels → plain English across task/call/meeting/ticket/contact/company; billing period → combobox+manual; numeric-string jargon rewritten (~13 fields) | monday column_types + hubspot property/search resolvers; columnValue schema-aware editor |
| C commerce | **mailchimp contact + campaign_defaults: required JSON → Setup `object` editors**; audience_event eventTypes → closed 6-value multi-select; create_segment mode-scoped visibleWhen (+conditions required); stripe lineItems required+mode-scoped; **autoAdvance + at_period_end → explicit required choices (Q11)**; automaticTax + shopify addresses → `object`; currency combobox; update_order_status union-armed visibleWhen | stripe/shopify resource resolvers; afterCompletion stays json (union); segment condition `op` stays open text (open DSL) |
| D mail/docs | gmail labels picker wired on 5 fields + outlook folders on 4 (incl. the 3 HIGH raw-id fields); gmail search_emails 12 mode-scoped fields → visibleWhen (runtime discriminator verified as `query`); outlook get_attachment mode-armed required filters; docs update/share conditional sections; sheets row_changed changeKinds → closed multi-select + keyColumn visibleWhen; stale send-email description fixed; `readRows.schema.ts` reference removed | outlook categories + sheets columns resolvers; subject exact-match visibleWhen (needs non-empty-string condition form); formatRange numberFormat object (reverted: LOW vs pin cost) |
| E microsoft | onenote update_page insert-armed target/position (required-when-visible); getPageContent dev toggles + outlook-calendar refinement quartet ×2 → Advanced; onedrive orderBy → select (5 verified values); Graph jargon + slice-ID leaks removed (~18 descriptions); relabels (Top → Max rows etc.) | excel table_columns resolver + add_table_row/update_row editors; teams chats resolver (Marcus-deferred); mimeType option list (no in-repo source; google-drive's had one — converted there) |
| F pm-tools | trello `pos` select on 4 nodes (fixes UI-runtime break); 7 notion page pickers on `notion:pages`; notion search.filter json→`object`; airtable sort json→object-list; 6 pagination fields → Advanced; XOR wording on create_comment | notion databases resolver; typed-map/DSL editors; either-or readiness adapter (owner decision) |
| G google/social | github labels/assignees → string-array (fixes runtime break); `private` → explicit required choice (Q11); facebook/GA temporal conversions + insights metric combobox (verified names only); GCal all-day ⇄ timed field pairs via visibleWhen (runtime XOR verified); discord messages/members pickers wired + copy sweep; dropbox defaults surfaced | github branches/milestones resolvers; keywordMatchType visibleWhen (string-array controller unsupported) |
| H native | if/then operator enum fixed (runtime parity test) + Value required-when-visible; http_request body mode-gated + timeout → Advanced; **cron schedule presets** (CronField); copy sweep on all 7 nodes | router defaultRoute derived-select; http auth surface (secret-aware design needed) |

Cross-cutting: `tests/unit/services/discovery/_registry.test.ts` stale point-in-time
pins were reconciled centrally (they pinned the pre-sweep shapes this slice
deliberately changed — e.g. "resolvers deferred", "paste-JSON textareas", "no enabled
default"); two stale manifest handler-inventory pins (teams, outlook) were also
corrected against the long-committed handler registries.

## 6. Deliberately deferred (honest reasons)

| Item | Why deferred |
|---|---|
| Purpose-built editors for the 33 remaining JSON grammars (Notion property/filter DSL, Slack Block Kit, Airtable typed field maps, Monday column values, Sheets batch ranges, stripe afterCompletion union) | Each needs a designed, schema-aware editor; the validated `json` escape hatch (AUDIT-2) remains correct in the meantime. Same posture as the two prior closeouts. |
| New option resolvers (stripe customers/prices, shopify products/locations, teams chats, notion databases, github branches/milestones, hubspot object-search pickers, sheets/excel column resolvers, slack archived-channels, outlook categories) | Every new resolver needs live provider verification (and some need scopes or Marcus sign-off — teams chats is explicitly deferred by registry comment). No fake pickers. Tracked per appendix. |
| Object-list row-level `optionsSource` (QuickBooks invoice line item pickers) | Contract deliberately keeps row sub-fields reduced; extending it is an infra decision with renderer + resolver-deps design. |
| Router `defaultRoute` as a select derived from sibling route labels | Needs sibling-derived options (composite-editor pattern); free text kept with corrected copy. |
| http_request `auth` surface | Runtime supports bearer/basic/apiKey but exposing it needs a secret-aware design (values persist in workflow config); not a JSON-textarea job. |
| Excel add_table_row / update_row spreadsheet-editor adoption | Named deferred items of SPREADSHEET-CONFIG-REDESIGN-1; need the `table_columns` resolver + record-commit editor mode. |
| Sheets `range`/positional `values` redesign | Recorded product decision needed first (sheet picker + derived range) — per the spreadsheet closeout. |
| Either-or readiness semantics (notion create_comment pageId XOR discussionId) | Readiness checklist can't express XOR without an adapter; copy clarified; adapter is a small follow-up. |

## 7. Backward compatibility strategy

- **No config key renamed, no migration, no handler/schema change.** Every control
  commits the exact runtime shape the handler already validated.
- Saved values hydrate into whichever tab/control now owns the field; unknown/unfamiliar
  values are preserved (object editor keeps unknown keys; temporal fields keep
  non-matching strings verbatim — existing behavior).
- `visibleWhen` never clears values on hydration — only on an explicit controller change
  (the same moment the old UI would have left a runtime-rejected stale value in place).
- Fields newly marked `advanced` remain fully saved/loaded; they moved tabs, not keys.
- Two deliberate readiness-visible changes (both make previously-broken-or-risky saves
  explicit rather than silent): stripe `create_invoice.autoAdvance` and github
  `create_repository.private` are now explicit required choices (Q11). Existing saved
  workflows keep executing exactly as before; the builder now asks the question.

## 8. Verification

Recorded in the final owner report (commands + results), including the inherited
baseline failures that predate this slice.
