# Template business-capability audit (TEMPLATE-QUALITY-1)

**Date:** 2026-07-15 · **Slice:** TEMPLATE-QUALITY-1 · **Companion closeout:**
[`docs/slices/phase-4/workflows/template-quality-1-closeout.md`](../slices/phase-4/workflows/template-quality-1-closeout.md)

Purpose: map the **registered** ChainReactV2 capability surface to real, recognizable business
processes, so the official template catalog is built from evidence — not from "five nodes that
happen to connect." This audit drove the retirement of the 75 ≤4-node templates (batches 1–3)
and the design of seed batch 5.

---

## 1. Method — what counts as "available"

A node is template-eligible only when **all** of these hold (verified 2026-07-15):

- Its meta is registered in the live discovery registry (`services/discovery/_registry.ts`
  `listAllActionMetas()` / `listAllTriggerMetas()` — dumped directly from the registry, not from
  file presence, manifests, or docs).
- Runtime↔metadata consistency is green (`provider_metadata_consistency_check`: 30/30 providers
  OK, 0 errors/warnings; the 26-provider launch-gap tracker reports 0 pending handlers).
- Its manifest is enabled (`provider_capability_matrix`: all 30 providers `isEnabled=true`).

**Registered surface on the audit date: 350 actions + 74 triggers across 30 providers**
(includes the 5 `native` nodes: `manual.run`, `schedule.fired` triggers; `delay`,
`if_then_condition`, `router`, `format_transformer`, `http_request` actions — `http_request` is
excluded from official templates by policy).

Per-provider action/trigger counts (registry dump):

| Provider | Actions | Triggers | Provider | Actions | Triggers |
|---|---|---|---|---|---|
| airtable | 11 | 1 | microsoft-excel | 13 | 5 |
| asana | 7 | 5 | microsoft-onedrive | 7 | 1 |
| calendly | 0 | 2 | microsoft-onenote | 12 | 2 |
| discord | 5 | 2 | microsoft-outlook | 11 | 3 |
| dropbox | 11 | 1 | microsoft-outlook-calendar | 5 | 1 |
| eden | 36 | 0 | microsoft-teams | 8 | 1 |
| facebook | 8 | 2 | monday | 24 | 5 |
| github | 6 | 1 | native | 5 | 2 |
| gmail | 15 | 3 | notion | 16 | 0 |
| google-analytics | 6 | 0 | quickbooks | 7 | 4 |
| google-calendar | 5 | 1 | shopify | 11 | 1 |
| google-docs | 5 | 2 | slack | 31 | 10 |
| google-drive | 7 | 1 | stripe | 16 | 1 |
| google-sheets | 12 | 2 | trello | 8 | 6 |
| hubspot | 26 | 1 | typeform | 2 | 1 |
| mailchimp | 14 | 7 | — | — | — |

Engine capabilities that matter for templates (verified in code):

- **Branching is supported**: `WorkflowEdge.label` + handler `branchTaken` + label-aware
  traversal (`services/execution/engine.ts`); `native:if_then_condition` emits
  `'true'`/`'false'` (or skips), `native:router` emits route labels. Batch 5 ships the first
  branching official template.
- **One trigger per workflow** (`WorkflowDefinitionSchema`); no loops/iteration primitive; no
  approval/human-gate primitive; `native:delay` is seconds-based.

---

## 2. Business-capability matrix

Feasibility: **FULL** = complete process shippable today · **PARTIAL** = shippable but a
contract gap limits prewiring or depth · **BLOCKED** = would mislead users; not templated.

| Business need (research-backed) | Trigger | Core actions | Feasibility | Shipped as |
|---|---|---|---|---|
| Web-form lead capture → CRM intake, qualification task, sales alert | `typeform:new_response_in_form` | hubspot create_contact/create_deal/create_task, sheets, slack | **PARTIAL** (answers array not flattened → identity fields left for setup) | Batch 5 `…05b` |
| Survey/NPS detractor close-the-loop (score-based routing) | `typeform:new_response_in_form` | if_then(score<7), hubspot create_ticket, slack, gmail draft | **FULL** (declared `score` scalar) | Batch 5 `…05c` |
| Meeting booked → CRM contact + prep pack | `calendly:event_scheduled` | hubspot contact/task, docs, sheets, slack | **FULL** (flat inviteeEmail/meetingName) | Batch 5 `…05d` |
| Canceled-meeting recovery / rebooking | `calendly:event_canceled` | hubspot task, gmail draft, sheets, slack | **FULL** | Batch 5 `…05e` |
| Invoice issued → AR ledger + follow-up ownership | `quickbooks:invoice_created` | qb get_customer, sheets, hubspot task, slack | **FULL** (flat docNumber/dueDate/customerId) | Batch 5 `…05f` |
| Payment received → cash log + CRM record + acknowledgment | `quickbooks:payment_received` | sheets, hubspot note, gmail draft, slack | **FULL** | Batch 5 `…060` |
| Subscription-cancellation save play (churn rescue) | `stripe:event_received` | find_customer, hubspot task, gmail draft, sheets, slack | **PARTIAL** (`data` opaque → identity left for setup) | Batch 5 `…061` |
| Vendor invoice email intake → AP register + review task | `gmail:new_labeled_email` | draft_reply ack, asana task, sheets, slack | **PARTIAL** (attachment itself not filed — see gap G2) | Batch 5 `…062` |
| Employee offboarding checklist (access, payroll, exit interview) | `native:manual.run` | asana task+subtasks, gcal event, gmail draft, slack | **FULL** | Batch 5 `…063` |
| Campaign QA / launch coordination | `mailchimp:campaign_created` | asana task, notion page, sheets, slack | **FULL** | Batch 5 `…064` |
| Recurring sales-pipeline review | `native:schedule.fired` | hubspot get_deals, docs, sheets, slack | **FULL** (single-page snapshot; no per-deal iteration — G5) | Batch 5 `…065` |
| Project milestone → client update + CRM record | `asana:task_completed` | hubspot note, gmail draft, sheets, slack | **FULL** | Batch 5 `…066` |
| Lead intake/qualification from CRM/db events | hubspot webhook / airtable | (kept batch-4 …04c/…04d) | **PARTIAL** (opaque hubspot event / airtable fields) | Batch 4 (kept) |
| Support escalation from email; product feedback; incident intake; file review; meeting prep; exec report; customer onboarding; content pipeline; ecommerce retention; order ops; payment ops; engagement follow-up; team onboarding | (batch-4 triggers) | (kept batch-4 sets) | **FULL/PARTIAL** per batch-4 prewire gap notes | Batch 4 (kept, 15) |
| High-value / risk-flagged order routing (VIP, fraud hold) | `shopify:webhook_received` | if_then on order total → escalation | **BLOCKED** (G1: `body` opaque — no declared order-total scalar to branch on) | — |
| Staged dunning sequences (reminder → escalate over days) | qb/stripe | delay + re-check + branch | **BLOCKED** (G4/G6: no overdue trigger; multi-day durable delay unverified) | — |
| Attachment filing pipelines (invoices/contracts → Drive) | `gmail:new_attachment` | get_attachment → drive upload | **BLOCKED** (G2: trigger declares no attachmentId) | — |
| Social comment triage by sentiment/intent | `facebook:new_comment` | classify → route | **BLOCKED** (G7: no classification primitive; keyword-only if_then would mislead) | — |
| Approval workflows (expense/content sign-off) | any | human approval gate | **BLOCKED** (G8: no approval primitive; drafts/reactions are only approximations) | — |
| Meeting no-show recovery | calendly | (no-show trigger) | **BLOCKED** (G3: no `invitee_no_show` trigger) | — |

### Research sources (accessed 2026-07-15)

- Lead intake/qualification/routing: [monday.com — lead generation automation](https://monday.com/blog/crm-and-sales/lead-generation-automation/), [Cirrus Insight — CRM workflow automation](https://www.cirrusinsight.com/blog/crm-workflow-automation), [Default — automate sales process](https://www.default.com/post/automate-sales-process)
- AR / dunning / payment recovery: [Invoiced — what is dunning](https://www.invoiced.com/resources/blog/what-is-dunning), [HighRadius — AR process](https://www.highradius.com/resources/Blog/what-is-accounts-receivable-process-cycle/), [Recurly — dunning campaigns](https://docs.recurly.com/docs/dunning-management)
- Employee onboarding/offboarding: [monday.com — onboarding automation](https://monday.com/blog/service/employee-onboarding-automation/), [ManageEngine — on/offboarding workflows](https://www.manageengine.com/products/service-desk/itsm/employee-onboarding-and-offboarding.html), [Rippling — onboarding checklist automation](https://www.rippling.com/blog/the-top-5-ways-to-automate-your-onboarding-checklist)
- Support triage/escalation: [InvGate — ticket triage](https://blog.invgate.com/ticket-triage), [Featurebase — ticket escalation](https://www.featurebase.app/blog/ticket-escalation)
- Scheduling follow-up: [Calendly — workflows](https://calendly.com/blog/workflows), [Calendly Learn — automate reminders/follow-ups](https://calendly.com/learn/calendly-workflows)
- Incident management: [PagerDuty — incident management workflows](https://www.pagerduty.com/resources/incident-management-response/learn/incident-management-workflows/), [Atlassian — postmortems](https://www.atlassian.com/incident-management/postmortem/templates)
- Ecommerce order ops / VIP flagging: [Shopify — automated order fulfillment](https://www.shopify.com/blog/automated-order-fulfillment), [Shopify Flow](https://www.shopify.com/flow)
- NPS close-the-loop: [Zonka — NPS automation](https://www.zonkafeedback.com/blog/nps-automation), [Typeform — NPS form builder](https://www.typeform.com/nps-form-builder)

Competitor templates were used to understand the underlying business processes only; every
shipped graph was designed against ChainReactV2's registered nodes and declared contracts.

---

## 3. Capability gaps (prioritized)

Legend: **META** = runtime exists, declared contract/metadata is the gap · **NEW** = net-new
provider/engine work. None of these were faked in templates; blocked processes were not shipped.

| # | Gap | Provider | Kind | Unlocks | Priority |
|---|---|---|---|---|---|
| G1 | Flatten webhook payloads to declared scalars (order total/number/email; Stripe object fields; HubSpot property values) | shopify, stripe, hubspot | **META** (payloadShape enrichment on existing triggers) | Value-based order routing (VIP/fraud), payment-amount branching, full identity prewiring for ecommerce/payments/CRM templates — the single highest-leverage gap | **P1** |
| G2 | `gmail:new_attachment` declares no `attachmentId`/filename, so `gmail:get_attachment` cannot be wired downstream | gmail | **META** | Attachment filing pipelines: AP invoice filing to Drive, contract archiving, receipt processing | **P1** |
| G3 | Typeform `answers` array has no flattened/mappable common fields (email, name) | typeform | **META/NEW** (answer-mapping option source) | Complete form→CRM lead capture without manual field mapping | **P2** |
| G4 | No `invoice_overdue`-style trigger (QuickBooks/Stripe) | quickbooks, stripe | **NEW** (polling trigger) | Dunning/collections entry point — the highest-value AR workflow | **P2** |
| G5 | No iteration/loop node over list outputs (`get_deals`, `list_records`, …) | native/engine | **NEW** | Per-item processing: stale-deal nudges, data-quality sweeps, digest itemization | **P2** |
| G6 | Durable multi-day `delay` unverified (seconds-based; long-sleep durability unknown) | native/engine | **NEW/verify** | Staged sequences: dunning cadences, onboarding drip, SLA timers (with G4/if_then re-checks) | **P3** |
| G7 | No AI/classification action (sentiment, intent, priority) | native/ai | **NEW** (product decision) | Smart triage: support routing, social comment escalation, lead scoring | **P3** |
| G8 | No approval / human-in-the-loop gate | native/engine | **NEW** | True approval workflows (expense, content, purchase sign-off) | **P3** |
| G9 | `calendly` no-show trigger (`invitee_no_show`) | calendly | **NEW** (small; webhook supports it) | No-show recovery — proven high-value scheduling workflow | **P3** |
| G10 | Carried-forward batch-4 gaps: airtable `fields` map has no flat title; `slack:reaction_added` lacks parent-thread ts; GA `run_report` enums unseeded | airtable, slack, google-analytics | **META** | Deeper prewiring of kept batch-4 templates | **P4** |

None of these block the shipped catalog; they cap how much of each PARTIAL process can be
prewired and which BLOCKED processes stay out of the catalog. G1+G2 are metadata-contract
corrections to existing runtime behavior and are natural next slices; G4–G9 are genuine
follow-up slices and are **not** part of TEMPLATE-QUALITY-1.

---

## 4. Catalog standard (durable)

- Every official template: **≥5 nodes** (trigger included), one complete business outcome, no
  padding, no provider-swapped near-duplicates, only registered nodes, configs empty or
  safe-prewired per the variable-only policy.
- Enforced by `tests/unit/migrations/officialTemplateCatalogIntegrity.test.ts` (effective
  catalog = seeds − retirements + prewire overlays; the ≥5-node floor fails the build if a
  small template is ever seeded without being retired).
