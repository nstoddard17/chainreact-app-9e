# ChainReactV2 — Engineering Roadmap

**Status as of:** 2026-05-10
**Scope:** What ships, in what order, and why — from current Phase 1 state to launch readiness.
**Audience:** Marcus + future Claude sessions. Not a marketing doc.

This roadmap defines eight phases. Phase 1 (provider foundation) is the only phase substantially complete today. The remaining phases are scoped at the level needed to decide what to do next — not at the level of individual slice plans. Each phase has a clear entry condition (when it can start), a clear exit condition (when it's done), and a non-goals section that prevents scope creep.

The intent is: stop adding providers on top of an unaudited foundation, lock down a roadmap, then execute it in order.

> **⚠️ Status correction — added 2026-05-25 (Slice 4.PROVIDER-DOCS-1; accepted by Marcus).** This roadmap's 2026-05-10 snapshot is stale on the provider front. Verified-against-live-code current state: **provider runtime is essentially complete across 26 providers** (286 real, non-stubbed handlers; full Jest suite green — 12,382 passed / 7 skipped / 0 failures). The Phase-2 examples below (e.g. "Slack V1 has 14+ actions; V2 has 1") are **obsolete** — Slack now has 31 registered actions; runtime/parity is done. The real remaining provider gap is **builder metadata**: **17/26 providers** are Builder-visible; **9 launch-scope providers are runtime-present but builder-invisible** (`hasMetadata:false` → "coming soon"): `microsoft-excel, airtable, shopify, trello, microsoft-onedrive, microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar`. Corrected one-liner: *provider runtime is essentially complete, but provider metadata/builder launch readiness still has a 9-provider gap.* Live tracker: [`../slices/phase-4/provider-metadata-launch-gap-tracker.md`](../slices/phase-4/provider-metadata-launch-gap-tracker.md). Treat the Phase-1/Phase-2 narrative below as historical context, not current status.

---

## Operating principles

These hold across every phase. They're the lens for prioritization within a phase.

1. **Port proven V1 behavior over inventing new behavior.** Marcus's V1 repo (`c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`) is the source of truth for what real users have used. Adapt to V2's cleaner boundaries; don't re-derive product decisions.
2. **Honest-state capabilities.** A manifest capability flips true only when a real handler / trigger is registered. The provider registry is the single source of truth.
3. **Prefer porting and adapting V1 behavior over inventing new behavior** — including for UX, ops, and billing. V1 has been live; V2 hasn't.
4. **One source of truth per concern.** Provider registry. Manifest. Action handler registry. Polling registry. No parallel structures.
5. **Tests cite contracts.** Unit tests reference the slice's plan / contract Q-numbers; e2e tests exercise real V2 internals and mock only the external provider boundary.
6. **Living documentation rule** (per `CLAUDE.md` §"Living Documentation"). When a phase introduces an architectural pattern, the docs update in the same batch. This roadmap itself is living — append phase outcomes and decisions back into it as phases complete.
7. **One phase at a time.** Phase N's exit condition gates Phase N+1's start. Hot-swapping work across phases breeds half-done foundations.

---

## Phase 1 — Provider foundation

**Status:** Substantially complete locally. Local branch `v2-provider-port-local`.

### What's done

15 providers + Excel (16 total) are ported with manifests, OAuth (where applicable), action handlers, triggers (webhook or polling per provider), and mocked-Graph-boundary e2e walkthroughs:

| Provider | Slice | OAuth | Actions | Trigger model |
|---|---|---|---|---|
| Slack | 1 | ✅ | send_channel_message | webhook |
| Gmail | 2 | ✅ (PKCE) | send_email | polling (newEmail) |
| Google Calendar | 3 | ✅ | 5 actions | webhook (eventChanged) |
| Google Drive | 4 | ✅ | 5 actions | webhook (fileChanged) |
| Google Sheets | 5 | ✅ | 5 actions | webhook (rowChanged) |
| Microsoft Outlook (mail) | 6 | ✅ | send_email | webhook (newEmail) |
| Microsoft Outlook Calendar | 7 | ✅ | 5 actions | webhook (eventChanged) |
| Microsoft OneDrive | 8 | ✅ | 7 actions | webhook (fileChanged) |
| Notion | 9 | ✅ | 7 actions | (deferred) |
| Airtable | 10 | ✅ | 8 actions | webhook (recordChanged) |
| Stripe | 11 | ✅ | 10 actions | webhook (eventReceived) |
| Shopify | 12 | ✅ (per-shop) | 10 actions | webhook (webhookReceived) |
| HubSpot | 13 | ✅ | secondary + CRM core | webhook (webhookReceived) |
| Mailchimp | 14 | ✅ (DC routing) | subscriber + audience | webhook (audienceEvent + …) |
| GitHub | 14b | ✅ | 6 actions | webhook (newCommit) |
| Microsoft Excel | 15 | ✅ | 6 actions | polling (new_row + new_table_row) |

### What's also done — shared infrastructure

- **OAuth dispatcher** (`services/oauth/`): generic connect / handleCallback / refresh. DB-backed signed state nonce with atomic consume. Per-user single-flight refresh lock. PKCE thread-through. Per-tenant provider-hint support (Shopify per-shop, Mailchimp DC).
- **`_shared/microsoft/` + `_shared/google/`**: PKCE, authorize URL, token exchange + refresh, /me lookup, Graph error envelope parser, subscription CRUD (Microsoft).
- **Trigger lifecycle**: activation registry, deactivation registry, subscription registry, polling registry, renewal cron for subscription-expiring triggers, generic dispatcher routed by (provider, eventType).
- **Execution engine**: handler registry (~110 actions across all providers), strict variable resolver, soft design-time resolver, run persistence, error humanizer, billing gate (per-user task quota), task-deduction RPC.
- **Notifications**: fan-out orchestrator across in-app, email, Slack, Discord channels with atomic dedup.
- **OAuth + workflow walkthroughs**: 15 e2e specs covering the full chain with mocked external boundaries. CI workflow + Vercel cron wiring.

### Exit condition for Phase 1
- ✅ Excel slice 15 commits 1–5 landed locally.
- ⏳ **Pending decision (Marcus):** push `v2-provider-port-local` to a shared branch / open a consolidated PR.
- ⏳ **Pending:** trash sweep of unused slice plans + provider scaffolding.

### Non-goals for Phase 1
- Net-new providers beyond the 16 above.
- Adding UI surface for connecting/managing integrations beyond the minimum walkthroughs already exercise.
- Re-architecting OAuth / engine / trigger lifecycle.
- Billing UX, plan enforcement, multi-org features.

---

## Phase 2 — Provider parity / missing V1 actions and triggers

**Status:** Not started.
**Entry condition:** Phase 1 exited.
**Goal:** Close the gap between V1's per-provider action/trigger surface and V2's, *for the 16 providers already in V2*. No new providers in this phase.

### What this is

Phase 1 ported the **most-used** actions and triggers per provider. V1 has many more. Phase 2 audits each ported provider against V1 and decides — per action and per trigger — whether to:

- **Port** (high-value, low-rot).
- **Skip permanently** (V1 rot; out of scope).
- **Defer to a later phase** (depends on UI / teams / billing scaffolding).

### Scope per provider

For each provider, the deliverable is an audit doc at `docs/roadmap/provider-parity/<provider>.md`:

1. List V1's actions + triggers.
2. Mark each port / skip / defer with one-sentence reasoning.
3. Identify V1 rot (deprecated handlers, dual implementations, missing scope-validation entries).
4. Estimate effort + risk per ported item.

The audit doc is the input to a per-provider parity slice that lands the agreed ports. Each parity slice follows the same 5-commit shape: plan doc → manifest/OAuth refinements → actions → triggers → e2e additions.

### Priority order within Phase 2

Driven by V1 usage data + product reach. Default ordering (revisit when usage data is in):

1. **Slack** — V1 has 14+ actions; V2 has 1.
2. **Gmail** — V1 has compose/draft, label management, attachment handling; V2 has send_email only.
3. **Notion** — webhook triggers (V1 has them, V2 deferred).
4. **Microsoft Excel** — 5 deferred actions (`update_row`, `delete_row`, `add_multiple_rows`, `rename_worksheet`, `delete_worksheet`) + 3 deferred triggers (`updated_row`, `updated_table_row`, `new_worksheet`).
5. **Google Sheets** — V1 surface 2× V2's. Higher-priority surfaces: read_rows variants, find/update by column, batchUpdate.
6. **Stripe** — V1 has subscription items, invoices, products + prices, charges (refunds covered), checkout sessions; V2 has 10.
7. **Airtable / Shopify / HubSpot / Mailchimp / GitHub** — incremental ports as audit identifies gaps.
8. **Microsoft Outlook (mail)** — V1 has reply, forward, draft management; V2 has send_email only.

### Exit condition for Phase 2

- Every Phase 1 provider has a parity audit doc.
- Either every "port" decision in those audits has shipped, or the deferred items are tracked with a follow-up phase label.
- V1 rot identified in each audit (deprecated scopes, unused handlers, dual implementations) is either removed in V2 or explicitly skipped.

### Non-goals for Phase 2

- New providers not in Phase 1.
- Multi-account UX (one user can connect multiple workspaces).
- AI-driven config generation.
- Engine changes beyond what specific ports require.

---

## Phase 3 — UI and page transfer

**Status:** Not started. V2's UI is minimal (workflows list, builder shell, integrations list, login). V1 has the full product UX.
**Entry condition:** Phase 2 substantively complete — provider surface is stable.
**Goal:** Port V1's UI pages into V2's cleaner architecture.

### What this is

V1 ships a Next.js App Router UI with: workflow builder (React Flow), per-node configuration modals, dynamic dropdowns, run history, integration management, admin panel, billing/subscription pages, AI assistant chat, dashboard.

V2 today has the bare minimum to drive the e2e walkthroughs: integrations list, workflow CRUD, basic builder shell. Per-node configuration is patched via API in the walkthroughs because the UI for it doesn't exist.

### Subphases

**3a — Workflow builder per-node configuration UI.** This is the largest gap. Required: configuration modals per provider/action with cascading fields, validation against the action's Zod schema, "Use ConfigurationContainer not ScrollArea" rule (per V1 CLAUDE.md §"Modal Overflow"). Output: replace every walkthrough's `PATCH /api/workflows/:id { draftDefinition }` step with a UI interaction.

**3b — Run history UI.** V2 persists run history; the surfaced UI today is a basic list. Port V1's error humanizer presentation + classified error card (`ClassifiedErrorCard` in V1) + one-click retry.

**3c — Integration management UX.** Connected status (NULL-invariant honored — `health_check_status = NULL` never renders as healthy), disconnect flow, reconnect deep-link surfaced from notifications.

**3d — Dashboard / activity feed.** Port V1's main dashboard cards (recent runs, integration health, quick-create workflow).

**3e — AI assistant chat surface.** Bare entry point — full AI behavior lands in Phase 5. This subphase just ports the chat shell so Phase 5 has a place to render output.

**3f — Polish: light/dark mode parity.** V1's CLAUDE.md §"Light & Dark Mode — MANDATORY" rule applies. Every component must support both modes simultaneously with WCAG AA contrast.

### Exit condition for Phase 3

- Every walkthrough that today uses `PATCH /api/workflows/:id { draftDefinition }` to bypass the UI can be rewritten to drive via UI (whether or not we *do* rewrite them).
- Each subphase has a UI/UX doc at `docs/architecture/ui-<subphase>.md` capturing the V1 → V2 port decisions.
- ConfigurationContainer pattern documented; no `ScrollArea` in modals.

### Non-goals for Phase 3

- Net-new UX V1 doesn't have.
- AI generation of workflows (Phase 5).
- Multi-org permissions UI (Phase 4).
- Mobile-specific surfaces.

---

## Phase 4 — Teams / orgs / workspaces / permissions

**Status:** Not started. V2 today is single-user. Every `userId` foreign key resolves to one human.
**Entry condition:** Phase 3 substantially shipped — UI is stable enough that the teams UX has a place to live.
**Goal:** Add the ownership model that lets ChainReact be a team product.

> **⚠️ Canonical model now lives in [`docs/rules/account-ownership-model.md`](../rules/account-ownership-model.md).** That rule doc supersedes the V1-style `workspaces` + `team_members` + per-resource `workspace_id` framing used in the narrative below. Before Phase 4 work begins, the subphases and exit conditions in this section should be re-derived from the rule doc (Account is the permanent owner; personal vs team/org are account *types*, not separate ownership systems; integrations and workflows are account-scoped from launch). Treat the narrative below as historical scoping; the rule doc is authoritative for ownership semantics.

### What this is

Today every workflow + integration + run is owned by exactly one user via `user_id` foreign keys. To go beyond single-user usage we need:

1. **Workspaces** — a top-level container that owns integrations + workflows + runs. Users join workspaces with a role.
2. **Roles + capabilities** — owner, admin, editor, viewer, billing. Capabilities map to actions (create workflow, edit any workflow, view runs, manage integrations, view billing, invite members).
3. **Resource scoping** — every existing `user_id` column becomes either `workspace_id` + `created_by_user_id`, or stays `user_id` for personal preferences.
4. **Invitations** — invite-by-email + accept flow. Token-based, expiring.
5. **Billing scope shift** — task quotas + pack purchases scope to the workspace, not the user (paired with Phase 7).

### V1 reference

V1 has a working admin authorization architecture (per the V1 `CLAUDE.md` §"Admin Authorization Architecture"): three-layer enforcement (middleware → API route → action-scoped helpers), capability JSONB on `user_profiles`, JWT claim sync, step-up auth for destructive actions, audit logs. V2's equivalent is a single `requireAdmin()` placeholder in `lib/utils/admin-auth.ts`.

Port V1's pattern faithfully — middleware checks JWT claims, route handlers call `requireAdmin({ capabilities, stepUp })`, scoped helpers in `lib/admin/` own writes + audit-log entries.

### Subphases

**4a — Workspace table + membership table + migrations.** Backwards-compatible: every existing user gets a "personal" workspace they own.
**4b — Repository layer rewrite.** Every `user_id`-scoped query gains a workspace scope. RLS policies updated.
**4c — Roles + capabilities.** Port V1's admin-capability model. Step-up auth for destructive actions (delete workspace, remove member, change role).
**4d — Invitations + members UI.** Email invites, accept flow, member list.
**4e — Switcher UI.** Top-bar workspace switcher; persists selection per session.
**4f — Audit log.** `workspace_audit_events` table + admin viewer.

### Exit condition for Phase 4

- Every existing query scopes to a workspace.
- A user can create a workspace, invite others, assign roles, and have those roles correctly gate every action.
- Destructive actions require step-up auth.
- Admin audit log captures every mutation.

### Non-goals for Phase 4

- SAML / SSO (deferred to a later phase; not on the launch path).
- Cross-workspace resource sharing.
- Per-resource ACLs (workflow visibility within a workspace is uniform — role gates it).

---

## Phase 5 — AI assistant + React agent architecture

**Status:** Not started.
**Entry condition:** Phase 3 (UI) + Phase 4 (workspaces) substantially complete. AI assistant lives inside a workspace and needs the chat shell from Phase 3e.
**Goal:** Bring V1's AI workflow planner + AI assistant into V2 in a re-architected form.

### What V1 has

V1 ships an AI workflow planner that takes natural-language prompts and generates workflow definitions. Multi-stage: node selection → configuration → edge/layout. Pattern fallbacks (fast-path → DB template → lightweight LLM → clarifications). Self-growing template pool (published templates auto-available to the planner). SSE streaming. Cost preview before run.

V1 also ships an "AI assistant" — chat surface that the user can talk to about workflows, integrations, runs.

### What this phase delivers

**5a — Shared AI utilities.** Single OpenAI/Anthropic clients (lazy-initialized — never module-level). Retry / timeout / model fallback. Token-aware history truncation. Plan cache. Template catalog loader. Per V1's `lib/ai/` shape.

**5b — Workflow planner.** Multi-stage planner. Pattern-fallback ladder. Stream over SSE. Cost preview before commit. Variable mapping uses upstream data, never hallucinates fields. Generative fields use `{{AI_FIELD:fieldName}}` for runtime values, not for IDs/enums/structural config.

**5c — React (workflow) agent.** Per V1's "React agent" pattern — an agent that operates *on* workflows (analyzes them, suggests improvements, debugs failures) rather than *running inside* them.

**5d — AI assistant chat.** Connect chat surface (Phase 3e shell) to the planner + react agent. Conversation persistence. Tool-use to query the user's workflows, runs, integrations.

**5e — Self-growing template pool.** Published templates → catalog → planner Tier 2 (keyword match, $0) and Tier 3 (LLM context).

**5f — Eval harness.** Port V1's agent evaluation framework. Single table `agent_eval_events` with funnel / quality / drafting / trust event categories. Dashboard at `/admin → Agent Eval`. Required: bump `AGENT_VERSION` on every agent change.

### Architecture decisions to lock down

- **AI is a component, not the system.** Determinism in workflow execution stays. AI is invoked for planning + suggestion, not for runtime execution decisions.
- **All client/model selection via central config.** `AI_MODELS.planning`, `AI_MODELS.fast`, `AI_MODELS.utility`, `AI_MODELS.configuration`. No hardcoded model strings at runtime selection points.
- **Cost preview is authoritative.** Client-side estimation is hint-only; server computes the actual cost via `computeCostPreview`.

### Exit condition for Phase 5

- A user can prompt "Send me a Slack message when a new Stripe invoice is paid" and get a valid runnable workflow.
- The planner's accuracy / cost / latency is captured in the eval harness on every release.
- Cost preview blocks runs that exceed the user's quota.
- Self-growing templates measurably reduce LLM calls (Tier 1 + Tier 2 hit rate target tracked in the eval).

### Non-goals for Phase 5

- AI-driven execution (workflows still run deterministically).
- AI-generated UI.
- Voice mode.

---

## Phase 6 — Workflow engine hardening

**Status:** Engine exists (`services/execution/engine.ts`) and runs all walkthrough cases. Hardening means closing known gaps before scale.
**Entry condition:** Phase 5 done — AI planner is the primary workflow-creation surface, so engine bugs become AI-quality bugs. Hardening must precede launch.
**Goal:** Make the engine production-ready under load + at scale.

### Concrete deliverables

**6a — Durable queue.** V2's current "queue" is in-process fire-and-forget (`services/execution/enqueue.ts`). A node restart drops in-flight runs. Land a durable queue (BullMQ / Inngest / equivalent) without API changes to `enqueueRun`.

**6b — Resume-from-failed-node.** V1 has paused this work pending a v2-engine consolidation. V2 starts fresh — resume-from-failed-node lands here, with cross-session side-effect dedup, lineage threading (`root_execution_id` + `workflow_definition_hash`), and migration safety. Reference: V1's `learning/docs/safe-resume-from-failed-node-project.md`.

**6c — HITL (human-in-the-loop) pause/resume.** Action handlers that need user approval pause the run; resume API completes it. Required for several V1 actions (Slack interactive, Gmail labels, etc.).

**6d — Test-mode interception.** Engine-level gate that refuses external-action handlers during test runs (per V1's testMode safety audit). Read-only operations still execute.

**6e — Strict pre-resolution at the engine layer.** Already partially in place — extend to every dispatch path so handlers never see unresolved `{{...}}` templates. Missing variables surface as standardized config-failure shape `{success:false, category:'config', error:{code:'MISSING_VARIABLE', path}, message}`.

**6f — Within-session idempotency (Q4 contract).** V2 already has `lib/workflows/actions/core/sessionSideEffects.ts` ported from V1. Wire `checkReplay` / `recordFired` at the **engine boundary** rather than per-handler so every action is covered uniformly.

**6g — Parallel execution.** Today the engine executes nodes sequentially. Branch nodes need parallel children; loop nodes need iteration. Defer if Phase 6a–f take longer than expected — sequential execution is correct, just slow for fan-out workflows.

**6h — Per-handler timeouts + circuit breakers.** A wedged provider can stall a run today; budget per node + circuit-breaker per (user, provider, accountId).

### Exit condition for Phase 6

- Engine restarts mid-run resume cleanly.
- HITL actions are exercised by an e2e walkthrough.
- The Q-contract suite (Q2 strict resolution, Q4 idempotency, Q8 test-mode, Q11 no hidden defaults, Q12 tz/locale) passes for every action.
- Load test: 1000 concurrent runs, none drop, p95 latency tracked.

### Non-goals for Phase 6

- Custom code nodes (JS / Python evaluation).
- Visual diff of workflow versions.
- Multi-region execution.

---

## Phase 7 — Billing, usage limits, entitlements

**Status:** Billing gate exists (per-user task quota). Plans / packs / overage / entitlements do not.
**Entry condition:** Phase 4 (workspaces) done — billing scopes to a workspace, not a user. Phase 6 (engine) done — billing decisions hinge on deterministic execution.
**Goal:** Production-ready billing matching V1's surface.

### V1 reference

V1's `CLAUDE.md` §"Task Cost Visibility & Billing" describes a tested, working billing system: plans + packs + overage + auto-buy, atomic deduction RPC (`deduct_tasks_if_available`), Stripe metered subscription items, idempotency event ledger, daily report-overage cron, usage alerts at 80% / 100% / overage-activated / pack-depleted, parity invariants between ledger and counter columns. Port faithfully.

### Subphases

**7a — Plans table + Stripe price IDs.** Plan setup scripts (mirror V1's `scripts/setup-stripe-{prices,metered-prices,pack-prices}.ts`).
**7b — Task deduction RPC.** Atomic FOR-UPDATE inside the RPC. Decision tree: plan → pack → overage → 402. TypeScript callers are pass-through.
**7c — Pack purchases.** One-time Stripe Checkout `mode: 'payment'`. FIFO consumption ordered by `paid_at`. Packs never expire.
**7d — Overage subscription items.** Stripe metered subscription_item. Daily cron drains `task_overage_events` to Stripe usage records (deterministic idempotency key).
**7e — Auto-buy.** Off-session `paymentIntents.create` when balance hits zero.
**7f — Usage alerts.** Daily cron at 80% / 100% / overage-activated / pack-depleted.
**7g — Cost preview API.** `/api/workflows/[id]/preview-cost` returns plan + pack + overage breakdown. Confirmation dialog blocks runs that exceed available budget — fails closed if preview API errors.
**7h — Stripe webhook events.** `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_{succeeded,failed}`, `charge.refunded` at `/api/webhooks/stripe-billing`.
**7i — Billing UI.** Subscription card, pack card, overage toggle + cap slider. Admin read-only view of all workspaces.

### Parity invariants (must hold)

```
sum(task_billing_events.amount where source != 'period_reset' and event_type != 'pack_purchase' and event_type != 'pack_refund')
  = sum(metadata.plan_consumed)
  + sum(metadata.pack_consumed)
  + sum(metadata.overage_consumed)
```

The denormalized cache `workspace_balances.task_pack_balance` must equal `sum(pack_purchases.tasks_remaining where status='paid')` for that workspace.

### Exit condition for Phase 7

- A workspace can subscribe, buy packs, enable overage, and consume tasks atomically.
- Daily reconciliation cron compares the ledger to the counter columns and pages on drift.
- Usage alert emails fire on schedule.
- Stripe webhook idempotency proven (replay same event → no double-credit).
- Cost preview blocks runs that exceed budget.

### Non-goals for Phase 7

- Invoicing at the workspace level beyond Stripe-managed invoices.
- Multi-currency.
- Sales-led custom plans (handled manually in Stripe for now).

---

## Phase 8 — Ops, docs, testing, launch readiness

**Status:** Phase 1 has CI (lint + structure + migrations + unit tests). Vercel cron wired for the Gmail polling case. Beyond that — minimal.
**Entry condition:** Phases 1–7 substantively complete.
**Goal:** Everything that has to be true before turning on signups.

### Subphases

**8a — Observability.** Structured log standard (`event` field). Metrics: workflow run count by status, p95 latency per action handler, OAuth refresh failure rate per provider, polling-trigger lag distribution. Dashboard wiring (Grafana / equivalent).

**8b — Alerting.** Pages on: cron job failures, queue depth growing, OAuth refresh failure rate spike per provider, billing reconciliation drift, dedup outage, error rate spike per workflow.

> **Scope note [2026-06-26]:** 8a/8b observability + alerting are **internal/platform** concerns and stay external (structured logs → Grafana / equivalent, plus paging). They are **explicitly NOT customer-facing Analytics widgets.** Marcus decided we are not adding `runs_by_status`, `p95_duration`, `failures_by_workflow`, reconnect/disconnected counts, queue depth, cron failures, OAuth refresh failures, or provider-wide failure rates to the customer Analytics page, and not standing up a separate customer observability dashboard right now. Platform observability stays internal (structured logs + paging, never customer widgets). **Reconciliation [internal alerts shipped, local]:** the two prerequisites this note named — *durable event ledgers* (`ops_signal_events` / `ops_alert_events`) and the internal owner-alert path — now EXIST (see the status note below); so "deferred" no longer applies to internal owner alerting itself. What remains deferred is a platform-owner UI / authorization tier and Grafana-style dashboard wiring (and, separately, customer-facing widgets, which stay out of scope). Customer Analytics stays a user/business-value surface; app health belongs on Apps, run failures on Runs / builder run results. See [analytics-observability-product-decision.md](../slices/phase-4/analytics/analytics-observability-product-decision.md).

> **Status (local, unpushed) [internal owner alerts SHIPPED]:** The internal/owner alert
> evaluator is built — strictly internal (no customer-facing widgets / no Analytics-page
> additions, consistent with the scope note above): structured logs + optional paging
> (`OPS_ALERT_WEBHOOK_URL`) over **durable event ledgers** (`ops_signal_events`,
> `ops_alert_events`, both system-table / service-role-only). Cron-driven
> (`/api/cron/evaluate-ops-alerts`, 5 min), dedupe/cooldown, 6 categories (stuck runs,
> queue backlog, provider failure rate, OAuth refresh failures, billing webhook failures,
> cron failures). Queue backlog is the real queued-depth alert gated behind
> `QUEUE_BACKLOG_MONITORING_ENABLED` until the DURABLE-QUEUE-1 migration is applied
> (reported unmonitored, never green). No platform-owner UI tier was added (out of scope);
> alerts live in the ledger + logs + optional webhook. Billing **reconciliation drift**
> (ledger vs counters) + dedup-outage alerting remain follow-ups. Design + ops:
> [`launch-alerts-audit-plan.md`](../slices/phase-8/launch-alerts-audit-plan.md),
> [`../runbooks/ops-alerts.md`](../runbooks/ops-alerts.md).

**8c — Runbooks.** Per-provider OAuth re-issuance steps. Per-cron-job pause/resume. Database migration rollback procedure. "User's workflows aren't firing" triage guide.

**8d — Cron wiring.** Currently only Gmail polling cron is wired in `vercel.json`. Wire every polling provider + renewal cron + report-overage cron + usage-alerts cron + clean-session-side-effects cron + reset-task-usage cron.

**8e — Secrets management.** Audit env-var surface. Rotation procedures documented. Production secrets in a secret manager (Vercel env / equivalent), not local `.env`.

**8f — Backups + DR.** Daily Supabase backup verified. Restore procedure tested end-to-end. RPO / RTO targets documented.

**8g — Load testing.** 1000 concurrent runs scenario (from Phase 6 exit). Workspace fanout (1 workspace with 100 active workflows). Provider rate-limit handling.

**8h — Security review.** OWASP top 10 walkthrough. Token encryption verified end-to-end. Admin step-up auth. CORS audit. CSP header policy. RLS policy coverage for every user-data table.

**8i — Legal + policy.** Terms of service. Privacy policy. DPA template for enterprise. GDPR data-export endpoint.

**8j — Launch checklist.** Final go/no-go items. Customer-success playbook. Support routing.

**8k — Public docs.** Per-provider connection guide. Workflow building tutorial. AI assistant prompt examples. API reference (if/when we ship a public API).

### Exit condition for Phase 8

- All subphases checked.
- Final pre-launch security review signed off.
- Cron jobs all wired + monitored.
- Backups verified by restore drill.
- Marcus + designated launch reviewer agree we're go.

### Non-goals for Phase 8

- New product features.
- New providers.
- Engine changes.
- Marketing site / pricing page polish — that's a separate website track.

---

## Cross-phase concerns

### When to interrupt the roadmap

Interrupts are allowed for:
- **Security incidents** (anywhere, any time).
- **Live-user critical bugs** once we have live users (Phase 8+).
- **External dependency forcing-functions** — provider OAuth scheme changes, Stripe API deprecations, Supabase auth changes.

Interrupts are NOT allowed for:
- Adding "just one more provider" that wasn't in Phase 1's scope.
- Optimization work without measured-load data.
- Refactor opportunities that don't unblock the current phase.

### V1-feature gate

Before porting a V1 feature into V2 — at any phase — apply the V1 audit gate:

1. **Used?** Is the feature observably used by real V1 traffic? (If unknown, default to "skip until needed.")
2. **Rot?** Is the V1 implementation healthy? (If rotten, the port is a rewrite, not a copy.)
3. **Coupled?** Does the feature require infrastructure V2 doesn't have? (If so, defer to the phase that adds that infrastructure.)
4. **In phase scope?** Does this feature belong in the current phase's exit condition? (If not, defer or reject.)

### Doc updates per phase

Each phase exit MUST include:
- This roadmap updated (the phase's outcomes summarized, decisions captured).
- `CLAUDE.md` updated if a new architectural pattern landed.
- Slice-level docs under `docs/slices/` for individual ships.
- Runbook updates under `docs/runbooks/` for ops-touching work.

The living-documentation rule (per `CLAUDE.md` §"Living Documentation Rule") applies: docs land in the same local batch as the implementation, not as stale follow-up.

---

## Status table (single-glance)

| Phase | Title | Status | Blocking |
|---|---|---|---|
| 1 | Provider foundation | ✅ Substantially complete | Marcus push decision |
| 2 | Provider parity | ⏳ Not started | Phase 1 exit |
| 3 | UI and page transfer | ⏳ Not started | Phase 2 substantively complete |
| 4 | Teams / orgs / workspaces | ⏳ Not started | Phase 3 substantially shipped |
| 5 | AI assistant + React agent | ⏳ Not started | Phase 3 + Phase 4 |
| 6 | Engine hardening | ⏳ Not started | Phase 5 done |
| 7 | Billing / plans / entitlements | ⏳ Not started | Phase 4 + Phase 6 |
| 8 | Ops / docs / launch readiness | ⏳ Not started | Phases 1–7 |

---

## How to use this doc

- **Before starting a new slice**, check which phase it belongs to. If it's not the current phase, defer (or argue for an interrupt under the rules above).
- **Before adding a provider**, check Phase 2's audit doc for that provider. No new providers in Phase 1; new providers in Phase 2 only via the parity audit.
- **Before adding a feature**, run the V1-feature gate. If it survives, identify the phase. If it's not in the current phase, defer.
- **At every phase exit**, update this doc. The status table is the operational truth.
