# Parity audit — Mailchimp

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/mailchimp/`](../../../integrations/mailchimp/) (Slice 14, shipped locally)
**Phase 1 surface shipped:** 10 actions + 1 consolidated `audience_event` webhook trigger (6-event allowlist: subscribe / unsubscribe / profile / upemail / cleaned / campaign) + 3 polling triggers (campaign_created / email_opened / link_clicked). Per-datacenter REST host routing (first V2 provider with per-integration API base URL). Non-refreshable OAuth2 opaque bearer (V1's `oauth_with_refresh` misclassification corrected). REST `3.0`. No webhook signatures — Mailchimp doesn't sign deliveries; authenticity rides on URL secrecy + audienceId match + event-type allowlist + sha256(rawBody) dedup.

**Recommendation up front.** Slice 14 shipped a substantial Mailchimp port — Slice 14 deliberately bounded scope to the subscriber/audience/segment/event surface plus the most-used trigger families. The set difference is **7 V1 actions** and **3 V1 polling trigger types**. Of those, **4 actions** map to a single durable cluster (`get_subscribers` list-read + `get_campaign` + `get_campaign_stats` + `unsubscribe_subscriber`) that's safe to port without product decisions. **3 actions** are high-blast-radius email-sending surfaces (`send_campaign` + `schedule_campaign` + `create_campaign`) that are real parity gaps **AND** Q11 hot spots — they require Marcus signoff on the explicit-consent + safety-floor model before any code lands. **3 polling triggers** are lifecycle-shape gaps (`subscriber_added_to_segment` + `segment_updated` + `new_audience`) — straightforward to port using V2's existing polling snapshot pattern. **Recommended next slice — Mailchimp 2.1** ≈ **4–5 commits**: port the safe action cluster + the 3 polling triggers + an outcomes doc. **Mailchimp 2.2** (provisional, blocked on **NPD-M1** below) ports the 3 send/schedule/create campaign actions once Marcus accepts the explicit-consent + safety-floor contract for marketing-email sends. The audit also surfaces **5 open product decisions (NPD-M1..NPD-M5)** — none block Mailchimp 2.1; **NPD-M1 blocks 2.2**.

---

## 1. V1 source paths audited

**Action handlers** ([`lib/workflows/actions/mailchimp/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp), 18 `.ts` files, **2,199 LOC**):

- [`addNote.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addNote.ts) — **101 LOC**. POST `/lists/{id}/members/{hash}/notes`.
- [`addSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts) — **168 LOC**. PUT `/lists/{id}/members/{hash}`. **Q11 — `requireExplicitField('status')` already in place.** Merge-field ADDRESS nesting; CSV tag parsing.
- [`addTag.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addTag.ts) — **107 LOC**. POST `/lists/{id}/members/{hash}/tags`.
- [`createAudience.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createAudience.ts) — **120 LOC**. POST `/lists`. Silently emits `email_type_option: false` (default).
- [`createCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createCampaign.ts) — **155 LOC**. POST `/campaigns` then PUT `/campaigns/{id}/content` (two-call sequence — schema + body). `type` silently defaults `'regular'`. No `send_receipt` / `notify_on_subscribe` flags.
- [`createEvent.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createEvent.ts) — **143 LOC**. POST `/lists/{id}/members/{hash}/events`.
- [`createSegment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createSegment.ts) — **149 LOC**. POST `/lists/{id}/segments`. Static / dynamic / saved variants.
- [`getCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getCampaign.ts) — **97 LOC**. GET `/campaigns/{id}`.
- [`getCampaignStats.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getCampaignStats.ts) — **118 LOC**. GET `/reports/{id}` — opens / clicks / bounces / unsubscribes.
- [`getSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getSubscriber.ts) — **115 LOC**. GET `/lists/{id}/members/{hash}`.
- [`getSubscribers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getSubscribers.ts) — **71 LOC**. GET `/lists/{id}/members` (list-read with pagination).
- [`removeSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/removeSubscriber.ts) — **136 LOC**. PATCH or DELETE on `/lists/{id}/members/{hash}` (`delete_permanently` toggle — actual hard-delete only when explicit).
- [`removeTag.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/removeTag.ts) — **107 LOC**. Same endpoint as `addTag` with `status: 'inactive'` per-tag.
- [`scheduleCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/scheduleCampaign.ts) — **159 LOC**. POST `/campaigns/{id}/actions/schedule`. Absolute vs relative time; timewarp + batch-delivery options.
- [`sendCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/sendCampaign.ts) — **82 LOC**. POST `/campaigns/{id}/actions/send`. **No explicit-consent / safety-floor guard.**
- [`unsubscribeSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/unsubscribeSubscriber.ts) — **141 LOC**. PATCH `/lists/{id}/members/{hash}` with `status: 'unsubscribed'`. **`sendGoodbye` / `sendNotification` flags accepted but TODO-logged** (V1 rot).
- [`updateSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/updateSubscriber.ts) — **142 LOC**. PATCH `/lists/{id}/members/{hash}`.
- [`utils.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts) — **88 LOC**. `getMailchimpAuth(userId)` — runtime DC re-fetch fallback if `dc` is missing on the integration row (V2 fails loud instead — see §8).

**Registry:** [`lib/workflows/actions/registry.ts:496-512` + `:1432-1448`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts) — **17 Mailchimp action entries, all wired**. No unregistered files.

**Node definitions:** [`lib/workflows/nodes/providers/mailchimp/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/mailchimp/index.ts) — **1,696 LOC** single consolidated file with 10 trigger types + 10 action types declared inline + 7 split-schema actions imported from `./actions/*.schema.ts` (7 schema files totalling **690 LOC**: addNote / createSegment / getCampaign / getCampaignStats / getSubscriber / scheduleCampaign / unsubscribeSubscriber). **No `comingSoon: true` flags. No orphans.**

**Trigger lifecycle:** [`lib/triggers/providers/MailchimpTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts) — **725 LOC**. Hybrid webhook + polling per-workflow lifecycle. `getEventsForTrigger()` maps trigger type → Mailchimp event flags (subscribe / unsubscribe / profile / upemail / cleaned / campaign — V1 omits `cleaned` from manifest but lifecycle helper supports it). On no-webhook triggers, falls through to polling-snapshot baseline storage. POST `/lists/{id}/webhooks` for webhook activation; polling rows in `trigger_resources` for poll triggers.

**Polling worker:** [`lib/triggers/pollers/mailchimp.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/mailchimp.ts) — **930 LOC**. Switch-dispatch on 6 polling trigger types: `email_opened`, `link_clicked`, `segment_updated`, `new_audience`, `campaign_created`, `subscriber_added_to_segment`. Snapshot-on-activate + delta-detect on each poll. Calls back through `triggerWorkflow(trigger, payload)` to the standard pipeline.

**OAuth config:** [`lib/integrations/oauthConfig.ts:577-590`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L577) — login origin authorize/token. Body-form `authMethod`. `refreshRequiresClientAuth: true`. `sendRedirectUriWithRefresh: true`. **Misclassified as `oauth_with_refresh` in [`authSchemes.ts:64`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L64)** while [`provider-registry.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts) hardcodes `refresh_token: null` — refresh never attempted. V2 fixed during Slice 14 (`refreshable: false`).

**Webhook receive route:** [`app/api/webhooks/mailchimp/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/mailchimp/route.ts) — **273 LOC**. **No signature verification** (Mailchimp doesn't sign — see §8). Maps 5 form-data event types (`subscribe`, `unsubscribe`, `profile`, `upemail`, `campaign`) to 4 V1 trigger types via static `triggerMapping`. `triggerWorkflowsForEvent` fallback for legacy workflows. Per-event dedup via `eventId` (Mailchimp re-sends the same id on retries) routed through unified `executeWebhookWorkflow` (PR-V2-WEBHOOK-MAILCHIMP).

**Data handlers (UI dynamic data):** [`app/api/integrations/mailchimp/data/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/mailchimp/data/) — handler registry: audiences / campaigns / mergeFields / segments / subscribers / tags / tagSegments. Phase 3 surface; **out of scope for parity audit** per Phase 2 master plan §2.

**Tests:** [`__tests__/workflows/pr-g5-mailchimp-shopify-ai-required-fields.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/pr-g5-mailchimp-shopify-ai-required-fields.test.ts) — **217 LOC** cross-provider Q11 (PR-G5) test confirming `addSubscriber` requires explicit `status`. **No dedicated per-handler test files for Mailchimp** — extremely sparse coverage relative to V2.

**Walkthroughs:** [`learning/walkthroughs/mailchimp-gap-analysis-and-implementation.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/walkthroughs/mailchimp-gap-analysis-and-implementation.md) (525 LOC) + [`learning/walkthroughs/mailchimp-phase-2-advanced-triggers.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/walkthroughs/mailchimp-phase-2-advanced-triggers.md) (672 LOC). Document V1's Phase-1 + Phase-2 internal pushes, the 17-action / 8-trigger landings, and the parity-to-Zapier framing.

---

## 2. V1 actions inventory

17 V1-registered actions (all live; no orphans, no `comingSoon`):

| # | V1 action type | One-line description | Status |
|---|---|---|---|
| 1 | `mailchimp_action_get_subscribers` | List-read members of an audience with pagination. | live |
| 2 | `mailchimp_action_add_subscriber` | Upsert member in audience. **Q11 — `requireExplicitField('status')`**. Merge-field ADDRESS nesting; CSV tag parsing. | live |
| 3 | `mailchimp_action_update_subscriber` | PATCH member fields incl. email change. | live |
| 4 | `mailchimp_action_remove_subscriber` | PATCH `archived` OR DELETE-permanent on explicit `delete_permanently` toggle. | live |
| 5 | `mailchimp_action_add_tag` | Add named tag to member. | live |
| 6 | `mailchimp_action_remove_tag` | Remove named tag from member. | live |
| 7 | `mailchimp_action_send_campaign` | **High-blast-radius.** POST `/campaigns/{id}/actions/send`. No explicit-consent / safety-floor guard. | live |
| 8 | `mailchimp_action_create_campaign` | **Two-call sequence.** POST `/campaigns` + PUT `/campaigns/{id}/content`. `type` silently defaults `'regular'`. Marketing-content surface. | live |
| 9 | `mailchimp_action_create_audience` | Create list/audience. Silently emits `email_type_option: false`. | live |
| 10 | `mailchimp_action_create_event` | Create per-subscriber event record. | live |
| 11 | `mailchimp_action_add_note` | Add note to member. | live |
| 12 | `mailchimp_action_get_subscriber` | GET single member. | live |
| 13 | `mailchimp_action_get_campaign` | GET single campaign metadata. | live |
| 14 | `mailchimp_action_get_campaign_stats` | GET `/reports/{id}` — opens / clicks / bounces / unsubscribes / forwards / abuse / etc. | live |
| 15 | `mailchimp_action_schedule_campaign` | **High-blast-radius.** POST `/campaigns/{id}/actions/schedule`. Absolute vs relative; timewarp + batch-delivery. | live |
| 16 | `mailchimp_action_unsubscribe_subscriber` | PATCH `status: 'unsubscribed'`. `sendGoodbye` / `sendNotification` flags accepted but TODO-logged — **rot**. | live |
| 17 | `mailchimp_action_create_segment` | Create static / dynamic / saved segment. | live |

No V1 Mailchimp orphans. No `comingSoon: true` flags. No "kitchen-sink" multi-purpose router.

---

## 3. V1 triggers inventory

10 V1 trigger types. **Per-workflow lifecycle.** Mailchimp uses a **hybrid webhook + polling model** within one provider — first/only V1 provider with this mix.

| # | V1 trigger type | Model | Mailchimp resource | Notes |
|---|---|---|---|---|
| 1 | `mailchimp_trigger_new_subscriber` | webhook | `subscribe` event | List webhook subscription. |
| 2 | `mailchimp_trigger_unsubscribed` | webhook | `unsubscribe` event | List webhook. |
| 3 | `mailchimp_trigger_subscriber_updated` | webhook | `subscribe` + `profile` + `upemail` events | List webhook; V1 fans across 3 native events into ONE trigger type. |
| 4 | `mailchimp_trigger_new_campaign` | webhook | `campaign` event (fires on SEND) | List webhook; "new" here means "campaign was sent". |
| 5 | `mailchimp_trigger_email_opened` | polling | `/reports/{campaignId}/open-details` | Snapshot-baseline. Per-campaign loop. |
| 6 | `mailchimp_trigger_link_clicked` | polling | `/reports/{campaignId}/click-details` | Snapshot-baseline. Per-campaign + per-link + per-member. |
| 7 | `mailchimp_trigger_campaign_created` | polling | `/campaigns` (full list, status filter) | Mailchimp's `campaign` webhook only fires on SEND; polling catches save / schedule / sent transitions. |
| 8 | `mailchimp_trigger_subscriber_added_to_segment` | polling | `/lists/{id}/segments/{segId}/members` | Per-segment membership delta. |
| 9 | `mailchimp_trigger_segment_updated` | polling | `/lists/{id}/segments` | Create + update detection. |
| 10 | `mailchimp_trigger_new_audience` | polling | `/lists` | Account-wide audience-creation detection. |

Lifecycle owner: [`MailchimpTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts) (725 LOC). Snapshot-on-activate pattern for the 6 polling triggers (prevents first-poll-miss). Webhook lifecycle is per-workflow: one Mailchimp webhook per `(workflow, audience, event-set)`.

---

## 4. V2 current surface

10 actions (Slice 14 Commit 3, registered in [`services/execution/handlers/_registry.ts:452-461`](../../../services/execution/handlers/_registry.ts)):

1. `add_subscriber` — REST PUT `/lists/{id}/members/{hash}` (upsert). **Q11 — `status` REQUIRED at schema** (no default; mirrors V1's `requireExplicitField`). Wrapper: [`memberPut`](../../../integrations/_shared/mailchimp/api/members.ts).
2. `update_subscriber` — REST PATCH `/lists/{id}/members/{hash}`.
3. `remove_subscriber` — REST PATCH `archived` OR explicit `delete_permanently` → DELETE.
4. `add_tag` — REST POST `/lists/{id}/members/{hash}/tags`.
5. `remove_tag` — Same endpoint with `status: 'inactive'`.
6. `get_subscriber` — REST GET `/lists/{id}/members/{hash}`.
7. `create_segment` — REST POST `/lists/{id}/segments`.
8. `create_audience` — REST POST `/lists`.
9. `create_custom_event` — REST POST `/lists/{id}/members/{hash}/events`. (V1 calls this `create_event`; V2 renamed for clarity.)
10. `add_note` — REST POST `/lists/{id}/members/{hash}/notes`.

4 triggers (Slice 14 Commits 4 + 5, registered in [`integrations/_registry.ts:52-55`](../../../integrations/_registry.ts)):

- `audience_event` — **consolidated webhook trigger** with 6-event allowlist ([`integrations/mailchimp/triggers/audienceEvent/allowedEventTypes.ts`](../../../integrations/mailchimp/triggers/audienceEvent/allowedEventTypes.ts)): `subscribe`, `unsubscribe`, `profile`, `upemail`, `cleaned`, `campaign`. Workflows pick a subset at config time; dispatch branches on `payload.type`. **V2 adds `cleaned` (NEW)** — V1 lifecycle supports it but V1's manifest never exposed it. Receive route at [`app/api/webhooks/mailchimp/route.ts`](../../../app/api/webhooks/mailchimp/route.ts) (140 LOC). URL-secret + audienceId-match + event-type allowlist + sha256(rawBody) dedup (Mailchimp doesn't sign).
- `campaign_created` — polling. Per-campaign snapshot baseline; delta on `/campaigns`.
- `email_opened` — polling. Per-campaign baseline; reads `/reports/{campaignId}/open-details`.
- `link_clicked` — polling. Per-campaign baseline; reads `/reports/{campaignId}/click-details`.

Manifest ([`integrations/mailchimp/manifest.ts`](../../../integrations/mailchimp/manifest.ts), 182 LOC):
- `tokenScope: "user"`, `accountIdField: "mailchimpAccountId"`.
- `apiVersion: "3.0"`, `oauthFlows: ["v2"]`, `refreshable: false`.
- **Synthetic single scope** `["account_access"]` (Mailchimp doesn't enforce scopes — string never sent on the wire).
- `healthCheckIntervalMs: 12h`.
- Capabilities: `oauth: true`, `webhookTrigger: true`, `pollingTrigger: true`, `actions: true`.

OAuth ([`integrations/mailchimp/oauth.ts`](../../../integrations/mailchimp/oauth.ts), 257 LOC):
- Body-form token exchange; **no PKCE**; no `scope=` on authorize URL.
- Two auxiliary GETs at callback: `oauth2/metadata` (returns `dc` — required for every API call) + `/3.0/` API root (returns `account_id` — `providerAccountId`).
- `refreshToken()` throws `RefreshNotSupportedError("mailchimp")`.
- `dc` persisted on `integrations.accountMetadata.dc`. Action time `_resolveDc.ts` reads it via `getActiveForExecution`. **Missing `dc` throws `MissingDataCenterError` — fail loud, no runtime re-fetch** (V1's [`utils.ts:37-75`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L37) re-fetch pattern intentionally NOT reproduced).

Per-datacenter REST helper ([`integrations/_shared/mailchimp/api/_base.ts`](../../../integrations/_shared/mailchimp/api/_base.ts) + `_request.ts` + 6 resource wrappers + `_subscriberHash.ts` + `webhooks/{normalize,signature}.ts`). The `mailchimpApiUrl(dc, path)` builder forces dc-presence; empty `dc` throws.

E2E: [`tests/e2e/slice-14-mailchimp-walkthrough.spec.ts`](../../../tests/e2e/slice-14-mailchimp-walkthrough.spec.ts) (751 LOC). Covers OAuth (dc + accountId capture), 10 actions, audience-event webhook activate / receive / deactivate, 3 polling triggers (activate / first-poll / delta-detect). Mock server at [`tests/e2e/helpers/mockMailchimpServer.ts`](../../../tests/e2e/helpers/mockMailchimpServer.ts).

Unit tests: **27 files** under `tests/unit/integrations/mailchimp/` (actions / triggers / manifest / oauth / resolveDc) + `tests/unit/integrations/_shared/mailchimp/` (6 API wrappers + webhooks/normalize + webhooks/signature placeholder + base + request + subscriberHash) + `tests/unit/app/api/webhooks/mailchimp.route.test.ts`.

---

## 5. Missing actions

Set difference: V1 registered (17) minus V2 (10) = **7 candidates**.

| V1 action | One-line gap |
|---|---|
| `get_subscribers` | List-read members of an audience with pagination. Pure read; no provider mutation. New REST wrapper `membersList(dc, listId, query)` against `/lists/{id}/members`. |
| `get_campaign` | GET `/campaigns/{id}` — campaign metadata read. Pure read. New REST wrapper `campaignGet`. (Existing `_shared/mailchimp/api/campaigns.ts` may already expose helpers — confirm at port time.) |
| `get_campaign_stats` | GET `/reports/{id}` — opens / clicks / bounces / unsubscribes / forwards / abuse stats. Pure read. New REST wrapper `reportGet` (or extend existing `reports.ts`). |
| `unsubscribe_subscriber` | PATCH `/lists/{id}/members/{hash}` with `status: 'unsubscribed'`. Mutates subscriber state but **does not send email**. Distinct from `remove_subscriber` (which archives or DELETEs the record). V1 carries `sendGoodbye` / `sendNotification` flags that are accepted-but-TODO-logged — **V1 rot M-R3**; V2 should drop the flags entirely OR implement and Q11-gate them. |
| `send_campaign` | **HIGH BLAST RADIUS.** POST `/campaigns/{id}/actions/send`. Triggers the actual email send to every audience subscriber. **Q11 hot spot — V1 has no explicit-consent / safety-floor guard.** NPD-M1. |
| `schedule_campaign` | **HIGH BLAST RADIUS.** POST `/campaigns/{id}/actions/schedule`. Schedules the same send for a future time. Same Q11 surface as `send_campaign`. NPD-M1. |
| `create_campaign` | Two-call sequence: POST `/campaigns` then PUT `/campaigns/{id}/content`. Creates the campaign metadata + body but does NOT send. **Q11 surface** because the campaign is then either `send_campaign`-able or `schedule_campaign`-able; the audience/subject/from-name/reply-to bundle is the consent surface. NPD-M1. |

**V2-domain gaps neither V1 nor V2 covers** (not parity gaps; product-expansion candidates flagged for completeness — see NPD-M5):
- **templates** — `/templates`. Create / update / delete. V1 has zero.
- **automations / classic automations** — `/automations`. Pause / start / pause workflow emails. V1 has zero.
- **customer journeys** — `/customer-journeys/journeys/{id}/steps/{stepId}/actions/trigger`. Trigger a journey for a contact. V1 has zero.
- **transactional email (Mandrill)** — separate API. V1 doesn't ship a `mandrill` provider. Out of scope for Mailchimp; would be its own provider.
- **landing pages** — `/landing-pages`. V1 zero.
- **e-commerce store sync** — `/ecommerce/stores`. Connect a store / order. V1 zero. The Mailchimp e-commerce surface is its own large domain.
- **conversations** — `/conversations`. Read inbound replies. V1 zero. Largely deprecated by Mailchimp.
- **batch operations** — `/batches`. Submit batch member upserts. V1 zero. A latency / throughput optimization for high-volume workflows.

---

## 6. Missing triggers

Set difference: V1 (10 trigger types) minus V2 (4 trigger objects covering 7 V1 trigger types) = **3 candidates**.

| V1 trigger | Model | One-line gap |
|---|---|---|
| `subscriber_added_to_segment` | polling | Per-segment / per-tag membership-change detection. Mailchimp has no webhook for tag / segment membership. V1 polls `/lists/{id}/segments/{segId}/members`. |
| `segment_updated` | polling | Per-list segment creation + edit detection. Mailchimp has no webhook for segment lifecycle. V1 polls `/lists/{id}/segments`. |
| `new_audience` | polling | Account-wide list/audience-creation detection. Mailchimp has no webhook for list creation. V1 polls `/lists`. |

**V2 already covers** the 4 V1 webhook trigger types via the consolidated `audience_event` discriminator (`subscribe` / `unsubscribe` / `profile+upemail` / `campaign`) — set match is exact at the event-allowlist layer. V2 additionally exposes `cleaned` (NEW — V1 lifecycle supports but V1 manifest never declared).

**V2 already covers** 3 of V1's 6 polling trigger types (`campaign_created`, `email_opened`, `link_clicked`).

**Event-type allowlist gaps neither V1 nor V2 covers** (product-expansion candidates):
- Mailchimp's webhook protocol supports no additional event types beyond the 6 V2 already allows.
- Polling-only candidates not in either V1 or V2: per-template / per-automation / per-journey lifecycle events; campaign A/B-test result events; e-commerce store sync events. None part of the standard Mailchimp REST surface used by V1 / V2.

---

## 7. Port / skip / defer table

Every row from §5 + §6 gets a decision.

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `get_subscribers` | action | **PORT (Mailchimp 2.1)** | Pure read. No defaults. Mirror existing `members.ts` wrapper shape. Adds pagination cursoring. |
| `get_campaign` | action | **PORT (Mailchimp 2.1)** | Pure read. Single wrapper call. Existing `_shared/mailchimp/api/campaigns.ts` already present — confirm exported `campaignGet` or extend. |
| `get_campaign_stats` | action | **PORT (Mailchimp 2.1)** | Pure read. Extend `_shared/mailchimp/api/reports.ts`. No new contract surface. |
| `unsubscribe_subscriber` | action | **PORT (Mailchimp 2.1) — DROP V1 ROT** | PATCH `status: 'unsubscribed'`. **Drop V1's `sendGoodbye` / `sendNotification` flags** — they're TODO-logged in V1 and never reach Mailchimp (M-R3). The action becomes a clean state-change with no notification fanout. |
| `send_campaign` | action | **DEFER pending NPD-M1** | High blast radius. Triggers the actual marketing-email send. Q11 contract for explicit-consent + safety-floor required before port. Targeted for **Mailchimp 2.2** if NPD-M1 lands. |
| `schedule_campaign` | action | **DEFER pending NPD-M1** | Same Q11 surface as `send_campaign`. Targeted for **Mailchimp 2.2**. |
| `create_campaign` | action | **DEFER pending NPD-M1** | Two-call sequence (`POST /campaigns` then `PUT /campaigns/{id}/content`). The audience / subject / from-name / reply-to bundle is the consent surface that downstream `send_campaign` / `schedule_campaign` rely on. Couples Q11. Targeted for **Mailchimp 2.2**. |
| `subscriber_added_to_segment` | trigger | **PORT (Mailchimp 2.1)** | Polling. Existing snapshot pattern (`campaignCreated/poll.ts`) is the template. Per-segment / per-tag membership detection. |
| `segment_updated` | trigger | **PORT (Mailchimp 2.1)** | Polling. Mirrors `campaignCreated` pattern on `/lists/{id}/segments`. |
| `new_audience` | trigger | **PORT (Mailchimp 2.1)** | Polling. Account-wide `/lists` poll. Smallest of the 3 polling additions. |
| `cleaned` event (V2 only) | trigger | already shipped | V2's `audience_event` allowlist includes `cleaned` (NEW vs V1). Documented in §4. |
| Templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch | action | **DEFER pending product signal (NPD-M5)** | Not parity gaps. Each is its own domain expansion candidate. Revisit when AI planner (Phase 5) flags coverage gaps or a customer demo references the domain. |
| Additional webhook event types | trigger | **n/a** | Mailchimp's webhook protocol exposes no event types beyond the 6 V2 already allows. |
| Additional polling families (e.g. campaign A/B-test result, automation-step events) | trigger | **DEFER pending product signal (NPD-M5)** | Same. |

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 categories:

| ID | Pattern | Citation | V2 status |
|---|---|---|---|
| M-R1 | **Mailchimp misclassified as `oauth_with_refresh` while `refresh_token: null` is hardcoded** | [`authSchemes.ts:64`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L64) declares `'oauth_with_refresh'`; [`provider-registry.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts) `transformTokenData` hardcodes `refresh_token: null`. Refresh never attempted. | **FIXED in Slice 14.** V2 manifest `refreshable: false`. `refreshToken()` throws `RefreshNotSupportedError("mailchimp")`. |
| M-R2 | **Runtime DC re-fetch fallback** | [`utils.ts:37-75`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L37) — if `metadata.dc` is missing, hit `oauth2/metadata` at action time and back-fill. Hides OAuth-callback failures behind silent recovery. | **NOT REPRODUCED.** V2 captures `dc` deterministically at OAuth callback; missing `dc` at action time throws `MissingDataCenterError` ([`integrations/_shared/mailchimp/errors.ts`](../../../integrations/_shared/mailchimp/errors.ts)). Surfaces a clear "reconnect Mailchimp" prompt. |
| M-R3 | **`unsubscribeSubscriber` accepts `sendGoodbye` / `sendNotification` flags but never sends them** | [`unsubscribeSubscriber.ts:90-96`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/unsubscribeSubscriber.ts#L90) — `if (sendGoodbye || sendNotification) { logger.info('TODO: send goodbye...') }`. Mailchimp's PATCH endpoint doesn't accept these flags; V1 retained the schema fields anyway. | **DROP ON PORT.** V2's `unsubscribe_subscriber` (Mailchimp 2.1) ships without these flags. The action becomes a pure state-change with no notification surface. |
| M-R4 | **`createCampaign` silently defaults `type: 'regular'`** | [`createCampaign.ts:20`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createCampaign.ts#L20) | **NOT YET PORTED** — Mailchimp 2.2. When ported under NPD-M1, `type` becomes a required enum field with no default (mirror `addSubscriber` Q11 pattern). |
| M-R5 | **`createAudience` silently defaults `email_type_option: false`** | [`createAudience.ts:20`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createAudience.ts#L20) | **PORTED in Slice 14 — confirm Q11 status.** V2's `create_audience` schema currently mirrors V1 behavior. If `email_type_option` is consent-adjacent (controls whether subscribers choose HTML vs plain text), it may need Q11-required treatment. Sub-decision under NPD-M2. |
| M-R6 | **`sendCampaign` has no Q11 consent / safety-floor guard** | [`sendCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/sendCampaign.ts) — POSTs to `/actions/send` with only `campaignId` validation | **NOT PORTED.** NPD-M1 designs the V2 guard before any port. |
| M-R7 | **`scheduleCampaign` silently defaults `scheduleType: 'absolute'` / `relativeUnit: 'hours'`** | [`scheduleCampaign.ts:20-23`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/scheduleCampaign.ts#L20) | **NOT YET PORTED** — Mailchimp 2.2. Defaults become required enums on port under NPD-M1. |
| M-R8 | **Webhook receive route has zero signature verification** | [`app/api/webhooks/mailchimp/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/mailchimp/route.ts) — no HMAC check, no shared secret comparison | **DOCUMENTED, NOT FIXED.** Mailchimp doesn't sign webhooks (protocol limitation). V2 follows the same approach in [`signature.ts`](../../../integrations/_shared/mailchimp/webhooks/signature.ts) — replaces signature with URL-secrecy + audienceId-match + event-type allowlist + sha256(rawBody) dedup. **R7 master-plan rot is intentional and protocol-aligned**, not a V2 regression. |
| M-R9 | **Polling worker uses raw `triggerWorkflow(trigger, payload)` pre-dating PR-V2-WEBHOOK migration** | [`lib/triggers/pollers/mailchimp.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/mailchimp.ts) — 930 LOC, calls into legacy V1 trigger pipeline | **NOT REPRODUCED.** V2's polling triggers go through `dispatchTriggerEvent` + webhook_event_dedup directly (see `campaignCreated/poll.ts`). Polling code is shorter and engine-aligned. |
| M-R10 | **Two-call campaign creation (POST `/campaigns` + PUT `/campaigns/{id}/content`) is non-atomic** | [`createCampaign.ts:65-110`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createCampaign.ts#L65) — if the second call fails, the campaign exists but has empty content | **NOT YET PORTED.** Q4 idempotency wrap around the pair on port (Mailchimp 2.2). NPD-M3 captures the design decision for partial-failure recovery. |
| M-R11 | **V1's `createCampaign` requires HTML or text content but not both** | [`createCampaign.ts:60-62`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createCampaign.ts#L60) — `if (!htmlContent && !textContent) { throw }` | **NOT YET PORTED.** On port (Mailchimp 2.2), the schema-level union enforces this at config time, not at runtime. Q11-adjacent (empty-body marketing-email risk). |
| M-R12 | **No Mailchimp-specific test files in V1** | Only [`pr-g5-mailchimp-shopify-ai-required-fields.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/pr-g5-mailchimp-shopify-ai-required-fields.test.ts) — cross-provider Q11 test for `addSubscriber` only | **NOT PORTED AS A PROBLEM.** V2 ships 27 unit files across actions / triggers / OAuth / wrappers / manifest. Per-action test density matches Stripe / Shopify Slices. |
| M-R13 | **V1's `getMailchimpAuth` re-writes `metadata` on every action call when DC re-fetch path fires** | [`utils.ts:53-65`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L53) — race conditions if two concurrent actions both fall into the re-fetch path | **NOT REPRODUCED.** V2 has no re-fetch path; `dc` is read once via `_resolveDc.ts` from `getActiveForExecution`. |
| M-R14 | **V1 manifest has 1,696-line monolithic file (master-plan R1 rot)** | [`lib/workflows/nodes/providers/mailchimp/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/mailchimp/index.ts) — partial split (7 schema files extracted; 10 actions + 10 triggers remain inline) | **NOT REPRODUCED.** V2 schemas live per-action (10 `.schema.ts` files) + per-trigger (4 trigger directories with `index.ts` + `schema.ts` + `activate.ts` / `receive.ts` / `poll.ts`). Master-plan R1 closed. |

---

## 9. V2 dependency map

Which V2 contracts each ported / deferred item depends on. Identifies contract gaps.

| Item | Dependencies | Contract gap |
|---|---|---|
| `get_subscribers` (action) | `mailchimpApiUrl(dc, path)` + `_request.ts` + `_resolveDc.ts` + `refreshAndRetry` (401 → action_required), `membersList` wrapper (**NEW**) | **One new wrapper** in [`integrations/_shared/mailchimp/api/members.ts`](../../../integrations/_shared/mailchimp/api/members.ts): `membersList({ dc, listId, query }) → MemberListResponse`. Pagination cursor via Mailchimp's `count`/`offset` URL params. |
| `get_campaign` (action) | Same chain; existing `_shared/mailchimp/api/campaigns.ts` may already export `campaignGet` — **confirm at port time**. | Likely zero new wrapper. |
| `get_campaign_stats` (action) | Same chain; existing `_shared/mailchimp/api/reports.ts` may already export `reportGet` — **confirm at port time**. | Likely zero new wrapper. |
| `unsubscribe_subscriber` (action) | Same chain; existing `members.ts.memberPatch` likely covers PATCH `status: 'unsubscribed'`. | Zero or one new wrapper. |
| `subscriber_added_to_segment` (trigger) | Polling lifecycle (snapshot baseline on activate → delta on poll), `webhook_event_dedup` cross-tick stability, `_shared/mailchimp/api/segments.ts`. | Possibly a new wrapper `segmentMembersList(dc, listId, segId, query)`. |
| `segment_updated` (trigger) | Polling lifecycle, `segments.ts` `segmentsList`. | Likely zero new wrapper. |
| `new_audience` (trigger) | Polling lifecycle, `lists.ts` `listsList`. | Likely zero new wrapper. |
| `send_campaign` (Mailchimp 2.2 — blocked NPD-M1) | All of the above + **explicit-consent / safety-floor contract** | **Platform gap** — NPD-M1. Q11 helper extension (e.g. `requireMarketingEmailConfirmation`) or a per-handler safety-floor pattern. |
| `schedule_campaign` (Mailchimp 2.2 — blocked NPD-M1) | Same as `send_campaign` + scheduling fields (absolute / relative / timewarp / batch-delivery) | Same platform gap. |
| `create_campaign` (Mailchimp 2.2 — blocked NPD-M1) | Atomic two-call wrapper OR Q4 idempotency bracket around the pair (NPD-M3). | NPD-M3 design decision; not a contract gap. |

Everything reusable already exists: `mailchimpApiUrl`, `_request.ts`, `refreshAndRetry`, `_resolveDc.ts`, polling registry, webhook receive route, `webhook_event_dedup`, `getActiveForExecution`.

---

## 10. Required platform gaps (if any)

**Zero platform-tier prerequisites for Mailchimp 2.1** (4 actions + 3 polling triggers).

Open product decisions block any larger Mailchimp 2.x slice — listed for clarity. **NPD-M1 blocks Mailchimp 2.2.**

- **NPD-M1: High-blast-radius email-sending contract.** `send_campaign` + `schedule_campaign` + `create_campaign` are the most consequential actions in any Mailchimp port — they cause real outbound email to every subscriber on an audience. V1 ships them with no explicit-consent / safety-floor guard. **Closure options:**
  - **(a) Q11 required-field pattern.** New required fields on the action schemas: `confirm_marketing_send: z.literal(true)` + `expected_audience_size_min: number` + `expected_audience_size_max: number`. Handler reads `/lists/{id}` member count at runtime; if outside the declared range, returns `MISSING_REQUIRED_FIELD`-shaped failure. Mirrors V1 PR-G5 / PR-G6 Q11 audit pattern.
  - **(b) Test-mode-only port.** Ship the handlers but gate `actionMode === 'execute_all'` checks so testMode runs short-circuit. Workflow authors get planner support without production-risk exposure. Production-mode send is then an explicit downstream lift.
  - **(c) Defer indefinitely.** Document V2 Mailchimp as "campaign-author-side automation only — actual sending happens manually from the Mailchimp dashboard." Removes the surface entirely.
  - **(d) Hybrid — port `create_campaign` (no send), defer `send_campaign` + `schedule_campaign`.** `create_campaign` is one step removed from the actual send; the audience commitment happens at send-time, not create-time. Workflow authors can compose `create_campaign` → manual review → manual dashboard send.
  - **Recommendation:** **(d)** — port `create_campaign` under Q11 (required type / required `audience_id` / required `from_name` / required `reply_to` / required content union), defer `send_campaign` + `schedule_campaign` until customer signal. The two-call atomicity issue (M-R10) becomes the only platform-tier work for `create_campaign`. Marcus signoff required to lock the recommendation.

- **NPD-M2: `email_type_option` Q11 treatment in `create_audience`.** V1 silently defaults to `false`. The field controls whether subscribers see an HTML-vs-plain-text choice at signup. Consent-adjacent under some interpretations (subscriber preference) but probably not CAN-SPAM-actionable. **Closure:** Marcus signoff that V2's current `create_audience` schema (which mirrors V1) is acceptable, OR add a Q11-required field. Recommend acceptance of current shape (the consent surface in Mailchimp is the signup form, not the list config).

- **NPD-M3: Two-call campaign-create atomicity.** Mailchimp's API requires POST `/campaigns` then PUT `/campaigns/{id}/content` as two separate calls. If the second call fails, the campaign exists with no content (M-R10). **Closure options:**
  - **(a) Q4 bracket spans both calls.** Idempotency key covers the pair. Retry safe — the second call upserts content; partial-failure resolves on retry.
  - **(b) On second-call failure, DELETE the orphan campaign.** Adds cleanup but loses retry-safety (no idempotency on delete).
  - **(c) Surface partial failure to workflow author.** Action returns `{success: true, content_partial: true}` with the campaign id; author adds a follow-up `update_campaign_content` action. Requires a new action that V1 doesn't have.
  - **Recommendation:** **(a)** for Mailchimp 2.2. Q4's session-level idempotency already supports the bracket-around-multi-call pattern (Stripe does the same for checkout-session + line-items).

- **NPD-M4: Mailchimp API rate-limit handling.** Mailchimp's rate-limit policy is "no more than 10 simultaneous connections per account" — a connection-count cap, not a request-rate cap. V1 has no provider-tier handling. V2 has no provider-tier handling. **Closure options:**
  - **(a) Document workflow-author guidance** ("for bulk Mailchimp chains, add `wait` nodes between actions; the connection cap fires at 429 with `Retry-After`").
  - **(b) Add a connection-cap-aware semaphore in `_request.ts`.** Provider-tier complexity; only worthwhile if customer reports surface.
  - **Recommendation:** **(a)** for Mailchimp 2.1 + 2.2; revisit if signal emerges.

- **NPD-M5: Domain expansion priority (templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch).** Each is a separate slice candidate. **Closure:** defer pending Phase 5 AI planner / Phase 3 UI usage signal. Revisit when at least one workflow template or customer demo references the domain. Mandrill (transactional email) is a separate provider entirely if it ever ships.

---

## 11. Effort estimate

Compared to Phase 1 reference slices:

- **Mailchimp 2.1 = ~Sheets-2.1-sized.** 4 read-tier actions + 3 polling triggers + tests + outcomes ≈ **4–5 commits**.

| Commit | Scope | Est. LOC |
|---|---|---|
| 0 | This audit. Doc-only. | — |
| 1 | `feat(mailchimp): port read-tier actions (get_subscribers, get_campaign, get_campaign_stats)` + wrappers + tests + registry entries + manifest count bump 10 → 13. | ~280 src + ~360 test |
| 2 | `feat(mailchimp): port unsubscribe_subscriber action` (drop M-R3 `sendGoodbye` / `sendNotification` flags) + tests + registry + manifest count bump 13 → 14. | ~110 src + ~140 test |
| 3 | `feat(mailchimp): port polling triggers (subscriber_added_to_segment, segment_updated, new_audience)` + 3 trigger directories + wrappers + tests + polling-registry entries + manifest test bump (3 → 6 polling triggers). | ~340 src + ~420 test |
| 4 | `test(e2e): extend mailchimp walkthrough with 2.1 actions + triggers` (4 new action scenarios + 3 new polling-trigger scenarios in [`slice-14-mailchimp-walkthrough.spec.ts`](../../../tests/e2e/slice-14-mailchimp-walkthrough.spec.ts)). | ~50 src + ~280 e2e |
| 5 | `docs(mailchimp): document 2.1 outcomes` + CLAUDE.md "Phase 2 progress (Mailchimp)" entry + Deep Gotchas "Mailchimp parity patterns" subsection (rot table M-R1..M-R14; NPD-M1..NPD-M5 status; per-datacenter routing durable rule; deferred Mailchimp 2.2 send-campaign cluster blocked on NPD-M1). | — |

**Mailchimp 2.1 total:** 4 implementation commits + 1 audit + 1 outcomes ≈ **~780 src LOC + ~920 test LOC + ~330 e2e LOC**. Roughly Sheets 2.2 / Airtable 2.1 / Slack 2.3 scale; smaller than Slack 2.1 (messaging+reactions) and Stripe 2.1.

**Mailchimp 2.2 (blocked on NPD-M1; recommended (d) — `create_campaign` only):** **3 commits**.

| Commit | Scope | Est. LOC |
|---|---|---|
| 1 | `feat(mailchimp): port create_campaign action` (Q4 idempotency bracket per NPD-M3 (a); required `type` enum / required content union; two-call wrapper). | ~220 src + ~280 test |
| 2 | `test(e2e): extend mailchimp walkthrough with create_campaign scenario`. | ~50 src + ~120 e2e |
| 3 | `docs(mailchimp): document 2.2 outcomes`. | — |

**Mailchimp 2.2 total:** 2 implementation + 1 outcomes ≈ **~270 src + ~280 test + ~120 e2e**. Conditional on Marcus accepting NPD-M1 (d).

**Mailchimp 2.3 (highly conditional — `send_campaign` + `schedule_campaign`):** NOT scoped here. Blocked on Marcus rejecting NPD-M1 (d) and choosing (a) or (b) instead.

---

## 12. Risk estimate

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Marcus accepts Mailchimp 2.1 read-tier port and then signals demand for `send_campaign` ahead of NPD-M1 decision | medium | high | Surface NPD-M1 in this audit's recommendation. Document NPD-M1 (d) as the recommended path in the Mailchimp 2.1 outcomes doc and in CLAUDE.md so it's a single-question signoff later. Mailchimp 2.2 is a 3-commit lift once NPD-M1 lands. |
| R2 | Polling-trigger snapshot-on-activate misses early events when first poll lands within the cron-tick window | low | medium | V2 already documents the first-poll-miss avoidance in `GoogleApisTriggerLifecycle.ts:120-135` and Slice 14 polling triggers (`campaignCreated/poll.ts`). The 3 new polling triggers must mirror that pattern: capture baseline in `activate.ts`, guard on `previousSnapshot` in `poll.ts`. Audit-time test coverage already validates this for `campaign_created`. |
| R3 | New REST wrappers (`membersList`, possibly `segmentMembersList`) for read-tier actions accidentally pull all members of a large audience in a single response | low | medium | Mailchimp's `/lists/{id}/members` endpoint defaults to 10 items per response (max 1000); pagination cursor is mandatory for any list > 10. The `get_subscribers` action MUST surface pagination cursor in its output schema so downstream actions can iterate. Document in handler doc-comment + e2e scenario. |
| R4 | Unsubscribing the M-R3 `sendGoodbye` / `sendNotification` flags is a contract change vs V1's schema (workflow authors who reference these fields in V1 configs) | low | low | V1 production never sent goodbye/notification emails (the flags were TODO-logged). Workflow authors won't notice behavior change. Document explicitly in the Mailchimp 2.1 outcomes doc. |
| R5 | A new V1 audit finding surfaces during port (e.g. an undocumented dynamic-data dependency, a hidden default) | low | low | Master-plan §5 rot catalog is comprehensive; M-R1..M-R14 covers the provider-specific patterns. Any new finding goes into the §8 table at port time. |

---

## 13. Recommended parity batch plan

Ordered list of commits Mailchimp 2.1 would land if accepted:

| Commit | Title | Scope |
|---|---|---|
| **0** | `docs(mailchimp): add parity audit` | This doc. **Doc-only.** Pending Marcus's acceptance. |
| **1** | `feat(mailchimp): port read-tier actions (get_subscribers, get_campaign, get_campaign_stats)` | Three pure-read actions. New wrapper `membersList` in `members.ts`; confirm-or-extend `campaignGet` + `reportGet` wrappers. Three new action handlers + schemas + tests. Registry entries. Manifest action-count test bumped 10 → 13. |
| **2** | `feat(mailchimp): port unsubscribe_subscriber action` | PATCH `status: 'unsubscribed'`. **Drop V1 M-R3 `sendGoodbye` / `sendNotification` flags** — the action is a pure state-change. New action handler + schema + tests. Registry entry. Manifest count bump 13 → 14. |
| **3** | `feat(mailchimp): port polling triggers (subscriber_added_to_segment, segment_updated, new_audience)` | Three polling triggers using the snapshot-on-activate pattern. Three new trigger directories (`triggers/{name}/{index,schema,activate,poll}.ts`). Possibly one new wrapper `segmentMembersList`. Tests for activate + first-poll + delta-detect. Polling-registry entries in `integrations/_registry.ts`. Manifest polling-trigger-count test bump (3 → 6). |
| **4** | `test(e2e): extend mailchimp walkthrough with 2.1 scenarios` | Four new action scenarios (get_subscribers pagination / get_campaign / get_campaign_stats / unsubscribe_subscriber) + three new polling-trigger scenarios (activate + first-poll + delta) in [`slice-14-mailchimp-walkthrough.spec.ts`](../../../tests/e2e/slice-14-mailchimp-walkthrough.spec.ts). Mock-server extensions for the new endpoints. |
| **5** | `docs(mailchimp): document 2.1 outcomes` | New `docs/slices/parity/mailchimp-2-1-outcomes.md` + CLAUDE.md "Phase 2 progress (Mailchimp)" entry + Deep Gotchas "Mailchimp parity patterns" subsection capturing: 14 actions live + 6 triggers live (4 audience-event allowlist + 3 polling); M-R3 V1 rot dropped in `unsubscribe_subscriber`; NPD-M1..NPD-M5 status + recommended path; per-datacenter routing as a durable rule (matches Stripe / Shopify per-account pattern doc); deferred Mailchimp 2.2 `create_campaign` cluster blocked on NPD-M1; explicit pointer that templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch are domain-expansion candidates, NOT parity ports. |

**Each implementation commit independently passes gates:** `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`. Commit 4 additionally passes `npx playwright test tests/e2e/slice-14-mailchimp-walkthrough.spec.ts --workers=1`.

**No commit introduces a new platform contract.** No new shared utility module beyond per-resource wrappers; no new contract type; no new infrastructure cron; no schema migration.

**Conditional follow-up — Mailchimp 2.2 (3 commits)**: blocked on NPD-M1 acceptance. Recommended scope: `create_campaign` only, under NPD-M1 (d).

---

## 14. Exit checklist

This audit is complete when:

- [ ] Marcus has read §1 (paths) + §2 (V1 actions) + §3 (V1 triggers) + §4 (V2 today) and agrees the inventory is accurate.
- [ ] §5 + §6 (missing items) match Marcus's understanding of the parity gap — specifically:
  - **7 V1 actions** missing in V2: `get_subscribers`, `get_campaign`, `get_campaign_stats`, `unsubscribe_subscriber`, `send_campaign`, `schedule_campaign`, `create_campaign`.
  - **3 V1 polling triggers** missing in V2: `subscriber_added_to_segment`, `segment_updated`, `new_audience`.
  - **0 V1 webhook trigger types** missing in V2 (V1's 4 webhook trigger types fold into V2's `audience_event` allowlist; V2 additionally exposes `cleaned`).
- [ ] §7 (port / skip / defer) decisions accepted, especially:
  - **PORT in 2.1** = 4 actions (`get_subscribers`, `get_campaign`, `get_campaign_stats`, `unsubscribe_subscriber`) + 3 polling triggers.
  - **DEFER pending NPD-M1** = 3 actions (`send_campaign`, `schedule_campaign`, `create_campaign`) — targeted for Mailchimp 2.2 if NPD-M1 (d) accepted.
  - **DROP M-R3** = V1's `sendGoodbye` / `sendNotification` flags on `unsubscribe_subscriber` are dead in V1 and not reproduced.
  - **DEFER pending NPD-M5** = templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch.
- [ ] §8 (V1 rot) inventory accepted — confirms M-R1 / M-R2 / M-R9 / M-R14 already addressed in Slice 14; M-R3 / M-R4 / M-R5 / M-R7 / M-R10 / M-R11 are port-time fixes; M-R8 is protocol-aligned (Mailchimp doesn't sign webhooks).
- [ ] §10 (platform gap) — **zero required prerequisites for Mailchimp 2.1**; five open product decisions (NPD-M1 / NPD-M2 / NPD-M3 / NPD-M4 / NPD-M5) called out for visibility, **only NPD-M1 blocks Mailchimp 2.2**.
- [ ] §11 (effort) ≈ 4 implementation commits + 1 audit + 1 outcomes for Mailchimp 2.1 is in the right ballpark.
- [ ] §13 (batch plan) commit ordering accepted.
- [ ] **Open decisions confirmed:**
  - **NPD-M1:** High-blast-radius email-sending contract — recommendation: **(d) port `create_campaign` only under Q11; defer `send_campaign` + `schedule_campaign` until customer signal.** Mailchimp 2.2 ships `create_campaign` (3 commits). `send_campaign` / `schedule_campaign` then become Mailchimp 2.3 candidates under Q11 (a) if signal emerges. Accept/reject.
  - **NPD-M2:** `email_type_option` Q11 in `create_audience` — recommendation: **accept current V2 shape** (Mailchimp's consent surface is the signup form, not the list config). Accept/reject.
  - **NPD-M3:** Two-call campaign-create atomicity — recommendation: **(a) Q4 bracket spans both calls** for Mailchimp 2.2. Accept/reject.
  - **NPD-M4:** Mailchimp rate-limit handling — recommendation: **(a) document workflow-author guidance**; defer provider-tier semaphore until customer report surfaces. Accept/reject.
  - **NPD-M5:** Domain expansion priority — recommendation: **defer pending Phase 5 AI planner / Phase 3 UI usage signal.** Each domain is its own slice candidate, NOT bundled into Mailchimp parity. Mandrill is a separate provider entirely. Accept/reject.
- [ ] Implementation does not start until all checkboxes are ticked.
