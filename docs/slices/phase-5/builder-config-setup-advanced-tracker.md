# Builder Config Setup/Advanced Usability Audit — Tracker (CONFIG-UX-SETUP-ADVANCED-1)

**Date:** 2026-07-15 · **Branch:** `v2-main` · **Predecessors (untouched):**
CONFIG-FIELD-UX-MODERNIZATION (phase-4), CONFIG-UX-AUDIT-1/2,
SPREADSHEET-CONFIG-REDESIGN-1 (phase-5).

> **⚠️ This tracker's original closeout was PREMATURE — superseded by the
> corrective pass below (RESOLVERS-1 + CONFIG-UX-NODE-SUMMARY-1, 2026-07-16).**
> The first pass classified fields and fixed the Setup/Advanced structure, but it
> DEFERRED the provider-discovery work that the normal path actually depends on —
> leaving normal users to paste `sub_…` / `cus_…` / `price_…` / record ids into
> "Setup". Deferring that was wrong: needing a new read-only API wrapper, a
> resolver, pagination, or account-scoped credentials is an implementation
> requirement, not a reason to redefine product scope. §9–§11 record the correction.

---

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

---

## 9. Corrective pass — RESOLVERS-1 (provider resource discovery)

**Why:** the first pass shipped Setup/Advanced structure but left ~60 fields where the
normal path still demanded a provider-internal identifier, because building the
discovery infrastructure was scoped out. That failed the product standard: *a normal
user must never have to leave ChainReact, inspect a URL, or hunt an opaque id to
configure the common path.* Stripe was the clearest failure — **zero** resolvers, so
`update_subscription` asked for `sub_…` **and** `price_…` as free text.

### Re-audit method

The whole 1,571-field surface was re-dumped from the LIVE discovery registry (not the
earlier report) and every resource-referencing field was classified into five buckets:
static-setup-resource (picker required) · upstream-runtime value (mapping is correct) ·
external-system-supplied · provider-cannot-list · freeform business key. Full ledger,
including endpoint + scope verdicts for anything left uncovered:
[`config-ux-audit/resource-field-ledger.md`](./config-ux-audit/resource-field-ledger.md).

### Resolver families added (24 new sources)

| Provider | Sources | Backing endpoint |
|---|---|---|
| stripe (had **zero**) | `customers`, `subscriptions`, `prices` | `/v1/customers`, `/v1/subscriptions?expand=data.customer`, `/v1/prices?expand=data.product` |
| hubspot | `contacts`, `companies`, `deals`, `tickets`, `products`, `line_items` (server-side search) + 6 `*_properties` + `call_disposition` | `POST /crm/v3/objects/{type}/search`, `GET /crm/v3/properties/{type}` |
| github | `branches`, `labels`, `assignees` | `/repos/{o}/{r}/{branches,labels,assignees}` |
| google-sheets | `columns` | header-row `values.get` (mirrors `excel:worksheet_columns`) |
| microsoft | `excel:table_columns`, `teams:chats` (un-deferred with owner sign-off), `onenote:target_sections` | Graph `tables/{t}/columns`, `/me/chats?$expand=members`, `/me/onenote/sections?$expand=parentNotebook` |
| slack | `channels_archived` | `conversations.list` (`excludeArchived:false`, archived-only) |
| microsoft-outlook | `categories` | `/me/outlook/masterCategories` |
| notion | `databases` | `POST /v1/search` (object=database filter) |
| shopify | `products`, `customers` | `products.json`, `customers.json` |
| airtable | `records` (reverses the v1 record-picker rejection) | base schema → primary field, `/v0/{base}/{table}` |

Plus **12 fields wired to resolvers that already existed but were never connected**
(gmail labels ×5, outlook folders ×4, notion pages ×7, slack users, discord
messages/members, mailchimp members ×5, airtable add_attachment, stripe find_customer,
hubspot ticket associations ×3, notion get_block ×2).

**Label policy (enforced by tests):** display names only — contact/customer labels never
carry email, phone, balance, or spend. Subscription labels read "customer — status";
price labels use the merchant's own catalog pricing. Every picker keeps
`allowManualEntry` + variable insertion, so a power user is never trapped by a resolver
that can't list their resource.

### The durable guard

[`tests/structure/resource-field-discovery-coverage.test.ts`](../../../tests/structure/resource-field-discovery-coverage.test.ts)
scans every builder-visible field and **fails** when an identifier-shaped field is plain
Setup text with no registered `optionsSource`, unless it carries a documented exemption
in one of four evidence classes — **UPSTREAM · NO-LISTING · SCOPE · CONTRACT**. It also
fails on a picker pointing at an unregistered source, and on a stale exemption whose
field no longer exists. This is what stops paste-the-id UX from returning.

### Honestly unresolved (35 exemptions, each with evidence in the guard)

- **UPSTREAM (majority):** message / email / event / attachment / charge / payment-intent
  ids. Produced by an earlier step or delivered by a trigger; there is no meaningful
  browse list and mapping is the correct UX.
- **SCOPE:** `shopify:update_inventory.location_id` — the Location REST resource requires
  `read_locations`, absent from the manifest; adding it forces every merchant to
  reconnect (an owner decision). Same parent-gap blocks `variant_id`.
- **CONTRACT:** `github:create_issue.milestone` (runtime stores `z.number()`; the contract
  forbids `optionsSource` on `number` and a combobox commits a string — needs a schema
  change); `mailchimp:unsubscribe_subscriber.emailAddress` (its V1 field names can't feed
  the members resolver, which reads `deps.audience_id` — SchemaForm keys deps by the
  parent's field NAME); object-list ROW sub-fields (the `ObjectListItemField` contract has
  no `optionsSource`, which is why quickbooks invoice line items and stripe checkout row
  prices still take typed ids).
- **NO-LISTING:** GA `send_event.apiSecret` (decision D-GA1 — never read or surfaced),
  GA `clientId`/`userId` (generated by the customer's own site at runtime).

## 10. Corrective pass — CONFIG-UX-NODE-SUMMARY-1 (at-a-glance)

A configured node now explains itself in business language, on the collapsed card and in
the panel, per the north star.

- **`core/workflows/nodeConfigSummary.ts`** (pure): task-shaped headline + segments from
  registry metadata. Classifies each value RESOURCE (picker-backed → recognizable name) ·
  DYNAMIC (`{{…}}` → "from the trigger" / "from an earlier step") · CONDITION
  (select/boolean → the chosen option's label) · FIXED (reused every run). Hidden
  (`visibleWhen` unmet) and empty fields excluded; structured rows summarize by count.
- **`resourceLabelCache`**: pickers write `(source,value)→label` as they load; summaries
  read it. Display-only — never influences what is saved. A miss shows the stored id
  marked "(saved id)" rather than inventing a name.
- **`NodeConfigOverview`** (Setup tab) groups *Using · From earlier steps (changes each
  run) · Behavior · Same on every run*, so fixed-vs-per-run is visually distinguishable.
- **Card headline** via `buildNodeSummaryFieldsByType` (the `configDiffFieldMeta`
  server-computed-prop pattern) → canvas adapter → `node-summary-line`. It renders **only
  when every resource label resolved**, making a raw id on the canvas structurally
  impossible.

## 11. Live verification — NOT done

**No resolver in RESOLVERS-1 has been exercised against a real provider account in this
session** (no connected test accounts available). Each resolver header records its
endpoint + official doc URL and is unit-tested against a mocked provider boundary
(labels/values, q-filter, pagination `hasMore`, disconnected, 401→reconnect,
provider-error sanitization, no-PII pins). **Nothing here may be described as
live-certified.** Graceful degradation is what makes this safe to ship un-smoked: every
wired field keeps manual entry, and scope/permission failures map to a typed Reconnect
state rather than a dead control.

**Owner action needed before these light up for existing users:**
`microsoft-outlook:categories` requires the newly-**optional** `MailboxSettings.Read`
scope — existing Outlook connections must reconnect, and the Azure app registration may
need the delegated permission added first.

---

## 12. Corrective pass 2 — RESOLVERS-2 + the clean-checkout gap (2026-07-16)

### 12.1 Why there was a second corrective pass

§9's RESOLVERS-1 closed the resource-discovery gap for the fields the first audit had
flagged. It did not re-audit the registry afterwards. Two things were therefore missed,
and both are the same mistake in different clothes — **trusting the previous pass's
inventory instead of re-reading the live registry**:

1. **The registry had grown.** The Microsoft Power BI provider landed (47 actions + 16
   polling triggers + 24 option sources), taking the surface from 424 nodes / 1,571
   fields to **487 nodes (397 actions + 90 triggers) / 1,780 fields / 32 providers**.
   None of its 63 nodes had ever been through a config-UX audit.
2. **RESOLVERS-1 left picker-able fields on plain text**, including
   `stripe:update_subscription.default_payment_method` — a text box on the *exact node*
   whose text boxes prompted the correction in the first place.

Re-running the audit against the live registry (not the tracker) found **15 Setup fields
across 4 providers** that made an ordinary user go find an opaque id by hand while the
provider exposed a perfectly good listing endpoint.

### 12.2 What shipped (commit `23dfa7f2a`)

9 new resolver families; **149 → 158** registered resolvers; **716 of 1,780 fields** are
now resolver-backed pickers.

| Source | Backs | Shape |
|---|---|---|
| `google-calendar:events` | update/delete/add_attendees `.eventId` | cascade child of `calendarId`; 30d back, `singleEvents`+`orderBy=startTime` so the picked id is the recurrence INSTANCE the handler patches; native `q` search |
| `microsoft-outlook-calendar:events` | update/delete/add_attendees `.eventId` | **dep-less on purpose** — those schemas have no `calendarId` field (wrappers address `/me/events`), so the picker lists the same default-calendar scope the handler writes to |
| `shopify:orders` | update_order_status / add_order_note / create_fulfillment `.order_id` | one bounded page, most-recent-first, existing `read_orders` |
| `shopify:variants` | update_product_variant `.variant_id` | flat — no product field in the schema, and Shopify has no shop-wide `/variants.json`; variants come inline off `/products.json` |
| `shopify:locations` | update_inventory `.location_id` | needs the **new optional** `read_locations` scope |
| `stripe:charges` | create_refund `.chargeId` | `GET /v1/charges` |
| `stripe:payment_methods` | create_subscription `.default_payment_method` | dep `customerId` |
| `stripe:subscription_payment_methods` | update_subscription `.default_payment_method` | dep `subscriptionId` → resolves customer via `subscriptionsGet` |
| `stripe:payment_intent_payment_methods` | confirm_payment_intent `.payment_method` | dep `paymentIntentId` → resolves customer via `paymentIntentsGet` |

**The Stripe payment-method family is one listing behind three resolvers.** Stripe lists
payment methods only per-customer; deps are keyed by the parent **field** name; and only
`create_subscription` actually has a customer field. Wiring the other two to
`dependsOn: "customerId"` would look correct and ship a permanently-empty dropdown. The
alternative — renaming keys in shipped `.strict()` schemas — was refused. Same precedent
as `microsoft-powerbi:target_semantic_models`.

Every converted field keeps `required` as-is and keeps `allowManualEntry: true`: these
ids very often arrive from a trigger via `{{…}}`, so **the picker is added alongside
upstream mapping, not instead of it**. No runtime schema, field name, or handler changed.

### 12.3 The clean-checkout gap (commits `c28e397f3`, `292b3bf48`, `a875adcd3`)

For several days `v2-main` **could not be compiled from a clean clone**: `225826fb2`
registered 21 Power BI resolvers whose source files were never `git add`ed (21× TS2307).
The same omission had already happened twice (`github/options/_shared.ts`; then 5
resolvers in `eb62221c8`). The provider slice landing in `c28e397f3` closed the gap;
verification against a **detached worktree of the commit** (not the dirty tree) confirms
`npx tsc --noEmit` → **0 errors**.

This bug class is invisible to every other gate — tsc, lint and jest all read the dirty
working tree, where the untracked file is sitting right there on disk. Only a fresh clone
fails. So it now has a structural guard that reads **git's index** instead of the
filesystem: [`tests/structure/no-tracked-import-of-untracked-file.test.ts`](../../../tests/structure/no-tracked-import-of-untracked-file.test.ts),
verified to fire by reproducing the exact defect.

`292b3bf48` separately restored `field-sensitivity-coverage` to green: the Power BI slice
added 5 heuristic-over-matching fields, and a 6th (`eden:read_content.url`) had left the
guard permanently red — a guard that always fails enforces nothing.

**A guard that cannot fail is worse than no guard.** A proposed "every `dependsOn` names a
real sibling" test was written and then *deleted*: the `ActionMeta` Zod contract already
rejects that at module load, so the test could never fail and would have read as coverage
it did not provide.

### 12.4 Still not live-certified

§11 stands, now covering RESOLVERS-2 as well: **no resolver in either pass has been run
against a real provider account.** No connected Stripe / Shopify / Google / Microsoft test
accounts exist in this environment. Playwright was attempted rather than skipped and is
blocked at sign-in by an unavailable Supabase (`Database error deleting user`) — the same
root cause as the 28 DB-backed jest suites. **Nothing here may be described as
live-certified.**

**Owner actions before these light up for existing users:**

- **Shopify `read_locations`** — added to `scopes.optional`, so *zero* existing
  connections are forced to reconnect and every current handler is unaffected. But tokens
  minted before it genuinely lack the scope, so the **locations picker alone** returns
  `PROVIDER_REAUTH_REQUIRED` → Reconnect prompt until those merchants re-authorize
  (manual entry + `{{…}}` keep the field usable meanwhile). **`read_locations` must first
  be added to the app config in the Shopify Partner dashboard**, or consent cannot include it.
- **Outlook `MailboxSettings.Read`** — as recorded in §11.
- **One live check worth doing:** `shopify:orders` uses `order=created_at desc`, a
  long-standing but undocumented param. Shopify ignores unknown params silently rather
  than erroring, and the wrapper re-sorts the returned page itself — so what the user sees
  is always newest-first. What is unproven is whether the page Shopify *selects* is the 50
  newest or the 50 oldest on a shop with >50 orders.

---

## 13. Corrective pass 3 — RESOLVERS-3 / RESOLVERS-4 (rows are configuration too)

### 13.1 The gap under the gap

§12's re-audit swept **top-level** fields. It did not look inside structured rows. When it did,
the finding was worse than the one it had just fixed: **no `itemField` in the entire registry
could carry an `optionsSource` — the contract could not express it.** So a provider value inside
a row had to be hand-typed *even when a registered resolver for it already existed*.

That is Marcus's original complaint one layer down. `stripe:create_checkout_session` made a user
type `price_xxx` into a line item while `stripe:prices` sat registered and unused, and three
resolvers — `quickbooks:items`, `quickbooks:tax_codes`,
`microsoft-powerbi:semantic_model_parameters` — were **registered and referenced by ZERO fields**
for exactly this reason. The QuickBooks resolver's own comment admitted it ("object-list
sub-fields can't bind option sources — documented limitation"). A "documented limitation" that is
really an unbuilt feature is just a deferral wearing a lab coat.

### 13.2 RESOLVERS-3 — `optionsSource` on `itemFields` (commit `0704be7ef`)

Contract gains `optionsSource` / `dependsOn` / `allowManualEntry` on the itemFields schema;
`ObjectListField` + `ObjectField` render a real picker by delegating to the existing
`ComboboxField` (no parallel discovery path). **`type` remains the VALUE type; `optionsSource`
upgrades only the WIDGET** — which is what keeps `shopify:create_order line_items[].variant_id`
(`type: "number"`) committing a number, pinned by a test asserting the runtime schema *rejects* a
string so the coercion is load-bearing rather than incidental.

Wired: stripe checkout + payment-link `lineItems[].priceId`, quickbooks `lineItems[].itemId` +
`.taxCodeId`, shopify `line_items[].variant_id`, powerbi `parameters[].name`.

### 13.3 RESOLVERS-4 — row-local deps (commit `29825366f`)

RESOLVERS-3 resolved sub-field deps against **top-level** fields only, which left
`hubspot:webhook_received subscriptions[].propertyName` on plain text — REQUIRED, and asking the
user to know `amount` / `dealstage` / `hs_lead_status` by heart. The row's OWN `eventType` decides
which property list applies, and different rows watch different object types, so there was no
honest top-level field to hoist it to.

Two moves closed it:

- **`dependsOnRow`** — an explicit second scope resolving against the same row's other
  sub-fields. Not a new notion: `visibleWhen.field` on an itemField has *always* resolved
  row-locally, so this makes deps consistent with visibility rather than inventing a third rule.
  Both scopes merge into one flat `ctx.deps`; the resolver never learns which scope a value came
  from; a name that doesn't exist in the scope it declares throws at **module load**, in both
  directions.
- **Server-side dispatch** — when the row value should select the option SOURCE itself, do not
  invent per-row sources. `hubspot:subscription_properties` takes `eventType` as a dep and maps
  `contact./company./deal./ticket.` → `contacts/companies/deals/tickets` internally, calling the
  same `resolveHubspotPropertyNameOptions` the six shipped per-object resolvers use (extracted,
  not copied — a test asserts its output equals `hubspot:deal_properties`' for the same portal
  data, so they cannot drift).

An unmappable eventType returns an **empty list**, not `MISSING_DEPENDENCY`: the dep IS present
and the user DID choose an event, so "Select Event first" under a populated Event picker would be
a lie. Changing a row's eventType clears **that row's** now-wrong property (a stale `amount` must
not survive a switch from deal to contact) and only that row's.

### 13.4 What is still NOT closed

- **Still nothing is live-certified** (§11, §12.4 stand). No HubSpot/Stripe/Shopify/Google/
  Microsoft credentials exist in this environment; every resolver is unit-tested against a mocked
  provider boundary only.
- **Owner actions unchanged**: Shopify `read_locations` in the Partner dashboard; Outlook
  `MailboxSettings.Read`; the one live check on Shopify's undocumented `order=created_at desc`.
- `dependsOnRow` supports **direct** dependents only (no chains), matching the top-level cascade.
