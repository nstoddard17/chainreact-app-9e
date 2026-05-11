# Phase 2 — Provider parity master plan

**Status:** Planning / audit. **Doc-only commit.** No implementation work begins under this plan until each per-provider audit is individually accepted.
**Branch:** `v2-provider-port-local` (local-only).
**Reference codebase (V1):** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**Roadmap reference:** [`docs/roadmap/chainreact-v2-roadmap.md`](../roadmap/chainreact-v2-roadmap.md) §Phase 2.
**Predecessor:** [`docs/slices/phase-1-provider-completion-audit.md`](phase-1-provider-completion-audit.md) (Phase 1 exit doc, accepted).

This is the master plan for Phase 2. It defines the audit method, the priority order, the V1 usage-data approach, the cross-cutting V1 rot pre-pass, the parity-slice shape, and the definition of done. Per-provider parity audits land under this plan and follow its template.

---

## 1. Phase 2 purpose

Phase 2 is **provider parity and expansion** for the 17 providers landed in Phase 1.

Phase 1 ported the **most-used** action and trigger per provider (often 1 of N actions; sometimes 0 of M triggers). Phase 2 closes the gap by auditing each ported provider against V1's full surface and deciding — per action and per trigger — whether to:

- **Port** — high-value, low-rot, fits V2 contracts.
- **Skip permanently** — V1 rot or out-of-scope under current product direction.
- **Defer** — depends on UI / teams / billing / engine-hardening infrastructure not yet shipped.
- **Redesign** — V1 implementation is salvageable as a contract but not as code.
- **Needs product decision** — Marcus has to choose before the recommendation is actionable.

**No new providers in Phase 2.** Phase 2 exits when every Phase 1 provider has an accepted parity audit and every "port" decision in those audits has either shipped or is tracked with an explicit follow-up phase label.

---

## 2. Audit method + per-provider template

Every per-provider parity audit is a single Markdown doc under `docs/slices/parity-<provider>.md` (see open question 9.4 for location decision). It uses the following fixed section list — sections may not be skipped, but a section may legitimately read "n/a" with one sentence of justification.

### Template

```markdown
# Parity audit — <Provider>

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e
**V2 baseline:** integrations/<provider>/ (slice <N>)
**Phase 1 surface shipped:** <one line — actions + trigger model>
**Recommendation up front:** <one paragraph — port count + skip count + defer count + the single most important decision>

## 1. V1 source paths audited
Bullet list of exact V1 files inspected with line counts.
Manifest, action handlers, trigger lifecycle, OAuth, webhook normalizer/verification, tests.

## 2. V1 actions inventory
Numbered list of every V1 action for this provider with one-line description.
Mark each as `comingSoon` / live / dead-code / unclear-runtime-wiring.

## 3. V1 triggers inventory
Same shape as actions but for triggers.
Mark trigger model (webhook / polling / gateway) and whether V1's lifecycle is per-workflow or eager-bulk.

## 4. V2 current surface
Numbered list of what's shipped in V2 today.
Cite manifest entries (`integrations/<provider>/manifest.ts`) + handler files.

## 5. Missing actions
Set difference: V1 actions minus V2 actions. One line per missing action.

## 6. Missing triggers
Set difference: V1 triggers minus V2 triggers. One line per missing trigger.

## 7. Port / skip / defer table
| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
Every row from Sections 5 and 6 gets a decision.
Reasoning cites V1 rot rows from §5 of the master plan when applicable.

## 8. V1 rot / bugs / dead code inventory
Provider-specific rot beyond the master-plan §5 categories.
Cite file paths + line counts. One row per rot finding.

## 9. V2 dependency map
Which V2 contracts each ported item depends on. Identify any contract gaps the port would surface.
Reference: `contracts/integration.ts`, `_shared/{microsoft,google}/`, action handler registry, polling registry, subscription registry.

## 10. Required platform gaps (if any)
List any V2 contract changes / shared-infrastructure additions the audit identifies as prerequisites.
Each gap is its own slice candidate, NOT bundled into the parity port.

## 11. Effort estimate
Per-batch rough-order-of-magnitude. Use the parity-slice shape (§6 of master plan) as the unit.
Compare to a Phase 1 reference slice ("~Excel-sized", "~Sheets-sized").

## 12. Risk estimate
Top 3 risks. For each: likelihood, impact, mitigation.

## 13. Recommended parity batch plan
Ordered list of commits the parity slice would land if accepted.
Follows the parity-slice shape from §6 of master plan.

## 14. Exit checklist
Bullet list of "this audit is complete when…" items.
Marcus checks each off before implementation starts.
```

### Method per audit

For each provider the audit reads, in order:

1. `lib/workflows/nodes/providers/<provider>/index.ts` — count `isTrigger: false` (actions) and `isTrigger: true` / separate `triggers/*.schema.ts` files (triggers). Count `comingSoon: true` flags. Note line count.
2. `lib/workflows/actions/<provider>/` or `lib/workflows/actions/<provider>.ts` — handler implementations. Note monolithic vs per-action split.
3. `lib/integrations/<provider>*.ts` and `app/api/integrations/<provider>/` — OAuth callback, refresh wiring, lifecycle hooks.
4. `lib/webhooks/normalizer.ts` and `lib/webhooks/verification.ts` — webhook entries (where applicable). Flag any provider that returns `true` from verification without verifying.
5. V1 tests under `__tests__/{nodes,workflows,integrations}/` — gives a usage-density signal (see §4).
6. V2's existing shared infrastructure (`integrations/_shared/{google,microsoft}/`, OAuth dispatcher, trigger lifecycle registries, polling registry, action handler registry) — to judge whether each port reuses what's there or requires new contract surface.

The audit does NOT read V1 components (UI is Phase 3). The audit does NOT read V1 billing (Phase 7). The audit reads only what's needed to decide port/skip/defer for the provider's action + trigger surface.

---

## 3. Priority order

The roadmap's draft order is the starting point. Each provider's rank below is tied to **concrete signals** rather than vibes. Where signals conflict, the audit-time deep dive resolves; the rank here is the pre-audit prior.

### Signal model

Each candidate is rated on six concrete signals:

1. **User/product value** — does this provider show up in V1's published templates? In the audit prompt list? In customer-facing demos?
2. **V1 implemented surface size** — actions + triggers count (proxy for "how much V1 invested here").
3. **V2 current gap size** — V1 surface minus V2 surface. Bigger gap = more porting opportunity.
4. **Implementation risk** — provider-specific quirks (GraphQL helper layer needed, per-shop OAuth, per-tenant DC routing, etc.).
5. **Architecture dependency** — does the port require Phase-N infrastructure not yet shipped (UI, workspaces, AI, engine)?
6. **Setup friction** — env vars, OAuth app registration, app review, sandbox account setup.
7. **AI/builder unlock** — does closing the gap meaningfully expand what the AI planner (Phase 5) and the builder UI (Phase 3) can compose?

A pre-audit rank uses these signals as a tie-breaker; the audit can revise.

### Pre-audit rank

| Rank | Provider | V2 today | V1 surface (approx) | Primary signal driving rank |
|---|---|---|---|---|
| 1 | **Slack** | 1 action, 1 webhook trigger | 14+ actions, 5+ triggers | Largest gap among shipped providers; highest user/product value (every workflow tutorial uses Slack); minimal V2-side risk (manifest already healthy). |
| 2 | **Gmail** | 1 action, 1 polling trigger | 8+ actions (compose/draft/labels/attachments), 3+ triggers | High user value; existing PKCE + polling wired; V1 has labels + attachments + draft management ready to port. |
| 3 | **Notion** | 7 actions, **0 triggers** (deferred) | 7+ actions, 2+ triggers (webhook) | Trigger gap; Notion webhooks are the missing piece — Notion-without-triggers is half a provider in workflow terms. |
| 4 | **Microsoft Excel** | 6 actions, 2 polling triggers | 11 actions, 5 triggers | Polling trigger pattern is now proven (slice 15); 5 deferred actions + 3 deferred triggers per the Phase 1 audit are a clean batch. |
| 5 | **Google Sheets** | 5 actions | ~12 actions (read variants, find/update by column, batchUpdate) | V1 surface roughly 2× V2's; many workflows hinge on read+update flows V2 doesn't ship. |
| 6 | **Stripe** | 10 actions | 18+ actions (subscription items, invoices, products, prices, charges, checkout sessions) | V1 surface is large but each action is independent; risk-managed parity that lets Stripe-driven workflow templates ship. |
| 7 | **Airtable** | 8 actions, 1 webhook trigger | 12+ actions (bulk ops, view filtering, attachments) | Bulk operations + view-aware reads commonly requested. |
| 8 | **Shopify** | 10 actions, 1 webhook trigger | 14+ actions (orders, fulfillment, inventory, refunds), 6+ webhook event types | Per-shop OAuth already shipped; gap is event-type coverage in the trigger normalizer. |
| 9 | **HubSpot** | core CRM + secondary, 1 webhook trigger | 15+ actions across CRM + marketing + tickets, 5+ webhook event types | Audit decides which CRM verbs are truly missing vs. reachable through the secondary objects API. |
| 10 | **Mailchimp** | subscriber + audience, 1 webhook trigger (4 event types) | 10+ actions (campaigns, segments, automations), several more webhook event types | DC routing already shipped; gap is campaign + automation actions. |
| 11 | **GitHub** | 6 actions, 1 webhook trigger (newCommit) | 12+ actions (issues, PRs, releases, comments), 8+ webhook event types | Webhook event-type breadth is the main gap; actions are well-distributed. |
| 12 | **Microsoft Outlook (mail)** | 1 action, 1 webhook trigger | 8+ actions (reply, forward, draft management, attachments) | Symmetrical to Gmail; same audit shape; lower priority because Outlook user volume is lower in V1 traffic. |

### Rank-not-yet-set (audit-on-demand)

These providers are Phase 1 graduates but the master plan does NOT pre-rank them. They get audit slots when their parity surface becomes a workflow blocker:

- **Google Calendar / Google Drive / Microsoft OneDrive / Microsoft Outlook Calendar** — Phase 1 shipped 5–7 actions each; gap is real but smaller in absolute action count than the priority-12 cluster above. Audit when a downstream phase (UI Phase 3, AI Phase 5) hits a missing-action blocker.

### Rank-NULL (Phase 2 but not normal parity — see §8)

- **Trello** — Phase 2 only after the token-ingest auth contract is designed and accepted.

---

## 4. V1 usage-data plan

The roadmap names "V1 usage data" as the priority driver. The reality:

**We do not currently have V1 production usage data.** No analytics export, no per-action invocation counts, no trigger-fire rate by provider in this working set. (See open question 9.1.)

### Proxy signals (used until real data lands)

Until usage data is available, the audit uses six proxies — composite, not any one:

1. **V1 manifest action/trigger count** — high count signals V1 invested. Low count signals V1 itself didn't bother. Source: `lib/workflows/nodes/providers/<provider>/index.ts`.
2. **Provider tier / business importance** — Slack / Gmail / Stripe / Shopify are foundational; Twitter / Box are not. This is product judgment, not data.
3. **Doc density** — count of `learning/docs/` and `learning/walkthroughs/` files mentioning the provider. High doc density signals the provider was actively maintained / debugged.
4. **Test density** — count of `__tests__/` files for the provider. Tests exist where bugs were found; bug count proxies usage.
5. **Template/example presence** — count of `published_templates` rows referencing the provider (V1 has a self-growing template pool per `lib/ai/template-catalog.ts`). High count signals user demand.
6. **AI-planner reference count** — count of fast-path / pattern-fallback entries naming the provider in V1's `lib/workflows/ai-agent/` templates. High count signals the planner expects this provider.

### Risk of proxies

Each proxy carries a known bias:

- **Manifest count** over-represents providers V1 over-built and never validated (Twitter has 12 actions declared, all `comingSoon`).
- **Tier/importance** is product judgment without data — biased toward Marcus's mental model of who matters.
- **Doc density** over-represents providers that were *broken* (more bugs = more docs), which is sometimes opposite of "popular."
- **Test density** over-represents providers with active development churn, which doesn't always equal user usage.
- **Template presence** is forward-looking only if V1's template pool reflects observed user usage; if templates were authored top-down, this is just another product-judgment proxy.
- **AI-planner reference count** is biased toward what the planner authors *expected* users to want, not what users actually ran.

**Mitigation:** No single proxy decides a rank. The pre-audit rank in §3 uses a composite. The per-provider audit revisits each rank at audit time and revises if the proxy mix points the wrong way.

**Decision deadline:** If real V1 usage data becomes available before audit 4 (Microsoft Excel) lands, the rank order is re-validated and reordered if signal disagrees. After audit 4, the order is locked to avoid thrashing.

---

## 5. Cross-cutting V1 rot pre-pass

V1 has recurring rot patterns that show up in nearly every provider. Cataloging them once at the master-plan level lets per-provider audits cite a row instead of re-deriving the analysis. Each row below is sourced from existing V1 audit findings and the V1 CLAUDE.md.

### Rot catalog

| ID | Pattern | Where in V1 | Mitigation in V2 port |
|---|---|---|---|
| **R1** | **Monolithic action files** | `slack.ts`, `googleDocs.ts` (1042 lines), `discord.ts` (2075 lines), `facebook.ts` (1497 lines), `trello.ts` (1402 lines), `gmail/handlers.ts` (likely large) | V2 ports always per-action-split (one handler file per action). Audit flags monolithic V1 source as "split-required" effort. |
| **R2** | **Duplicate implementations** | Two execution engines (V1's `advancedExecutionEngine.ts` vs `workflowExecutionService.ts`); two Trello action shapes (legacy + V2-shape `getCards.ts`); per-provider double OAuth wrappers | V2 has one engine, one OAuth dispatcher. Audit flags any V1 dual-implementation and chooses the cleaner one to port. |
| **R3** | **Missing scope-validation entries** | V1 had a `scopeValidation.ts` registry that several providers were never added to (recently cleaned up: `e62d831da refactor(integrations): delete validateIntegrationScopes orphan`) | V2 manifest declares scopes inline in `manifest.ts`. No separate registry to fall out of sync. |
| **R4** | **Dead OAuth config / per-provider env silos** | `TEAMS_CLIENT_ID` / `TEAMS_CLIENT_SECRET` (closed in slice 16 by reusing shared Microsoft app); same pattern likely in other Microsoft providers if audited | V2 ports always reuse the shared `_shared/{google,microsoft}/` OAuth where applicable. Audit flags per-provider env silos as "consolidate to shared." |
| **R5** | **Dead handler graphs** | `WebhookManager.processWebhook` + private `executeWorkflow` (deleted in `5ab93f65f`); `generateReconnectionUrl` in scopeValidation (deleted in `8c82586ea`); `validateIntegrationScopes` orphan (deleted in `e62d831da`) | V2 audits cite the V1 dead-code commits and confirm no corresponding dead path is being ported. |
| **R6** | **comingSoon stubs / placeholder manifests** | Twitter (16 `comingSoon` flags, 0 handlers); Dropbox (1 `comingSoon`); Box / Blackbaud / YouTube (scaffold-only) | V2 ports never include `comingSoon`. Manifest capability flag flips true only when a real handler is registered (V2's "honest-state capabilities" rule per `docs/rules/provider-registry.md`). |
| **R7** | **Unsafe webhook verification** | `lib/webhooks/verification.ts` returns `true` for Trello (no signature check); same shape may exist for other providers — audit checks per-provider | V2 ports MUST verify signature where the provider supports it. If the provider has no signature mechanism, the audit explicitly documents that and proposes alternative verification (e.g. clientState for Microsoft Graph subscriptions). |
| **R8** | **Silent high-risk defaults / Q11 violations** | V1 documented at `learning/docs/handler-defaults-audit.md`. PR-G0..G6 in V1 closed many; some remain | V2 ports comply with V1's Q11 contract: no hidden high-risk defaults (auto-notify, visibility/sharing, consent/compliance, AI behavior). Required fields are explicit; missing field returns standardized config-failure shape. |
| **R9** | **Inline token decrypt / manual auth header construction** | Pre-PR-AUTH-3 V1 had ~50 client-side `getSession()` / `getUser()` call sites; server-side handler files often constructed Bearer headers manually | V2 ports use `getDecryptedAccessToken(userId, provider)` server-side; auth header construction is centralized. Audit flags any V1 inline auth as "rewrite to use V2 dispatcher." |
| **R10** | **ActionResult shape inconsistencies** | V1 handlers historically returned `{success, data}` vs `{success, output}` vs `{success, message, error}` interchangeably; Q-contract suite normalized over time but V1 still has stragglers | V2's `ActionResult` is one shape (`contracts/integration.ts`). Audit flags V1 handlers returning ad-hoc shapes as "normalize on port." |
| **R11** | **Trigger lifecycle: eager-bulk vs per-workflow** | V1 Trello registers webhooks for ALL boards on connect (bulk); V1 Discord uses persistent gateway (orthogonal pattern); per-workflow lifecycle is the V2 standard but V1 mixes patterns | V2's trigger lifecycle is per-workflow per-trigger. Audit flags any V1 eager-bulk registration as "redesign to per-workflow." |
| **R12** | **Missing or partial idempotency** | V1 documented Q4 contract (`session_side_effects`); some V1 handlers lack `checkReplay` / `recordFired` brackets | V2 has `lib/workflows/actions/core/sessionSideEffects.ts` ported. Audit confirms each ported action is wrapped at the engine boundary (Phase 6f) or per-handler until then. |
| **R13** | **Missing tz/locale resolution** | V1 documented Q12 contract; V1 had silent `'09:00'` / `'10:00'` substitutions in Calendar / Outlook handlers (audit changes pending) | V2 ports use `resolveTimezone` / `resolveLocale` helpers. Audit flags any V1 hardcoded time/locale as "replace with helper." |
| **R14** | **Multi-recipient / multi-value field parsing inconsistencies** | V1 documented Q7 contract; mixed handling of CSV strings vs arrays of strings vs arrays of CSV strings across Gmail/Outlook/Calendar | V2 routes through `parseRecipients`. Audit flags any V1 ad-hoc CSV-splitting as "route through helper." |

### How the rot catalog gets used

A per-provider audit's §8 ("V1 rot inventory") cites these IDs in shorthand:

> Slack handlers exhibit **R1** (1283-line monolith), **R10** (3 distinct ActionResult shapes), and **R12** (no `checkReplay` bracket on `send_channel_message`).

The audit only writes a paragraph for rot patterns NOT in the master catalog. The master catalog is appended to (never edited destructively) when a new pattern surfaces.

---

## 6. Parity slice shape

The Phase 1 "5-commit slice" shape (plan → manifest/OAuth → actions → triggers → e2e) does not fit parity work. Most parity is small additions to a provider that already has manifest + OAuth + lifecycle. Forcing parity into 5 commits means inflating tiny work or padding the plan/e2e commits.

### Right-sized parity-slice template

A parity slice for a single provider looks like:

```
Commit 1: docs/slices/parity-<provider>.md  — audit doc only
              (gates: docs-only, but full unit gates run anyway)

Commit 2..N: feat(<provider>): port <action-batch-1>
              feat(<provider>): port <action-batch-2>
              ...one commit per logical batch (3–6 actions each)

Commit N+1: feat(<provider>): port <trigger-1> trigger
              ...one commit per trigger (triggers are larger and need lifecycle wiring)

Commit M: test(e2e): extend <provider> walkthrough with <new actions/triggers>
              (only if behavior change warrants e2e coverage)

Commit M+1 (rare): docs(claude): document <new pattern> introduced in this slice
              (only if new architectural pattern landed)
```

### Sizing per provider

The audit's §11 ("Effort estimate") sets the commit count. Rough sizing relative to a reference Phase 1 slice:

| Reference | Approx commit count for parity |
|---|---|
| Excel-sized (5 actions + 3 triggers) | 4–5 commits |
| Sheets-sized (~7 missing actions, 1–2 triggers) | 5–6 commits |
| Slack-sized (~13 missing actions, 4 triggers) | 8–10 commits |
| Stripe-sized (~8 missing actions, 0 missing triggers) | 5–6 commits |

A parity slice that exceeds 12 commits gets split — typically along action-domain lines (e.g. Slack split: messages / channels / users / reactions).

### What does NOT belong in a parity slice

- Engine changes (Phase 6).
- UI changes (Phase 3).
- Billing wiring (Phase 7).
- Workspace scoping (Phase 4).
- AI planner integration (Phase 5).

If a parity audit identifies a required platform gap (audit §10), that gap is its own slice. The parity slice depends on the gap-slice landing first.

### Gates per commit

Every commit (audit doc included) runs the unit gate suite:

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

E2e gates run only on commits that change provider behavior (action / trigger / e2e additions). Doc-only commits skip e2e by convention.

---

## 7. Definition of done

### Phase 2 done

- Every Phase 1 provider has an **accepted** parity audit doc.
- Every "missing V1 item" identified in those audits has a decision: **port / skip / defer / redesign / needs product decision**.
- Every "port" decision has either:
  - **shipped** (parity slice landed locally, gates green); or
  - is **tracked** with an explicit follow-up phase label (e.g. "depends on Phase 4 workspaces", "depends on Phase 5 AI planner").
- The cross-cutting rot catalog (§5) has been appended to with any new patterns surfaced during audits.
- The roadmap status table is updated to show Phase 2 complete.

### Per-provider audit done

- Marcus has read and **accepted** the audit doc.
- Implementation work has NOT started before acceptance.
- Every audit-doc section is filled (no skipped sections without justification).
- Required platform gaps (audit §10) are filed as separate slice candidates.
- Open questions are resolved or explicitly deferred with a named follow-up.

### Per-parity-slice done (post-audit, implementation phase)

- Audit's recommended batch plan is followed (or deviation explained at commit time).
- Every "port" item the audit recommended has a corresponding implementation commit.
- Manifest capability flags accurately reflect what's now shipping (honest-state rule).
- E2e walkthrough updated if new behavior changed the user-visible flow.
- All gates green on every commit.

---

## 8. Trello / token-ingest exception

Trello is Phase 2, but **not normal provider parity.**

Per the slice 17 audit ([`docs/slices/slice-17-trello.md`](slice-17-trello.md)), Trello requires a **platform-gap prerequisite**: a `token-ingest` auth contract for API-key / user-token style providers that don't fit V2's current `ProviderOAuth` contract (`contracts/integration.ts:168-222`).

### Sequencing rule

1. The token-ingest auth contract is **its own design slice**, not bundled into a Trello parity slice.
2. The contract slice produces: a contract spec doc, a contract definition in `contracts/integration.ts`, a dispatcher path that handles the new auth scheme, tests, and at least one provider that consumes the contract end-to-end (could be Trello as the first consumer).
3. **No Trello implementation work begins until the token-ingest contract is designed and accepted.**
4. Trello's parity audit (eventually `docs/slices/parity-trello.md`) is allowed to start before the contract lands — the audit can identify what the port would look like assuming the contract exists.

### Other potential token-ingest consumers

If the token-ingest contract is built, the audit should enumerate other V1 providers that would benefit (per the Phase 1 audit, Trello is the headline case but other API-key-style providers may exist in V1 that were never ported — Gumroad and ManyChat in `misc/` are candidates). The contract design doc considers those at design time, not after.

---

## 9. Open questions for Marcus

These need decisions before audits begin (or, where indicated, before a specific later step).

### 9.1. Do we have real V1 usage data?

The roadmap's priority order references "V1 usage data" but no analytics export, per-action invocation counts, or trigger-fire rates exist in either repo. **Need:** confirm whether real data exists somewhere (Supabase analytics, Vercel logs, Mixpanel, etc.) or if the proxy approach in §4 is the operational answer.

If real data exists: how do we pull it in a form usable by the audit? (One-off SQL? Export script?)

### 9.2. If no real data, are the proposed proxies acceptable?

Per §4, the composite of (manifest count + tier + doc density + test density + template presence + AI-planner refs) drives the pre-audit rank. **Need:** confirm this proxy mix is acceptable or propose a different one. The risk surface is documented in §4.

### 9.3. Naming convention for parity audit docs

The Phase 1 exit doc is `phase-1-provider-completion-audit.md`. The roadmap §Phase 2 names parity docs as `docs/roadmap/provider-parity/<provider>.md`. Two questions inside this:

- **File-name pattern:** `parity-<provider>.md` vs `provider-parity-<provider>.md` vs `<provider>-parity.md`? (Recommendation: `parity-<provider>.md` — sorts grouped together.)
- **Per-audit doc name:** is it always `parity-<provider>.md`, or does each get a slice number (`slice-18-slack-parity.md`, `slice-19-gmail-parity.md`)? Slice numbers were a Phase 1 convention; Phase 2 may not need them.

### 9.4. Audit doc location

The roadmap says `docs/roadmap/provider-parity/<provider>.md`. The Phase 1 audit lives at `docs/slices/phase-1-provider-completion-audit.md`. Two consistent options:

- **(a)** Audit docs under `docs/slices/parity-<provider>.md` (consistent with where Phase 1 audit lives; easier to find next to slice plans).
- **(b)** Audit docs under `docs/roadmap/provider-parity/<provider>.md` (consistent with the roadmap's draft; separates audit-state docs from implementation slice plans).

**Recommendation:** **(a)** for consistency with Phase 1 (which put the master audit under `docs/slices/`). The roadmap can be updated to point at the new location.

This master plan is staged at `docs/slices/phase-2-plan.md` on the assumption of (a). If Marcus prefers (b), the master plan moves to `docs/roadmap/phase-2-plan.md` and per-provider audits go to `docs/roadmap/provider-parity/<provider>.md`.

### 9.5. Trello / token-ingest sequencing relative to normal parity

§8 says the token-ingest contract is a separate slice and Trello implementation waits for it. **Need:** decide when to schedule the contract slice. Two options:

- **(a)** Token-ingest contract is **slice 0** of Phase 2 — designed and accepted before the first normal parity audit (Slack) begins. Parity audits then ship in priority order.
- **(b)** Normal parity audits ship first (Slack → Gmail → Notion → Excel → ...) and the token-ingest contract slots in once Marcus signals it's needed. Trello stays parked until then.

**Recommendation:** **(b)** — parity work has more user-visible value than a contract that only Trello consumes today. The contract gets scheduled when Trello becomes the headline ask, which may be never if other parity work fills the demand.

### 9.6. UI / Phase 3 parallelism

The roadmap puts Phase 3 (UI) after Phase 2 (parity). The Phase 1 audit's exit logic suggests Phase 3 starts when Phase 2 is "substantively complete." **Need:** define "substantively complete" — does it mean every audit accepted (including audits that recommend "skip/defer everything"), or every "port" decision shipped?

Two options:

- **(a)** Strict: Phase 3 starts only after every audit is accepted AND every "port" decision has shipped. Cleanest sequencing; longest wait.
- **(b)** Pragmatic: Phase 3 starts after the top-N parity slices ship (top 4–5 priority providers), and the long tail of parity slices runs in parallel with early Phase 3 work. Faster delivery; introduces Phase 2 / Phase 3 cross-coupling that may produce design churn.

**Recommendation:** **(b)** with a guardrail — Phase 3 starts after parity slices for **Slack + Gmail + Notion + at least one Microsoft provider** ship (priority 1–4 in §3). That gives Phase 3 a stable reference surface across the four highest-traffic provider tiers without waiting for the whole long tail.

---

## 10. What happens after this plan is accepted

This master plan is doc-only. After Marcus accepts:

1. **Phase 2 is officially open.** The roadmap status table updates to show Phase 2 in-progress.
2. **The first per-provider audit opens.** Per the priority order in §3, that's **Slack**. The Slack audit doc is staged at `docs/slices/parity-slack.md` (subject to open question 9.4).
3. **No implementation work** until the Slack audit is accepted.
4. **Open questions in §9 are answered** in this conversation or in the conversation that opens the Slack audit.

The audit-then-implement cycle repeats per provider until the Phase 2 done condition (§7) is met.

---

## 11. Status table (single-glance)

| Item | Status | Blocking |
|---|---|---|
| Phase 2 master plan | ⏳ Pending Marcus acceptance | — |
| Open questions §9 | ⏳ Pending answers | Master plan acceptance |
| Slack parity audit | ⏳ Not started | Master plan + open questions |
| Gmail parity audit | ⏳ Not started | Slack audit accepted |
| Notion parity audit | ⏳ Not started | Gmail audit accepted |
| ... (priority 4–12) | ⏳ Not started | Predecessor audit accepted |
| Token-ingest auth contract | ⏳ Not scheduled | Marcus decision per 9.5 |
| Trello parity audit | ⏳ Not started | Token-ingest contract OR Marcus go-ahead per 9.5(b) |

---

## 12. How to use this doc

- **Before opening a per-provider parity audit**, re-read §2 (template) and §5 (rot catalog). Cite rot IDs by number rather than re-deriving the analysis.
- **Before scheduling a parity slice for implementation**, confirm the audit is accepted (check the audit's own §14 exit checklist).
- **Before adding a row to the rot catalog**, confirm the pattern appears in 2+ providers — single-provider rot belongs in the per-provider audit's §8, not in the cross-cutting catalog.
- **At Phase 2 exit**, update this doc and the roadmap status table. Capture any audit-time revisions to the priority order, the proxy mix, or the slice shape so the next phase has accurate operational truth.
