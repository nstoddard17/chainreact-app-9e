# Phase 2 — Final Closeout

**Slice:** 3.PHASE-2-FINAL-CLOSEOUT
**Type:** Doc-only umbrella checkpoint. **No runtime/source/test/metadata files modified.**
**Date:** 2026-05-25
**Branch:** `v2-provider-port-local`
**HEAD at authoring:** `68d352267` (NATIVE-NODES-1 audit)

> **⚠️ Scope clarification — added 2026-05-25 (Slice 4.PROVIDER-DOCS-1; accepted by Marcus).** The completion claims below are accurate **for their stated scope** (runtime/parity + the revived-provider queue + native nodes) and are **not retracted**. They do **not** mean all 26 providers are Builder-ready. Corrected status: *provider runtime is essentially complete across 26 providers, but provider metadata/builder launch readiness still has a 9-provider gap.* Nine launch-scope providers are runtime-present but builder-metadata-incomplete (`hasMetadata:false` → "coming soon"): `microsoft-excel, airtable, shopify, trello, microsoft-onedrive, microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar`. Tracked in [`../phase-4/provider-metadata-launch-gap-tracker.md`](../phase-4/provider-metadata-launch-gap-tracker.md). Do not call the provider foundation "fully complete / launch-ready" until those 9 are covered or product-deferred.

This is the umbrella closeout that ties together the two accepted Phase 2 completion artifacts so the project can move cleanly into its next major focus area. It adds no new findings — it ratifies the evidence already accepted in the provider-completion closeout and the native-nodes audit.

---

## 1. Final status

**Phase 2 is complete to Marcus's current standard.**

- **Provider-completion is complete** for the intended provider set (the revived completion queue), excluding the two providers Marcus explicitly chose not to pursue.
- **Native / built-in node completion is complete** for everything in Phase 2 scope.
- Everything still open is one of: a **named hard blocker**, an **accepted standing deferral** (Phase 5 / 6 / 8 or pending product signal), an **internal launch-readiness gate** (operator/setup, not customer-facing), or **non-blocking polish**.

No partial provider surfaces and no half-built native nodes remain. Both completion claims are regression-protected by the structural test suite (`discovery-meta-coverage`, `trigger-meta-activation-invariant`, `sensitive-output-coverage`) via `COVERED_PROVIDERS`, not asserted point-in-time.

---

## 2. Evidence

- **Providers:** [`docs/slices/phase-3/provider-completion-closeout.md`](./provider-completion-closeout.md) — accepted at commit `e32ade018`.
- **Native nodes:** [`docs/slices/phase-3/native-nodes-completion-audit.md`](./native-nodes-completion-audit.md) — accepted at commit `68d352267`.

Both were verified against the working tree and `git log` at authoring, with the relevant unit / integration / structure suites re-run green.

---

## 3. Provider summary

The revived provider-completion queue shipped each provider to the V2 standard (runtime actions → options resolvers → action metas → `COVERED_PROVIDERS` flip, plus triggers where a V2-native trigger architecture exists):

| Provider | Actions | Resolvers | Triggers | Status |
|---|---|---|---|---|
| Discord | 5 | 6 | 2 (+1 deferred) | Complete + named hard blocker (`member_join`) |
| Google Docs | 5 | 2 | 2 | Complete |
| OneNote | 12 | 3 | 2 | Complete |
| Monday | 24 | 7 | 5 | Complete |
| Dropbox | 11 | 2 | 1 | Complete |
| Facebook | 8 | 4 | 2 | Complete |
| Google Analytics | 6 | 4 | 0 (by design) | Complete — intentional actions-only |

**Explicit product decisions:**
- **ManyChat — skipped.**
- **Twitter / X — skipped.**

Full per-provider detail, commit chains, and coverage verification live in the provider-completion closeout (§2).

---

## 4. Native node summary

The native / built-in surface is complete for Phase 2 scope:

- **5 native actions** complete: `http_request` (+ `httpRequestEgress` request-side hardening), `format_transformer`, `delay`, `if_then_condition`, `router`.
- **2 native triggers** complete: `manual.run` (run-now API) and `schedule.fired` (cron orchestrator + native activation registry).
- Every shipped native node has **runtime + strict schema + ActionMeta/TriggerMeta + builder field renderer + execution wiring + risk/sensitive flags + (triggers) tested activation**, with **drift protection** via `native` in `COVERED_PROVIDERS`.
- **`http_request` structured auth editor is optional UX polish only** — auth already works through the `headers` key-value field, and the schema/handler fully support bearer/basic/apiKey.

Full inventory, per-node completeness table, and test totals (405 native unit + 5 builder integration + 3 e2e) live in the native-nodes audit (§2).

---

## 5. Remaining non-blocking items

None block the Phase 2 completion claim.

**Named hard blocker / by-design:**
- **Discord `member_join`** — deferred with a hard architectural blocker (no join-time-indexed REST endpoint; audit log doesn't record joins; Event Webhooks don't cover `GUILD_MEMBER_ADD`). Tracked as `DISCORD-N-member-join` with named revisit conditions.
- **Google Analytics triggers** — intentionally not shipped (GA4 has no clean push/webhook model; a polling metric-threshold trigger is fragile). Actions-only by design.

**Polish / follow-up:**
- Dropbox root-level file-picker cascade UX gap.
- Facebook `albums` resolver currently unconsumed (lights up once `upload_photo` gains `albumId` support).
- Google Analytics dynamic per-property metric/dimension resolver.
- A future FieldMeta secret/password field type (would improve `send_event.apiSecret` + `http_request` auth UX).
- `http_request` structured auth builder editor (header-only today).
- Registry `max-lines` cleanup — `services/discovery/_registry.ts` (~411) and `services/execution/handlers/_registry.ts` (~615) exceed the 400-line `max-lines` warn cap (warnings, not errors); broader registry-extraction cleanup.

**Internal launch-readiness gates (operator items — NOT customer-facing copy):**
- Complete **Meta App Review / Advanced Access** before Facebook public launch.
- Complete **Google OAuth verification for GA sensitive scopes** (`analytics.edit`) before public launch.
- Provider env var / OAuth app / webhook / operator setup per the provider-completion closeout's launch-readiness checklist (§7 there).

---

## 6. Next recommended major focus areas

Listed for planning only — **no implementation is started by this doc.** Sequencing is a separate decision.

- **AI architecture / React Agent planning** — the AI cluster (`ai_agent` + sub-actions, `tavily_search`) is Phase 5 territory; design before build.
- **Workflow execution data-flow correctness tests between nodes** — broaden coverage of multi-node variable threading, branch-conditional flow, and trigger-payload propagation.
- **Teams / organizations / workspaces design review.**
- **Billing / tasks / tier enforcement.**
- **Templates system** (gallery / import path).
- **Custom actions / custom nodes.**
- **Registry cleanup** (the `max-lines` extraction work above, generalized).
- **Phase 6 durable-runtime items** — `loop`, `wait_for_event`, durable/unbounded `delay`, pause/resume, durable queue.

---

## 7. Acceptance statement

**Phase 2 is complete to Marcus's current standard.**

**Do not reopen provider / native-node completion unless a regression or an explicit product decision changes the scope.**
