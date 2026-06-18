# ChainReact Pricing and Tiers (Canonical)

**Status:** Canonical reference for plan tiers, limits, and feature gating.
**Locked:** 2026-06-17 (PRICING-LOCK-1). Recommended launch pricing; may change before public launch.
**Source of truth for limits:** [`core/billing/planPolicy.ts`](../../core/billing/planPolicy.ts) (`PLAN_LIMITS`).
This doc explains and contextualizes those numbers; the code is authoritative for the numeric caps.

> Honesty note: prices below are the recommended launch prices. They are NOT hardcoded in the
> repo. Stripe Price IDs are resolved from env vars (`STRIPE_PRICE_PRO` / `_TEAM` / `_BUSINESS`)
> in [`services/billing/platformStripePrices.ts`](../../services/billing/platformStripePrices.ts);
> the dollar figures live in the Stripe dashboard. Checkout is dark-launched behind
> `ENABLE_PLATFORM_BILLING` (default OFF), so no plan is publicly purchasable yet.

## Price summary

| Tier | Price (annual) | Price (monthly) | For |
|------|----------------|-----------------|-----|
| Free | $0 | $0 | Trying the product |
| Pro | $19/mo | $25/mo | Solo builders running real workflows |
| Team | $59/mo | $75/mo | Small teams sharing workflows and connections |
| Business | $199/mo | $249/mo | Companies needing control, visibility, scale |
| Enterprise | Custom | Custom | Custom limits, security, compliance, procurement |

Monthly vs annual price variants are NOT yet modeled in code (single price per tier per
`platformStripePrices.ts`; annual is a deferred decision). Document-only until that lands.

## Limit matrix (per month unless noted)

These numbers live in `PLAN_LIMITS` and are read by the marketing pricing page, account-settings
copy, the downgrade-safety check, and the billing webhook/upgrade RPC.

| Limit | Free | Pro | Team | Business | Enterprise |
|-------|------|-----|------|----------|------------|
| Seats (incl. owner) | 1 | 1 | 5 | 25 | Custom |
| Workflow tasks / mo | 100 | 2,000 | 7,500 | 25,000 | Custom |
| AI credits / mo | 20 | 500 | 2,000 | 10,000 | Custom |
| Workflow folders | 10 | 25 | 100 | 250 | Custom |
| Custom templates | 0 | 25 | 50 | 250 | Custom |
| Built-in template use | Yes | Yes | Yes | Yes | Yes |
| Bulk export | No | Yes | Yes | Yes | Yes |

`null` in code means custom/uncapped (Enterprise); per-deal values are set on `account_billing`
directly.

## Valid account type to plan combinations

From `ALLOWED_PLANS_BY_TYPE` in `planPolicy.ts` (`account.type` is internal; user-facing labels
in parentheses):

- `personal` (Personal): Free, Pro
- `team` (Team): Team
- `organization` (Business): Business, Enterprise

In-place cross-type upgrade: Team to Business (flips `accounts.type` team to organization via the
`apply_business_upgrade` RPC). No other cross-type upgrade exists.

## AI credits vs workflow tasks (separate billing dimensions)

These are two independent dials, by design.

- **Workflow tasks** measure automation execution work (roughly one action a workflow carries
  out when it runs). Today billing deducts a flat 1 task per run
  ([`services/billing/executionBillingGate.ts`](../../services/billing/executionBillingGate.ts));
  a per-node cost model is classified and recorded but not yet enforced
  ([`services/billing/taskCostPolicy.ts`](../../services/billing/taskCostPolicy.ts)).
- **AI credits** meter paid model calls
  ([`core/billing/aiCreditPolicy.ts`](../../core/billing/aiCreditPolicy.ts)). Per-call cost:
  workflow_creation 2, workflow_editing 2, workflow_repair 4, workflow_explanation 1,
  workflow_qa 1, failed_run_analysis 1, provider_discovery 1, template_recommendation 1,
  template_customization 2, cost_preview 0. A stronger model costs 2x; an escalation adds 1.5x.
  An unmapped paid LLM call fails closed to 5 credits.
- **Deterministic work is free / 0 credits.** `cost_preview` and any non-LLM check return 0.
  Deterministic "Check workflow" does not consume credits.
- Cheap-model-by-default routing with escalation only on validation failure / low confidence /
  higher-tier flows is the intended direction (the escalation multiplier is wired; no path
  escalates yet).

## Feature gates: built now vs planned

Built and enforced today:
- Seat caps (Team 5 / Business 25), enforced at invite time via member-limit helpers.
- Folder caps by account type (personal 10 / team 100 / organization 250), enforced at folder
  creation. NOTE: this is account-type-keyed, so Pro's documented 25 folders is not yet honored
  (see gaps below).
- Monthly task limit, enforced at execution (flat 1/run) against `account_billing.tasks_limit`.
- Bulk export gate (Free no, paid yes) via `canBulkExportForPlan` (resolver exists;
  route-level wiring per feature).
- Built-in template use for all tiers.

Built but flag-gated OFF (dark-launched):
- Platform checkout / portal (`ENABLE_PLATFORM_BILLING`).
- Personal Free to Pro upgrade (`ENABLE_PERSONAL_PRO`).
- Business to Team downgrade (`ENABLE_BUSINESS_DOWNGRADE`).
- AI credit enforcement gate (`ENABLE_AI_CREDIT_ENFORCEMENT`); credits are recorded today,
  deducted/blocked only when the flag is on.

Planned / not yet built (do not advertise as available):
- Active-workflow count limits (Free 3 / Pro 25 / Team 100 / Business 500). No field, no
  enforcement.
- Run-history retention (Free 7d / Pro 30d / Team 90d / Business 180d). No field, no TTL.
- Connected-accounts-per-app limits (Free 1 / paid unlimited). No field, no enforcement.
- Concurrency / priority execution. No model.
- Webhook triggers, multi-step, filters/paths/branching/loops, AI creation/diagnosis/repair,
  retries: feature availability is governed by the product surface, not by a per-tier flag in
  `planPolicy` today. Gate per tier when the product decides to meter them.
- Enterprise: SSO/SAML/SCIM, audit logs / log streaming, custom connectors, dev/staging/prod
  environments, invoice billing, dedicated support / SLA. All "contact us"; none built.

## Enforcement status (what actually limits usage today)

| Limit | Enforced today? | Notes |
|-------|-----------------|-------|
| Monthly task limit | Yes (blocks) | `executionBillingGate` to `deductTasks` RPC; lazy period rollover |
| Pro task cap propagation | Yes | Webhook `applyResolvedPlan` stamps personal `tasks_limit` from policy |
| Business task cap propagation | Yes (new upgrades) | `apply_business_upgrade` RPC defaults `p_tasks_limit` from policy |
| Team task cap propagation | **No (gap)** | Team accounts keep the `account_billing` default (100); only a business to team downgrade stamps the team cap. Follow-up: stamp team/org caps on team-plan activation + backfill |
| AI credit limit | Gate exists, OFF | `aiCreditGate` no-op until `ENABLE_AI_CREDIT_ENFORCEMENT=true`; not wired into AI routes yet |
| Seat / member limit | Yes (blocks) | Enforced at invitation |
| Folder limit | Yes, by account type | Personal 10 (so Pro 25 is **not** honored yet); team 100; org 250 |
| Template limit | No | Policy + helpers exist; no route consumes the cap yet |
| Active workflows | Not implemented | No field/model |
| Run-history retention | Not implemented | No TTL/delete policy |
| Connected accounts per app | Not implemented | No field/model |
| Concurrency / priority | Not implemented | No queue/model |

## Credential safety (preserved, unchanged)

Team-visible does not automatically mean team-runnable. Private / member-connected credentials
stay scoped to the connecting member; ChainReact does not let other teammates run a workflow as
the original connector. Account/service providers (Slack, Notion, Stripe, Shopify, HubSpot,
Mailchimp) can be shared at the account level; everything else is personal. See
[`core/integrations/credentialSharing.ts`](../../core/integrations/credentialSharing.ts).

## Follow-ups before public pricing launch

1. **Team task enforcement.** Stamp team/org `tasks_limit` from policy on team-plan activation
   (extend `applyResolvedPlan`) and backfill existing team accounts, or accept that team caps
   only apply via the downgrade path.
2. **Pro folder enforcement.** Make folder enforcement plan-aware (currently account-type-keyed),
   or set Pro folders back to 10 in policy + docs to match enforcement.
3. **Decide annual vs monthly modeling** if annual pricing ships (add a billing-interval
   dimension to `platformStripePrices.ts`).
4. **Decide which Pro/Team/Business feature bullets to gate** (active workflows, retention,
   connected-accounts-per-app) and build the enforcement before advertising hard numbers.
5. **Set the Stripe Price IDs** (`STRIPE_PRICE_PRO/TEAM/BUSINESS`) to prices matching this doc
   before flipping `ENABLE_PLATFORM_BILLING`.
