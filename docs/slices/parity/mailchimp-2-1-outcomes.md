# Mailchimp 2.1 — read-tier + unsubscribe + parity polling triggers outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Provider audit:** [`docs/slices/parity/parity-mailchimp.md`](./parity-mailchimp.md) (accepted before Commit 1 began).
**Phase 1 predecessor:** [`docs/slices/slice-14-mailchimp.md`](../slice-14-mailchimp.md) (10 subscriber/audience/segment/note/event actions + consolidated `audience_event` webhook trigger (6-event allowlist) + 3 polling triggers (`campaign_created` / `email_opened` / `link_clicked`); established per-datacenter API-host routing + non-refreshable OAuth contract + Mailchimp-doesn't-sign webhooks pattern).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/mailchimp/`](../../../integrations/mailchimp/).

Mailchimp 2.1 closes the audit's PORT set: **4 read-tier / state-change actions + 3 polling triggers**. Zero new platform infrastructure. The 3 send/schedule/create campaign actions remain DEFERRED per Marcus's accepted **NPD-M1 (d)** recommendation — Mailchimp 2.2 will eventually port `create_campaign` only, under a Q11 explicit-consent contract; `send_campaign` / `schedule_campaign` stay deferred indefinitely on high-blast-radius grounds. The audit's accepted **NPD-M2..NPD-M5** decisions hold the line on `email_type_option` (no Q11 change), campaign-create atomicity strategy (Q4 bracket reserved for 2.2), Mailchimp rate-limit handling (documented, not engineered), and domain expansion (templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch all deferred pending product signal).

Largest qualitative outcomes: (1) **V1 M-R3 dead flags fully dropped** — `sendGoodbye` / `sendNotification` / `reason` rejected at schema-parse time in `unsubscribe_subscriber`. (2) **Single-page list-read convention established** — `get_subscribers` and all 3 new polling triggers return single-page results; workflow authors compose pagination. No auto-pagination anywhere. (3) **Privacy-friendlier polling snapshots** — `subscriber_added_to_segment` snapshots use Mailchimp's stable `member.id` (md5 hash) rather than V1's raw `email_address` arrays. (4) **Hybrid webhook + polling provider proven at parity** — V2 now ships 6 polling triggers + 1 consolidated webhook trigger for Mailchimp, matching V1's 10 trigger types via 7 V2 trigger objects.

---

## 1. Commit chain

| Commit | Title |
|---|---|
| `35e89e2d0` | `docs(mailchimp): add parity audit` — Commit 0 (audit; doc-only). |
| `702c45097` | `feat(mailchimp): port read-tier actions` — Commit 1 (`get_subscribers` + `get_campaign` + `get_campaign_stats` + `membersList` wrapper + `reportGet` alias + widened `MailchimpReportSummary` interface + 49 tests). |
| `6bfc07c3d` | `feat(mailchimp): add unsubscribe subscriber action` — Commit 2 (`unsubscribe_subscriber` reusing `memberPatch` + 25 tests; V1 M-R3 dead flags dropped at parse time). |
| `88420231a` | `feat(mailchimp): add parity polling triggers` — Commit 3 (`subscriber_added_to_segment` + `segment_updated` + `new_audience` + 3 new shared wrappers (`segmentGet`, `segmentMembersList`, `listsList`) + 55 trigger tests + 16 wrapper tests + widened `MailchimpList` interface). |
| `a8c7e4d00` | `test(mailchimp): extend walkthrough with 2.1 parity coverage` — Commit 4 (2 new e2e tests inside existing `slice-14-mailchimp-walkthrough.spec.ts`; mock Mailchimp server extended with 5 wire endpoints + 5 control endpoints + lists/segments state maps). |

This doc (Commit 5) is the retro. **No runtime code changes.**

---

## 2. Scope shipped

### Actions (4 new)

| Action | Mailchimp endpoint | What it does | V1 reference |
|---|---|---|---|
| `get_subscribers` | `GET /3.0/lists/{listId}/members` | Single-page list-read with optional status / count / offset / sinceLastChanged / beforeLastChanged / sortField / sortDir filters. Bounded per-subscriber projection + `nextOffset` cursor for workflow-author-driven pagination. | [`lib/workflows/actions/mailchimp/getSubscribers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getSubscribers.ts) (71 LOC) |
| `get_campaign` | `GET /3.0/campaigns/{campaignId}` | Single-record campaign read with bounded `settings` + `recipients` sub-shapes. | [`lib/workflows/actions/mailchimp/getCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getCampaign.ts) (97 LOC) |
| `get_campaign_stats` | `GET /3.0/reports/{campaignId}` | Campaign stats read with bounded `opens` / `clicks` / `bounces` / `forwards` / `industryStats` sub-shapes. Single API call (V1 used a 2-call campaign-then-report pattern). | [`lib/workflows/actions/mailchimp/getCampaignStats.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getCampaignStats.ts) (118 LOC) |
| `unsubscribe_subscriber` | `PATCH /3.0/lists/{listId}/members/{md5LowercaseEmail}` body `{status: 'unsubscribed'}` | State-change only. Preserves the subscriber record. Distinct from `remove_subscriber` (Slice 14's Q11-gated archive / hard-delete). V1's M-R3 dead `sendGoodbye` / `sendNotification` / `reason` flags rejected at schema parse. | [`lib/workflows/actions/mailchimp/unsubscribeSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/unsubscribeSubscriber.ts) (141 LOC; V2 reduces to ~85 LOC across handler + schema by deleting M-R3 surface) |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts).
**V2 Mailchimp action total after 2.1: 14** (10 Slice 14 Commit 3 + 4 Mailchimp 2.1).

### Triggers (3 new, polling)

| Trigger | Wire endpoint | Snapshot shape | Dedup key |
|---|---|---|---|
| `subscriber_added_to_segment` | `GET /3.0/lists/{listId}/segments/{segmentId}/members` (single page, count clamped 100) | Sorted set of Mailchimp `member.id` values (md5 hashes) | `subscriber_added_to_segment:{segmentId}:{hash}` |
| `segment_updated` | `GET /3.0/lists/{listId}/segments/{segmentId}` | `{name, memberCount, updatedAt, type}` observable tuple | `segment_updated:{segmentId}:{updatedAt}` (fallback `mc:{name}:{count}:{type}` if `updatedAt` absent) |
| `new_audience` | `GET /3.0/lists` (single page, count clamped 100) | Sorted set of list ids | `new_audience:{listId}` |

Registered in [`integrations/_registry.ts`](../../../integrations/_registry.ts).
**V2 Mailchimp polling-trigger total after 2.1: 6** (3 Slice 14 Commit 5 + 3 Mailchimp 2.1).
**V2 Mailchimp webhook-trigger total: 1** (consolidated `audience_event` — unchanged).

### API wrappers (1 new + 1 alias + 3 extensions)

| Wrapper | Module | Added / Extended | Used by |
|---|---|---|---|
| `membersList` | [`integrations/_shared/mailchimp/api/members.ts`](../../../integrations/_shared/mailchimp/api/members.ts) | NEW | `get_subscribers` |
| `reportGet` | [`integrations/_shared/mailchimp/api/reports.ts`](../../../integrations/_shared/mailchimp/api/reports.ts) | NEW alias of `reportSummary` (same wire path; wider `MailchimpReportSummary` interface to cover `send_time` / `abuse_reports` / `unsubscribed` / `forwards` / `industry_stats`) | `get_campaign_stats` |
| `segmentGet` | [`integrations/_shared/mailchimp/api/segments.ts`](../../../integrations/_shared/mailchimp/api/segments.ts) | NEW | `segment_updated` (activate + poll) |
| `segmentMembersList` | [`integrations/_shared/mailchimp/api/segments.ts`](../../../integrations/_shared/mailchimp/api/segments.ts) | NEW | `subscriber_added_to_segment` (activate + poll) |
| `listsList` | [`integrations/_shared/mailchimp/api/lists.ts`](../../../integrations/_shared/mailchimp/api/lists.ts) | NEW (+ widened `MailchimpList` interface with `contact` / `permission_reminder` for new_audience payload) | `new_audience` (activate + poll) |

**Reused unchanged:** `campaignGet` (Slice 14), `memberPatch` (Slice 14; threading `status: 'unsubscribed'` on `unsubscribe_subscriber`), all of `_request.ts` + `_base.ts` + `_subscriberHash.ts` + `errors.ts`, `refreshAndRetry`, `resolveDc`.

### Manifest scope changes

**None.** Mailchimp's synthetic `["account_access"]` scope is unchanged — Mailchimp does not enforce OAuth scope parameters. Same `tokenScope: "user"`, `accountIdField: "mailchimpAccountId"`, `refreshable: false`. Capability flags untouched (all 4 already true after Slice 14 Commit 5).

### File system

No reshape. New action files in-place under `integrations/mailchimp/actions/`. Three new polling-trigger directories `triggers/{subscriberAddedToSegment,segmentUpdated,newAudience}/` each with the canonical `{index,schema,activate,poll}.ts` 4-file shape. Wrapper extensions appended to existing shared API modules. All leaf folders stay well under the 50-file limit.

---

## 3. Durable decisions worth preserving

### 3.1 Read/list actions are single-page only

`get_subscribers` and all 3 polling triggers (`segmentMembersList`, `listsList`, the activation-side fetches) return a single page of results bounded by Mailchimp's per-call count cap (clamped at 100 in the V2 wrappers, well below Mailchimp's 1000 server cap). No auto-pagination is provided. Workflow authors compose pagination explicitly via the `offset` config field and the `nextOffset` output (for `get_subscribers`) or by structuring multiple workflows around segment / list state.

Reason: every form of auto-pagination would require either an unbounded loop inside a single action invocation (timing out long-running pages) or an unbounded snapshot (broken JSONB equality across writes; runaway storage). Both are explicit non-goals per audit §11 + §12 R3. The downstream `nextOffset` cursor surfaces what V2 cleanly supports without hidden loops; the engine's `wait` + multi-tick composition handles the user-visible iteration story.

### 3.2 `unsubscribe_subscriber` is PATCH `status: 'unsubscribed'`, NOT archive/delete

V1's doc comment was explicit: *"This preserves the subscriber record (unlike remove which permanently deletes)."* V2 matches. The action is a pure state-change — the subscriber can be re-subscribed later. Distinct from `remove_subscriber` (Slice 14 Commit 3) which routes to `memberArchive` (reversible) or `memberDeletePermanent` (irreversible) via a Q11 destructive-gate `mode` field.

Workflow authors who want to permanently delete a subscriber compose `remove_subscriber` (with `mode: "delete_permanent"` Q11-required). Authors who want to send a goodbye email — Mailchimp does NOT support this at the API; it's a list-level dashboard setting. Authors who want to attach a reason note compose `unsubscribe_subscriber` → `add_note` explicitly.

### 3.3 V1 M-R3 dead flags rejected at schema parse

`UnsubscribeSubscriberConfigSchema` is `.strict()`. The three V1 flags (`sendGoodbye`, `sendNotification`, `reason`) cause Zod to throw with the offending key in the error path:

- `sendGoodbye` — V1 only TODO-logged the flag; Mailchimp's PATCH endpoint ignores it.
- `sendNotification` — same; list-owner notifications are a dashboard setting.
- `reason` — V1 fired a hidden second `POST /notes` with `.catch(swallow)` — non-atomic, hidden side effect.

The Zod-parse-before-resolveDc/wrapper-call ordering is asserted in unit tests (`unsubscribeSubscriber.test.ts`) AND in the e2e (`memberPatch` recorded body has none of these keys).

### 3.4 No raw Mailchimp response spread anywhere

Every action / trigger output enumerates fields explicitly:
- Action outputs: `getSubscribers` / `getCampaign` / `getCampaignStats` / `unsubscribeSubscriber` handler files each project ~7-15 named fields. Anti-tests in `readTierActions.test.ts` and `unsubscribeSubscriber.test.ts` assert wire-only fields (`stats`, `ip_signup`, `merge_fields` on unsubscribe, `permission_reminder` on get_campaign, etc.) do NOT leak through.
- Trigger payloads: `subscriber_added_to_segment` / `segment_updated` / `new_audience` poll handlers each project a bounded payload. The e2e asserts `workflow_runs.trigger_event.payload` shape directly (no extra keys).

This is the established V2 contract — workflow variables stay stable as Mailchimp evolves the wire response.

### 3.5 `get_campaign` 404 propagates `NotFoundError` (no mixed-success `found:false`)

V1's `getCampaign` returned `{success: false, output: {found: false, campaignId}, message: "Campaign X not found"}` on 404 — a mixed-success envelope that workflows have to special-case. V2's wrapper raises `NotFoundError("campaign X")`; the engine surfaces it as a normal error; workflow authors branch on the error (consistent with `get_subscriber`, `get_subscribers`, and `unsubscribe_subscriber`). No special-case `found` flag in any V2 action output.

### 3.6 `get_campaign_stats` is a single `/reports/{id}` call

V1's `getCampaignStats` ran two API calls per invocation: first `GET /campaigns/{id}` to check status, then conditionally `GET /reports/{id}` if status was `'sent'`. V2 collapses to one call against `/reports/{id}` directly. Mailchimp returns 404 for `/reports/{id}` when the campaign hasn't been sent; that surfaces as `NotFoundError` (matching §3.5).

Wire savings: 50% fewer Mailchimp API calls per `get_campaign_stats` invocation. Behavioral equivalence: V1's conditional second call already returned the same data V2 now retrieves directly.

### 3.7 Polling triggers honor V2's "baseline-first" rule

Every polling trigger captures its baseline at activation time, not at first poll. The activation hook:
1. Fetches the current state from Mailchimp.
2. Stores a sorted-set snapshot (for set-based triggers) or observable-tuple snapshot (for `segment_updated`).
3. Throws `MissingDataCenterError` if dc is absent — fails loud; the trigger never registers.

The first poll after activation observes the same state and emits zero events. New state on subsequent polls fires one event per new entity. Asserted in 3 unit tests (one per trigger) + 1 e2e test (parametrized across all 3 triggers).

### 3.8 Polling snapshots use stable provider identifiers, not emails

`subscriber_added_to_segment` snapshots store Mailchimp `member.id` values (md5(lowercase(email)) hashes), NOT raw email addresses. V1 used `email_address` in its snapshot map; V2 changes to `member.id` for two reasons:

- **Privacy:** raw emails persisted in JSONB snapshots become a quiet PII surface in the database. The hash is opaque-looking and recoverable only by the Mailchimp API (which already has the email).
- **Stability:** the hash is what Mailchimp keys subscriber endpoints by; using it directly aligns the snapshot with the wire-format dedup discriminator.

The bounded payload still includes `emailAddress` (Mailchimp surfaces it on `/segments/{id}/members` reads), so downstream workflows can use it.

### 3.9 Polling snapshots stored as sorted arrays for stable JSONB equality

Every set-based snapshot (`knownCampaignIds`, `knownSubscriberHashes`, `knownListIds`) is persisted as a `sort()`-ed array. JSONB equality at the Postgres layer is lexicographic; sorted arrays mean two snapshots with the same elements compare equal across writes. Eliminates spurious snapshot-equality bugs that would surface only as flaky tests.

### 3.10 Polling snapshots grow monotonically for set triggers

`subscriber_added_to_segment` / `new_audience` snapshot updates union the previous snapshot with the current observed set. Removal of an entity from the underlying Mailchimp surface does NOT shrink the snapshot. Reason: a member leaving and rejoining shouldn't fire a duplicate `subscriber_added_to_segment` event. The audit's accepted "one-way diff" rule.

### 3.11 `segment_updated` snapshot always overwrites to latest observed state

`segment_updated` snapshots the entire observable tuple (`name`, `memberCount`, `updatedAt`, `type`). On every poll (changed OR unchanged), the snapshot is overwritten with the latest observed state. Reason: idle ticks where the underlying segment did change but the workflow didn't fire (e.g. dedup hit OR dedup outage) should leave the snapshot aligned with reality, not stuck at the old baseline. Asserted in `segmentUpdated.test.ts` "snapshot always updated to latest observed state".

### 3.12 Per-datacenter routing via integration metadata; fail loud on missing dc

`resolveDc` reads `integrations.accountMetadata.dc` (captured at OAuth callback time per Slice 14 Commit 2). Missing dc throws `MissingDataCenterError`. V2 deliberately does NOT reproduce V1's runtime DC re-fetch fallback (`utils.ts:37-75`) which masked OAuth-callback failures behind silent recovery. Surfaces a clear "reconnect Mailchimp" prompt at action / trigger time instead.

Asserted in both action unit tests (Zod-rejects-or-resolveDc-rejects-before-wrapper guards) and polling-trigger unit tests (poll-time MissingDataCenter propagation).

### 3.13 DB-backed dedup via `webhook_event_dedup`; fail-CLOSED on dedup outage

Every polling event passes through `webhookEventDedup.markSeen("mailchimp", eventId)`. If the dedup table returns `{fresh: false}`, the event is skipped (the prior poll already enqueued it). If the dedup call itself fails (DB outage), the event is skipped this tick + a warn log is emitted; the next tick retries. Better delayed than double-fired.

Stable provider-backed event IDs (`{eventType}:{providerId}` or `{eventType}:{compositeKey}:{discriminator}`) ensure cross-tick dedup is reliable. Crash between enqueue and snapshot persistence is safe — the dedup table already has the row.

### 3.14 5-minute polling cadence (V2 default)

All 3 new polling triggers default to `DEFAULT_INTERVAL_MS` (5 minutes). The polling cron picks up rows via `config.pollingEnabled: true`. No per-trigger override needed for Mailchimp 2.1; the audit didn't surface any rate-limit-sensitive endpoint that would benefit from a slower cadence.

### 3.15 No provider-tier rate-limit handling (NPD-M4 deferred)

Mailchimp's rate-limit policy is "10 simultaneous connections per account" — connection-count cap, not request-rate cap. V1 has no provider-tier handling; V2 does not engineer one. Workflow authors managing high-volume Mailchimp chains should add `wait` nodes between actions; the connection cap fires at 429 with `Retry-After`. Revisit only if a customer report surfaces.

### 3.16 No 2-call atomicity wrapper for `create_campaign` (deferred to Mailchimp 2.2 under NPD-M3)

Mailchimp's create-campaign requires `POST /campaigns` + `PUT /campaigns/{id}/content` as separate calls. V1's M-R10 issue (the second call's failure leaves an orphan campaign with empty content) is documented but NOT fixed by Mailchimp 2.1 — `create_campaign` is deferred to Mailchimp 2.2 (NPD-M1 (d)). When 2.2 lands, the audit's accepted **NPD-M3 (a)** decision applies: a Q4 idempotency bracket spans both calls, making partial-failure retry-safe.

### 3.17 `audience_event` consolidated webhook trigger unchanged

Slice 14 Commit 4's `audience_event` (6-event allowlist: subscribe / unsubscribe / profile / upemail / cleaned / campaign) covers V1's 4 webhook trigger types. No new webhook event types added in Mailchimp 2.1. The audit's §6 finding stands: webhook event-type coverage is at 100% parity (V2 actually adds `cleaned` over V1).

---

## 4. V1 rot inventory closed in 2.1

Audit-numbered rows from [`docs/slices/parity/parity-mailchimp.md`](./parity-mailchimp.md) §8. Status after Mailchimp 2.1:

| ID | Rot | Status |
|---|---|---|
| M-R1 | Mailchimp misclassified as `oauth_with_refresh` while `refresh_token: null` hardcoded | **CLOSED in Slice 14** (V2 manifest `refreshable: false`). |
| M-R2 | Runtime DC re-fetch fallback in V1 `utils.ts:37-75` | **CLOSED in Slice 14** (V2 fails loud via `MissingDataCenterError`). |
| M-R3 | `sendGoodbye` / `sendNotification` TODO-only flags on `unsubscribeSubscriber` | **CLOSED in Mailchimp 2.1 Commit 2** — schema rejects at parse time. **Extended:** V1's third dead flag `reason` (hidden `/notes` side effect) also rejected. |
| M-R4 | `createCampaign` silent `type: 'regular'` default | Deferred — `create_campaign` is Mailchimp 2.2 scope under NPD-M1 (d). On port the field becomes required at the schema layer. |
| M-R5 | `createAudience` silent `email_type_option: false` default | **Accepted unchanged** per NPD-M2 (Mailchimp's consent surface is the signup form, not the list config). |
| M-R6 | `sendCampaign` no Q11 consent / safety-floor guard | **Deferred indefinitely** per NPD-M1 (d) — `send_campaign` not ported in 2.1 or 2.2. |
| M-R7 | `scheduleCampaign` silent `scheduleType: 'absolute'` / `relativeUnit: 'hours'` defaults | **Deferred indefinitely** per NPD-M1 (d) — `schedule_campaign` not ported. |
| M-R8 | Webhook receive route has zero signature verification | **Protocol-aligned, not a V2 regression** — Mailchimp doesn't sign webhooks. V2 honors the same approach (URL secrecy + audienceId match + event-type allowlist + sha256 dedup). Slice 14 Commit 4 closed this. |
| M-R9 | V1 polling worker uses legacy `triggerWorkflow` pipeline | **NOT REPRODUCED in Slice 14 + 2.1** — V2 polling triggers dispatch through `dispatchTriggerEvent` + `webhook_event_dedup` directly. |
| M-R10 | Two-call campaign creation is non-atomic | Deferred to Mailchimp 2.2 under NPD-M3 (a) — Q4 bracket spans both calls when ported. |
| M-R11 | V1 `createCampaign` requires HTML or text content but not both | Deferred to Mailchimp 2.2 — enforced at the Zod schema's content union when ported. |
| M-R12 | Near-zero V1 test coverage for Mailchimp | **NOT a problem in V2** — Slice 14 shipped 27 unit files; Mailchimp 2.1 adds ~129 new tests (49 read-tier + 25 unsubscribe + 55 polling + 16 wrapper). V2 Mailchimp focused test count after 2.1: **39 suites / 552 tests passing**. |
| M-R13 | V1 `getMailchimpAuth` re-writes metadata on every action call when re-fetch path fires (race conditions) | **NOT REPRODUCED** — V2's `resolveDc` is read-only. |
| M-R14 | V1 1,696-line monolithic manifest file | **CLOSED in Slice 14** — V2 schemas per-action / per-trigger 4-file directories. Mailchimp 2.1 keeps the pattern (4 new action+schema pairs + 3 new trigger 4-file directories). |

---

## 5. E2E validation

[`tests/e2e/slice-14-mailchimp-walkthrough.spec.ts`](../../../tests/e2e/slice-14-mailchimp-walkthrough.spec.ts) extended with **2 new tests** in the same describe block. **3 tests total passing in 60s** under `--workers=1`.

### Test 2 — "Mailchimp 2.1 — read-tier actions + unsubscribe_subscriber"

Single workflow with `audience_event(subscribe)` trigger chained to 4 actions in series:
- `get_subscribers` → `get_campaign` → `get_campaign_stats` → `unsubscribe_subscriber`

One webhook fire drives the run. Asserts:
- Each step succeeded (via `workflow_runs.steps[].status === 'succeeded'`, Map-keyed lookup).
- Mock saw 1× GET `/lists/{id}/members` (with status + count query params); 1× GET `/campaigns/{id}`; 1× GET `/reports/{id}`; 1× PATCH `/lists/{id}/members/{md5LowercaseEmail}`.
- PATCH body has `status === "unsubscribed"`; subscriberHash matches expected md5 of configured emailAddress.
- **Anti-tests**: PATCH body has NO `sendGoodbye`, `sendNotification`, or `reason` keys (M-R3 dropped at the wire).

### Test 3 — "Mailchimp 2.1 — parity polling triggers"

3 separate workflows, one per polling trigger. Per trigger:
1. Seed mock baseline state.
2. Activate trigger → assert snapshot captured + correct baseline call to mock.
3. First polling tick (no state change) → assert 0 workflow_runs.
4. Modify mock state (add member / update segment / add list).
5. Second polling tick → assert exactly 1 workflow_run per trigger.
6. Assert `workflow_runs.trigger_event.payload` matches expected bounded shape (read directly off the jsonb column — cleaner than variable-substitution side channels).
7. Third polling tick (no further state change) → assert no duplicate fires.

Payload assertions verified:
- `subscriber_added_to_segment`: `{listId, segmentId, subscriberHash, emailAddress, status}` + eventId `subscriber_added_to_segment:{segmentId}:{newMemberHash}`.
- `segment_updated`: `{listId, segmentId, name, memberCount, type, updatedAt}` + eventId `segment_updated:{segmentId}:{newUpdatedAt}`.
- `new_audience`: `{listId, name, company, memberCount, dateCreated}` + eventId `new_audience:{newListId}`.

### Mock Mailchimp additions

[`tests/e2e/helpers/mockMailchimpServer.ts`](../../../tests/e2e/helpers/mockMailchimpServer.ts) extended with:

| Endpoint | Purpose |
|---|---|
| `GET /3.0/lists/{id}/members` | `get_subscribers` wire surface. Honors status / count / offset / sort query params. |
| `PATCH /3.0/lists/{id}/members/{hash}` | `unsubscribe_subscriber` wire surface. Applies status change to seeded state best-effort. |
| `GET /3.0/lists/{id}/segments/{segId}` | `segment_updated` activate + poll. |
| `GET /3.0/lists/{id}/segments/{segId}/members` | `subscriber_added_to_segment` activate + poll. |
| `GET /3.0/lists` | `new_audience` activate + poll. |
| `POST /__seedList` | Seed an audience for the polling tests. |
| `POST /__seedListMembers` | Bulk-seed list members for `get_subscribers`. Auto-creates parent list if absent. |
| `POST /__seedSegment` | Seed a segment with optional initial members. |
| `POST /__addSegmentMember` | Drop a new member into a seeded segment; auto-bump `member_count` + `updated_at`. |
| `POST /__updateSegment` | Change observable segment fields (name / memberCount / type / updatedAt). |

Mock state extended with `lists` and `segments` maps; per-list / per-segment member maps keyed by md5(lowercase(email)) hash so mock-side changes propagate through the same wire surface V2 reads.

### Trigger-node step logging lesson

The v2 engine logs the trigger node alongside action nodes in `workflow_runs.steps[]`. Initial e2e assertion used strict-set equality on the steps array and failed on the unexpected `trigger-node:succeeded` entry. Fixed by switching to `Map.get(nodeId)` lookups so the trigger-node step doesn't break action assertions. **Test-assertion issue, not a production bug.**

---

## 6. Test coverage delta

| Layer | Before Mailchimp 2.1 | After Mailchimp 2.1 | Delta |
|---|---:|---:|---:|
| Mailchimp focused unit suites | 28 | 39 | +11 |
| Mailchimp focused unit tests | 417 | 552 | +135 |
| Full npm test suites | 660 | 669 | +9 |
| Full npm test count | 6438 | 6673 | +235 |
| Mailchimp e2e tests (slice-14 spec) | 1 | 3 | +2 |

---

## 7. Final scoreboard against the audit

| Audit decision | Status |
|---|---|
| **PORT in 2.1**: `get_subscribers`, `get_campaign`, `get_campaign_stats`, `unsubscribe_subscriber`, `subscriber_added_to_segment`, `segment_updated`, `new_audience` | ✅ All shipped (Commits 1-3, e2e in 4). |
| **DROP M-R3** (`sendGoodbye` / `sendNotification` on `unsubscribe_subscriber`) | ✅ Dropped at schema-parse time. Extended to also drop `reason`. |
| **DEFER pending NPD-M1**: `send_campaign`, `schedule_campaign`, `create_campaign` | ✅ Not ported. NPD-M1 (d) accepted — `create_campaign` reserved for Mailchimp 2.2; `send_campaign` / `schedule_campaign` deferred indefinitely. |
| **DEFER pending NPD-M5**: templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch | ✅ Not ported. Revisit per Phase 5 AI planner / Phase 3 UI signal. |
| **NPD-M2** — `email_type_option` Q11 treatment in `create_audience` | ✅ Accepted unchanged. |
| **NPD-M3** — two-call campaign-create atomicity | ✅ Reserved for Mailchimp 2.2 (Q4 bracket when `create_campaign` ports). |
| **NPD-M4** — rate-limit handling | ✅ Documented (workflow-author `wait` node guidance); no provider-tier engineering. |

---

## 8. What's deferred

### Deferred to Mailchimp 2.2 (conditional on Marcus assigning)

| Item | Audit decision |
|---|---|
| `create_campaign` | NPD-M1 (d) PORT under Q11 explicit-consent contract. NPD-M3 (a) Q4 idempotency bracket spans both API calls. M-R4 (silent `type` default) closed at port time by making `type` Zod-required. M-R11 (HTML-or-text content) enforced by schema union. |

### Deferred indefinitely

| Item | Reason |
|---|---|
| `send_campaign` | High blast radius (real outbound email to every audience subscriber). NPD-M1 audit accepted (d) explicitly defers. |
| `schedule_campaign` | Same Q11 surface as `send_campaign`. |
| Provider-tier rate-limit semaphore | NPD-M4 — workflow-author guidance (use `wait` nodes) sufficient until a customer report surfaces. |

### Deferred pending product signal (NPD-M5)

| Item | Reason |
|---|---|
| `templates` (`/templates`) | Domain-expansion; not a parity gap. Revisit on AI planner / UI usage signal. |
| `automations` / `classic-automations` (`/automations`) | Same. |
| `customer-journeys` (`/customer-journeys/journeys/.../actions/trigger`) | Same. |
| `mandrill` (transactional email) | Separate API + separate provider entirely. Would need its own slice. |
| `landing-pages` (`/landing-pages`) | Same. |
| `ecommerce` (`/ecommerce/stores`) | Large domain; would need its own slice. |
| `conversations` (`/conversations`) | Largely deprecated by Mailchimp. |
| `batch` (`/batches`) | Latency / throughput optimization for high-volume workflows. Revisit if rate-limit pressure surfaces. |

### Out of scope — not started

- Any Mailchimp 2.2 work. The audit covered Mailchimp 2.1 only; Mailchimp 2.2 (`create_campaign`) requires fresh Marcus assignment.

---

## 9. CLAUDE.md updates landed

A new "Phase 2 progress (Mailchimp)" entry under "Current Local Development State" records the Mailchimp 2.1 commit chain, shipped surface, and durable decisions.

A new "Mailchimp Phase 2 patterns" subsection under "Deep Gotchas" records six durable rules:
- **Single-page list-read only.** Read/list actions and polling triggers return one page; `nextOffset` / segment-membership cursor surfaces in the output; no auto-pagination anywhere.
- **`unsubscribe_subscriber` is PATCH `status: 'unsubscribed'` — NOT archive / delete.** Preserves the subscriber record; distinct from `remove_subscriber` (Slice 14 Q11 destructive-gate `mode`).
- **No hidden notification / note side effects on subscriber mutations.** V1's `sendGoodbye` / `sendNotification` / `reason` flags rejected at schema parse. Workflow authors compose `add_note` explicitly for unsubscribe-reason logging.
- **Polling triggers baseline-first and never replay historical state.** Activation captures baseline; first poll after activation observes the same state and emits zero events; new state on subsequent polls fires one event per new entity.
- **Polling snapshots use stable provider identifiers, not email addresses where avoidable.** `subscriber_added_to_segment` snapshots store Mailchimp `member.id` (md5 hashes), not raw emails. Privacy-friendlier + aligns with the wire-format dedup discriminator.
- **`create_campaign` / `send_campaign` / `schedule_campaign` remain out of 2.1.** Email sending is high-blast-radius. NPD-M1 (d) reserves `create_campaign` for Mailchimp 2.2 under Q11; the send/schedule pair stays deferred indefinitely.

---

## 10. What's next (Mailchimp roadmap)

Per parity-mailchimp §§11–13:

- **Mailchimp 2.2** — `create_campaign` only, under NPD-M1 (d). Requires Marcus signoff to start. Estimated 3 commits (action + e2e + outcomes). NPD-M3 (a) Q4 bracket spans both API calls when ported. NOT pre-committed.
- **Mailchimp 2.3** — conditional on Marcus rejecting NPD-M1 (d). Would port `send_campaign` + `schedule_campaign` under Q11 (a) explicit-consent. NOT pre-committed.
- **Domain expansion** (templates / automations / journeys / Mandrill / landing pages / e-commerce / conversations / batch) — each a separate slice candidate. Revisit per Phase 5 AI planner / Phase 3 UI signal.
- **Provider-tier rate-limit handling** — its own slice if a customer reports 429-induced workflow failures.

**Mailchimp 2.1 closes the audit's identified parity PORT set. The next provider audit is the natural next step unless Marcus assigns Mailchimp 2.2 work explicitly.**
