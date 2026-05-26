# Phase 1 — Provider completion audit

**Branch:** `v2-provider-port-local` (local-only; do not push).
**Reference codebase (V1):** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**Goal:** Decide what closes Phase 1. Specifically: which V1 providers are already ported, what is still in flight, what is deferred to Phase 2, what is permanently skipped under current product direction, and whether Phase 1 should end after Microsoft Teams or absorb one more provider.

**Recommendation up front:** **End Phase 1 after Microsoft Teams.** No remaining V1 provider is clean enough to port inside Phase 1 without either dragging in V1 rot (Discord, Twitter, Facebook), depending on infrastructure Phase 1 doesn't ship (Monday, OneNote, Google Docs, Google Analytics), or requiring a product decision that hasn't been made (Trello, Dropbox already deferred under this rule). Detail per provider below.

This doc is the input to the Phase 1 exit checklist in [`docs/roadmap/chainreact-v2-roadmap.md`](../roadmap/chainreact-v2-roadmap.md). It does NOT authorize implementation work — Marcus accepts or revises the audit before any Phase 2 slice begins.

---

## Method

For each provider not in V2's manifest registry, the audit reads:

1. `lib/workflows/nodes/providers/<provider>/index.ts` — counts `isTrigger: false` (actions) and `isTrigger: true` / separate `triggers/*.schema.ts` files (triggers). Counts `comingSoon: true` flags.
2. `lib/workflows/actions/<provider>/` or `lib/workflows/actions/<provider>.ts` — handler implementations.
3. `lib/integrations/<provider>*.ts` and `app/api/integrations/<provider>/` — OAuth + lifecycle.
4. `lib/webhooks/normalizer.ts` and `lib/webhooks/verification.ts` — webhook entries (where applicable).
5. V2's existing shared infra (`integrations/_shared/google/`, `integrations/_shared/microsoft/`, OAuth dispatcher, trigger lifecycle registries, polling registry, action handler registry) — to judge whether a port reuses what's there or requires new contract surface.

The output is a per-provider recommendation with one of four labels:

- **port now** — fits current V2 contracts, V1 code is healthy enough, no new infrastructure needed.
- **defer Phase 2** — V1 code is healthy enough but the port needs something Phase 2 will already build (per-provider parity audits), or carries dependencies on Phase 3+ (UI), Phase 4 (workspaces), Phase 5 (AI) infrastructure.
- **skip** — V1 implementation is rot, comingSoon, or unbuilt; not worth porting under current product direction.
- **needs product decision** — Marcus has to choose before the recommendation is actionable.

---

## Section 1 — What's already ported (16 providers)

Source of truth: `integrations/_registry.ts:57-75` (ALL_MANIFESTS list). Honest-state capability flags per `docs/rules/provider-registry.md`.

| # | Provider | Slice | V2 path | OAuth | Actions | Triggers (model) |
|---|---|---|---|---|---|---|
| 1 | Slack | 1 | `integrations/slack/` | ✅ | `send_channel_message` | webhook (`event_callback`) |
| 2 | Gmail | 2 | `integrations/gmail/` | ✅ (PKCE) | `send_email` | polling (`newEmail`) |
| 3 | Google Calendar | 3 | `integrations/google-calendar/` | ✅ | 5 actions | webhook (`eventChanged`) |
| 4 | Google Drive | 4 | `integrations/google-drive/` | ✅ | 5 actions | webhook (`fileChanged`) |
| 5 | Google Sheets | 5 | `integrations/google-sheets/` | ✅ | 5 actions | webhook (`rowChanged`) |
| 6 | Microsoft Outlook (mail) | 6 | `integrations/microsoft-outlook/` | ✅ | `send_email` | webhook (`newEmail`) |
| 7 | Microsoft Outlook Calendar | 7 | `integrations/microsoft-outlook-calendar/` | ✅ | 5 actions | webhook (`eventChanged`) |
| 8 | Microsoft OneDrive | 8 | `integrations/microsoft-onedrive/` | ✅ | 7 actions | webhook (`fileChanged`) |
| 9 | Notion | 9 | `integrations/notion/` | ✅ | 7 actions | (deferred — Phase 2) |
| 10 | Airtable | 10 | `integrations/airtable/` | ✅ | 8 actions | webhook (`recordChanged`) |
| 11 | Stripe | 11 | `integrations/stripe/` | ✅ | 10 actions | webhook (`eventReceived`) |
| 12 | Shopify | 12 | `integrations/shopify/` | ✅ (per-shop) | 10 actions | webhook (`webhookReceived`) |
| 13 | HubSpot | 13 | `integrations/hubspot/` | ✅ | core CRM | webhook (`webhookReceived`) |
| 14 | Mailchimp | 14 | `integrations/mailchimp/` | ✅ (DC routing) | subscriber + audience | webhook (`audienceEvent`, `campaignCreated`, `emailOpened`, `linkClicked`) |
| 15 | GitHub | 14b | `integrations/github/` | ✅ | 6 actions | webhook (`newCommit`) |
| 16 | Microsoft Excel | 15 | `integrations/microsoft-excel/` | ✅ | 6 actions | polling (`new_row` + `new_table_row`) |

**Total surface today:** ~80–110 actions + 17 trigger entry points across 16 providers, depending on whether you count Notion's deferred webhook trigger as one or zero.

---

## Section 2 — In progress

### Microsoft Teams (slice 16)

**V2 path:** `integrations/microsoft-teams/`. Manifest present at `integrations/microsoft-teams/manifest.ts`; registered in `_registry.ts` at line 67. OAuth and 5 delegated-user actions committed (`f14a466e0 feat(microsoft-teams): delegated Teams actions and Graph wrappers`).

**Status:**
- ✅ Commit 2 — manifest + OAuth + dispatcher registration (`fe66c3003`).
- ✅ Commit 3 — 5 actions + Graph wrappers + tests (`f14a466ec`).
- ⏳ Commit 4 — `new_channel_message` Graph-subscription webhook trigger (in another chat).
- ⏳ Commit 5 — e2e walkthrough with mocked Graph boundary.

**Manifest capability flags today:**
- `oauth: true`
- `actions: true`
- `webhookTrigger: false` (flips true when Commit 4 lands)
- `pollingTrigger: false`

Reuses the shared Microsoft Azure AD app (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`) — closes V1's `TEAMS_CLIENT_ID/SECRET` duplication rot. Per the slice-16 plan, Batch 1 deliberately ships **5 of V1's 18 actions** and **1 of V1's 7 triggers**. The remainder is Phase 2 parity work, not Phase 1.

**Phase 1 exit gate:** Teams Commit 4 + Commit 5 lands and `webhookTrigger: true` flips. After that, no more providers are added in Phase 1 (subject to Section 6).

---

## Section 3 — Already deferred / skipped (decisions standing)

### Dropbox — **skip for V2 unless product direction changes**

**V1 source:**
- `lib/workflows/nodes/providers/dropbox/index.ts` (536 lines, 3 actions + 1 trigger, **1 `comingSoon: true` entry**).
- `lib/workflows/actions/dropbox/` (handlers + schema).
- V1 also has `lib/integrations/dropboxTriggerHandler.ts` and a Dropbox processor.

**Why skipped:** V1 was incomplete (`comingSoon: true` in the manifest), webhook signature verification was unresolved, and the upload-file action had a Supabase-fallback storage path tied to V1-specific infra. The audit gate ("Used? Rot? Coupled?" from the roadmap) returns "rot + coupled" — porting is a rewrite, not a port.

**Conditions to reopen:** Marcus decides Dropbox is product-critical AND a clean webhook-signature contract exists in V2 (it does — `_shared/microsoft/subscription-validation` and the GitHub HMAC pattern are both reusable). If both are true, Dropbox becomes a Phase 2 candidate, not a Phase 1 one.

### Trello — **defer to Phase 2 (auth contract extension required)**

**V1 source:** `lib/workflows/nodes/providers/trello/index.ts` (1047 lines, **10 actions + 6 triggers**, no `comingSoon` flags but two known-bad subsystems).

**Decision:** Already documented in [`docs/slices/slice-17-trello.md`](slice-17-trello.md). The blockers are:

1. **Auth model incompatibility.** Trello uses a client-side fragment-receiver pattern, not OAuth 2.0. V2's `ProviderOAuth` contract (`contracts/integration.ts:168-222`) assumes a server-side `authorizationUrl` + `tokenEndpoint` + refresh-capable flow. Porting Trello today would require either (a) extending the contract with a `token-ingest` auth scheme designed deliberately, or (b) embedding a Trello-specific bypass that mirrors V1's three-layer dead-config rot.
2. **Webhook security gap in V1.** `lib/webhooks/verification.ts` explicitly returns `true` for Trello — V1 never verifies the `X-Trello-Webhook` HMAC-SHA1 signature. Porting the signature verification is straightforward but should land alongside the auth contract decision so the whole provider lands clean.
3. **No per-trigger lifecycle.** V1 does bulk board webhook registration on connect, not per-workflow-trigger registration. V2's trigger lifecycle pattern doesn't support that shape — would need either contract extension or eager-registration carve-out.

**Conditions to reopen:** Phase 2 introduces a `token-ingest` auth scheme. Until that lands, Trello stays parked.

---

## Section 4 — Remaining V1 providers (audit results)

Each entry follows the slice prompt's per-provider report shape: V1 source paths → action count → trigger count → auth model → V2 architectural fit → setup friction → V1 code health → recommendation.

### 4.1 Google Docs

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/google-docs/index.ts` (883 lines).
  - Handlers: `lib/workflows/actions/googleDocs.ts` (1042 lines, legacy monolithic) + `lib/workflows/actions/googleDocs/createDocument.ts` (236 lines, V2-shape outlier).
- **Implemented actions:** **5** — `create_document`, `update_document`, `share_document`, `get_document`, `export_document`.
- **Implemented triggers:** **2** — `new_document`, `document_updated`.
- **Auth model:** Google OAuth (`offline_access` + `documents` + `drive` scopes). Identical to Google Drive / Sheets / Calendar in shape.
- **V2 architectural fit:** **Strong.** Reuses `integrations/_shared/google/` (PKCE, token refresh, `/me` lookup). The `create_document` handler already uses V2-shape primitives (`refreshAndRetry`, `requireExplicitField`, `getDecryptedAccessToken`).
- **Setup friction:** Low. No new env vars, no new OAuth app — same Google client as Drive/Sheets/Calendar. Triggers reuse Drive's `files.watch` subscription pattern (`fileChanged` resource feeds Docs change events via mimeType filter).
- **V1 code health:** **Mixed.** `update_document` carries a heavy template-merging branch and an inline preview-render component (`google_docs_preview` field type) that V2 doesn't have. The monolithic `googleDocs.ts` (1042 lines) needs the same per-action split that Drive/Sheets got during their slices.
- **Recommendation:** **Defer Phase 2.** Reasoning: the architectural fit is strong, but Google Docs is **the third Google provider that uses Drive's `files.watch` subscription for triggers**. Doing it well requires either (a) generalizing Drive's webhook lifecycle so Docs and (later) Slides plug in, or (b) duplicating the lifecycle. The right time to make that decision is during the Google Sheets + Drive + Docs parity audit in Phase 2, not as a one-off Phase 1 port. Action surface is also small — 5 actions — which is too little reach for one more Phase 1 slice.

### 4.2 Discord

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/discord/index.ts` (508 lines).
  - Handlers: `lib/workflows/actions/discord.ts` (2075 lines, monolithic).
  - Gateway runtime: `lib/integrations/discordGateway.ts` (1565 lines) + `lib/integrations/discordBotPresence.ts` (301 lines).
- **Implemented actions:** **5** — `send_message`, `edit_message`, `delete_message`, `fetch_messages`, `assign_role`.
- **Implemented triggers:** **3** — `member_join`, `new_message`, `slash_command`.
- **Auth model:** Bot token + OAuth scope grant. Bot tokens don't refresh — Discord's auth pattern is closer to GitHub (non-refreshable Bearer) than Google (refresh-capable).
- **V2 architectural fit:** **Weak.** Discord's "trigger" surface is a **persistent gateway websocket connection**, not webhooks or polling. V1 runs a long-lived `discordGateway.ts` process. V2's trigger lifecycle has no analog: no "websocket-trigger" registry, no presence runtime. Porting Discord triggers means inventing either:
  - A persistent worker outside the Vercel serverless model.
  - A converter from gateway events to per-workflow webhook calls (V1 doesn't have this; it would be a rewrite).
- **Setup friction:** **High.** Bot must be added to each Discord server, slash commands registered per-guild via the Discord API, bot presence advertised. None of this matches the per-user OAuth model the other 16 providers share.
- **V1 code health:** Gateway code is 1866 lines and tightly coupled to V1's `discordInviteTracker.ts` (already deferred in V1's own V2-consolidation plan — see V1 CLAUDE.md §"Direct-caller migrations status: Discord invite tracker — pending"). Action handlers in `discord.ts` are workable but need the per-action split everyone else got.
- **Recommendation:** **Defer Phase 2 / needs product decision.** Discord is high-value (user-popular per V1 traffic intuition), but porting requires a **persistent-trigger contract** that doesn't exist in V2 and doesn't fit Phase 1's scope ("provider foundation"). Acceptable Phase 2 outcomes:
  - **(a)** Port actions only (5 actions, no triggers) — usable but loses half the provider's value.
  - **(b)** Build a websocket-trigger contract first, then port triggers — likely a Phase 2/3 boundary.
  - **(c)** Skip Discord entirely until Phase 6 (engine hardening — durable queue can absorb a gateway worker).
  Marcus picks; the audit doesn't lock the answer.

### 4.3 Microsoft OneNote

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/onenote/index.ts` (834 lines).
  - Handlers: `lib/workflows/actions/microsoft-onenote/` (13 files, ~1100 lines total).
  - Triggers: `lib/workflows/nodes/providers/onenote/triggers/*.schema.ts` (2 files).
- **Implemented actions:** **12** — `create_page`, `create_notebook`, `create_section`, `update_page`, `get_page_content`, `get_pages`, `list_notebooks`, `list_sections`, `get_notebook_details`, `get_section_details`, `delete_page`, `copy_page`.
- **Implemented triggers:** **2** — `new_note`, `updated_note`.
- **Auth model:** Microsoft Graph delegated-user. Identical to Outlook / OneDrive / Excel / Teams. Same Azure AD app reusable.
- **V2 architectural fit:** **Strong on actions, blocked on triggers.** All 12 handlers map to Graph endpoints (`/me/onenote/...`). V2's `_shared/microsoft/` provides everything actions need (PKCE, refresh, error envelope, `/me` lookup). But — and this is the Phase 1 disqualifier — **OneNote's Graph endpoints don't support subscriptions** (no entry in `/v1.0/subscriptions` resource list). V1's `new_note` / `updated_note` triggers are wired but their lifecycle is unimplemented (the trigger schema files exist; no registration logic).
- **Setup friction:** Low for actions. For triggers, requires polling — which V2 supports (Excel just shipped two polling triggers in slice 15) but porting OneNote with both actions and triggers means designing the polling registry around a notebook-tree resource (not flat like Excel rows), which is its own design call.
- **V1 code health:** **Good.** Handler files are already per-action split. Schemas already separated. Closest-to-V2-shape of any unported provider.
- **Recommendation:** **Defer Phase 2.** The actions are clean and reusable, but shipping "actions only, no triggers" violates the Phase 1 honest-state rule (a provider lands with at least one working trigger model). Shipping both means designing OneNote-specific polling, which belongs in the Phase 2 parity work where Excel's polling pattern gets generalized.

### 4.4 Monday.com

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/monday/index.ts` (258 lines, dispatcher only).
  - Action schemas: `lib/workflows/nodes/providers/monday/actions/*.schema.ts` (24 files, V2-shape).
  - Trigger schemas: `lib/workflows/nodes/providers/monday/triggers/*.schema.ts` (5 files, V2-shape).
  - Handlers: `lib/workflows/actions/monday/*.ts` (24 handler files + index).
- **Implemented actions:** **24** — `create_item`, `update_item`, `create_update`, `create_subitem`, `delete_item`, `archive_item`, `move_item`, `create_board`, `create_group`, `get_item`, `search_items`, `list_items`, `add_file`, `duplicate_item`, `duplicate_board`, `add_column`, `list_updates`, `download_file`, `get_user`, `list_users`, `list_boards`, `get_board`, `list_groups`, `list_subitems`.
- **Implemented triggers:** **5** — `new_item`, `column_changed`, `item_moved`, `new_subitem`, `new_update`.
- **Auth model:** Monday OAuth (standard `code` → token exchange). Tokens DO refresh (refreshable: true).
- **V2 architectural fit:** **Strong on the surface, blocked on volume.** Monday's GraphQL surface is a clean fit — single endpoint (`https://api.monday.com/v2`), query-based, well-documented. V2 has no Monday-specific blockers. But: **24 actions is the largest port surface of any unshipped provider**, larger than Stripe or Shopify at slice time. Porting Monday in a single Phase 1 slice would push the slice 2–3× longer than any predecessor and risk Phase 1 closure slipping.
- **Setup friction:** Medium. Requires a Monday-side OAuth app (one-time). GraphQL action handlers need a query-builder helper that V2 doesn't have yet (every Monday call is a templated GraphQL string).
- **V1 code health:** **Excellent.** Schemas are already V2-shape (one file per action, separated trigger files). Per-handler files exist. This is the cleanest unported provider in V1.
- **Recommendation:** **Defer Phase 2.** Specifically: it's the **best parity-audit-first candidate** because the action surface is large enough that a port-or-skip-per-action decision in Phase 2 actually matters (vs. binary port-everything for smaller providers). Phase 2 parity work on Monday should subset down to the 8–10 most-used actions per V1 traffic data, not blindly port all 24.

### 4.5 Twitter

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/twitter/index.ts` (1073 lines, **16 `comingSoon: true` flags**).
  - Handlers: none — no `lib/workflows/actions/twitter/` directory exists.
- **Implemented actions:** **0** (12 declared in manifest, ALL marked `comingSoon: true`).
- **Implemented triggers:** **0** (5 declared in manifest, all `comingSoon: true`).
- **Auth model:** Declared as OAuth 2.0 with PKCE in the manifest. No callback wiring.
- **V2 architectural fit:** N/A — nothing to fit.
- **Setup friction:** N/A — never built in V1.
- **V1 code health:** **Stub only.** The manifest is a placeholder advertising future support; no handlers, no OAuth registration, no webhook receiver, no tests. This is the same "displayed in the UI as coming-soon" pattern V1 used for the Twitter API v2 transition window.
- **Recommendation:** **Skip.** Twitter (now X) has unstable API policy and aggressive rate-limit / pricing changes since 2023. Building it would be a from-scratch implementation, not a port. Defer until product direction explicitly requests it — at which point it's a Phase 2+ green-field add, not a Phase 1 port.

### 4.6 Facebook

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/facebook/index.ts` (933 lines).
  - Handlers: `lib/workflows/actions/facebook.ts` (1497 lines, monolithic).
- **Implemented actions:** **8** — `create_post`, `get_page_insights`, `send_message`, `comment_on_post`, `delete_post`, `update_post`, `upload_photo`, `upload_video`.
- **Implemented triggers:** **2** — `new_post`, `new_comment`.
- **Auth model:** Facebook Graph API OAuth (long-lived page tokens). Tokens technically don't refresh — they expire at ~60 days and require re-grant.
- **V2 architectural fit:** **Weak.** Facebook's surface forces multiple cross-cutting decisions:
  - **Page-level vs. user-level tokens.** Most actions need a page access token; OAuth gets a user token first, then exchanges for page tokens. V2's `ProviderOAuth` contract assumes one token per integration row.
  - **Webhook subscription is per-app, not per-user.** Facebook webhooks are configured at the Meta Developer App level for the whole app's user base, not per-user as V2's `subscription` registry expects. The Meta App owner configures fields; users opt in. V2 has no analog for "global app-level webhook configuration."
  - **Reviewer-approval gate.** Most write scopes (`pages_manage_posts`, `pages_messaging`) require Meta app review. This is a 2–6 week external dependency outside our engineering schedule.
- **Setup friction:** **Very high.** Meta app review process is a hard blocker for production launch even after code lands.
- **V1 code health:** Workable for the actions surface, but the monolithic `facebook.ts` is overdue for the per-action split.
- **Recommendation:** **Needs product decision.** If Facebook (Meta) is a product-launch requirement, schedule Meta app review NOW because it's a 2–6 week wait independent of code. If not, **skip** until product direction explicitly requires it. Either way it's Phase 2+, not Phase 1.

### 4.7 Google Analytics (GA4)

- **V1 source:**
  - Manifest: `lib/workflows/nodes/providers/google-analytics/index.ts` (876 lines).
  - Handlers: not located in a clean per-provider folder — search returns nothing under `lib/workflows/actions/google-analytics/` and no `googleAnalytics.ts` file at the actions root. The actual handler registration path is unclear; the manifest declares actions but the runtime wiring may be missing.
- **Implemented actions (declared):** **6** — `send_event`, `create_measurement_secret`, `run_report`, `find_conversion`, `create_conversion_event`, `run_pivot_report`.
- **Implemented triggers:** **0** — GA4 has no webhook surface. All "triggers" would have to be polling on Data API queries.
- **Auth model:** Google OAuth with `analytics.readonly` + `analytics.edit` scopes. Reuses V2's `_shared/google/`.
- **V2 architectural fit:** **Medium.** Actions fit V2 cleanly. But the "no triggers" reality matters: GA4 is **action-only**, which violates the Phase 1 convention that every provider ships with at least one trigger model. Phase 2 may relax this — there are legitimate action-only providers — but the rule shouldn't bend for GA4 specifically.
- **Setup friction:** Low. Same Google OAuth client as Drive / Sheets / Calendar / Docs.
- **V1 code health:** **Unclear.** The manifest exists in detail but the handler implementation needs auditing — possibly never finished in V1. The `create_measurement_secret` and `run_pivot_report` actions in particular look ambitious vs. V1's general action surface.
- **Recommendation:** **Skip / needs product decision.** Analytics is a low-traffic action surface in workflow-automation tools (Zapier / Make.com both ship GA4 connectors but with low usage). Until product direction asks for it explicitly, defer indefinitely.

---

## Section 5 — Hidden / scaffold-only providers

Found while scanning `app/api/integrations/` and `lib/workflows/nodes/providers/`:

| Provider | V1 evidence | Status |
|---|---|---|
| **Box** | `app/api/integrations/box/data/` only — no manifest entry, no handlers. Referenced in AI/automation HITL knowledge-base provider lists as a dropdown option. | Skip. Never built in V1. |
| **Blackbaud** | `app/api/integrations/blackbaud/data/` only — same shape as Box. | Skip. Never built in V1. |
| **YouTube** | `app/api/integrations/youtube/get-video-details/` only — a single read endpoint, no manifest, no actions. Referenced in `app/api/integrations/debug-youtube/`. | Skip. Single-endpoint fragment, not a real provider port. |
| **Gumroad** | Lives entirely in `lib/workflows/nodes/providers/misc/index.ts` (~30 declarations under `providerId: "gumroad"`). | Defer Phase 2. The location in `misc/` signals V1 itself never elevated it to a first-class provider. If product wants it, the parity audit decides the surface. |
| **ManyChat** | Same shape as Gumroad — `providerId: "manychat"` declarations inside `misc/index.ts`. | Defer Phase 2 or skip. Same reasoning as Gumroad. |
| **Google Calendar / Mail in `misc/`** | Spot-checked — none. `misc/index.ts` is gumroad + manychat only. | n/a |

The `misc/` folder is **3793 lines** of stub-grade declarations. Treat it as a "Phase 2 audit-in-place" surface — none of it ports into Phase 1.

---

## Section 6 — Should Phase 1 absorb one more provider?

The Phase 1 honest-state convention is: a provider lands with **OAuth + at least one action + at least one trigger model + an e2e walkthrough mocked at the external boundary**. That's the bar.

The audit narrows the "what's next" candidates to three:

| Candidate | Effort vs. Excel/Mailchimp | Net Phase 1 reach gained | Blocker |
|---|---|---|---|
| Google Docs | ~Sheets-sized (Q: 5 actions + 2 triggers, reuses Drive watch) | Productivity tier completion (Docs joins Drive/Sheets/Calendar) | Drive-watch generalization is a Phase 2 design call, not Phase 1. |
| Monday | ~2× Excel (24 actions; the largest unported port surface) | Project-mgmt tier breakthrough (no V2 PM provider today) | GraphQL helper layer doesn't exist; parity audit should subset first. |
| OneNote | ~Excel-sized (12 actions, 2 triggers) | Microsoft tier completion (5th delegated-user Graph provider) | Triggers require polling-registry design for a tree-resource shape. |

**Recommendation: don't absorb any more.** Reasoning:

1. **Phase 1's stated goal is "provider foundation," not "exhaustive provider coverage."** Adding a 17th provider doesn't change Phase 1's exit-condition material — UI, AI, workspaces, engine, billing all still have to happen. It pushes Marcus's push-decision later without changing the destination.
2. **Each remaining candidate has at least one design call that belongs in Phase 2.** Google Docs needs Drive-watch generalization. Monday needs a parity-audit subset + GraphQL helper. OneNote needs polling for tree-resources. Doing any of those inside Phase 1 means "smuggling a Phase 2 design into a Phase 1 slice," which violates the roadmap's one-phase-at-a-time rule.
3. **Microsoft Teams is the marginal honest provider for Phase 1.** It closes the Microsoft tier consistency story (Outlook Mail / Outlook Cal / OneDrive / Excel / Teams = 5 delegated-user Graph providers on shared Azure AD). One more provider would be tier-mixed (Google Docs reopens the Google tier; OneNote reopens Microsoft; Monday opens a new tier) — none gives Phase 1 a clean closing arc.

**Phase 1 should end after Microsoft Teams' Commits 4 + 5 land.** Phase 2 then opens with a parity-audit doc per provider and decides the next ports against V1 usage data (per the roadmap §Phase 2 ordering).

---

## Section 7 — Recap table

| Provider | V1 actions | V1 triggers | Recommendation | Why |
|---|---|---|---|---|
| Microsoft Teams | 18 | 7 | **complete in Phase 1** | In progress; closes Phase 1. |
| Google Docs | 5 | 2 | **defer Phase 2** | Strong fit; Drive-watch generalization belongs in Phase 2. |
| Discord | 5 | 3 | **defer Phase 2 / product decision** | Persistent-gateway trigger contract doesn't exist in V2. |
| OneNote | 12 | 2 | **defer Phase 2** | Polling design for tree-resources belongs in Phase 2. |
| Monday | 24 | 5 | **defer Phase 2** | Largest unported surface; parity audit should subset first. |
| Twitter / X | 0 (12 declared, all `comingSoon`) | 0 | **skip** | Never built in V1; API instability. |
| Facebook | 8 | 2 | **needs product decision** | Meta app review is a 2–6 week external dependency. |
| Google Analytics | 6 (declared; handler wiring unclear) | 0 | **skip / product decision** | Low usage in workflow tools; action-only violates Phase 1 convention. |
| Trello | 10 | 6 | **defer Phase 2** | Token-ingest auth contract extension required. |
| Dropbox | 3 (1 `comingSoon`) | 1 | **skip unless product changes** | V1 incomplete + webhook signature gap. |
| Box | 0 | 0 | **skip** | Never built. |
| Blackbaud | 0 | 0 | **skip** | Never built. |
| YouTube | 0 (single read endpoint) | 0 | **skip** | Fragment, not a provider. |
| Gumroad | ~10 (in `misc/`) | ~2 (in `misc/`) | **defer Phase 2** | Stub-tier; parity audit decides. |
| ManyChat | ~6 (in `misc/`) | ~1 (in `misc/`) | **defer Phase 2** | Same as Gumroad. |

---

## Section 8 — Answers to the audit's six questions

**1. Which V1 providers have been fully ported for Phase 1?**
Sixteen, per Section 1: Slack, Gmail, Google Calendar, Google Drive, Google Sheets, Outlook Mail, Outlook Calendar, OneDrive, Notion (actions; trigger deferred), Airtable, Stripe, Shopify, HubSpot, Mailchimp, GitHub, Microsoft Excel. Registered in `integrations/_registry.ts:57-75`.

**2. Which are currently in progress?**
One: **Microsoft Teams** (slice 16). Commits 2 + 3 landed locally; Commit 4 (webhook trigger) is in another chat; Commit 5 (e2e walkthrough) follows.

**3. Which should be deferred to Phase 2?**
Trello (auth contract), Google Docs (Drive-watch generalization), OneNote (polling tree-resource design), Monday (parity-audit subset first), Discord (websocket-trigger contract), Gumroad + ManyChat (audit in `misc/`).

**4. Which should be skipped entirely for V2 unless product direction changes?**
Dropbox (V1 rot + webhook gap), Twitter / X (never built; API instability), Box / Blackbaud / YouTube (never built; scaffold-only), Google Analytics (low usage + action-only). Facebook is **product-decision-pending** — it's not auto-skipped but it shouldn't start until Marcus commits to the Meta app-review timeline.

**5. Which remaining providers are clean enough to port in Phase 1?**
None. Each remaining candidate carries a Phase 2 design dependency (see Section 6). Architectural fit is strong for Google Docs, OneNote, and Monday, but porting any of them inside Phase 1 means smuggling Phase 2 design decisions into Phase 1 slices.

**6. Whether Phase 1 should end after Microsoft Teams, or one more provider is worth doing.**
**End Phase 1 after Microsoft Teams.** Adding a 17th provider doesn't materially advance Phase 1's exit-condition (UI / AI / workspaces / engine / billing all still gated). The marginal next provider has a Phase 2 design call inside it. Closing Phase 1 on a clean Microsoft-tier completion (5 Graph providers on shared Azure AD) is the better operational story than an asymmetric Google Docs or OneNote add-on.

---

## Section 9 — What happens after acceptance

This audit is doc-only. After Marcus accepts:

1. **Phase 1 exit checklist** opens in the roadmap:
   - Microsoft Teams Commits 4 + 5 land.
   - Trash sweep of unused slice plans + provider scaffolding (per roadmap §Phase 1 exit condition).
   - Marcus's push decision on `v2-provider-port-local`.
2. **Phase 2 entry** unblocks: per-provider parity audits land in `docs/roadmap/provider-parity/<provider>.md`. Priority order in the roadmap §Phase 2.
3. **No new provider work** until Phase 1 exits. Audit candidates in Section 4 stay parked until their parity slice opens.

The audit is revisited only if (a) Marcus rejects a recommendation here, (b) product direction shifts (Facebook / Discord / Trello), or (c) a V1-feature gate audit (per roadmap §Cross-phase concerns) surfaces a hidden dependency.
