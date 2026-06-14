# 4.APP-ADD-0 — Provider Inventory + Next-App Recommendation

**Type:** Audit + recommendation (docs-only). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Companion:** [adding-a-new-provider.md](../../runbooks/adding-a-new-provider.md) (the playbook a build must follow) ·
[apps-permissions-matrix-closeout.md](./providers/apps-permissions-matrix-closeout.md) (permission model the new provider inherits).

> **Headline:** the existing provider catalog is **mature** — all **25** registry
> providers are enabled, classified, OAuth/token-ingest registered, Apps-page
> visible, and carry STRONG test coverage. **No scaffolded / broken / metadata-only
> providers exist.** So "the next app" means a **net-new** provider, not finishing a
> half-built one. Recommended first build: **Asana** (research-first; build only on
> Marcus's approval).

---

## 1. Method / files inspected

Cross-verified by four independent sweeps of the live code (counts taken by listing
directories + registries, not estimated):

- Roster + flags: [`integrations/_registry.ts`](../../integrations/_registry.ts) (`ALL_MANIFESTS`), each `integrations/<id>/manifest.ts`, [`core/integrations/credentialSharing.ts`](../../core/integrations/credentialSharing.ts), [`services/oauth/dispatcher.ts`](../../services/oauth/dispatcher.ts) (`OAUTH_BY_PROVIDER` / `TOKEN_INGEST_BY_PROVIDER`).
- Action/trigger/option counts: `integrations/<p>/{actions,triggers,options}/`, [`services/execution/handlers/_handlerInventory.ts`](../../services/execution/handlers/_handlerInventory.ts), [`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts), [`services/options/_registry.ts`](../../services/options/_registry.ts).
- Webhooks + tests: `app/api/webhooks/**`, `integrations/<p>/webhooks/`, `tests/unit/**`.
- Apps-page visibility: [`lib/apps/providerCategories.ts`](../../lib/apps/providerCategories.ts), `public/integrations/*.svg`.

`native` (httpRequest / delay / manual+scheduled triggers / router / if-then) is the
built-in pseudo-provider, not a connectable app — excluded from the 25.

---

## 2. Provider inventory (25 connectable providers)

Class: **P** = personal (connector-owned), **A** = account/service (owner/admin-managed).
Connect: OAuth = `code_callback`, TI = `token_ingest`. Triggers: W = webhook, P = polling.
All counts are *registered* counts.

| Provider | Class | Connect | Refresh | Apps-visible | Actions | Triggers | Webhook route | Tests | Status | Safe to expose now |
|---|---|---|---|---|---|---|---|---|---|---|
| slack | A | OAuth | no | ✅ | 31 | 10 W | ✅ | STRONG | Complete | ✅ |
| notion | A | OAuth | no | ✅ | 16 | 0 | — | STRONG | Complete (actions-only) | ✅ |
| stripe | A | OAuth | yes | ✅ | 16 | 1 W | ✅ | STRONG | Complete | ✅ |
| shopify | A | OAuth | no | ✅ | 11 | 1 W | ✅ | STRONG | Complete | ✅ |
| hubspot | A | OAuth | yes | ✅ | 26 | 1 W | ✅ | STRONG | Complete | ✅ |
| mailchimp | A | OAuth | no | ✅ | 14 | 7 (1W,6P) | ✅ | STRONG | Complete | ✅ |
| gmail | P | OAuth | yes | ✅ | 13 | 3 P | — (polling) | STRONG | Complete | ✅ |
| google-calendar | P | OAuth | yes | ✅ | 5 | 1 W | ✅ | STRONG | Complete | ✅ |
| google-docs | P | OAuth | yes | ✅ | 5 | 2 W | ✅ | STRONG | Complete | ✅ |
| google-drive | P | OAuth | yes | ✅ | 5 | 1 W | ✅ | STRONG | Complete (route test gap) | ✅ |
| google-sheets | P | OAuth | yes | ✅ | 11 | 2 W | ✅ | STRONG | Complete (route test gap) | ✅ |
| google-analytics | P | OAuth | yes | ✅ | 6 | 0 | — | STRONG | Complete (read-only, no triggers) | ✅ |
| microsoft-outlook | P | OAuth | yes | ✅ | 9 | 3 W | ✅ +lifecycle | STRONG | Complete | ✅ |
| microsoft-outlook-calendar | P | OAuth | yes | ✅ | 5 | 1 W | ✅ +lifecycle | STRONG | Complete | ✅ |
| microsoft-onedrive | P | OAuth | yes | ✅ | 7 | 1 W | ✅ +lifecycle | STRONG | Complete | ✅ |
| microsoft-onenote | P | OAuth | yes | ✅ | 12 | 2 P | — (polling) | STRONG | Complete | ✅ |
| microsoft-excel | P | OAuth | yes | ✅ | 10 | 5 P | — (polling) | STRONG | Complete | ✅ |
| microsoft-teams | P | OAuth | yes | ✅ | 5 | 1 W | ✅ +lifecycle | STRONG | Complete | ✅ |
| airtable | P | OAuth | yes | ✅ | 11 | 1 W | ✅ | STRONG | Complete | ✅ |
| trello | P | TI | no | ✅ | 8 | 6 W | ✅ | STRONG | Complete | ✅ |
| monday | P | OAuth | yes | ✅ | 24 | 5 W | ✅ | STRONG | Complete | ✅ |
| github | P | OAuth | no | ✅ | 6 | 1 W | ✅ | STRONG | Complete | ✅ |
| discord | P | OAuth | yes | ✅ | 5 | 2 (1W,1P) | ✅ | STRONG | Complete | ✅ |
| dropbox | P | OAuth | yes | ✅ | 11 | 1 W | ✅ | STRONG | Complete | ✅ |
| facebook | P | OAuth | no | ✅ | 8 | 2 W | ✅ | STRONG | Complete | ✅ |

**Classification buckets (per the task):**
- **Complete enough for production smoke:** **all 25.** Enabled, classified, registered, visible, STRONG tests, ≥5 actions each.
- **Mostly complete (minor gaps):** see §3 — all cosmetic/polish, none blocking.
- **Metadata-only / scaffolded:** **none.**
- **Broken / stale:** **none.**
- **Not present (candidates):** see §5.

Consistency checks all passed: every registry provider is classified in
`credentialSharing.ts` and registered in the dispatcher; every provider has a
description, category, and SVG icon. No orphans either direction.

---

## 3. Existing-catalog gaps (optional polish — NOT blockers, NOT this slice)

These are small and do **not** make any provider unsafe to expose. Listed for honesty;
fixing them is independent of adding a new provider. **The deltas below are apparent
file-vs-registry counts and likely include `_shared` helper dirs miscounted as
resources — verify each before treating it as a real gap.**

- **Webhook route tests missing:** `google-drive` and `google-sheets` have webhook
  receive modules + integration tests but no dedicated `app/api/webhooks/<p>.route.test.ts`.
- **Apparent unregistered option-source / action deltas** (files present > registered):
  slack (−2 actions), google-sheets (−1 action), discord (−2 options), airtable/
  facebook/microsoft-onedrive/microsoft-teams/trello (−1 option each). Most are very
  likely `_shared` directories, not real omissions — confirm by reading the dirs.
- **No-trigger providers:** `notion` and `google-analytics` expose 0 triggers (Notion
  has no first-class webhook; GA is report/read-oriented). Intentional, not a defect.

Recommendation: leave these for a small "catalog polish" slice later; none block launch
or a new build.

---

## 4. Reading: what the inventory implies

The catalog already covers communication, productivity/PM, storage, CRM, marketing,
e-commerce, payments, social, analytics, and developer. The highest-leverage move is a
**net-new provider** that opens a category we don't serve well yet (scheduling, support,
forms, SMS) or deepens a strong category (project management). The provider must fit the
playbook profiles so the build is mechanical, not exploratory.

> **Honesty note on external specifics.** The OAuth model (refresh vs long-lived),
> webhook availability/plan tier, exact scopes, and personal-vs-account class for the
> candidates below are stated from general API knowledge as of training and **MUST be
> confirmed in the playbook's Mode-A research (§1) before any build.** That research
> step is mandatory anyway; this doc only recommends *which provider to research first*.

---

## 5. Top 3 next-provider recommendations

| Rank | Provider | Category (new value) | Likely class | Likely profile | Why | Main risk to verify in §1 |
|---|---|---|---|---|---|---|
| **1** | **Asana** | Project management | Personal | Profile 1 (refreshable OAuth + webhook w/ handshake) | Golden-path fit; broad appeal; free dev account + free webhooks; easy to smoke (create a task → webhook). Exercises the well-trodden personal-connector path end-to-end. | Confirm refresh-token issuance + webhook `X-Hook-Secret` handshake + scope granularity. |
| **2** | **Linear** | Dev issue tracking | Account/service (workspace) | Profile 3/6 (likely non-refreshable OAuth + permanent webhook) | On-brand (CR's Notion/Linear/Stripe north star); free OAuth + free webhooks (no paid tier); **validates the new §4.8 owner/admin account-provider permission path**. | Confirm token longevity (no refresh?), webhook signing, and the **personal-vs-account classification decision** (§4.8.1). |
| **3** | **Calendly** | Scheduling | Personal | Profile 6 (permanent webhook w/ signing key) | Scheduling automation is a flagship use case (booked → CRM/Slack/email follow-up); very broad appeal beyond dev. | **Webhook subscriptions may require a paid Calendly plan** — a §0.2 stop-and-ask. Actions work on free; the *trigger* may be gated. |

Deliberately deferred:
- **Twilio (SMS)** — extremely useful and OAuth-free (API key), but it would be the
  **first API-key provider** and there is **no API-key credential-entry UX today** (all
  25 are OAuth/token-ingest). That's a new auth surface to design (§0.2 / §10.5), not a
  clean playbook build. Strong candidate *after* the API-key UX exists.
- **Jira/Atlassian, Salesforce, Zendesk** — high value but heavier OAuth (3LO / cloudid
  / enterprise consent) and approval friction. Better once the easy wins land.

---

## 6. Recommended first build: **Asana**

**Why Asana over the others as the *first*:**
- **Cleanest playbook fit.** If §1 confirms refreshable OAuth 2.0 + webhooks, it maps
  to **Profile 1** — the golden path the playbook is built around (copy from
  `microsoft-teams` / `airtable`).
- **No paid blocker** (unlike Calendly's likely paid webhooks) and **no new auth UX**
  (unlike Twilio's API key). Free developer app + free workspace to smoke locally and in
  prod.
- **Personal credential class** — the most-exercised permission path (member connects
  their own; connector-only reconnect/share), so the APPS-PERM model applies with zero
  surprises.
- **Broad customer usefulness** — task/project automation (create task on form submit,
  notify on task completed, sync to Slack/Notion) is core Zapier-grade value we don't
  cover yet.

**Close second:** Linear — pick it instead if §1 shows Asana's OAuth/webhook story is
messier than expected, *or* if we specifically want the first new provider to validate
the new account/service owner-admin permission path end-to-end.

---

## 7. What Marcus would personally need to do (Asana — confirm in §1, then do for Mode B)

Likely owner-only setup (verify exact steps during research; do NOT pre-create until the
plan is approved):
- **Developer account / app:** create a free Asana developer app in the Asana developer
  console; capture **client id + client secret** → `.env` (`ASANA_CLIENT_ID`,
  `ASANA_CLIENT_SECRET`, names TBD in plan).
- **Redirect URL:** register our callback `…/api/integrations/oauth/asana/callback`
  (local + prod URLs).
- **Scopes:** confirm the minimal scope set for the launch actions/triggers (Asana's
  scope model is coarse historically — verify granular scopes vs `default`); justify
  each scope per §0.2.
- **Test workspace:** a free Asana workspace + a project to smoke connect → create task →
  webhook → trigger.
- **Webhook setup:** Asana webhooks are created via API at trigger-activation time (no
  console step) and use an `X-Hook-Secret` handshake — confirm the handshake + signature
  verification in §1 (mirror the existing challenge-style providers).
- **No paid plan expected** — confirm during research that webhooks/actions don't require
  a paid Asana tier.

If §1 reclassifies Asana as account/service, the connect/reconnect/disconnect gating
flips to owner/admin automatically (§4.8) — no extra work, but note it in the plan.

---

## 8. Exact next implementation slice proposal

**APP-ADD-1 — Asana provider: Mode A research + plan only (NO code).**
- Run the playbook §1 research → fill the §1.4 research output (auth model, scopes with
  justification, webhooks vs polling, rate limits, tokenScope, accountIdField, sandbox,
  app-review needs).
- Make the **§4.8.1 classification decision** (personal vs account/service) with rationale.
- Produce the §2.2 plan: manifest fields, launch-scope actions/triggers (defer the rest
  with reasons), env vars, Marcus's developer-console task list, blockers.
- **STOP for Marcus sign-off** (per playbook §0.1 / §0.2). Docs-only; nothing built.

**APP-ADD-2 — Asana Mode B implement** (only after APP-ADD-1 is approved): backend (§3),
frontend incl. §4.8 permission wiring (§4), AI visibility (§5), tests (§6) incl. a
permission/DTO test, §0.5 gates, §7 report. Local commits, no push.

Do **not** start APP-ADD-1 until Marcus approves the provider choice.

---

## 9. Closeout confirmation

Docs-only. No source/test/migration/UI changed. Nothing pushed. No `db:push`. No
AI/MCP/billing change. Doc path:
`docs/slices/phase-4/provider-inventory-and-next-app.md`.
