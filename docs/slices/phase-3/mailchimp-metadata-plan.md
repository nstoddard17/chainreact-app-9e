# Mailchimp Metadata + Resolver Plan — Slice 3.MAILCHIMP-1

**Status:** Planning slice. Doc-only. **No metadata, no resolvers, no runtime changes ship in this commit.**
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Predecessor:** [`./hubspot-metadata-outcomes.md`](./hubspot-metadata-outcomes.md). The HubSpot arc proved the resolver-first + dependsOn-cascade pattern on a multi-resolver provider; this plan reuses it.
**Companion plans:** [`./options-source-plan.md`](./options-source-plan.md), [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md).

Every count, schema shape, and field-name claim below was verified by reading live files (`services/execution/handlers/_registry.ts`, `services/discovery/_registry.ts`, `services/options/_registry.ts`, `integrations/mailchimp/**`, `integrations/_shared/mailchimp/**`) — not from memory.

---

## 1. Current Mailchimp inventory

- **Action handlers registered:** **14** in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) (one block under `// Mailchimp 2.1 ...`). Matches the post-HUBSPOT coverage checkpoint.
- **Trigger handlers registered:** **7** — `audience_event` (webhook, consolidated across 6 Mailchimp event types) + 6 polling triggers (`campaign_created`, `email_opened`, `link_clicked`, `new_audience`, `segment_updated`, `subscriber_added_to_segment`). All 7 register their activation hooks in `integrations/_registry.ts` via the per-trigger `index.ts` files.
- **Action metas registered:** **0**. No `*.meta.ts` files exist anywhere under `integrations/mailchimp/`.
- **Trigger metas registered:** **0**.
- **OptionsSource resolvers registered for Mailchimp:** **0**. `integrations/mailchimp/options/` directory does NOT exist.
- **Provider state in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts):** UNCOVERED. Adding to `COVERED_PROVIDERS` is the final step of this arc.
- **Provider in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts):** does NOT appear (no imports, no array entries).

Mailchimp is the largest fully-uncovered provider remaining after the HubSpot arc (14 action handlers + 7 trigger handlers — total 21 handlers without metadata, the highest of any uncovered provider). Coverage gain on completion: 14 actions → 134 → 148 actions covered, 22 → 23 trigger metas covered (if all 7 triggers ship) — **62.3% → 68.8%** of registered action handlers.

### OAuth + manifest state (no scope work required)

From [`integrations/mailchimp/manifest.ts`](../../../integrations/mailchimp/manifest.ts):

- **`refreshable: false`** — Mailchimp issues a single non-expiring opaque bearer token. On 401 the per-provider `refreshToken()` throws `RefreshNotSupportedError("mailchimp")`. Action handlers wrap their principal call in `refreshAndRetry`, which surfaces 401 as `IntegrationActionRequiredError(reason: "refresh_not_supported")` (matches Slack / Notion / Shopify / GitHub non-refreshable contract).
- **Scopes: `["account_access"]` — synthetic single placeholder.** Mailchimp's OAuth does NOT enforce scopes; the `scope=` URL param is ignored, and the token-exchange response carries `scope: null`. The manifest declares one synthetic scope to satisfy the V2 contract; the auth URL omits `scope=` entirely. **No scope additions needed for any resolver or meta in this arc.**
- **Per-datacenter API host routing.** Every action / resolver / trigger call routes through `https://${dc}.api.mailchimp.com/3.0/...` where `dc` is resolved from `integration.accountMetadata.dc`. Already wired via [`integrations/_shared/mailchimp/api/_base.ts`](../../../integrations/_shared/mailchimp/api/_base.ts); `resolveDc` at [`integrations/mailchimp/actions/_resolveDc.ts`](../../../integrations/mailchimp/actions/_resolveDc.ts). Missing `dc` throws `MissingDataCenterError`. Resolvers will reuse the same path.
- **Existing Mailchimp users do NOT need to reconnect.** Matches the HubSpot arc, contrasts with the Google Sheets arc (which added `drive.metadata.readonly`).

### Existing shared API surface

[`integrations/_shared/mailchimp/api/`](../../../integrations/_shared/mailchimp/api/) already provides typed wrappers for every endpoint the planned resolvers will need:

- `lists.ts` — `GET /lists` (for `mailchimp:audiences` resolver).
- `segments.ts` — `GET /lists/{audienceId}/segments` (for `mailchimp:segments`).
- `campaigns.ts` — `GET /campaigns` (for `mailchimp:campaigns`).
- `members.ts`, `webhooks.ts`, `me.ts` — already used by actions and triggers; not resolver targets in this arc.

No new API wrappers required for the planned resolvers.

---

## 2. Full action inventory

Read live from each schema + handler (`integrations/mailchimp/actions/*.{schema,}.ts`). Field names use the EXACT runtime keys — note the inconsistency between actions (see §2.1 below).

### 2.1 Critical field-name inconsistency to surface

Mailchimp action schemas use TWO competing conventions for the same fields:

| Convention | Used by |
| --- | --- |
| `audience_id` + `email` (snake_case) | `add_subscriber`, `update_subscriber`, `remove_subscriber`, `add_tag`, `remove_tag`, `get_subscriber`, `create_segment`, `create_custom_event`, `add_note` |
| `listId` + `emailAddress` (camelCase) | `unsubscribe_subscriber`, `get_subscribers` (uses `listId` only — no email) |
| `campaignId` (camelCase) | `get_campaign`, `get_campaign_stats` |

This is pre-existing — the slice rule "use exact runtime field names, do not infer from plan memory if live schema differs" forces every meta to mirror its specific action's schema. **A future "normalize Mailchimp field names" refactor would be a separate runtime/schema slice, not a metadata slice.** Metas in this arc MUST follow the per-action convention; mixing them would silently break workflows.

The same inconsistency carries into the triggers (some use `audienceId`, some use `listId`, some use `campaignId`). Each trigger meta mirrors its specific trigger schema.

### 2.2 Action-by-action audit

| Action | Schema file | Handler file | Required fields | Optional fields | Output shape | Risk recommendation | Sensitive outputs | Resolver needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `add_subscriber` | `addSubscriber.schema.ts` | `addSubscriber.ts` | `audience_id`, `email`, `status` (enum, NO default — Q11) | `first_name`, `last_name`, `phone`, `address`, `city`, `state`, `zip`, `country`, `tags` (CSV string) | `{subscriberId, email, status, listId, timestamp, tags[]}` | **medium** — affects a customer's marketing consent state via Mailchimp API; reversible via update/remove. `status: subscribed` has CAN-SPAM implications but the schema already gates with required Q11 enum. | `email`, `tags`, `subscriberId` (member id maps to real subscriber) | `audience_id` → `mailchimp:audiences` combobox |
| `update_subscriber` | `updateSubscriber.schema.ts` | `updateSubscriber.ts` | `audience_id`, `email` | `new_email`, `status` (enum), `first_name`, `last_name`, `phone`, `address`, `city`, `state`, `zip`, `country` | `{subscriberId, email, status, listId, lastChanged}` | **medium** — recoverable property/status edit. `new_email` triggers Mailchimp's email-change workflow + fires `upemail` webhooks. | `email`, `subscriberId` | `audience_id` → `mailchimp:audiences` |
| `remove_subscriber` | `removeSubscriber.schema.ts` | `removeSubscriber.ts` | `audience_id`, `email`, `mode` (enum `"archive"` \| `"delete_permanent"` — NO default; Q11) | — | `{email, audienceId, mode, deletedAt, permanent}` | **HIGH + isDestructive + requiresConfirmation** — `delete_permanent` mode is irreversible (Mailchimp also BLOCKS re-subscribing the same email afterward per GDPR erasure contract). `archive` mode is recoverable but the unified gate keeps the confirmation modal in front of the destructive option. | `email` | `audience_id` → `mailchimp:audiences` |
| `unsubscribe_subscriber` | `unsubscribeSubscriber.schema.ts` | `unsubscribeSubscriber.ts` | `listId`, `emailAddress` (NOTE: camelCase — different convention from other actions) | — | `{listId, subscriberHash, emailAddress, status, unsubscribed, lastChanged, success}` | **HIGH + requiresConfirmation** (NOT `isDestructive` — record is preserved) — materially changes a customer's marketing consent (subscribed → unsubscribed). User-clarified rule: consent-changing actions warrant confirmation. NOT destructive in the record-deletion sense; the subscriber's data + history stay in Mailchimp. | `emailAddress`, `subscriberHash` | `listId` → `mailchimp:audiences` |
| `add_tag` | `addTag.schema.ts` | `addTag.ts` | `audience_id`, `email`, `tags` (string[], min 1) | — | `{email, audienceId, addedTags[], addedAt}` | **medium** — recoverable tag edit; Mailchimp auto-creates missing tags. | `email`, `addedTags` (tags can encode customer attributes) | `audience_id` → `mailchimp:audiences`. `tags` stays string-array — segment/tag picker deferred (see §4). |
| `remove_tag` | `removeTag.schema.ts` | `removeTag.ts` | `audience_id`, `email`, `tags` (string[], min 1) | — | `{email, audienceId, removedTags[], removedAt}` (parity with `addTag`) | **medium** — recoverable; removing a tag the subscriber doesn't have is a no-op. | `email`, `removedTags` | `audience_id` → `mailchimp:audiences` |
| `get_subscriber` | `getSubscriber.schema.ts` | `getSubscriber.ts` | `audience_id`, `email` | — | `{subscriberId, email, status, listId, mergeFields, tags[], lastChanged}` | **low** — pure read. | `email`, `mergeFields` (PII fields like FNAME/LNAME/PHONE/ADDRESS), `tags`, `subscriberId` | `audience_id` → `mailchimp:audiences` |
| `get_subscribers` | `getSubscribers.schema.ts` | `getSubscribers.ts` | `listId` | `status` (enum 6-value), `count` (1..100), `offset`, `sinceLastChanged`, `beforeLastChanged`, `sortField` (enum 3-value), `sortDir` (enum) | `{listId, subscribers[], count, totalItems, nextOffset}` where each subscriber has `{id, emailAddress, uniqueEmailId, contactId, status, mergeFields, tags[], timestampSignup, lastChanged, vip, emailType}` | **low** — pure read. | `subscribers[]` (whole array — per-row PII), `mergeFields`, `tags` per-row, `emailAddress` per-row | `listId` → `mailchimp:audiences` |
| `create_segment` | `createSegment.schema.ts` | `createSegment.ts` | discriminated union on `mode`: <br>**static**: `audience_id`, `name`, `mode: "static"`, optional `static_emails[]`. <br>**saved**: `audience_id`, `name`, `mode: "saved"`, `conditions[]` (min 1), optional `match` (enum). | — | `{segmentId, name, audienceId, mode, memberCount, createdAt}` | **medium** — creates a new segment; reversible by deleting it. Static segments embed customer emails. | `name` (segment names often encode targeting intent — customer-identifying business data), `audienceId` ok | `audience_id` → `mailchimp:audiences`. Conditions stay paste-JSON textarea per §5 — segment-condition DSL is provider-specific and complex. |
| `create_audience` | `createAudience.schema.ts` | `createAudience.ts` | `name`, `permission_reminder`, `email_type_option` (boolean, NO default), `contact` (nested object: `company`/`address1`/`city`/`state`/`zip`/`country` required, `address2`/`phone` optional), `campaign_defaults` (nested: `from_name`/`from_email` required, `subject`/`language` optional) | `use_archive_bar`, `notify_on_subscribe`, `notify_on_unsubscribe`, `marketing_permissions`, `double_optin` (all optional booleans/emails) | `{audienceId, name, webId, dateCreated, memberCount}` | **medium** — creates a new Mailchimp audience; reversible by archiving (manual or via API). No customer messaging on create. | `name`, `webId`, `audienceId` (audience identity is customer-identifying business data) | None for resolvers — creates a NEW audience so audience picker is N/A. Nested `contact` + `campaign_defaults` use paste-JSON textareas per §5 (variable-shape nested objects). |
| `create_custom_event` | `createCustomEvent.schema.ts` | `createCustomEvent.ts` | `audience_id`, `email`, `event_name` (regex `^[a-z][a-z0-9_]{0,29}$`) | `properties` (string→string map), `occurred_at` (ISO 8601), `is_syncing` (boolean) | `{success, eventName, subscriberEmail, audienceId, occurredAt}` | **medium** — fires a Mailchimp Customer-Journey trigger. May cascade into customer email delivery if the workflow is wired to do so on the Mailchimp side — but the SEND is Mailchimp's responsibility, not ChainReact's. ChainReact's blast radius is bounded to "wrote an event row". | `subscriberEmail` | `audience_id` → `mailchimp:audiences`. `properties` map uses `keyvalue` FieldType (string→string fits perfectly). |
| `add_note` | `addNote.schema.ts` | `addNote.ts` | `audience_id`, `email`, `note` (max 1000) | — | `{noteId, email, audienceId, note, createdAt}` | **low** — internal CRM annotation; not sent to subscriber, only visible in Mailchimp UI. | `email`, `note` (free-text note may carry customer-identifying content) | `audience_id` → `mailchimp:audiences` |
| `get_campaign` | `getCampaign.schema.ts` | `getCampaign.ts` | `campaignId` | — | `{campaignId, webId, type, status, createTime, sendTime, archiveUrl, longArchiveUrl, emailsSent, contentType, settings: {title, subjectLine, previewText, fromName, replyTo}, recipients: {listId, listName, recipientCount}}` | **low** — pure read. | `settings` object (subjectLine/previewText carry customer-facing copy), `recipients` (listName + count), `archiveUrl`/`longArchiveUrl` (customer-public Mailchimp campaign URL but exposes campaign content), `replyTo` (employee email) | `campaignId` → `mailchimp:campaigns` combobox |
| `get_campaign_stats` | `getCampaignStats.schema.ts` | `getCampaignStats.ts` | `campaignId` | — | `{campaignId, emailsSent, abuseReports, unsubscribed, sendTime, opens: {opensTotal, uniqueOpens}, clicks: {clicksTotal, uniqueClicks}, bounces: {hardBounces, softBounces}, forwards: {...}, industryStats: {...}\|null}` | **low** — pure read. | `opens`, `clicks`, `bounces`, `forwards` (per-campaign performance — business-sensitive but no per-recipient data; marketing teams treat this as confidential nonetheless) | `campaignId` → `mailchimp:campaigns` |

**All 14 must be PORTed.** No blockers — every action has a clean schema + bounded output. The field-name inconsistency (§2.1) is the only design surprise; metas handle it by mirroring per-action.

---

## 3. Trigger inventory

7 trigger handlers. All register activation hooks; the `trigger-meta-activation-invariant` test will pass for every one of them without `SHARED_INFRA_EXEMPT_KEYS` entries.

| Trigger | Activation | Config schema fields (user-configurable only — internal `snapshot`/`polling`/`webhookEnabled`/`webhookId`/etc. excluded) | Payload fields | Sensitivity recommendation | Include in arc? |
| --- | --- | --- | --- | --- | --- |
| `audience_event` | **webhook** — `POST /lists/{audienceId}/webhooks` at activate, `DELETE` at deactivate. Permanent endpoint (no renewal cron). Lifecycle at [`integrations/mailchimp/triggers/audienceEvent/`](../../../integrations/mailchimp/triggers/audienceEvent/). | `audienceId` (required), `eventTypes` (required array from 6-value allowlist: `subscribe`, `unsubscribe`, `profile`, `upemail`, `cleaned`, `campaign`) | `{type, audienceId, email, subscriberHash, campaignId, firedAt, parsed: {type, firedAt, data{}, merges{}}}` per [`normalize.ts`](../../../integrations/_shared/mailchimp/webhooks/normalize.ts) | **Sensitive:** `email`, `subscriberHash`, `parsed` (raw form-decoded body including merge fields). **Structural:** `type`, `audienceId`, `campaignId`, `firedAt`. | YES — consolidated webhook (HubSpot-shaped). |
| `campaign_created` | polling (5-min cadence). Snapshot baseline at activate (set of known campaign ids). | `audienceId` (optional filter), `status` (optional enum: `save`/`paused`/`schedule`/`sending`/`sent`) | `{campaignId, type, status, title, subjectLine, fromName, replyTo, audienceId, audienceName, sendTime, createTime}` | **Sensitive:** `title`, `subjectLine`, `fromName`, `replyTo`, `audienceName`. **Structural:** ids + timestamps + status enums. | YES |
| `email_opened` | polling. Two-tier snapshot (per-campaign `totalOpens` + per-event dedup ledger). | `campaignId` (optional — when omitted, watches the most recent 10 sent campaigns) | `{campaignId, campaignTitle, subjectLine, email, subscriberId, audienceId, openTime, opensCount}` | **Sensitive:** `email`, `subscriberId`, `campaignTitle`, `subjectLine`. **Structural:** counts + timestamps. | YES |
| `link_clicked` | polling. Same snapshot shape as `email_opened` plus `urls_clicked[]`. | `campaignId` (optional), `url` (optional — exact-URL filter) | `{campaignId, campaignTitle, subjectLine, email, subscriberId, audienceId, url, urlId, clicks}` | **Sensitive:** `email`, `subscriberId`, `campaignTitle`, `subjectLine`. `url` carries the clicked link — may encode tracking tokens → mark sensitive. **Structural:** `urlId`, `clicks`. | YES |
| `new_audience` | polling. No required config (account-wide). | (no user-configurable fields) | `{listId, name, company, memberCount, dateCreated}` | **Sensitive:** `name`, `company` (audience-identifying business data). **Structural:** `listId`, counts, timestamps. | YES |
| `segment_updated` | polling. Per-segment observable state (name, memberCount, updatedAt, type). | `listId` (required), `segmentId` (required) | `{listId, segmentId, name, memberCount, type, updatedAt}` | **Sensitive:** `name` (segment names often encode targeting). **Structural:** ids, counts, type enum, timestamp. | YES |
| `subscriber_added_to_segment` | polling. Tracks per-segment membership additions. | `listId` (required), `segmentId` (required) | `{listId, segmentId, subscriberHash, emailAddress, status, lastChanged}` | **Sensitive:** `subscriberHash`, `emailAddress`. **Structural:** ids, status, timestamp. | YES |

**All 7 triggers should ship in this arc.** The activation invariant is already satisfied; including triggers in the arc lets us flip `hubspot`-style 1:1 trigger↔meta coverage from the start (though the structural test today only enforces action coverage). Polling triggers will share resolver consumers with actions (`mailchimp:audiences` on `audience_event`/`new_audience`/`segment_updated`/`subscriber_added_to_segment`; `mailchimp:campaigns` on `email_opened`/`link_clicked`; `mailchimp:segments` on `segment_updated`/`subscriber_added_to_segment`).

---

## 4. Resolver / optionsSource strategy

### 4.1 Resolvers required before usable metas

Three resolvers cover the high-frequency picker needs:

| Source key | Endpoint | dependsOn | Consumed by | Required? |
| --- | --- | --- | --- | --- |
| `mailchimp:audiences` | `GET /lists` | — | 11 of 14 actions + 4 of 7 triggers (any field named `audience_id` or `listId` that points to an existing audience) | **REQUIRED** — without it, every consumer field renders as a plain text field where the workflow author has to know an opaque Mailchimp list id. Highest-leverage resolver in the arc. |
| `mailchimp:campaigns` | `GET /campaigns` | — | `get_campaign`, `get_campaign_stats`, `email_opened`, `link_clicked` triggers (the optional `campaignId` filter) | **REQUIRED** — the campaign id is opaque and there's no other way to know it in advance. |
| `mailchimp:segments` | `GET /lists/{audienceId}/segments` | `audience_id` / `listId` (depending on the consuming field's name) | `segment_updated` + `subscriber_added_to_segment` triggers' `segmentId` field | **REQUIRED** — segment ids are opaque and scope-by-audience. Proves the dependsOn cascade on Mailchimp (already-proven pattern from Google Sheets + HubSpot). |

The dependsOn-cascade nuance: `mailchimp:segments`'s `requiredDeps` will need to declare EITHER `audience_id` OR `listId` depending on the consuming field, BUT the resolver-side `requiredDeps` is a single fixed key. The two triggers that consume it both use `listId` (the camelCase convention) — so the resolver declares `requiredDeps: ["listId"]` and the trigger metas wire `dependsOn: "listId"`. The arc has zero action consumers of `mailchimp:segments` (no action takes an existing segmentId as input — `create_segment` creates a new one). Pinning this in §5 below means no per-meta field-name divergence on the segment cascade.

### 4.2 Resolvers deferred

| Source key | Why deferred | Tracked as follow-up? |
| --- | --- | --- |
| `mailchimp:tags` | Would back the `tags[]` fields on `add_tag` / `remove_tag` / `add_subscriber.tags`. Mailchimp HAS a tags endpoint (`GET /lists/{audienceId}/tag-search`) but it's audience-scoped, paginated, and a chip-input combobox would need multi-select + create-on-the-fly support that the current `string-array` FieldType (Slice 3.13) does not provide. The current `string-array` FieldType is the right choice for v1; tags-as-combobox is a UI infrastructure follow-up. | YES — track as "Mailchimp tags picker / multi-select combobox" in outcomes doc §8. |
| `mailchimp:merge_fields` | Would back a hypothetical per-audience merge-field editor. The current schemas hardcode the FNAME/LNAME/PHONE/ADDRESS/CITY/STATE/ZIP/COUNTRY set — there is no field in any action that takes a free-form merge-field key. No consumer; no resolver needed. | NO — schema doesn't expose the surface. Tracked as part of the broader "merge field editor / property picker" cross-provider follow-up if it ever ships. |
| `mailchimp:interests` / `mailchimp:interest_categories` | No action or trigger schema takes an `interestCategoryId` or `interestId`. Mailchimp's interest-groups API is exposed via `add_subscriber.interests` in some integrations but NOT in the V2 schemas — `addSubscriber.schema.ts` hardcodes the merge-field allowlist with no `interests` field. No consumer; no resolver needed. | NO — schema doesn't expose the surface. |
| `mailchimp:templates` / `mailchimp:folders` | No action or trigger schema takes a `templateId` or `folderId`. The 14 shipped actions don't include `create_campaign` / `update_campaign` / `send_campaign` (which would consume templates). | NO — schema doesn't expose the surface. |
| `mailchimp:stores` / `mailchimp:ecommerce_customers` | No ecommerce handlers are registered. | NO — out of scope. |

### 4.3 Cascade summary

- `audience_id` → `mailchimp:audiences` (no cascade — audiences are account-scoped).
- `listId` → `mailchimp:audiences` (same resolver, just consumed via the camelCase field name).
- `campaignId` → `mailchimp:campaigns` (no cascade — campaigns are account-scoped).
- `segmentId` → `mailchimp:segments` (cascade — `dependsOn: "listId"`).

The HubSpot pipeline → stage cascade pattern translates directly. The Slice 3.33 cascade infrastructure handles the gated-empty + change-clears-dependent behavior; the only Mailchimp-specific concern is the `audience_id` vs `listId` field-name convention divergence inside the same arc (handled by per-meta wiring, not resolver design).

### 4.4 Recommended bias

- **Resolver-first.** 11 of 14 actions + 4 of 7 triggers consume `mailchimp:audiences`. Landing it before any meta is the same playbook that worked for Google Sheets + HubSpot.
- **Build the minimum set first.** `mailchimp:audiences` + `mailchimp:campaigns` + `mailchimp:segments` is the floor. Tags / merge-fields / interests can land in a follow-up arc if real workflows demand them.
- **Defer FieldType infrastructure.** No new FieldType needed for v1. `string-array` (tags), `keyvalue` (custom-event properties), `textarea` (segment conditions, audience contact/campaign_defaults paste-JSON) cover every shape.

---

## 5. Field metadata strategy

Per the slice rule: use exact runtime field names, mirror per-action conventions, no normalization.

### 5.1 Field-type decisions per shape

| Shape | FieldType | Notes |
| --- | --- | --- |
| `audience_id` / `listId` (existing audience) | `combobox`, `optionsSource: "mailchimp:audiences"` | 11 actions + 4 triggers consume. Required on most. |
| `campaignId` (existing campaign) | `combobox`, `optionsSource: "mailchimp:campaigns"` | 2 actions + 2 triggers. |
| `segmentId` (existing segment) | `combobox`, `optionsSource: "mailchimp:segments"`, `dependsOn: "listId"` | Only on `segment_updated` + `subscriber_added_to_segment` triggers (both use `listId` parent name). |
| `email` / `emailAddress` (input) | `text` | Required everywhere it appears. Runtime Zod validates email format. |
| `status` (enum: 5 or 6 values) | `select` with explicit options, **NO defaultValue** on `add_subscriber.status` (Q11 required), MAY have defaultValue on `update_subscriber.status` (optional field — no consent gate) | The 5-value vs 6-value split: `add_subscriber` uses 5 (no `archived`), `get_subscribers` uses 6 (adds `archived`). Each meta mirrors its specific schema. |
| `mode` (`remove_subscriber`: `"archive"` \| `"delete_permanent"`) | `select` with explicit options, **NO defaultValue** (Q11 destructive gate) | Workflow author MUST consciously pick. |
| `mode` (`create_segment`: `"static"` \| `"saved"`) | `select` with explicit options, **NO defaultValue** | Schema is discriminated union — author must pick before other fields make sense. |
| `tags` (string array) | `string-array` (Slice 3.13 chip input) | Used on `add_tag.tags`, `remove_tag.tags`. **NOT** the same as `add_subscriber.tags` (which is CSV string — see below). |
| `add_subscriber.tags` (CSV string) | `text` | Schema is `z.string()` (CSV format mirroring V1). Description must call out "comma-separated tag names" so authors don't paste JSON. A future schema flip to `string[]` would be a separate slice (UI-side change for the consuming meta is trivial). |
| `static_emails` (string array of emails) | `string-array` | Per-entry email validation happens at runtime via the schema's `z.array(z.string().email())`. |
| Free-text bodies / notes / segment conditions | `textarea` | `add_note.note` (max 1000), segment condition arrays (paste-JSON), `permission_reminder`. |
| Nested objects (`contact`, `campaign_defaults` on `create_audience`; segment `conditions[]` on `create_segment` saved mode) | `textarea` (paste-JSON) | Mirrors Notion / Stripe / HubSpot paste-JSON pattern. Runtime Zod schemas shred the JSON. Workflow author pastes a literal JSON object. Description must call out the required nested shape. |
| `properties` (string→string map on `create_custom_event`) | `keyvalue` | Perfect fit — schema is `z.record(z.string(), z.string())`. |
| ISO-8601 datetime (`occurred_at`, `sinceLastChanged`, `beforeLastChanged`) | `text` | No `datetime` FieldType today. Description calls out ISO 8601 + an example. |
| Numeric bounded (`count` 1..100, `offset` 0..) | `number` with `numeric: {min, max, integer: true, step: 1}` | Mirrors HubSpot / Google Sheets get-* paginators. |
| Booleans (`email_type_option`, `vip` filters, etc.) | `boolean` | Standard. `email_type_option` on `create_audience` is REQUIRED (Q11 — no default; affects whether subscribers can opt into HTML vs plain text). |
| `event_name` (regex-constrained on `create_custom_event`) | `text` | Description calls out the regex `^[a-z][a-z0-9_]{0,29}$`. Runtime Zod enforces. |
| `sortField` / `sortDir` / `match` enums | `select` with explicit options, `defaultValue` mirrored from Mailchimp's documented default where the schema doesn't have a Zod `.default()` | E.g. `match: "any"` is Mailchimp's documented default for `create_segment` saved mode — meta can carry `defaultValue: "any"`; schema accepts undefined and handler sends only when present. |

### 5.2 No new FieldType needed

Every shape maps to an existing FieldType. The audit found ONE potential gap (per-audience merge-field discovery for `add_subscriber`'s hardcoded merge-field set) — but the current schema hardcodes the allowlist, so there's no consumer surface to back. A free-form merge-field editor would require schema changes AND a new FieldType; deferred to a follow-up cross-provider slice if real workflows demand it (§8).

### 5.3 Field-name discipline (CRITICAL)

Every meta MUST use the EXACT runtime field name from its specific action's schema. The §2.1 inconsistency means:

- `add_subscriber.audience_id` (snake_case) — meta uses `name: "audience_id"`.
- `unsubscribe_subscriber.listId` (camelCase) — meta uses `name: "listId"`.
- The `mailchimp:audiences` resolver doesn't care which field name consumes it; the meta-side wiring carries the convention.

Each meta describe-block test will pin the exact field-name set to catch a future refactor that accidentally normalizes one but not the other.

---

## 6. Output metadata strategy

Per the user clarification — **ChainReact's scope is sensitive-data protection in outputs, NOT Mailchimp deliverability/compliance**.

### 6.1 Sensitive output classification

**Mark sensitive (`sensitive: true`) where outputs surface:**

- **Direct PII**: `email`, `emailAddress`, `subscriberEmail`, `subscriberId`, `subscriberHash`, `mergeFields` (carries FNAME/LNAME/PHONE/ADDRESS), `tags` per-entry (tags can encode targeting attributes about customers).
- **Audience identity**: `name` on `create_audience` / `new_audience` / `segment_updated` outputs (audience + segment names often encode customer-targeting intent — business-sensitive).
- **Campaign content**: `title`, `subjectLine`, `fromName`, `replyTo`, `previewText` on `get_campaign.settings` / `campaign_created` / `email_opened` / `link_clicked` payloads. `replyTo` is an employee email; the rest are customer-facing copy.
- **Campaign archive URLs**: `archiveUrl`, `longArchiveUrl` on `get_campaign` — Mailchimp-public URLs but they expose the full campaign body.
- **Member collections**: `subscribers[]` (whole array — every entry carries PII) on `get_subscribers`. Marked sensitive at the array level; no nested `fields[]` declaration (follows HubSpot precedent for broad-object outputs).
- **Note bodies**: `note` on `add_note` (free-text per-subscriber annotation).
- **Webhook raw payload**: `parsed` (form-decoded body including merge fields) on `audience_event` trigger.
- **Per-recipient click URL**: `url` on `link_clicked` (may carry tracking tokens encoding the recipient).
- **Per-campaign report aggregates**: `opens`, `clicks`, `bounces`, `forwards`, `industryStats` on `get_campaign_stats` — no per-recipient data, but marketing teams treat campaign performance as confidential. Conservative bias per the brief: mark sensitive.
- **Segment metadata**: `name` on `create_segment` / `segment_updated`.

**Stay non-sensitive (structural):**

- Opaque numeric/string IDs alone: `audienceId`, `listId`, `campaignId`, `webId`, `segmentId`, `noteId`, `urlId`, `subscriptionId`.
- Timestamps: `createdAt`, `dateCreated`, `lastChanged`, `addedAt`, `removedAt`, `deletedAt`, `sendTime`, `createTime`, `occurredAt`, `firedAt`, `timestamp`, `timestampSignup`, `openTime`, `updatedAt`, `capturedAt`.
- Counts: `count`, `totalItems`, `memberCount`, `emailsSent`, `recipientCount`, `opensCount`, `clicks`, `abuseReports`, `unsubscribed` (on `get_campaign_stats`).
- Pagination cursors: `nextOffset`.
- Status enums: `status`, `type`, `mode`, `contentType`, `emailType`, `vip` (boolean).
- Action-result booleans: `success`, `permanent`, `unsubscribed` (on `unsubscribe_subscriber`).
- Activation-state reports if surfaced (parity with HubSpot `associationsAttached` / `associationWarnings` — none on the Mailchimp surface).

### 6.2 SUSPICIOUS_NAMES drift check

The structural sensitive-output-coverage test (defined in [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts)) gates on a SUSPICIOUS_NAMES set. Mailchimp output fields that match the set:

- `email` (on `add_subscriber`, `update_subscriber`, `get_subscriber`, `remove_tag`, `add_tag`, `add_note`, `email_opened`, `link_clicked`) — **must carry `sensitive: true`**. Load-bearing.
- `from` (on `email_opened` / `link_clicked` payload? — NO, Mailchimp doesn't surface a `from` field; only `fromName`. Safe.)
- `body` (no Mailchimp output uses this name).
- `to` (no Mailchimp output uses this name).
- `users` / `messages` / `customer` / `payments` / `subscription` (none).
- `content` (no — `contentType` is fine; `note` is not in SUSPICIOUS_NAMES).
- `text` / `message` (none).
- `results` (no Mailchimp output uses this name — `subscribers`, `tags`, etc. are explicit).

Only `email` matches. Every `email` output below the schema check must carry `sensitive: true`. Zero allowlist additions expected — no Mailchimp output is a false positive.

### 6.3 No secret-shaped outputs

No `token` / `accessToken` / `refreshToken` / `clientSecret` / `secret` / `apiKey` / `webhookSecret` output anywhere on the Mailchimp surface. The cross-action structural test guards against any regression.

### 6.4 No FileRef surface

No Mailchimp action / trigger declares `producesFileRef` or `consumesFileRef`. Campaign archive URLs are Mailchimp-public URLs, not workflow-consumable FileRefs.

### 6.5 Provider route serialization

`GET /api/providers/mailchimp/actions` and `GET /api/providers/mailchimp/triggers` must serialize `riskLevel`, `isDestructive`, `requiresConfirmation`, `riskDescription`, and per-output `sensitive` flags exactly as for HubSpot / Google Sheets. Tests will pin one representative meta per category (write, read, destructive, consent-changing, polling trigger, webhook trigger).

---

## 7. Risk metadata strategy

Per the user clarification: classify on **what ChainReact can trigger through the API**, NOT on Mailchimp deliverability/compliance.

### 7.1 Risk classification matrix

| Action | `riskLevel` | `isDestructive` | `requiresConfirmation` | Why |
| --- | --- | --- | --- | --- |
| `add_subscriber` | medium | false | false | Adds a subscriber row. Recoverable via `update_subscriber` / `remove_subscriber`. Mailchimp enforces consent via the schema's required `status` field — no extra ChainReact gate needed beyond Q11 (already in schema). |
| `update_subscriber` | medium | false | false | Mutates subscriber fields; reversible by writing prior values back. |
| `remove_subscriber` | **high** | **true** | **true** | The `delete_permanent` mode is irreversible AND blocks future re-subscribe of the same email. Even `archive` mode removes the member from the audience. The destructive trio gates the confirmation modal in front of the operation regardless of mode (the schema gates the mode choice; the meta gates the action itself). |
| `unsubscribe_subscriber` | **high** | false | **true** | Materially changes a customer's marketing consent (subscribed → unsubscribed). Per user-clarified rule: consent-changing actions warrant confirmation. NOT `isDestructive` — the record is preserved. (`requiresConfirmation: true` with `riskLevel: "high"` and `isDestructive: false` is valid per `actionMeta.ts` superRefine — confirmation only requires `riskLevel: "high"`.) |
| `add_tag` | medium | false | false | Recoverable tag edit. |
| `remove_tag` | medium | false | false | Recoverable; removing a tag the subscriber doesn't have is a no-op. |
| `get_subscriber` | low | false | false | Pure read. |
| `get_subscribers` | low | false | false | Pure read. |
| `create_segment` | medium | false | false | Creates a segment; reversible by deletion. |
| `create_audience` | medium | false | false | Creates a new audience; reversible by archiving. No customer messaging. |
| `create_custom_event` | medium | false | false | Writes a custom-event row. May cascade into a Customer Journey send if the workflow is wired in Mailchimp — but that send is Mailchimp's responsibility (workflow author has configured the journey in Mailchimp's UI to do so). ChainReact's blast radius is bounded to "wrote one event row". |
| `add_note` | low | false | false | Internal CRM annotation; not customer-visible. |
| `get_campaign` | low | false | false | Pure read. |
| `get_campaign_stats` | low | false | false | Pure read. |

### 7.2 Risk classification rationale

- **Single high+destructive+confirm action**: `remove_subscriber`. Mirrors HubSpot's `remove_line_item` as the sole destructive surface in the arc.
- **Single high+confirm-only action**: `unsubscribe_subscriber`. New shape for ChainReact metadata (`requiresConfirmation: true` + `isDestructive: false` + `riskLevel: "high"`). The `actionMeta.ts` superRefine allows this (requires only `riskLevel: "high"` for `requiresConfirmation`). The destructive-confirmation modal will surface; the audit log will record a high-risk event. Validates the model — consent-changing without record destruction is a real category that deserves the gate.
- **No send-campaign action ships in this arc** — the 14 shipped handlers do NOT include `create_campaign` / `update_campaign` / `send_campaign`. If a future slice adds them, send actions will warrant `high + requiresConfirmation` (and likely `isDestructive: true` — sending an email to a list is hard-to-reverse customer impact even when the campaign draft is recoverable).
- **No archive/delete-campaign action ships** — same as above. If added in a future slice, classify as `high + isDestructive + requiresConfirmation`.
- **`create_custom_event` stays medium** — even though it MIGHT cascade into a Mailchimp Customer Journey send, that send is configured server-side in Mailchimp. ChainReact is not "the thing that decided to send the email"; ChainReact wrote a row that a customer-configured rule responded to. Marking `create_custom_event` as `high` would over-flag every event-tracking workflow (the typical use case: log a "page_viewed" event with no journey wired to it).

### 7.3 Trigger risk

Triggers don't carry the risk metadata fields (the `TriggerMeta` schema in `contracts/triggerMeta.ts` doesn't include `riskLevel` / `isDestructive` / `requiresConfirmation`). Sensitivity is the only relevant metadata on the trigger side, covered in §6.

---

## 8. Security constraints inherited from post-security work

The Mailchimp arc inherits every guard the post-SEC slices established:

- **`riskLevel` required on every action meta** — `actionMeta.ts` Zod contract enforces.
- **Sensitive output flags drive run-detail redaction + variable-picker warning chip** — implemented in `toWorkflowRunDetail` + `VariablePickerPopover`.
- **`requiresConfirmation: true` triggers the destructive-confirmation modal at activation / Run-now time** — covered by [`tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx`](../../../tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx). The arc reuses this; no Mailchimp-specific modal test needed.
- **testMode blocks all Mailchimp actions** — every Mailchimp action declares `requiresIntegration: true`; the v2 engine-level pre-call gate in `nodeExecutionService.ts` refuses to dispatch external-action handlers when `context.testMode && actionMode !== EXECUTE_ALL`. Cross-provider gate; no Mailchimp-specific handler guard needed.
- **High-risk lifecycle audit events emit automatically** for `requiresConfirmation: true` actions — works for `remove_subscriber` AND `unsubscribe_subscriber`.
- **Provider routes serialize risk + sensitive fields** — the registry serializer already handles every contract field. No route changes needed for Mailchimp; the arc just inherits.
- **Structural `sensitive-output-coverage` test stays green** — Mailchimp adds `email` SUSPICIOUS_NAMES matches that MUST carry `sensitive: true`. Zero allowlist additions needed.
- **Structural `discovery-meta-coverage` test stays green** through the arc (Mailchimp stays UNCOVERED until the final slice flips `mailchimp` into `COVERED_PROVIDERS`).
- **Structural `trigger-meta-activation-invariant` test stays green** — all 7 Mailchimp trigger handlers already register activation hooks. No `SHARED_INFRA_EXEMPT_KEYS` entries needed for Mailchimp.
- **No secret-shaped outputs** — already structurally enforced.

---

## 9. Implementation grouping

Recommended 4-slice arc + an outcomes doc:

### MAILCHIMP-2 — Resolvers (resolver-first)

**Files added:**
- `integrations/mailchimp/options/audiences.ts` — `mailchimp:audiences` resolver.
- `integrations/mailchimp/options/campaigns.ts` — `mailchimp:campaigns` resolver.
- `integrations/mailchimp/options/segments.ts` — `mailchimp:segments` resolver (`dependsOn: ["listId"]`).
- `services/options/_registry.ts` — register all 3.
- Unit tests for each resolver (3 files) under `tests/unit/integrations/mailchimp/options/`.
- One integration cascade test (`mailchimp-options-cascade.test.tsx`) exercising `listId → segmentId` against synthetic fields — mirrors `hubspot-options-cascade.test.tsx`.

**No meta files. No COVERED_PROVIDERS change.** Mailchimp stays out — the structural test allows uncovered handlers without metas.

### MAILCHIMP-3 — Subscriber + audience + tag + event + note action metas (10 metas)

The full subscriber/audience surface. Includes the destructive + consent-changing surfaces.

**Files added:**
- `integrations/mailchimp/actions/<each>.meta.ts` — 10 files: `addSubscriber`, `updateSubscriber`, `removeSubscriber`, `unsubscribeSubscriber`, `addTag`, `removeTag`, `getSubscriber`, `getSubscribers`, `createSegment`, `createAudience`, `createCustomEvent`, `addNote`. (Actually 12 — recounted. Adjusting: this slice ships **12 metas**, deferring the 2 campaign-read metas to MAILCHIMP-4.)
- `services/discovery/_registry.ts` — register the 12.
- Registry + provider-route tests for the 12-action surface.
- Integration tests (3):
  - `mailchimp-add-subscriber-config` — exercises `mailchimp:audiences` resolver + Q11 `status` select with no default + tag CSV input.
  - `mailchimp-remove-subscriber-config` — pins the destructive trio + `mode` Q11 enum.
  - `mailchimp-unsubscribe-subscriber-config` — pins the high+confirm-only shape (validates the new `actionMeta.ts` flag combo end-to-end through the route + persistence).

**Mailchimp stays out of COVERED_PROVIDERS** — 2 actions + 7 triggers pending.

### MAILCHIMP-4 — Campaign read metas + all 7 trigger metas + COVERED_PROVIDERS flip

Closes Mailchimp at 14 actions + 7 triggers.

**Files added:**
- `integrations/mailchimp/actions/getCampaign.meta.ts`, `integrations/mailchimp/actions/getCampaignStats.meta.ts`.
- `integrations/mailchimp/triggers/<each>/<name>.meta.ts` — 7 trigger metas (mirroring HubSpot trigger meta path convention).
- `services/discovery/_registry.ts` — register the 9.
- `tests/structure/discovery-meta-coverage.test.ts` — add `mailchimp` to `COVERED_PROVIDERS`.
- Registry surface tests for the 14-action + 7-trigger full surface; expectation flips to "26 -> mailchimp pinned set" with risk matrix coverage including the high+confirm-only `unsubscribe_subscriber`.
- Provider-route tests for `/api/providers/mailchimp/{actions,triggers}` — full 14 + 7.
- Integration tests (2):
  - `mailchimp-get-campaign-config` — exercises `mailchimp:campaigns` resolver.
  - `mailchimp-audience-event-trigger-config` — exercises the consolidated webhook trigger's `audienceId` (combobox) + `eventTypes` (string-array against the 6-value allowlist).

**Mailchimp flips into COVERED_PROVIDERS in this slice.** 1:1 handler↔meta enforced from here on.

### MAILCHIMP-5 — Outcomes doc + global coverage refresh

Doc-only checkpoint, mirroring `hubspot-metadata-outcomes.md`. Updates the global covered/uncovered counts.

### Why not split MAILCHIMP-3 finer?

12 metas in one slice is at the high end. The Slack arc shipped batches of 8/5/12/4 across 3.35→3.38; HubSpot shipped 6/7/13/1 across HUBSPOT-3→6. Mailchimp's MAILCHIMP-3 is comparable to HUBSPOT-5's 13-meta batch — manageable because every meta shares the same `mailchimp:audiences` resolver consumption shape. **Open for Marcus to split into MAILCHIMP-3a (8 metas: subscriber + tag + audience + note) + MAILCHIMP-3b (4 metas: segment + custom-event + the two read-list metas)** if the diff size warrants — see §11.

### Why not include triggers in MAILCHIMP-3?

Triggers can't ship before all action metas are done if we want a single COVERED_PROVIDERS flip. Including them in MAILCHIMP-4 keeps the flip atomic: actions complete in -3, triggers complete in -4 with the flip. Mirrors the HubSpot HUBSPOT-5/6 split.

---

## 10. Integration tests plan

Minimum 6 integration tests across the arc (one per UX shape, not one per meta):

| Slice | Test | What it pins |
| --- | --- | --- |
| MAILCHIMP-2 | `mailchimp-options-cascade.test.tsx` | listId → segmentId cascade (happy-path, gated-when-empty, change-clears-dependent). |
| MAILCHIMP-3 | `mailchimp-add-subscriber-config.test.tsx` | Exact field set; `mailchimp:audiences` resolver consumption; Q11 `status` select with NO defaultValue; tag CSV text field (not chip-input — schema is `z.string()`); sensitive outputs (`email`, `subscriberId`). |
| MAILCHIMP-3 | `mailchimp-remove-subscriber-config.test.tsx` | Sole destructive Mailchimp action — meta destructive trio pin; `mode` Q11 enum with NO defaultValue; persists exact runtime field names (`audience_id` snake_case); narrow outputs neither sensitive except `email`. |
| MAILCHIMP-3 | `mailchimp-unsubscribe-subscriber-config.test.tsx` | New high+confirm-only shape — `requiresConfirmation: true` + `isDestructive: false` + `riskLevel: "high"`; persists exact runtime field names (`listId` camelCase — NOT `audience_id`). Defensive guard that the snake_case names don't leak. |
| MAILCHIMP-4 | `mailchimp-get-campaign-config.test.tsx` | `mailchimp:campaigns` resolver consumption; sensitive campaign settings (subjectLine, fromName, replyTo). |
| MAILCHIMP-4 | `mailchimp-audience-event-trigger-config.test.tsx` | Webhook trigger config — `audienceId` combobox via `mailchimp:audiences`; `eventTypes` string-array against the 6-value allowlist; payload sensitivity pins on `parsed` + `email`; server-managed activation state (`webhookId`, `webhookUrl`, `webhookEnabled`, `adopted`) does NOT leak onto the persisted node config. |

Resolver unit tests (3) + meta-shape guards inside each meta-config integration test cover the field-name discipline (§5.3).

**No per-action integration test** — the 6 above cover every distinct UX shape (cascade, write+Q11, destructive, consent-confirm, read+resolver, webhook trigger). Per-meta surface tests live inside the registry test (one describe block per action, parity with HubSpot's `_registry.test.ts` structure).

---

## 11. Open decisions for Marcus

### Settled by the brief / inventory

- **Resolver-first?** YES. 11/14 actions consume `mailchimp:audiences`; the playbook is proven (Google Sheets + HubSpot).
- **Include triggers in same arc?** YES. The activation invariant is already satisfied (all 7 register hooks); deferring triggers would split the COVERED_PROVIDERS flip and leave the arc half-done.
- **Field-name normalization?** NO — out of scope for the metadata arc. Each meta mirrors its action's specific convention; a future runtime/schema slice can normalize if desired.
- **Send-campaign / archive-campaign / template metas?** NOT IN SCOPE — those handlers aren't registered. Future-slice work.
- **`create_custom_event` risk?** Medium (not high). It writes one event row; the cascade-to-send is Mailchimp's responsibility.
- **`unsubscribe_subscriber` risk?** **high + requiresConfirmation + NOT isDestructive.** New flag combo for ChainReact metadata — valid per `actionMeta.ts` superRefine; consent-changing without record destruction is its own category.

### Need Marcus's call

| # | Decision | Recommendation |
| --- | --- | --- |
| D-MC1 | Split MAILCHIMP-3 into two sub-slices (8 metas + 4 metas) for review-diff size, OR ship as one 12-meta slice? | Ship as one. The 12 metas all share the `mailchimp:audiences` resolver consumption pattern; reviewer cognitive load is bounded by one shape. Splitting adds 1 commit + 1 test file rework + no real review-clarity benefit. |
| D-MC2 | Is the high+confirm-only shape for `unsubscribe_subscriber` acceptable, or should it carry `isDestructive: true` as well to keep "high-risk = always destructive" simpler? | **High + confirm + NOT destructive** is correct. The record is preserved; "destructive" should mean "data is hard to recover", not "customer impact is hard to undo". Splitting these axes is a feature of the contract. Pinned by an integration test so a future contract tightening doesn't silently change behavior. |
| D-MC3 | `add_subscriber.tags` is CSV string (schema is `z.string()`) — meta uses `text` with description callout, or do we flip the schema to `string[]` in this arc? | **Stay text in v1.** Schema flip is a separate runtime change with workflow-migration implications. Meta description carries the "comma-separated" callout. Tracked as a follow-up. |
| D-MC4 | Should `mailchimp:audiences` surface the audience's `member_count` / `permission_reminder` in the option description (like `hubspot:lists` surfaces `processingType`)? | **YES, surface `member_count`** in the option description (e.g. "Audience Name — 1,250 subscribers"). Helps workflow authors pick the right audience. Skip `permission_reminder` (too long; per-portal). Tracked as a §4.1 implementation detail. |
| D-MC5 | Should the `audience_event` trigger's `eventTypes` field render as a multi-select combobox (chip input from the 6-value allowlist) or as a `string-array`? | **`string-array`** in v1 — Slice 3.13 chip input. A multi-select combobox would need a new FieldType (`select`/`combobox` + `multiple: true`) — not in scope for this arc. Description carries the allowlist + an example. Future polish slice can flip to multi-select combobox without breaking the schema. |
| D-MC6 | Pause Mailchimp and do Microsoft Excel or Notion-databases first if complexity is too high? | **Proceed with Mailchimp.** Complexity is bounded (3 resolvers, 14 metas, 7 triggers, 1 destructive, 1 consent-confirm) and every UX shape is already proven on HubSpot. Mailchimp also has the largest leverage (largest uncovered handler count). Excel and Notion-databases remain good follow-ups (see §12). |

---

## 12. Proposed next slice

**Default recommendation: MAILCHIMP-2 — Resolvers.**

Ship the 3 resolvers (`mailchimp:audiences`, `mailchimp:campaigns`, `mailchimp:segments`) + the cascade integration test BEFORE any meta. This:

1. Lets the Mailchimp-2 commit stand alone (small, reviewable, no metadata churn).
2. Pins the `mailchimp:segments` `dependsOn: "listId"` choice via a real test before any meta consumes it.
3. Matches the HubSpot HUBSPOT-2 cadence (resolvers in their own slice, integrated against synthetic fields).
4. The Mailchimp DC-routing + non-refreshable-401 + error-sanitization concerns get pinned in resolver unit tests where they're easiest to test, before they get amplified across 12 meta consumers.

If Marcus prefers a smaller-context-cost slice before Mailchimp, the two viable detours are:

- **Microsoft Excel planning slice** (`excel-metadata-plan.md`) — 10 handlers, structurally near-identical to Google Sheets. Most decisions port directly from the GSHEETS arc.
- **Notion `notion:databases` resolver slice** — Notion shipped at 16/16 metas with zero resolvers; every Notion id field is plain text. Adding `notion:databases` (and follow-ups `notion:pages` / `notion:users`) polishes existing surfaces without expanding coverage.

Neither blocks Mailchimp. The Mailchimp arc can land on top of either, in either order.

---

## 13. Push / PR readiness reminder

**Do not push yet.** Standing reminders carried from the HubSpot arc:

- **Dirty parallel-work files** in the working tree must be triaged before a clean push:
  - `app/page.tsx` (modified, unrelated)
  - `docs/rules/database-security.md` (modified, unrelated)
  - `features/workflows/WorkflowsList.tsx` (modified, unrelated)
  - `PACKAGES.md` (untracked)
  - `scripts/list-users.mjs` (untracked)
  - `scripts/reset-user-password.mjs` (untracked, pre-existing lint warning)
- **Branch strategy** must be confirmed. The arc would ship on `v2-provider-port-local` (already 7 local commits ahead of upstream after HUBSPOT-7).
- **Final gates** must run on each slice's push commit: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`.
- **PR body must include** (when the arc is push-ready):
  - Mailchimp provider coverage — 14 actions + 7 triggers + `mailchimp` added to `COVERED_PROVIDERS`.
  - Security controls — `remove_subscriber` is high+destructive+confirm; `unsubscribe_subscriber` is high+confirm-only (new shape). Sensitive flags on every PII/campaign-content output.
  - **No migrations** (no new tables; no schema changes).
  - **No new OAuth scopes** (Mailchimp doesn't enforce scopes — `account_access` placeholder remains).
  - **No reconnect required** for existing Mailchimp users.
  - Deferred risks — tags-as-combobox is `string-array` in v1 (§4.2); multi-select combobox for `eventTypes` is `string-array` in v1 (D-MC5); merge-field editor deferred (§4.2); send-campaign / archive-campaign metas not in scope (no handlers shipped).
  - Stripe rollout posture — unchanged.
  - Rollback notes — single-revert safe at any slice boundary. Reverting the COVERED_PROVIDERS flip alone (MAILCHIMP-4) degrades to "partial coverage, not enforced"; reverting MAILCHIMP-3 additionally drops 12 metas; reverting MAILCHIMP-2 additionally drops the 3 resolvers. No DB or scope state to revert at any layer.
