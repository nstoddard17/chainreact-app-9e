# ChainReactV2 — Engineering Roadmap

**Scope:** Current status, what to build next, and the standards that gate new work.
**Audience:** Marcus + future Claude sessions. Not a marketing doc.

This roadmap is forward-looking. It states where ChainReactV2 is now, what ships next, and
the standards every new slice must meet. Detailed rules live in [`docs/rules/`](../rules/)
and the **V2 Provider Authoring Rules** in root [`CLAUDE.md`](../../CLAUDE.md); this doc
points at them rather than restating them.

---

## Current status

ChainReactV2 is **live in production** at `https://chainreact.app`, deploying from the
`v2-main` branch. Authoritative live/verification detail:
[`docs/slices/phase-4/v2-go-live-status.md`](../slices/phase-4/v2-go-live-status.md).

- **Providers.** Runtime is essentially complete across the shipped provider set (real,
  non-stubbed action/trigger handlers; full Jest suite green). The remaining provider work
  is **builder metadata**: a small set of providers are runtime-present but builder-invisible
  (`hasMetadata:false`). Live tracker:
  [`provider-metadata-launch-gap-tracker.md`](../slices/phase-4/provider-metadata-launch-gap-tracker.md).
- **Account model.** Account is the permanent owner of workflows, integrations, and runs.
  Personal vs team/org are account *types*, not separate ownership systems. Canonical rules:
  [`docs/rules/account-ownership-model.md`](../rules/account-ownership-model.md).
- **Billing.** A **reserve/reconcile** model on `account_billing` + AI credits, account-scoped,
  Stripe-signature-verified, idempotent, and fail-closed. The only billing-adjacent cron is
  `release-expired-reservations`. Authoritative state:
  [`billing-production-readiness-closeout.md`](../slices/phase-5/billing-production-readiness-closeout.md),
  [`reserve-reconcile-billing-design.md`](../slices/phase-4/reserve-reconcile-billing-design.md).
- **Engine.** Deterministic execution with strict pre-resolution, durable run queue, HITL
  pause/resume, and the Q-contract suite (Q2 strict resolution, Q4 idempotency, Q8 test-mode,
  Q11 no hidden defaults, Q12 tz/locale). Rule: [`docs/rules/workflow-lifecycle.md`](../rules/workflow-lifecycle.md).
- **AI.** The React Agent ships visible; the deterministic "Check workflow" review is a
  zero-credit, no-LLM local path. AI is a component, not the system — workflow execution stays
  deterministic.

Per-slice history is under [`docs/slices/`](../slices/). Those are records of completed work,
not current guidance.

---

## Operating principles

These hold across every piece of work. They are the lens for prioritization.

1. **Build from current ChainReactV2 code, docs, tests, official provider docs, and live
   provider evidence.** These are the only implementation references.
2. **Honest-state capabilities.** A manifest capability flips true only when a real handler /
   trigger is registered. The provider registry is the single source of truth.
3. **Reuse existing V2 patterns.** Match a same-family provider/subsystem where one exists,
   then verify against official docs and live behavior.
4. **One source of truth per concern.** Provider registry. Manifest. Action handler registry.
   Polling registry. No parallel structures.
5. **Tests cite contracts.** Unit tests reference the slice's plan / contract Q-numbers; e2e
   tests exercise real V2 internals and mock only the external provider boundary.
6. **Living documentation.** When a slice introduces an architectural pattern, the docs update
   in the same batch. This roadmap is living — append status and decisions as work completes.
7. **Push-gated.** Local work stays local by default. Pushing `v2-main` deploys to production
   and requires Marcus's explicit, per-batch approval.

---

## What to build next

### Launch readiness

- **Builder-metadata launch gap.** Bring the remaining runtime-present providers to
  builder-visible (`hasMetadata:true`) with full config metadata, so no shipped provider
  renders as "coming soon". Tracker linked above.
- **Dev / staging environment.** A proper dev/staging environment lands before broad user
  rollout and before taking payments. Until it exists, `v2-main` is the ship path and every
  deploy is production.

### Provider expansion

New providers are selected by **product value, official API support, V2 architecture fit, and
live-certification readiness**. Each new provider follows the
[`chainreactv2-provider-integration-builder`](../../.claude/skills/chainreactv2-provider-integration-builder/SKILL.md)
skill end to end: research → v2-pattern-audit → implementation plan → build/test/smoke →
owner setup report → live completion certification. No net-new provider ships without a
`v2-pattern-audit.md` and a roadmap entry.

### Ongoing hardening

- Extend engine coverage (parallel branch/loop execution, per-handler timeouts + circuit
  breakers) as load and product needs demand.
- Grow the self-growing template pool so published templates reduce planner LLM calls.
- Keep the agent eval harness (`agent_eval_events`) tracking planner accuracy / cost / latency;
  bump `AGENT_VERSION` on every agent change.

---

## Provider / feature selection gate

Before adding a feature or provider, apply this gate:

1. **Valued?** Does it deliver real product value? (If unknown, skip until needed.)
2. **Supported?** Does the provider's official API support it safely, with the scopes and
   endpoints available? (If not, it's blocked, not silently deferred.)
3. **Fits?** Does it fit the current V2 architecture, or does it need infrastructure that
   doesn't exist yet? (If the latter, sequence the infrastructure first.)
4. **Certifiable?** Can it be live-certified against the real provider boundary?

---

## Standards that gate every slice

- **Provider authoring:** **V2 Provider Authoring Rules** in [`CLAUDE.md`](../../CLAUDE.md).
- **Account ownership:** [`docs/rules/account-ownership-model.md`](../rules/account-ownership-model.md).
- **Database security (RLS / GRANT / token encryption):** [`docs/rules/database-security.md`](../rules/database-security.md).
- **Variable resolution:** [`docs/rules/variable-resolver.md`](../rules/variable-resolver.md).
- **Webhook receipt / dispatch:** [`docs/rules/webhook-receipt-routes.md`](../rules/webhook-receipt-routes.md).
- **Workflow lifecycle:** [`docs/rules/workflow-lifecycle.md`](../rules/workflow-lifecycle.md).
- **Testing strategy:** [`docs/rules/testing-strategy.md`](../rules/testing-strategy.md).
- **Project structure / module boundaries:** [`docs/rules/project-structure-and-module-boundaries.md`](../rules/project-structure-and-module-boundaries.md).

---

## Non-goals (current)

- Custom code nodes (arbitrary JS / Python evaluation).
- Multi-region execution.
- SAML / SSO (not on the current launch path).
- AI-driven runtime execution — workflows run deterministically; AI plans and suggests only.

---

## How to use this doc

- **Before adding a provider**, select it by the gate above, follow the provider-integration
  builder skill, and certify it live.
- **Before adding a feature**, run the selection gate. If it survives, sequence it against the
  standards above.
- **When a slice changes an architectural pattern**, update the relevant rule doc and this
  roadmap in the same batch.
