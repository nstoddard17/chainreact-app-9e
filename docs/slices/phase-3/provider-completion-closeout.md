# Provider-Completion Closeout — Phase 2-to-Marcus-Standard Audit

**Slice:** 3.PROVIDER-COMPLETION-CLOSEOUT
**Type:** Doc-only closeout / completion verification + planning. **No source, runtime, resolver, or metadata files were modified.**
**Date:** 2026-05-25
**Branch:** `v2-provider-port-local`
**HEAD at authoring:** `4db26d0af` (GOOGLE-ANALYTICS-4 — the final provider-arc commit)

This document confirms that the revived provider-completion work meets Marcus's "Phase 2 to my standards" bar. It is a verification and planning artifact, not implementation work. Every count, commit hash, and invariant claim below was checked against the working tree and `git log` at authoring time; nothing is inferred or invented.

---

## 1. Scope and standard

The revived provider-completion effort raised the completeness bar from the original Phase 2 closeout. Phase 2 had deferred several V1 providers from V2 with the explicit acceptance that a later audit would decide which were worth shipping. Marcus then updated the product direction (recorded in [`missing-providers-status.md`](./missing-providers-status.md)): this was a **product-direction update, not a correction** — Phase 2 shipped exactly what was accepted at the time; the owner raised the bar afterward.

Marcus's final provider-completion standard:

- **Do not ship partial provider surfaces just to prove a provider works.** A provider is not "done" because one action runs end-to-end.
- **For each provider, ship every action/trigger that reasonably belongs in V2 before moving to the next provider.** Complete one provider, then advance — no breadth-first sprinkling.
- **Only defer or reject with a real, V2-native rationale** rooted in product, architecture, API capability, security, FileRef/file-handling contract, UX, or external dependency. "It's hard" is not a rationale; "the platform has no clean primitive for it" is.
- **Do not copy V1 blindly. Do not reject V1 blindly.** Each V1 behavior is evaluated as **COPY / ADAPT / REPLACE / DEFER / REJECT** against the V2 contracts (action/trigger meta, options resolvers, FileRef, sensitive-output, strict variable resolution).

Each provider followed the now-standard arc that emerged from the HubSpot / Mailchimp / Discord work:

| Slice | Purpose |
| --- | --- |
| `<PROVIDER>-1` | Audit + scope plan (doc-only) |
| `<PROVIDER>-2` | Runtime port (manifest, OAuth, action handlers, schemas, shared API helpers, handler-registry wiring, tests) |
| `<PROVIDER>-3` | OptionsSource resolvers (resolver-first) |
| `<PROVIDER>-4` | Action metas + `COVERED_PROVIDERS` flip |
| `<PROVIDER>-N-triggers` | Webhook / polling trigger metas, once the trigger-architecture decision is settled (optional per provider) |
| `<PROVIDER>-NA` | Registry-footprint trim back under the `max-lines` cap, where the meta wiring pushed a registry over 400 lines |

---

## 2. Provider-by-provider status table

All counts below are verified against the working tree:
- Action metas: `integrations/<provider>/actions/*.meta.ts`
- Trigger metas: `integrations/<provider>/triggers/**/*.meta.ts`
- Resolvers: imports in `services/options/_registry.ts`
- COVERED: membership in `COVERED_PROVIDERS` (`tests/structure/discovery-meta-coverage.test.ts`)

| Provider | Actions | Resolvers | Triggers | ActionMeta | TriggerMeta | COVERED | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Discord | 5 | 6 | 2 (+1 deferred) | ✅ | ✅ | ✅ | Complete to V2 standard with named hard blocker (`member_join`) |
| Google Docs | 5 | 2 | 2 | ✅ | ✅ | ✅ | Complete |
| OneNote | 12 | 3 | 2 | ✅ | ✅ | ✅ | Complete |
| Monday | 24 | 7 | 5 | ✅ | ✅ | ✅ | Complete |
| Dropbox | 11 | 2 | 1 | ✅ | ✅ | ✅ | Complete |
| Facebook | 8 | 4 | 2 | ✅ | ✅ | ✅ | Complete |
| Google Analytics | 6 | 4 | 0 (by design) | ✅ | n/a | ✅ | Complete — intentional actions-only provider |
| ManyChat | — | — | — | — | — | — | Skipped (explicit product decision) |
| Twitter / X | — | — | — | — | — | — | Skipped (explicit product decision) |

### Discord
- **Actions (5):** `send_message`, `edit_message`, `delete_message`, `fetch_messages`, `assign_role`.
- **Resolvers (6):** `guilds`, `channels`, `roles`, `members`, `messages`, `botMessages`.
- **ActionMeta:** 5/5 — `integrations/discord/actions/*.meta.ts`. 1:1 handler↔meta enforced.
- **Triggers shipped (2):**
  - `slash_command` — **webhook** trigger via Discord's Interactions Endpoint URL (Ed25519-signed HTTP POST). Not a gateway dependency; V1 also served slash commands over HTTP. Activation registers one guild-scoped command (`POST /applications/{app_id}/guilds/{guild_id}/commands`); deactivation deletes it.
  - `new_message` — **polling** trigger over `GET /channels/{id}/messages?after={id}` at ~5-min cadence. Trades V1's sub-second latency for shipping without gateway infrastructure.
- **Deferred:** `member_join`.
- **Reason (hard architectural blocker):** Discord's REST `GET /guilds/{id}/members` sorts by user id, not join time; the audit log doesn't record joins; Application/Event Webhooks don't cover `GUILD_MEMBER_ADD`. A reliable join feed requires persistent gateway-worker infrastructure (or a Discord API change). Tracked as `DISCORD-N-member-join` with named revisit conditions (V2 ships gateway-worker infra at the Phase level, OR Discord adds `GUILD_MEMBER_ADD` to Event Webhooks, OR Discord adds a join-time-indexed REST endpoint). See [`discord-trigger-architecture-plan.md`](./discord-trigger-architecture-plan.md).
- **Status:** Complete to V2 standard with a named hard blocker. The deferral is product/architecture-justified, not a gap.

### Google Docs
- **Actions (5):** `create_document`, `update_document`, `share_document`, `get_document`, `export_document`.
- **Resolvers (2):** `google-docs:documents` (under `integrations/google-docs/options/`) + a shared `google-drive:folders` resolver (placed under the `google-drive` namespace for cross-product reuse by share/export targets).
- **ActionMeta / TriggerMeta:** present and registered.
- **Triggers (2):** `new_document` + `document_updated`, both implemented via Google Drive's `files.watch` push channel filtered by the Docs mimeType (Docs has no native trigger surface).
- **COVERED_PROVIDERS:** ✅.
- **Status:** Complete.

### OneNote
- **Actions (12):** `create_page`, `update_page`, `copy_page`, `get_page_content`, `list_pages`, `delete_page`, `create_section`, `list_sections`, `get_section_details`, `create_notebook`, `list_notebooks`, `get_notebook_details`.
- **Resolvers (3):** `notebooks`, `sections`, `pages`.
- **Triggers (2):** `new_note` + `updated_note`, both **polling** (Microsoft Graph deprecated OneNote subscriptions in May 2023 — no webhook option exists; manifest `capabilities.webhookTrigger` is permanently `false`). Built on the shared Excel-style polling-trigger infrastructure.
- **ActionMeta / TriggerMeta / COVERED_PROVIDERS:** ✅.
- **Status:** Complete.

### Monday
- **Actions (24):** full surface (10 core in MONDAY-2; remaining 14 in MONDAY-4).
- **Resolvers (7):** `boards`, `groups`, `columns`, `items`, `fileColumns`, `users`, `itemFiles`.
- **Triggers (5):** `new_item`, `column_changed`, `item_moved`, `new_subitem`, `new_update` — webhook triggers via Monday's `create_webhook` lifecycle.
- **ActionMeta / TriggerMeta / COVERED_PROVIDERS:** ✅.
- **Note:** The interim 10/14 action split was corrected — all 24 actions shipped before the COVERED flip.
- **Status:** Complete.

### Dropbox
- **Actions (11):** `upload_file`, `download_file`, `get_file_metadata`, `list_folder`, `search_files`, `create_folder`, `move_file`, `copy_file`, `delete_file`, `create_shared_link`, `get_temporary_link`.
- **Resolvers (2):** `folders`, `files`.
- **Triggers (1):** `new_file` — app-level webhook + per-account cursor reconciliation (deliberately NOT the per-workflow `create_webhook` pattern).
- **ActionMeta / TriggerMeta / COVERED_PROVIDERS:** ✅.
- **Follow-up (polish, not blocker):** root-level file-picker cascade UX gap.
- **Status:** Complete.

### Facebook
- **Actions (8):** `create_post`, `update_post`, `comment_on_post`, `upload_photo`, `upload_video`, `get_page_insights`, `send_message`, `delete_post`.
- **Resolvers (4):** `pages`, `posts`, `albums`, `conversations`.
- **Triggers (2):** `new_post` + `new_comment` — Page webhook triggers via Facebook's app-level webhook + per-page `subscribed_apps` activation.
- **ActionMeta / TriggerMeta / COVERED_PROVIDERS:** ✅.
- **Internal launch note:** Meta App Review / Advanced Access is an internal launch-readiness gate, **not** customer-facing copy.
- **Status:** Complete.

### Google Analytics
- **Actions (6):** `run_report`, `run_pivot_report`, `get_realtime_data`, `find_conversion`, `send_event`, `create_conversion_event`.
- **Resolvers (4):** `accounts`, `properties`, `dataStreams`, `conversionEvents`.
- **Triggers (0) — by design.** GA4 lacks a clean push/webhook model for the accepted surface, and a polling metric-threshold trigger is fragile (processing latency, backfills, snapshot/dedup ambiguity). No weak trigger was invented to match a count (decision D-GA3). Manifest `capabilities.webhookTrigger` / `pollingTrigger` stay `false`.
- **ActionMeta / COVERED_PROVIDERS:** ✅. The discovery sub-registry exports only `GOOGLE_ANALYTICS_ACTION_METAS` (no trigger array), wired into `services/discovery/_registry.ts`.
- **Excluded actions:** `create_measurement_secret` + `get_user_activity` are intentionally not implemented (D-GA1 audit) — no handler, correctly no meta.
- **`send_event.apiSecret`:** required config, sensitive INPUT, **never** an output and never leaked. The FieldMeta contract has no password/secret field type, so it's currently a `text` field with a secret-oriented description (accepted for now).
- **Internal launch note:** Google OAuth verification for `analytics.edit` is an internal launch-readiness gate, **not** customer-facing copy.
- **Status:** Complete as an intentional actions-only provider.

### ManyChat / Twitter (X)
- **Skipped by explicit Marcus product decision.** Not gaps — out of scope by owner decision, recorded in [`missing-providers-status.md`](./missing-providers-status.md) §"Out-of-scope (explicit)".

---

## 3. Commit chain summary

Hashes taken directly from `git log` on `v2-provider-port-local` (authoritative). Where a provider's `missing-providers-status.md` per-provider note was not back-filled, the hashes here are the canonical record.

### Discord (DISCORD-1 → DISCORD-7)
| Slice | Commit | Summary |
| --- | --- | --- |
| DISCORD-1 | `4205697c8` | audit discord surface + plan provider port |
| DISCORD-2 | `c0aace04b` | runtime port (5 actions only) |
| DISCORD-3 | `b04224574` | options resolvers (6) |
| DISCORD-4 | `6eafedb31` | action metadata + COVERED flip |
| DISCORD-4A | `36c4133d4` | registry footprint trim under max-lines cap |
| DISCORD-5 | `4d9a9df11` | trigger architecture decision + per-trigger plan |
| DISCORD-6 | `21b8753b5` | `slash_command` webhook trigger |
| DISCORD-7 | `04926c81a` | `new_message` polling trigger |

### Google Docs (GDOCS-1 → GDOCS-5)
| Slice | Commit | Summary |
| --- | --- | --- |
| GDOCS-1 | `54149be11` | audit google docs surface + plan provider port |
| GDOCS-2 | `9029712eb` | runtime port (actions only) |
| GDOCS-3 | `1eae32aa1` | google docs + drive options resolvers |
| GDOCS-4 | `2294e3bae` | action metadata + COVERED flip |
| GDOCS-4A | `1683b93c3` | registry footprint trim under 400 lines |
| GDOCS-5 | `a8c1f8a63` | drive-watch triggers |

### OneNote (ONENOTE-1 → ONENOTE-5)
| Slice | Commit | Summary |
| --- | --- | --- |
| ONENOTE-1 | `06f0c05ae` | audit onenote surface + plan provider port |
| ONENOTE-2 | `6a5e36d10` | runtime port (actions only) |
| ONENOTE-3 | `29adf0385` | options resolvers |
| ONENOTE-4 | `36d273169` | action metadata + COVERED flip |
| ONENOTE-4A | `ecdd58767` | registry footprint trim under 400 lines |
| ONENOTE-5 | `65d3959ac` | polling triggers |

### Monday (MONDAY-1 → MONDAY-7)
| Slice | Commit | Summary |
| --- | --- | --- |
| MONDAY-1 | `308b49ca7` | audit monday.com surface + plan provider port |
| MONDAY-2 | `a5756f6d1` | runtime port — 10 actions, no triggers |
| MONDAY-3 | `ea8598015` | 6 options resolvers |
| MONDAY-4 | `213cd3f6c` | remaining 14 actions (full 24-action surface) |
| MONDAY-5 | `2b5f3cb36` | resolver-gap audit + domain-subfolder prep (7th resolver) |
| MONDAY-6 | `3d871e74a` | action metadata (24) + COVERED flip |
| MONDAY-7 | `32a655ab3` | webhook triggers (5) + webhookTrigger flip |

### Dropbox (DROPBOX-1 → DROPBOX-5)
| Slice | Commit | Summary |
| --- | --- | --- |
| DROPBOX-1 | `8ea821347` | audit + V2-native port plan |
| DROPBOX-2 | `3933681fc` | runtime port — 11 actions |
| DROPBOX-3 | `4d3383cc6` | options resolvers (folders, files) |
| DROPBOX-4 | `05919f95d` | action metadata (11) + COVERED flip |
| DROPBOX-5 | `55919d34c` | `new_file` webhook trigger + webhookTrigger flip |

### Facebook (FACEBOOK-1 → FACEBOOK-5)
| Slice | Commit | Summary |
| --- | --- | --- |
| FACEBOOK-1 | `6c25df205` | audit + V2-native port plan |
| FACEBOOK-2 | `65f0a09cf` | runtime port — 8 Pages actions |
| FACEBOOK-3 | `73b10a711` | options resolvers (pages, posts, albums, conversations) |
| FACEBOOK-4 | `aaebdb027` | action metadata (8) + COVERED flip |
| FACEBOOK-5 | `a33c5e375` | page webhook triggers (`new_post`, `new_comment`) |

### Google Analytics (GOOGLE-ANALYTICS-1 → GOOGLE-ANALYTICS-4)
| Slice | Commit | Summary |
| --- | --- | --- |
| GOOGLE-ANALYTICS-1 | `05d3c5ede` | audit + V2-native port plan |
| GOOGLE-ANALYTICS-2 | `7e908fdcf` | runtime port — 6 actions |
| GOOGLE-ANALYTICS-3 | `6504b521a` | options resolvers (4) |
| GOOGLE-ANALYTICS-4 | `4db26d0af` | action metadata (6) + COVERED flip |

> For any pre-arc setup commits not tagged with a slice id, see `git log` for the full chain.

---

## 4. Coverage verification

All invariant claims were re-run at authoring time, not assumed.

- **Each completed provider is in `COVERED_PROVIDERS` where appropriate.** The full set (`tests/structure/discovery-meta-coverage.test.ts`): `native`, `github`, `gmail`, `microsoft-outlook`, `slack`, `notion`, `stripe`, `google-sheets`, `hubspot`, `mailchimp`, `discord`, `google-docs`, `microsoft-onenote`, `monday`, `dropbox`, `facebook`, `google-analytics`. All 7 revived providers are present.
- **Handler↔ActionMeta parity is enforced.** For every provider in `COVERED_PROVIDERS`, the structural test asserts a 1:1 mapping between registered runtime handlers and action metas — drift in either direction fails. This is what makes "all actions shipped" structurally true rather than asserted by hand.
- **TriggerMeta activation invariant passes for shipped triggers.** `tests/structure/trigger-meta-activation-invariant.test.ts` pins each registered trigger meta to a valid activation registration (webhook / polling). Discord (2), Google Docs (2), OneNote (2), Monday (5), Dropbox (1), Facebook (2) all satisfy it; GA registers no triggers (none expected).
- **Sensitive-output coverage passes.** `tests/structure/sensitive-output-coverage.test.ts` confirms sensitive outputs are flagged/redacted; GA's `send_event.apiSecret` is verified as input-only and absent from the action's `outputs`.
- **Provider routes expose the expected action/trigger counts.** Routes read from the discovery registry: `app/api/providers/route.ts` (lists providers with `hasMetadata`), `app/api/providers/[id]/actions/route.ts`, `app/api/providers/[id]/triggers/route.ts`. GA was verified to return 6 actions / 0 triggers with `hasMetadata: true`; the same registry path serves every covered provider.
- **No broad exemptions were introduced to hide gaps.** The coverage test maintains an explicit allow-list (`COVERED_PROVIDERS`) rather than a blanket skip; trigger coverage is intentionally not gated by the meta-coverage test (precedent set by Stripe), so actions-only providers are an explicit, documented choice — not a silenced failure.

**Result at authoring time:** the three structure invariant suites — `discovery-meta-coverage`, `trigger-meta-activation-invariant`, `sensitive-output-coverage` — pass (3 suites, 9 tests, 0 failures).

---

## 5. Customer-facing copy guardrails

Two providers carry internal launch-readiness gates that MUST NOT leak into external-user-facing copy:

- **Facebook — Meta App Review / Advanced Access.** This is an operator/launch gate, not customer copy. Action and trigger metadata expose no App-Review caveat to end users. Builder copy must continue to describe Facebook as a normal provider.
- **Google Analytics — Google OAuth verification for sensitive scope (`analytics.edit`).** This is an operator/launch gate, not customer copy. GA action metadata exposes no verification/sensitive-scope caveat to end users.

**Rule:** these caveats live only in internal launch-readiness / operator documentation (this doc and the per-provider plans). The product should appear production-ready to external users only **after** the corresponding gate is resolved. Surfacing an internal gate in user-facing builder copy is a regression.

---

## 6. Remaining non-blocking follow-ups

None of these block the "complete to standard" determination. They are tracked polish / future-conditional items.

- **Discord `member_join` hard blocker** — `DISCORD-N-member-join`. Revisit when any of: V2 ships gateway-worker infrastructure (Phase-level), Discord adds `GUILD_MEMBER_ADD` to Event Webhooks, or Discord adds a join-time-indexed REST endpoint.
- **Discord production operator burdens** (tracked in `missing-providers-status.md`): bot install permission scopes; the `MESSAGE_CONTENT` privileged intent required for `new_message` `content` to populate; slash-command options/argument builder UI; `channelName`/`guildName` plumb-through on `new_message`.
- **Dropbox root-level file-picker cascade** — UX polish gap, not a functional gap.
- **Facebook `albums` resolver currently unconsumed** — registered (`services/options/_registry.ts`) but no action FieldMeta references it yet; it lights up once `upload_photo` gains `albumId` support.
- **Google Analytics dynamic per-property metric/dimension metadata resolver** — deferred; current metas use static metric/dimension entry.
- **FieldMeta password/secret field type** — a future contract addition would improve `send_event.apiSecret` UX (today a `text` field with a secret-oriented description).
- **Registry `max-lines` warnings** — `services/discovery/_registry.ts` (411 effective lines) and `services/execution/handlers/_registry.ts` (615 effective lines) both exceed the 400-line `max-lines` **warn** threshold (`eslint.config.mjs`, counted with `skipBlankLines`/`skipComments`). These are warnings, not lint errors (eslint reports 0 errors); resolving them is a broader registry-extraction cleanup, not GA- or provider-specific. The per-provider `-4A` trims kept the discovery registry under the cap at the time; cumulative provider growth has pushed it back over. (`services/execution/engine.ts`, 444 lines, also warns — same broader-cleanup bucket, unrelated to providers.)
- Provider-specific polish items already recorded in each `<provider>-metadata-plan.md` and the relevant `-outcomes` docs.

---

## 7. Launch readiness checklist (internal / operator)

Concise pre-public-launch checklist. Items here are operator responsibilities, not engineering gaps.

- [ ] Configure provider env vars (OAuth client id/secret, signing secrets, app ids) for all 7 providers.
- [ ] Confirm OAuth app settings + redirect URIs per provider.
- [ ] **Complete Meta App Review / Advanced Access before Facebook public launch.**
- [ ] **Complete Google OAuth verification for sensitive scopes (`analytics.edit`) before GA public launch.**
- [ ] Configure Dropbox App Console webhook endpoint (app-level webhook + cursor reconciliation).
- [ ] Configure Facebook webhook verify token + callback URL; subscribe pages via `subscribed_apps`.
- [ ] Confirm Monday webhook / request-signing setup.
- [ ] Confirm Discord app/bot permissions + Interactions Endpoint URL; enable `MESSAGE_CONTENT` privileged intent for `new_message`.
- [ ] Confirm Google Drive/Docs `files.watch` env + webhook routes (channel registration + renewal).
- [ ] Run the full test suite.
- [ ] Run provider-route smoke checks (`/api/providers`, `/api/providers/<id>/actions`, `/api/providers/<id>/triggers`) per provider.
- [ ] Run a Workflow Builder smoke test per provider (pick provider → action → resolver-backed field → save).

---

## 8. Recommendation

**Yes — provider-completion is complete to Marcus's Phase-2-to-my-standard bar for the intended provider set.**

All seven revived providers (Discord, Google Docs, OneNote, Monday, Dropbox, Facebook, Google Analytics) shipped their full V2-appropriate surface — runtime actions → options resolvers → action metas → `COVERED_PROVIDERS` flip, plus triggers where a V2-native trigger architecture exists. ManyChat and Twitter/X are excluded by explicit product decision, not by omission. The only deferrals are:

- **Discord `member_join`** — a named hard architectural blocker with concrete revisit conditions.
- **Google Analytics triggers** — an intentional actions-only design (no clean push model; no fragile invented trigger).

Everything else on the open list is polish or future-conditional, and the two internal launch-readiness gates (Facebook App Review, GA OAuth verification) are operator items that are correctly kept out of customer-facing copy.

Structural invariants (handler↔meta parity, trigger activation, sensitive-output coverage) pass and are enforced going forward, so the completeness state is regression-protected rather than point-in-time.
