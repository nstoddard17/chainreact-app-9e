# Smoke closeout rollup — action-smoke + trigger-smoke (2026-06-29)

Single-page handoff for the launch-readiness smoke effort. **Both the action-smoke and the trigger-smoke
frontiers are closed for the current safe/connected provider surface.** This rollup summarizes the final
state so the next launch-readiness work has a clear starting point. It is a pointer document, not a
replacement: the authoritative detail lives in the two checkpoints.

- Action-smoke detail: [action-smoke-matrix-checkpoint-2026-06-26.md](./action-smoke-matrix-checkpoint-2026-06-26.md)
- Trigger-smoke detail: [trigger-smoke-readiness-checkpoint-2026-06-29.md](./trigger-smoke-readiness-checkpoint-2026-06-29.md)

## 1. Final action-smoke matrix

```
298 registered
144 LIVE_PASS
 13 NOT_RUN
141 MISSING_FIXTURE
  0 fail / 0 bug
```
`npm run chainreact -- smoke actions --cert`. **Updated 2026-06-30:** Marcus connected Monday.com, which
reopened action-smoke for that provider — **9 of 10 Monday read actions are now LIVE_PASS** (was 135 LIVE_PASS
/ 22 NOT_RUN on 2026-06-29; +9 LIVE_PASS / −9 NOT_RUN). See action-smoke checkpoint §29. Action-smoke is again
**exhausted on the currently-connected providers**: the remaining 13 NOT_RUN self-skip without an operator
input/connection (incl. `monday:search_items`, which needs `SMOKE_MONDAY_QUERY`), and every MISSING_FIXTURE is
a send / raw-bytes / sharing / no-cleanup / no-verify action (incl. the 14 Monday write actions, deferred to a
write slice with smoke-owned create + cleanup). No failures and no product bugs surfaced.

## 2. Final trigger-smoke matrix

```
62 registered
14 LIVE_PASS
 1 RUN_NOW_PROVEN   (native:manual.run — manual run-now path, not a dispatch cert)
 1 BLOCKED          (microsoft-onenote:updated_note — Graph PATCH /pages/{id}/content
                     does not bump lastModifiedDateTime; provider behavior, not a harness bug)
46 un-harnessed     (each blocked by a named unlock — see §5 and checkpoint §19)
```

**LIVE_PASS (14):** `native:schedule.fired`; `microsoft-excel` ×5 (new_worksheet / new_row / new_table_row /
updated_row / updated_table_row); `microsoft-onenote:new_note`; `slack:channel_created` + `slack:file_shared`;
`github:new_commit`; `trello` ×4 (new_card / card_moved / card_archived / card_updated).

## 3. What was proven

- **Action fixture / cert coverage** for the current safe connected surface — 135 actions certified through
  their real handlers with cleanup + verification, 0 fail / 0 bug.
- **Native scheduled trigger path** — `native:schedule.fired`: real activation arms `nextFireAt`, before-tick
  fires 0 (baseline-first), at-tick fires exactly 1 via `dispatchTriggerEvent`, durable run reaches terminal.
- **Polling baseline-first path** — Excel ×5 + OneNote `new_note`: activation seeds the snapshot, first poll
  fires 0, a certified post-baseline change fires exactly 1 via the real per-trigger poll handler, durable
  run terminal, smoke-owned resource cleaned (0 leaked).
- **Slack signed-route webhook path** — `channel_created` + `file_shared`: a `SLACK_SIGNING_SECRET`-signed
  synthetic event to the real `/api/webhooks/slack` route (real HMAC verify → normalize →
  `dispatchTriggerEvent` → dedup → enqueue → drain → terminal). Registration is a pure `trigger_resources`
  upsert (Slack has no activation hook).
- **Direct-seeded HMAC webhook dispatch path** — `github:new_commit` (`X-Hub-Signature-256`) + `trello` ×4
  (`X-Trello-Webhook`, callbackURL-bound HMAC): a provider-signed synthetic payload to the real provider
  route, with the minimum `trigger_resources` row DIRECT-SEEDED (no activation hook, no provider API call),
  proving receive → verify → classify/normalize → `dispatchTriggerEvent` → dedup → enqueue → drain →
  terminal, with identity + dedup proven and 0 leaked.

All four trigger dispatch lanes (native internal, polling, no-activation signed webhook, direct-seed signed
webhook) are proven.

## 4. What is intentionally NOT proven

- **Provider-side webhook subscription activation/deactivation** for the direct-seeded webhook smokes (GitHub
  and Trello). The smoke direct-seeds the dispatch-lookup row and never calls the provider API; it certifies
  the route/dispatch path, NOT the provider-side webhook create/delete. Recorded honestly on each cert row.
- **User-content / message / member / subscriber / email triggers** — Slack message/reaction/member, Trello
  comment/member, Facebook post/comment, Gmail/Outlook email, Microsoft Teams message, Mailchimp
  subscriber/campaign. Firing them safely would fabricate user content or user-identity facts; excluded
  pending an explicit per-trigger synthetic-content contract.
- **Commerce / billing webhooks** — Shopify, Stripe. Kept out of the general matrix; if ever needed, a
  separate clearly-labeled commerce-webhook smoke with synthetic order/payment ids and a no-real-charge
  contract (Stripe also has a separate `/api/webhooks/stripe-billing` surface).
- **Raw-bytes / download / export actions** — these remain in action-smoke MISSING_FIXTURE (send / bytes /
  sharing / no-cleanup / no-verify), intentionally not fixtured.

## 5. Highest-yield unlocks (ranked)

1. **`MONDAY_SIGNING_SECRET` in `.env.local`** — highest yield, lowest friction. Unlocks `monday` ×5 on the
   EXISTING spec-driven direct-seed harness (same shape as Trello), pending a per-trigger synthetic-content
   contract for board/item-name payloads. Re-confirmed MISSING as of this rollup.
2. **Missing provider connections / resources** — connecting Discord / Monday / Shopify / Stripe on the smoke
   account, and provisioning operator resources (e.g. the Google/Microsoft subscriptions, Airtable macSecret)
   so those providers leave the not-connected / needs-resource buckets.
3. **Explicit commerce-webhook smoke approval** — to certify Shopify + Stripe as a separate, walled-off
   commerce smoke (synthetic order/payment ids, no-real-charge contract). Mechanically ready (secrets present).
4. **A Google/Microsoft resource-state webhook seam** — synthetic subscription + clientState/channel-token +
   a stubbed post-receipt provider fetch. Unlocks Google Calendar/Drive/Sheets/Docs + Microsoft
   OneDrive/Outlook-Calendar/Outlook/Teams + Airtable/Dropbox. The largest investment; its own project.

Also tracked: a per-trigger **synthetic-content contract** (unlocks Facebook ×2 immediately + is a
prerequisite for Monday and the content-bearing triggers), and a **HubSpot portalId two-table seeding seam**
(seed `hubspot_app_subscriptions` + `hubspot_subscription_refs`) plus a CRM-content decision.

## 6. Recommendation

**Move to the next launch-readiness area.** Both smoke frontiers are exhausted for the current safe/connected
surface; the certified set proves every dispatch/handler lane that exists today. Continuing smoke work now
yields nothing without one of the §5 unlocks, which require Marcus to provision a secret, a connection, a
resource, or an explicit approval — not more harness work. Resume the smoke lane only when an unlock lands;
`MONDAY_SIGNING_SECRET` (unlock #1) is the natural single provision to restart trigger-smoke (5 triggers on
the existing harness).

---

_No db:push, no deploy, nothing pushed. Docs-only rollup; the two checkpoints remain authoritative._
