# Analytics observability widgets — product decision (do not build)

> Status: **DECISION (2026-06-26, Marcus).** Durable product guidance. Supersedes
> the feasibility findings of the prior technical audit for this scope. Docs-only;
> no product code, migration, flag, or behavior changed.

## Decision

We are **not** building a customer-facing observability / "Workflow Health" metrics
slice on the Analytics page right now, and we are **not** standing up a separate
customer-facing observability dashboard right now. Marcus will set the next
Analytics/product direction later.

Specifically, do NOT add these as customer Analytics widgets right now:
`runs_by_status`, `p95_duration`, `failures_by_workflow`, reconnect-required counts,
disconnected counts, queue depth, cron failures, OAuth refresh failures, and
provider-wide failure rates.

## Why (durable product guidance)

1. **Analytics is not an ops console.** Keep it a value surface, not an SRE surface.
2. **Customer Analytics focuses on user/business value**, not technical/SRE
   observability.
3. **Do not duplicate** a metric as an Analytics widget just because the data exists.
   If it is already visible elsewhere, that is where it stays.
4. **App health / reconnect issues belong on the Apps / Connected Apps surface**,
   where the user can act (the page already shows per-app "Reconnect needed" pills,
   per-account reconnect CTAs, and bell notifications). An aggregate "needs
   attention" count, if wanted, is an Apps-page addition, not an Analytics widget.
5. **Run failures / debugging belong on Runs, workflow detail, and the builder run
   results** (status, duration, classified error card, per-step output, AI repair),
   where the user can inspect, retry, and fix.
6. **Platform / internal observability stays internal and deferred.** Queue depth,
   cron failures, webhook dedup outages, OAuth refresh spikes, billing
   reconciliation drift, and provider-wide failure rates are cross-account platform
   health. They must not be exposed through the account-scoped, member-readable
   Analytics page. They stay where roadmap Phase 8a/8b already puts them (structured
   logs to an external sink such as Grafana, plus paging) until V2 has BOTH a real
   platform-owner authorization tier AND durable event ledgers (cron-execution,
   refresh-failure, dedup-outage records). Neither exists today.
7. **Feasible does not mean worth building.** The earlier technical feasibility
   audit (most of this data is reachable) is superseded by this product-value
   decision.
8. **Do not re-propose or implement the canceled Workflow Health metrics** unless
   Marcus explicitly reopens this.

## What this does NOT change

- The existing Analytics page and its current metrics (success rate, outcomes,
  runs over time, avg duration, top workflows, recent runs, connected apps) are
  unchanged.
- The connected-app analytics SOURCE registry and its already-shipped business
  metrics (Stripe, HubSpot, Shopify, Gmail, Slack, etc.) are unchanged and remain
  the right place for user/business-value widgets.
- Apps, Runs, workflow detail, builder run results, and notifications are unchanged.

## Background

Two audits in the lead-up to this decision: a technical feasibility audit (can the
data back these metrics) and a product-value re-audit (do users gain anything not
already visible). The product-value re-audit found the proposed metrics are either
duplicates of existing Analytics metrics, already visible on Apps / Runs / builder
surfaces, or operator-only. This doc records the resulting decision so the idea is
not re-proposed.

See also: [analytics-closeout.md](./analytics-closeout.md),
roadmap [Phase 8 — Observability/Alerting](../../../roadmap/chainreact-v2-roadmap.md).
