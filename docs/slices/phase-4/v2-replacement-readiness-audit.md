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
- **Database security tests** — *mostly-complete.* RLS+policy on all 61 migrations, 16 integration
  security tests, service-role boundary enforced. **GRANT gap RESOLVED** (`20260619000000`): 12 live
  tables backfilled with policy-matched authenticated + service_role grants; `check-migration-rls.mjs`
  now enforces GRANT coverage. Remaining: live RLS cross-account pen-test + no-cleartext-token scan.

---

## D. Remaining blockers

### Hard blockers before *trustworthy* end-to-end live testing
*(None block local testing today; all block a credible live-cutover dry-run.)*

1. ~~**GRANT backfill on 10 early migrations**~~ — **✅ DONE (`0a6ba7efe`, applied via `db:push`).**
   13 missing-GRANT tables found; `user_billing` dropped/superseded; **12 live tables** backfilled
   (`user_profiles`, `integrations`, `workflows`, `workflow_revisions`, `trigger_resources`,
   `notifications`, `workflow_files`, `workflow_runs` + the service-role-only `oauth_states`,
   `webhook_event_dedup`, `hubspot_app_subscriptions`, `hubspot_subscription_refs`).
   `check-migration-rls.mjs` now enforces GRANT coverage (DROP-aware). No longer a blocker.
2. **Live OAuth round-trip per provider** — connect → callback → token-encrypt → first action → 401
   → refresh+retry → recover. Mock-only across all 25 OAuth providers; real redirect-URI mismatches
   fail silently. **Hard.**
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
- Plaintext-token detection lint on `integrations` encrypted columns.

---

## E. Risk register

| Risk | Severity | Area | How to verify / mitigate |
|---|---|---|---|
| ~~Migrations lack GRANTs → `42501` after Oct 30 2026~~ **RESOLVED** | ~~high~~ done | db-security | Closed by `0a6ba7efe` (`20260619000000`): 12 live tables backfilled, lint hardened (DROP-aware GRANT coverage), applied via `db:push` |
| OAuth refresh/revoke unproven against any real provider | high | oauth-tokens | E2E connect→action→401→refresh→retry per provider in a deployed env with real redirect-URI registration |
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
| No plaintext-token detection on encrypted columns | med | db-security | CI pattern-scan for `xoxb-`/`gho_`/`sk-` in `integrations` |
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
3. **`integrations`-table RLS + no-cleartext-token test suite** — the highest-sensitivity table has no
   dedicated security test. Add a four-op RLS denial test + a pattern-scan asserting no plaintext
   `xoxb-`/`gho_`/`sk-`. Defense-in-depth before any live token flows.
4. **Webhook integration-test harness (3–4 representative providers)** — unblocks trustworthy live
   webhook testing and pins dedup/normalize/dispatch end-to-end. Stand up `tests/integration/webhooks/`
   for one webhook (Stripe), one polling (Gmail), one subscription-watch (Google Calendar), one
   signature-verify (Slack).
5. **Health-engine signal listener + minimal reconnect surface** — OAuth flows already *emit*
   `action_required`/`recovered` but nothing *consumes* them. Locate-or-build the listener and add a
   single "needs attention" pill + reconnect button on `/apps`. Closes the most user-visible OAuth gap.

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
