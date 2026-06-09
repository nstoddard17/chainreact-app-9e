# V2 Replacement-Readiness Audit — Completion Map

**Type:** Audit / status report. **Docs-only. No source changes (one stale test assertion fixed
separately, see §B). Nothing pushed.**
**Date:** 2026-06-08
**Branch:** `builder-ui-v1-audit-1`
**Question answered:** *What remains before ChainReactV2 can fully replace V1 and become the app we
live-test end-to-end?*

> **Status update (2026-06-08, post-audit):** Hard blocker **D-1 (Data API GRANT backfill) is CLOSED.**
> The initial audit estimated **10** early tables missing explicit GRANTs. Hardening the GRANT lint
> found **13** missing-GRANT `CREATE` targets; one (`user_billing`) was later **dropped/superseded by
> `account_billing`**, leaving **12 live tables** — all backfilled by
> `20260619000000_backfill_data_api_grants.sql` (commit `0a6ba7efe`) and **applied to the dev DB via
> `db:push`.** `check-migration-rls.mjs` now enforces GRANT coverage (DROP-aware), so the gap can't
> recur. Mentions of "10 tables" below are kept for historical accuracy and annotated.

> **PRODUCT DECISION (2026-06-08, Marcus): live provider/connection readiness is deferred to the
> live-validation phase — it is NOT a local build blocker.** Work that *requires external provider
> setup* — live OAuth round-trips, live webhook delivery, live Stripe checkout/webhook round-trips,
> provider app-credential / redirect-URI registration, and per-provider live testing — **happens after
> the V1 → V2 switch path is ready**, not before. These items remain in the risk register below
> (§D / §E) and are **still required before full public/live validation** — they are NOT downgraded in
> importance, only **re-sequenced** out of the immediate local-readiness queue. The §D "Hard blockers"
> list is therefore retitled **"Required before full live/public validation (post-switch)."** The one
> exception: any sub-part of these that can be **proven fully locally without external provider setup**
> (e.g. *that the OAuth write path encrypts before persisting*, *that RLS predicates deny cross-account
> reads against a local Supabase*, *that webhook normalize/dedup logic is pure and idempotent*) stays
> in-scope as local readiness and is being knocked out as unit/gated-DB tests (see the security-test
> arc in §C / §F). **The next local slices are non-provider** (security hardening, product completion,
> local billing/account behavior, readiness closeout). Nothing here is pushed; V1 is untouched.

> **SWITCH UPDATE (2026-06-09):** the local V1 → V2 switch has since happened —
> **ChainReactV2 is now the active app/build target; `chainreact-app-9e` (V1) is archived reference
> only.** This was a local-only, in-place archive (no files moved, nothing pushed). Where the dated
> body below says things like "V1 is NOT being replaced in this pass" or "V1 remains the production
> path" (§A scope note, §H), read them as **point-in-time wording from the 2026-06-08 audit**: V2 is
> now the active build target, while GitHub `main` (what deploys) **still points at V1** and the
> remote/`main` promotion + live-provider validation remain **deferred (push-gated)**. Canonical
> record: [`v1-to-v2-local-switch-closeout.md`](./v1-to-v2-local-switch-closeout.md).

**Method:** 14 read-only subsystem agents mapped completion status (done / partial / missing /
needs-live-testing / unknown) against live code + tests + closeout docs; synthesized into the
roadmap below. Test baselines were measured this session (not inherited).

---

## A. Executive summary

ChainReactV2 is **feature-complete at the code level across all 12 audited subsystems** but **not
yet validated end-to-end against real providers or a live database.** The remaining gap is
**verification, not construction.** Every subsystem self-reports as a non-blocker with high
confidence; `tsc` is clean, both lint gates pass, the full Jest suite is green, and account-scoped
RLS+policy exists on every user-data table.

The single biggest gap is **live-provider / live-DB validation**: OAuth connect→refresh→revoke,
webhook delivery+dedup, polling snapshots, Stripe checkout/webhook round-trips, and RLS
cross-account isolation are all proven against **mocks only**. ~~The one concrete compliance defect is
10 early migrations missing explicit `GRANT` statements~~ → **RESOLVED** (see Status update above: 12
live tables backfilled + lint hardened). The functional item originally flagged here ("plan limits
not enforced") was **disproven on re-audit** — the gate already enforces a plan-synced cap. The real
gap was **task usage never reset by billing period (lifetime caps)**, now **RESOLVED** by lazy period
rollover (`20260620000000`). See
[plan-enforcement-and-task-period-audit.md](./account-settings/plan-enforcement-and-task-period-audit.md).

**Rough readiness: ~85% to full live-testing.** The remaining ~15% is almost entirely "run it
against real providers + real Supabase and watch it work." (The GRANT backfill and the task-period
rollover — the two non-provider items originally flagged here — are now both done.)

> Scope note: this is **pre-cutover live testing of V2 in isolation.** V1 is NOT being replaced in
> this pass, and nothing is pushed.

---

## B. Current branch / local status

| Fact | Value |
|---|---|
| Branch | `builder-ui-v1-audit-1` |
| Upstream tracking | **none** — entirely local, never pushed |
| Remote | `origin` → `Chain-React-Org/chainreact-app.git` (shared with V1; V2 lives only on this local branch) |
| Working tree | **clean** |
| Providers | 26 (+ `native`, `_shared`) |
| Migrations | 61 (latest `20260618000000_seed_official_templates.sql`) |

**Test baselines — measured this session (authoritative):**

- `tsc --noEmit` → **clean**
- `lint:structure` → **OK** (every leaf folder ≤ 50 files)
- `lint:migrations` → **OK** (RLS + ≥1 policy on every user-data table) — note: does **not** check GRANTs (see §D-1)
- Full `jest` → **16,757 passed / 16,919** (161 skipped, 37 skipped suites; 1483/1521 suites). The
  sweep initially showed **1 failure** — a stale assertion in
  `tests/unit/services/ai/apply/applyWorkflowPatch.test.ts` left over from the manual-copy slice
  (`c8ceed32d`), which only ran `saveDraftDefinition.test.ts`. Behavior was correct; the assertion
  was fixed in commit **`69bc051f3`** (the lone non-docs change in this audit pass). Suite is now
  green.
- `test:e2e` (Playwright) → **not run this session.**

**Unpushed local arc on this branch** (most recent first, abridged): docs(rules) lifecycle/webhook
fixes → manual-trigger lifecycle closeout → inert-row + manual-copy + shared-save lifecycle fixes →
folder-concern extraction + dashboard tests → templates marketplace + official templates + builder
template modal → dashboard folders/trash/bulk → account-model / team / billing foundations. Dozens
of local commits; **none pushed.**

---

## C. Completed areas

- **Account model & teams** — *complete.* Account-ownership cutover on all hot tables, team
  creation/invites/roles, credential-sharing policy (personal = creator-pinned, account = shared),
  owner transfer + leave with a ≥1-owner DB invariant, per-node credential reassignment (flag OFF).
  RLS verified in code.
- **Workflow dashboard** — *mostly-complete.* Tabs/search/filter/multi-select/bulk-actions, depth-3
  nested folders, trash + undo, server-seed + client-orchestrator pattern, real APIs only.
- **Workflow lifecycle** — *complete.* Six-state machine with exhaustive transition validation,
  transactional orchestrator with correct side-effect ordering, active-edit stale-trigger guard,
  Reactivate→Resume recovery, dispatcher drops events for disabled workflows. `publish/active_revision`
  deferred (interim guard operational).
- **Templates marketplace + portability** — *complete.* Schema + 5 official seeds, marketplace/use/
  fork routes, tier-gated, RLS membership-gated, service-role-only writes, no-leak sanitization
  verified.
- **Providers / actions / triggers (26)** — *complete.* 286 handlers with 1:1 ActionMeta parity,
  60/60 runtime triggers covered, all OAuth manifests present, options resolvers registered,
  structural invariant tests passing, all 26 builder-visible. *(Code-level completeness — runtime
  validity is the live-testing gap; see §D.)*
- **Execution engine** — *mostly-complete.* BFS ordering, strict variable pre-resolution,
  label-aware branching, test-mode gating, billing integration, run persistence with classification.
  Loops/pause/resume/HITL deferred to Phase 6/8.
- **OAuth & tokens** — *mostly-complete.* Generic dispatcher, HMAC-signed state + atomic nonce
  consume, AES-256-GCM encryption, refreshAndRetry single-flight, PKCE, account-bound connects.
  Health-signal plumbing, disconnect UX, and health-check cron are partial/deferred.
- **Webhooks & dispatch** — *mostly-complete.* Thin receipt routes for 21+ providers, canonical
  TriggerEvent contract, dispatcher with dedup + state gate + filter eval, subscription renewal +
  polling crons. Normalize-purity audit and `billingEvent.ts` contract are open items.
- **Runs / debug UX** — *complete.* Read-only account-scoped runs list, safe-column projection (no
  tokens/steps/billing leaked), source/status badges, humanized errors. No fake actions
  (Retry/Replay/Cancel correctly omitted).
- **Billing** — *mostly-complete.* Cost estimation, flat 1-task/run gate, usage ledger, plan
  metadata + limits, Stripe checkout/webhook, reserve/reconcile foundation + shadow mode (flag OFF).
  **Task-period reset** added (`20260620000000`, lazy rollover) — caps are now monthly, not lifetime.
  The "plan-enforcement" concern was disproven on re-audit (the gate already enforces a plan-synced cap).
- **Settings / notifications / API keys** — *mostly-complete.* Account settings shell, profile/
  security/danger-zone, full API-keys arc (create/reveal-once/revoke/rate-limit/attribution, flag
  OFF), in-app notifications. Email/Slack/Discord/SMS channels **scaffolded only.**
- **App catalog / onboarding / mobile** — *mostly-complete.* `/apps` catalog with search/filter/sort,
  expandable accounts, real OAuth connect, marketing homepage, app-shell + mobile drawer, DTO no-leak
  verified. Health-status pills, disconnect UI, workflow-linkage deferred.
- **Database security tests** — *mostly-complete.* RLS+policy on all 61 migrations, 17+ integration
  security tests, service-role boundary enforced. **GRANT gap RESOLVED** (`20260619000000`): 12 live
  tables backfilled with policy-matched authenticated + service_role grants; `check-migration-rls.mjs`
  now enforces GRANT coverage. **`integrations` RLS + no-cleartext-at-rest suite added** (gated DB) +
  **OAuth write-path encryption contract** (unit) + **always-on encryption-primitive no-cleartext
  guard.** Remaining: live RLS cross-account pen-test (post-switch, real Supabase).

---

## D. Remaining blockers

### Required before full live/public validation (post-switch)
*(Per the PRODUCT DECISION above: **none of these block local readiness today** — they require external
provider/Stripe/Supabase setup and are sequenced to the **live-validation phase after the V1 → V2
switch path is ready**. They remain mandatory before full public/live validation and stay in the risk
register; they are re-sequenced, not de-prioritized. Locally-provable sub-parts (encryption-before-
persist, RLS denial against a local DB, normalize purity/dedup) are split out as in-scope local tests.)*

1. ~~**GRANT backfill on 10 early migrations**~~ — **✅ DONE (`0a6ba7efe`, applied via `db:push`).**
   13 missing-GRANT tables found; `user_billing` dropped/superseded; **12 live tables** backfilled
   (`user_profiles`, `integrations`, `workflows`, `workflow_revisions`, `trigger_resources`,
   `notifications`, `workflow_files`, `workflow_runs` + the service-role-only `oauth_states`,
   `webhook_event_dedup`, `hubspot_app_subscriptions`, `hubspot_subscription_refs`).
   `check-migration-rls.mjs` now enforces GRANT coverage (DROP-aware). No longer a blocker.
2. **Live OAuth round-trip per provider** — connect → callback → token-encrypt → first action → 401
   → refresh+retry → recover. Mock-only across all 25 OAuth providers; real redirect-URI mismatches
   fail silently. **Hard. Post-switch.** *(Locally-proven sub-part — DONE: the **encryption-before-
   persist** contract of the callback **and** refresh write paths is unit-verified end-to-end —
   `tests/unit/services/oauth/dispatcher-encryption-contract.test.ts` runs the real dispatcher + real
   HubSpot handler + real `encryptToken` and asserts the repo boundary receives ciphertext that
   decrypts back to the fixtures. The live network round-trip + redirect-URI registration is the
   remaining post-switch part. Token-ingest (Trello) write-path encryption is still unproven — see §E.)*
3. **Live webhook delivery + dedup per provider** — real provider POST → signature verify → normalize
   → dispatch → run enqueued, plus retry-storm dedup. Mock-only; **no `tests/integration/webhooks/`
   exists.** **Hard.**
4. **Live Stripe checkout + billing webhook round-trip** — signature verify, event dedup,
   `account_billing.plan/plan_status` sync. Never run against a real Stripe test account. **Hard for
   any paid path.**
5. **Live RLS cross-account isolation** — a member of Team A querying Team B's integrations/workflows/
   runs must return nothing. Unit-verified predicates only; needs a real Supabase pen-test pass.
   **Hard (security).**

### Polish / soft (should land but don't block live testing *starting*)
- ~~Plan-enforcement wired into `executionBillingGate`~~ — **reframed + DONE.** Re-audit disproved the
  "not enforced" claim (gate already enforces a plan-synced cap); the real gap was **no task-period
  reset** (lifetime caps), fixed by lazy rollover (`20260620000000`).
- Health-engine signal **listener** + integration-status / reconnect UX (infra emits signals; nothing
  consumes them).
- Per-account disconnect/reconnect UI + `/api/integrations/[id]/disconnect` route.
- Invitation rate-limiting (TODO in `invitations.ts`) before any public invite UI.
- Business→Team downgrade + revert-on-cancel (designed, flag OFF; churned Business customer keeps caps).
- Outbound notification channels (email/Slack/Discord/SMS) — scaffolded, no implementations.
- ~~Plaintext-token detection lint on `integrations` encrypted columns.~~ **✅ DONE (test-based).** Gated
  DB no-cleartext-at-rest assertion (`tests/integration/security/integrations-rls.test.ts`) + an
  always-on encryption-primitive guard over 9 provider token shapes
  (`tests/unit/core/encryption/tokenNoCleartext.test.ts`). A standalone CI grep-lint over migration
  seed data was judged redundant given the test coverage; revisit only if seed fixtures grow.

---

## E. Risk register

| Risk | Severity | Area | How to verify / mitigate |
|---|---|---|---|
| ~~Migrations lack GRANTs → `42501` after Oct 30 2026~~ **RESOLVED** | ~~high~~ done | db-security | Closed by `0a6ba7efe` (`20260619000000`): 12 live tables backfilled, lint hardened (DROP-aware GRANT coverage), applied via `db:push` |
| OAuth refresh/revoke unproven against any real provider (post-switch) | high | oauth-tokens | E2E connect→action→401→refresh→retry per provider in a deployed env with real redirect-URI registration. *Locally-proven part DONE: callback+refresh write paths encrypt before persisting (`dispatcher-encryption-contract.test.ts`).* |
| Webhook delivery + dedup mock-only (no integration suite) | high | webhooks | Add `tests/integration/webhooks/<p>.test.ts`; replay same `eventId` 100× → assert 1 row + 99 drops |
| RLS cross-account isolation verified in unit only | high | account-model / db-security | Live probe: Team A user queries Team B resources; `ALLOW_DB_INTEGRATION_TESTS=true` run + manual pen-test |
| Stripe checkout/webhook never run against real Stripe | high | billing | Real Stripe test-mode round-trip; verify signature, dedup, plan/status sync |
| ~~Plan limits not enforced at run-time~~ **DISPROVEN** → real gap: **task usage never reset by billing period (lifetime caps)** **RESOLVED** | ~~med~~ done | billing | Closed by `20260620000000` (lazy period rollover in deduct/reserve); re-audit confirmed the gate already enforces a plan-synced cap |
| Churned Business customer keeps Business caps (no revert-on-cancel) | med | billing | Build Track-B downgrade flow; interim manual dashboard handling |
| Health-engine signal listener not located in codebase | med | oauth-tokens | Grep `services/` for the action-required listener; confirm deferred vs missing |
| Personal-credential soft-disconnect on member removal unverified live | med | account-model | Remove member, then attempt real Gmail/Outlook call with `disconnected_at` token → expect reject |
| Reserve/reconcile live wiring present but flag OFF (synthetic data only) | med | billing | Enable `ENABLE_RESERVE_RECONCILE_BILLING` in dev with organic runs; check ledger parity invariant |
| Polling first-poll-miss + cursor correctness unproven on live fields | med | webhooks / providers | Live poll cycle per provider; verify snapshot seeded at activation, no event dropped |
| Some `normalize` functions may not be pure (I/O) | med | webhooks | Scan every `receive.ts`/`normalize.ts` for `await`/`fetch`/`supabase` |
| ~~No plaintext-token detection on encrypted columns~~ **RESOLVED (test-based)** | ~~med~~ done | db-security | Closed: gated DB no-cleartext-at-rest assertion + always-on encryption-primitive guard (9 token shapes). See §D polish list. |
| Token-ingest (Trello) write-path encryption unproven | med | oauth-tokens | `handleTokenIngest → trelloAuth.verifyAndIngestToken → upsertActive` is a second write path into the repo; encryption-before-persist not yet unit-pinned. Deferred with the Trello live-ingest work (post-switch) per the product decision; revisit if Trello enters local scope. |
| Bulk-action fan-out partial-success undo untested | low | dashboard | Mock 50% API failure; verify undo restores only succeeded items |
| Search has no debounce; O(n) per keystroke | low | dashboard | Load 1000+ workflows; measure lag; add debounce if needed |
| API-key public-trigger source attribution unreachable in UI | low | runs / settings | Confirm public trigger route passes `triggeredBy='api_key'` |
| Concurrent folder reorder is last-write-wins | low | dashboard | Two-tab reorder; confirm no corruption (acceptable per plan) |

---

## F. Recommended next 5 local slices

1. ~~**GRANT-backfill + lint hardening**~~ — **✅ DONE (`0a6ba7efe`).** Superseded by the Status update;
   12 live tables backfilled (`20260619000000`), lint now enforces DROP-aware GRANT coverage, applied
   via `db:push`.
2. ~~**Plan-enforcement in the execution billing gate**~~ — **✅ DONE / reframed.** Re-audit disproved
   the "not enforced" premise; the genuine gap was **no task-period reset** (lifetime caps), fixed by
   lazy period rollover in the deduct/reserve RPCs (`20260620000000`, applied via `db:push`).
3. ~~**`integrations`-table RLS + no-cleartext-token test suite**~~ — **✅ DONE.** Account-membership RLS
   denial suite (member/non-member/anon, cross-account UPDATE/DELETE no-op, service-role read,
   personal/team separation) at `tests/integration/security/integrations-rls.test.ts` (gated DB) +
   no-cleartext-at-rest assertion there + always-on encryption-primitive guard
   (`tests/unit/core/encryption/tokenNoCleartext.test.ts`). The OAuth write-path encryption contract
   (`dispatcher-encryption-contract.test.ts`) landed alongside.
4. **Webhook normalize-purity** ✅ **DONE** + **dedup-idempotency local test harness (OPEN).** The
   normalize-purity half shipped: `tests/structure/webhook-normalize-purity.test.ts` (`5055e0cd3`)
   sweeps every `normalize.ts` (no `await`/`fetch`/`supabase`/impure imports/`Math.random`/`Date.now`/
   `process.env`) and pins **eventId determinism** (the dedup key never derived from a clock/RNG); it
   also caught + fixed two `Date.now()` eventId fallbacks (discord/trello) that would have broken replay
   dedup. **Still OPEN (local):** a `dispatch.ts` unit test that replays the same `(provider, eventId)`
   against mocked dedup storage → asserts 1 enqueue + N drops. *(The live signed-POST delivery half is
   post-switch.)*
5. ~~**Local billing usage visibility**~~ ✅ **DONE (`01521990f`).** Account Settings now shows
   current-period used/limit + remaining + reset date; `core/billing/taskUsagePeriod.ts` mirrors the
   SQL rollover anchor so a stale (elapsed-but-unreset) period renders effective-0, not lifetime usage.
   **Next non-provider candidates** (see Re-rank below): API-route authorization / no-service-client
   coverage, dispatch dedup-idempotency unit harness, runs/debug local polish, readiness-map closeout.
   *(Health-engine listener + reconnect UI is **provider-adjacent** → live-validation phase.)*

---

## F.1 Re-rank (2026-06-09) — local-only priorities after the recent arc

Eight readiness items have closed or reclassified since the original audit (GRANT backfill, migration
lint, task-period rollover, billing usage visibility, integrations RLS + no-cleartext, OAuth
encryption contract, normalize purity, live-provider re-sequencing). Current **local-only** standing:

**Still local build-readiness (in priority order):**
1. **API-route authorization / no-raw-service-client coverage** — verify every mutating `app/api/**`
   route enforces membership/role and routes writes through scoped helpers (not raw service clients).
   Highest-sensitivity untested surface; 90 route tests exist but the *guard* (a structural sweep) and
   the gap audit don't. Local, security-adjacent, test-led.
2. **Dispatch dedup-idempotency unit harness** — the open half of item #4: replay `(provider, eventId)`
   through `services/triggers/dispatch.ts` against mocked `webhookEventDedup` → 1 enqueue + N drops,
   plus the dedup-outage fail-open path. Local, pins an idempotency invariant without any provider.
3. **Runs/debug UX local polish OR readiness-map closeout** — smaller; pick if 1–2 are deferred.

**Post-switch / live-validation (deferred, still mandatory before public launch):** live OAuth
round-trips, live webhook delivery, live Stripe round-trip, live RLS cross-account pen-test, provider
credential/redirect-URI setup, per-provider live testing, health-engine listener + reconnect UI
(provider-adjacent).

**Deferred long-term architecture (do NOT start):** `publish`/`active_revision` versioning,
loops/pause-resume/HITL/`wait_for_event`, reserve/reconcile live cutover (flag OFF), outbound
notification channels, non-Anthropic AI routing at scale.

---

## G. What "ready for full live testing" should mean

Full live testing may begin when **all** of the following hold:

- [x] **Full Jest sweep green** — 16,757/16,919 this session (`69bc051f3` fixed the lone stale assertion).
- [x] `tsc` clean, `lint:structure` OK, `lint:migrations` OK.
- [x] **GRANTs present on all live tables**, and the migration lint verifies GRANT coverage (DROP-aware) — `20260619000000` / `0a6ba7efe`.
- [ ] **A real Supabase instance** provisioned with all 61 migrations applied (confirm none unapplied per environment).
- [ ] **≥1 real OAuth round-trip per OAuth provider**: connect → callback → encrypted token stored →
  action fires → 401 triggers refresh-and-retry (refreshable) or `action_required` (non-refreshable).
- [ ] **≥1 real webhook delivery per webhook provider**: signed POST → verify → normalize → dispatch →
  run enqueued; replayed event deduped.
- [ ] **One full lifecycle loop** on live DB: draft → activate → run → pause → resume → disable →
  eligible_to_resume → resume.
- [ ] **RLS cross-account isolation** confirmed by live probe (Team A cannot read Team B).
- [ ] **Stripe checkout + billing webhook** round-trip in test mode syncs `account_billing.plan/plan_status`.
- [ ] **Feature-flag state recorded** for the run (`ENABLE_PUBLIC_API_KEYS`, `ENABLE_PERSONAL_PRO`,
  `ENABLE_RESERVE_RECONCILE_BILLING`, `ENABLE_BUSINESS_DOWNGRADE`,
  `ENABLE_NODE_CREDENTIAL_REASSIGNMENT` — all default OFF; flip deliberately and document).
- [ ] **Runtime no-leak spot-check**: runs list, apps DTO, marketplace DTO, notification payloads
  contain no tokens/hashes/emails/provider-labels/account-ids.
- [ ] **Playwright e2e** run and recorded (not run this session).

---

## H. What NOT to touch yet

**Deferred by design — do not implement now:**
- **`publish` / `active_revision` versioning** — explicitly deferred; the active-edit stale-trigger
  deactivation is the operational interim guard. Activating a V2 workflow does not require publish;
  `activeRevisionId` may stay null. Leave the forward-declared columns alone.
- **Loops / pause-resume / durable delay / HITL / `wait_for_event`** — Phase 6/8. The engine's
  visited-set cycle termination is intentional; do not add loop primitives.
- **Reserve/reconcile live cutover** — keep `ENABLE_RESERVE_RECONCILE_BILLING` OFF; gather shadow data first.
- **Outbound notification channels** (email/Slack/Discord/SMS) — in-app-only is the current contract.
- **AI provider routing to non-Anthropic models at scale** — OpenAI planner is flag-gated; Sonnet is
  the validated default.

**Stable — do not refactor without cause:**
- Auth store / `getAuthHeader` / `onAuthStateChange` synchronous-callback invariant + singleton browser
  client (the PR-AUTH-1..7 arc).
- `FlowEdges.tsx` edge-alignment fallback (DO-NOT-CHANGE zone).
- The 26-provider handler↔meta 1:1 parity + structural invariant tests (the safety net).
- The runs-page safe-column projection and DTO no-leak contracts.

**Process — do not do yet:**
- **Do not push, do not open a PR.** `builder-ui-v1-audit-1` is local/unpushed, working tree clean.
  Keep it that way until explicitly asked.
- **Do not replace V1.** This pass is V2 readiness assessment only; V1 remains the production path.
- **Do not add new responsibilities to the V1 execution engine** — all net-new work goes on V2.

---

## Honesty / confidence notes

- This map is **code-and-test grounded** (live code + the full Jest suite + lint/typecheck), not just
  closeout prose. Where a subsystem is marked *complete*, it means **code + mocked tests** are
  complete — runtime validity against real providers/DB is the explicit gap (§D).
- "Providers complete (26)" is a **code-completeness** claim (handlers ↔ meta parity, manifests
  present). It does **not** assert any provider has been exercised against its live API.
- Items marked *unknown* in the raw findings (e.g. exact location of the health-engine listener,
  normalize purity across all providers) are folded into the risk register with a verification step
  rather than asserted either way.
