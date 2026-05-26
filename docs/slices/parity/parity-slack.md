# Parity audit — Slack

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/slack/`](../../integrations/slack/) (slice 1)
**Phase 1 surface shipped:** 1 action (`send_channel_message`), 1 webhook trigger entry (catch-all `event_callback` → canonical TriggerEvent)
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md). Audit follows the 14-section template defined there.

**Recommendation up front.** V1 ships **34 actions** (+1 dead orphan handler) and **10 trigger schemas**; V2 ships **1 action** and **1 generic webhook entry** (no per-trigger filter logic). Audit recommends **31 actions PORT, 2 actions DEFER (user-token-required), 1 action SKIP (V1 dead orphan), 9 triggers PORT, 1 trigger NEEDS PRODUCT DECISION** (`userJoinedWorkspace` requires `users:read` scope expansion + workspace-scope handling). Three required platform gaps surface during port (P-S1 user-token storage; P-S2 per-trigger dispatcher filters; P-S3 file output contract). Recommended split: **3 parity slices** (messaging+reactions / channels+users / files+advanced) totaling ~14–17 commits across the slices. Slack is the single largest gap among Phase 1 providers and the highest-leverage parity port.

---

## 1. V1 source paths audited

### Manifest / node definitions

- [`lib/workflows/nodes/providers/slack/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/slack/index.ts) (374 lines) — 34 action exports + 10 trigger exports in `slackNodes` array.
- [`lib/workflows/nodes/providers/slack/actions/*.schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/slack/actions/) — 35 schema files (one per action; `findUser.schema.ts` exists but is NOT imported into the manifest — orphan).
- [`lib/workflows/nodes/providers/slack/triggers/*.schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/slack/triggers/) — 10 schema files (one per trigger).

### Action handlers

- [`lib/workflows/actions/slack/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/slack/) — 38 files: 35 per-action handler files + `index.ts` re-export barrel + `schema.ts` (legacy) + `utils.ts` (token resolver). Already V2-shape per-handler split.
- [`lib/workflows/actions/slack.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/slack.ts) (417 lines) — back-compat re-export barrel pointing to `./slack/*` files. Not a true monolith despite line count.
- Spot-check sizes: `sendMessage.ts` (100+ lines, attachment + Block Kit logic), `postInteractiveBlocks.ts` (54 lines), `uploadFile.ts` (114 lines), `scheduleMessage.ts` (74 lines), `setUserPresence.ts` (41 lines).

### OAuth + lifecycle

- [`lib/integrations/slack.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/slack.ts) (250 lines) — `slackConfig`, `getSlackOAuthClient` (returns auth URL builder + token exchange + refresh + revoke), `getSlackUserInfo`, `testSlackConnection`, `getSlackChannels`, `sendSlackMessage` (function), `SlackService` class (duplicates `sendSlackMessage`), `updateSlackProviderPlan` (workspace-plan tracking).
- [`app/api/integrations/[id]/callback/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/[id]/callback/route.ts) — generic dynamic-route callback (no per-Slack callback file).
- [`app/api/integrations/auth/generate-url/route.ts:318`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L318) — Slack scope string (20-scope mega-list).
- No per-workflow trigger lifecycle for Slack. Slack uses workspace-scoped Events API delivery; activation is implicit at OAuth time.

### Webhook receiver + verification + normalization

- [`app/api/webhooks/[provider]/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/[provider]/route.ts) — generic receiver. Slack-specific code: line 61 (`url_verification` POST handshake), line 102 (Slack INFO log), line 212 (GET-challenge handler). Calls `normalizeWebhookEvent('slack', ...)` then `processWebhookEvent`.
- [`lib/webhooks/normalizer.ts:12-202`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/normalizer.ts#L12) — Slack normalizer. Emits 11 distinct canonical eventType strings (`slack_trigger_message_deleted`, `slack_trigger_reaction_added`, `slack_trigger_reaction_removed`, `slack_trigger_channel_created`, `slack_trigger_member_joined_channel`, `slack_trigger_member_left_channel`, `slack_trigger_file_uploaded`, `slack_trigger_user_joined_workspace`, `slack_trigger_message_channels`, `slack_trigger_message_im`, `slack_trigger_message_mpim`).
- [`lib/webhooks/verification.ts:22-33, 80-107`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/verification.ts#L22) — real HMAC SHA256 + 5-min skew + timing-safe compare. **But:** lines 19 (`if (!secret) return true`) and 28 (`if (!signature || !timestamp) return true`) silently bypass verification when env or headers are absent. R8 violation.

### Scope definitions (R3 — divergent)

V1 has Slack scope lists in **5+ different files** with no overlap of values:

| File | Scopes |
|---|---|
| [`services/integration-service.ts:498`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/services/integration-service.ts#L498) | 2 (`channels:read`, `chat:write`) |
| [`lib/integrations/scope-validator.ts:91-98`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/scope-validator.ts#L91) | 3 (split required/optional) |
| [`lib/integrations/availableIntegrations.ts:170`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/availableIntegrations.ts#L170) | 5 |
| [`lib/integrations/integrationScopes.ts:6`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/integrationScopes.ts#L6) | 12 (required only) |
| [`app/api/integrations/auth/generate-url/route.ts:318`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L318) | 20 (mega-list — bot + extras) |
| [`docs/SLACK_INTEGRATION_SETUP.md:54`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/docs/SLACK_INTEGRATION_SETUP.md#L54) | 11 (doc-only) |

These are not consistent subsets of one another. V2 must consolidate to a single source-of-truth scope list per the manifest pattern.

### Tests

- **No Slack-dedicated unit tests** in V1's `__tests__/`. Grep on `slack` returns 15 matches — all are cross-provider tests (parity, webhook execute, error notifications, etc.). Slack appears as one provider among many; no `__tests__/integrations/slack/` directory.
- **Test density signal:** very low (proxy from §4 of master plan).

### Walkthroughs / docs density (proxy signal)

- [`learning/walkthroughs/slack-oauth-fix.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/walkthroughs/slack-oauth-fix.md) — single OAuth bug walkthrough.
- [`docs/SLACK_INTEGRATION_SETUP.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/docs/SLACK_INTEGRATION_SETUP.md) — setup guide.
- **Doc density signal:** medium-low. Slack was set up once, hit one OAuth bug, no further documented churn.

---

## 2. V1 actions inventory

Source: `slackNodes` export array in [`lib/workflows/nodes/providers/slack/index.ts:275-323`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/slack/index.ts#L275). Numbered in array order.

| # | Action | Status | Notes |
|---|---|---|---|
| 1 | `sendMessage` (`send_channel_message`) | live | bot + user-token (`sendAsUser`) variants; Block Kit; attachments via Supabase round-trip; rich-text formatter |
| 2 | `sendDirectMessage` | live | DM channel resolve via `conversations.open` |
| 3 | `createChannel` | live | public/private; topic/purpose set inline |
| 4 | `getMessages` | live | `conversations.history` |
| 5 | `postInteractiveBlocks` | live | Block Kit only; 54-line handler |
| 6 | `getUserInfo` | live | `users.info` |
| 7 | `updateMessage` | live | `chat.update` |
| 8 | `deleteMessage` | live | `chat.delete` |
| 9 | `getThreadMessages` | live | `conversations.replies` |
| 10 | `addReminder` | live | **Slack reminders API deprecated late 2024** — verify availability |
| 11 | `addReaction` | live | `reactions.add` |
| 12 | `removeReaction` | live | `reactions.remove` |
| 13 | `setChannelTopic` | live | `conversations.setTopic` |
| 14 | `setChannelPurpose` | live | `conversations.setPurpose` |
| 15 | `pinMessage` | live | `pins.add` |
| 16 | `unpinMessage` | live | `pins.remove` |
| 17 | `uploadFile` | live | `files.uploadV2` (Slack legacy `files.upload` retired Mar 2025); 114 lines incl. Supabase storage round-trip |
| 18 | `inviteUsersToChannel` | live | `conversations.invite` |
| 19 | `archiveChannel` | live | `conversations.archive` |
| 20 | `unarchiveChannel` | live | `conversations.unarchive` |
| 21 | `removeUserFromChannel` | live | `conversations.kick` |
| 22 | `leaveChannel` | live | `conversations.leave` |
| 23 | `joinChannel` | live | `conversations.join` |
| 24 | `renameChannel` | live | `conversations.rename` |
| 25 | `getChannelInfo` | live | `conversations.info` |
| 26 | `updateUserStatus` | live | **requires user token (xoxp)** — `users.profile.set` |
| 27 | `setUserPresence` | live | **requires user token (xoxp)** — `users.setPresence`; 41-line handler |
| 28 | `listChannels` | live | `conversations.list` |
| 29 | `listUsers` | live | `users.list` |
| 30 | `scheduleMessage` | live | `chat.scheduleMessage`; 74-line handler |
| 31 | `cancelScheduledMessage` | live | `chat.deleteScheduledMessage` |
| 32 | `listScheduledMessages` | live | `chat.scheduledMessages.list` |
| 33 | `downloadFile` | live | fetches private file via auth header |
| 34 | `getFileInfo` | live | `files.info` |
| — | `findUser` | **dead-code orphan** | Schema, handler, fieldMapping all exist; **NOT in `slackNodes` export array**. R5. |

**Total V1 actions:** 34 live + 1 orphan.

---

## 3. V1 triggers inventory

Source: `slackNodes` export array (trigger section) in [`lib/workflows/nodes/providers/slack/index.ts:312-322`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/slack/index.ts#L312). Trigger model is **workspace-wide Events API** (single webhook URL per Slack app; no per-workflow lifecycle). Filtering happens in V1's normalizer + downstream dispatcher.

| # | Trigger | Slack `event.type` | Filter | Lifecycle |
|---|---|---|---|---|
| 1 | `newMessageChannel` | `message` | `channel_type=channel` | none (workspace-wide) |
| 2 | `newDirectMessage` | `message` | `channel_type=im` | none |
| 3 | `newGroupDirectMessage` | `message` | `channel_type=mpim` | none |
| 4 | `reactionAdded` | `reaction_added` | optional reaction filter | none |
| 5 | `reactionRemoved` | `reaction_removed` | optional reaction filter | none |
| 6 | `channelCreated` | `channel_created` | — | none |
| 7 | `memberJoinedChannel` | `member_joined_channel` | optional channel filter | none |
| 8 | `memberLeftChannel` | `member_left_channel` | optional channel filter | none |
| 9 | `fileUploaded` | `file_shared` (or `file_created`) | optional channel filter | none |
| 10 | `userJoinedWorkspace` | `team_join` | — | requires `users:read` scope |

**Total V1 triggers:** 10 schemas. Lifecycle is implicit (workspace-wide Events API delivery; activation = OAuth grant).

V1 also normalizes a `slack_trigger_message_deleted` from `message.subtype=message_deleted` ([normalizer.ts:21](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/normalizer.ts#L21)) but **no schema** for "message deleted" exists in `triggers/` — emitted but unused.

---

## 4. V2 current surface

Source: [`integrations/slack/`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/).

### Actions (1)

| # | V2 Action | File | Notes |
|---|---|---|---|
| 1 | `send_channel_message` | [`actions/sendChannelMessage.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/actions/sendChannelMessage.ts) | Bot-token only; minimal `chat.postMessage`; no Block Kit, no attachments, no thread, no rich text |

### Triggers (1 generic webhook entry)

- Manifest declares `webhookTrigger: true`. There is no per-trigger schema; V2 emits **one canonical TriggerEvent per Slack `event_callback`** with `eventType = payload.event.type` (e.g. `"message"`, `"channel_created"`, `"reaction_added"`). The downstream dispatcher would need per-workflow filters on this string + payload fields. **No per-trigger config schema exists in V2 yet** — the workflow builder has nothing to render for "Slack new message" vs. "Slack reaction added" today.

### OAuth + webhook + normalize

- [`oauth.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/oauth.ts) — clean `ProviderOAuth` impl. `refreshToken()` throws `RefreshNotSupportedError` (correct — Slack v2 default flow doesn't return refresh tokens). `revoke()` is a TODO (deferred to "Slice 1E" comment).
- [`webhooks/receive.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/webhooks/receive.ts) — strict HMAC SHA256, 300s replay window, timing-safe, throws on missing secret/headers (no R8 silent bypass).
- [`webhooks/normalize.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/webhooks/normalize.ts) — pure function; passes `event.type` through as canonical eventType. No filtering, no per-trigger shaping.

### Scopes (manifest)

```ts
required: ["channels:history", "channels:read", "chat:write"]
optional: ["users:read"]
```

Conservative bot-token-only baseline. Closes V1's R3 (no divergent scope lists in V2).

### Tests (9)

[`tests/unit/integrations/slack/`](c:/Users/marcu/source/repos/ChainReactV2/tests/unit/integrations/slack/) — manifest, oauth, oauth-callback, chatPostMessage, sendChannelMessage, webhooks/normalize, webhooks/receive + [`tests/unit/app/api/webhooks/slack-route.test.ts`](c:/Users/marcu/source/repos/ChainReactV2/tests/unit/app/api/webhooks/slack-route.test.ts) + [`tests/e2e/slice-1-slack-walkthrough.spec.ts`](c:/Users/marcu/source/repos/ChainReactV2/tests/e2e/slice-1-slack-walkthrough.spec.ts). Test density: **far higher than V1** despite smaller surface.

---

## 5. Missing actions

V2 ships 1 of V1's 34 live actions. Missing 33. Grouped by domain (port-batch boundaries):

### Messaging core (8)

1. `sendDirectMessage` — DM channel resolve via `conversations.open` then `chat.postMessage`.
2. `getMessages` — `conversations.history` paginated read.
3. `updateMessage` — `chat.update`.
4. `deleteMessage` — `chat.delete`.
5. `getThreadMessages` — `conversations.replies`.
6. `scheduleMessage` — `chat.scheduleMessage` (post at future timestamp).
7. `cancelScheduledMessage` — `chat.deleteScheduledMessage`.
8. `listScheduledMessages` — `chat.scheduledMessages.list`.

### Reactions / pins (4)

9. `addReaction` — `reactions.add`.
10. `removeReaction` — `reactions.remove`.
11. `pinMessage` — `pins.add`.
12. `unpinMessage` — `pins.remove`.

### Interactive (1)

13. `postInteractiveBlocks` — `chat.postMessage` with Block Kit `blocks` array. Distinct from `send_channel_message`'s `text`-only path.

### Channel CRUD (8)

14. `createChannel` — `conversations.create` (public/private).
15. `archiveChannel` — `conversations.archive`.
16. `unarchiveChannel` — `conversations.unarchive`.
17. `joinChannel` — `conversations.join`.
18. `leaveChannel` — `conversations.leave`.
19. `renameChannel` — `conversations.rename`.
20. `getChannelInfo` — `conversations.info`.
21. `listChannels` — `conversations.list`.

### Channel membership (2)

22. `inviteUsersToChannel` — `conversations.invite`.
23. `removeUserFromChannel` — `conversations.kick`.

### Channel metadata (2)

24. `setChannelTopic` — `conversations.setTopic`.
25. `setChannelPurpose` — `conversations.setPurpose`.

### Users (4)

26. `getUserInfo` — `users.info`.
27. `listUsers` — `users.list`.
28. `updateUserStatus` — `users.profile.set` (**requires user token xoxp**).
29. `setUserPresence` — `users.setPresence` (**requires user token xoxp**).

### Files (3)

30. `uploadFile` — `files.uploadV2`. V1 round-trips through Supabase storage; port should drop that and accept URL or buffer directly.
31. `downloadFile` — fetches private file via auth header; needs file-output contract (P-S3).
32. `getFileInfo` — `files.info`.

### Misc (1)

33. `addReminder` — Slack `reminders.add`. **API deprecation flag:** Slack signaled reminders API deprecation late 2024. Verify status before porting.

**Total missing actions:** 33 live + 1 orphan (`findUser` — see §7).

---

## 6. Missing triggers

V2's normalizer emits a canonical TriggerEvent for every Slack `event_callback`, but there are **no per-trigger schemas, no per-trigger filter logic, and no workflow-builder entries** for any specific Slack trigger type. Effectively all 10 V1 triggers are missing as workflow-buildable entries.

| # | V1 Trigger | Slack event | Per-trigger filter needed | Notes |
|---|---|---|---|---|
| 1 | `newMessageChannel` | `message` | `channel_type=channel` + optional channel id | Most-used Slack trigger |
| 2 | `newDirectMessage` | `message` | `channel_type=im` + optional user filter | DM-specific |
| 3 | `newGroupDirectMessage` | `message` | `channel_type=mpim` | mpim = multi-party DM |
| 4 | `reactionAdded` | `reaction_added` | optional reaction emoji filter | |
| 5 | `reactionRemoved` | `reaction_removed` | optional reaction emoji filter | |
| 6 | `channelCreated` | `channel_created` | — | |
| 7 | `memberJoinedChannel` | `member_joined_channel` | optional channel id filter | |
| 8 | `memberLeftChannel` | `member_left_channel` | optional channel id filter | |
| 9 | `fileUploaded` | `file_shared` (or `file_created`) | optional channel id filter | V1 normalizer uses `file.shared` shape; verify Slack event type at port time |
| 10 | `userJoinedWorkspace` | `team_join` | — | Requires `users:read` scope (V2 has it as optional — promote to required) |

**Plus dead-code emit** to clean up: V1's normalizer emits `slack_trigger_message_deleted` from `message.subtype=message_deleted` but no V1 trigger schema for it. Skip in V2.

---

## 7. Port / skip / defer table

Decisions per item from §5 + §6. Reasoning cites master-plan rot IDs (R1..R14) where applicable.

### Actions

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `sendDirectMessage` | action | **port** | Core messaging; bot token sufficient (DM channel via `conversations.open` then post). |
| `getMessages` | action | **port** | Common workflow input. |
| `updateMessage` | action | **port** | Core lifecycle. |
| `deleteMessage` | action | **port** | Core lifecycle. |
| `getThreadMessages` | action | **port** | Threading is core Slack pattern. |
| `scheduleMessage` | action | **port** | Slack-native; clean port. |
| `cancelScheduledMessage` | action | **port** | Pairs with above. |
| `listScheduledMessages` | action | **port** | Pairs with above. |
| `addReaction` | action | **port** | Bot token + `reactions:write`. |
| `removeReaction` | action | **port** | Bot token + `reactions:write`. |
| `pinMessage` | action | **port** | Bot token + `pins:write`. |
| `unpinMessage` | action | **port** | Bot token + `pins:write`. |
| `postInteractiveBlocks` | action | **port** | Block Kit; bot token; ports as separate action from `send_channel_message` to keep schemas honest (text-only vs blocks). |
| `createChannel` | action | **port** | Bot token; channel-management action. |
| `archiveChannel` | action | **port** | Bot token. |
| `unarchiveChannel` | action | **port** | Bot token. |
| `joinChannel` | action | **port** | Bot token + `channels:join`. |
| `leaveChannel` | action | **port** | Bot token. |
| `renameChannel` | action | **port** | Bot token. |
| `getChannelInfo` | action | **port** | Bot token; read-only. |
| `listChannels` | action | **port** | Bot token; read-only. |
| `inviteUsersToChannel` | action | **port** | Bot token; multi-recipient field — route through V2's `parseRecipients` per R14. |
| `removeUserFromChannel` | action | **port** | Bot token. |
| `setChannelTopic` | action | **port** | Bot token. |
| `setChannelPurpose` | action | **port** | Bot token. |
| `getUserInfo` | action | **port** | Bot token + `users:read`. |
| `listUsers` | action | **port** | Bot token + `users:read`. |
| `updateUserStatus` | action | **defer** | **Requires user token (xoxp)** — V2's manifest is bot-only today. Defer until P-S1 (user-token storage) ships. |
| `setUserPresence` | action | **defer** | **Requires user token (xoxp)**. Same as above. |
| `uploadFile` | action | **port — redesign** | Port the Slack `files.uploadV2` API call only; **drop the V1 Supabase storage round-trip** (R1-adjacent — heavy provider-coupled logic). Accept URL or buffer at the action boundary; no implicit storage hop. |
| `downloadFile` | action | **port** | Returns file content. Needs P-S3 (file output contract) — port lands when contract exists. Until then: ship behind a flag or as the consumer that drives P-S3. |
| `getFileInfo` | action | **port** | Bot token + `files:read`. |
| `addReminder` | action | **needs product decision** | Slack signaled `reminders.add` deprecation late 2024. **Verify API status at port time.** Skip if deprecated; defer if still available but uncertain. |
| `findUser` | orphan | **skip** | R5 — dead-code orphan in V1 (handler + schema + fieldMapping exist but not exported in `slackNodes`). V2 doesn't carry the orphan. If find-user behavior is needed, build it as a V2-native action with `users.lookupByEmail` (no V1 baggage to port). |

**Action totals: 30 PORT, 1 PORT–REDESIGN, 1 PORT (gated by P-S3), 2 DEFER, 1 NEEDS PRODUCT DECISION, 1 SKIP.**

### Triggers

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `newMessageChannel` | trigger | **port** | Most-used Slack trigger; needs P-S2 dispatcher filters. |
| `newDirectMessage` | trigger | **port** | DM filter on `channel_type=im`. |
| `newGroupDirectMessage` | trigger | **port** | mpim filter. |
| `reactionAdded` | trigger | **port** | Reaction filter optional. |
| `reactionRemoved` | trigger | **port** | Reaction filter optional. |
| `channelCreated` | trigger | **port** | No per-workflow filter required. |
| `memberJoinedChannel` | trigger | **port** | Channel filter optional. |
| `memberLeftChannel` | trigger | **port** | Channel filter optional. |
| `fileUploaded` | trigger | **port** | Verify Slack event name (`file_shared` vs `file_created`) at port time. |
| `userJoinedWorkspace` | trigger | **needs product decision** | Requires `users:read` to be promoted from optional → required scope. Decision: do all V2 Slack users get `users:read` always (slight scope creep, simpler), or do only workspaces that activate `userJoinedWorkspace` request the scope (cleaner but requires per-trigger scope logic V2 doesn't have)? |

**Trigger totals: 9 PORT, 1 NEEDS PRODUCT DECISION.**

### Summary counts (per master plan §1)

- **Port:** 30 actions + 9 triggers = **39**
- **Port — redesign:** 1 action (`uploadFile`)
- **Port — gated by platform gap:** 1 action (`downloadFile`, gated by P-S3)
- **Defer:** 2 actions (gated by P-S1)
- **Needs product decision:** 1 action (`addReminder`) + 1 trigger (`userJoinedWorkspace`)
- **Skip:** 1 orphan action (`findUser`)

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 catalog. Each row tagged with the master-plan rot ID where the pattern matches.

| ID | Finding | V1 location | V2 mitigation |
|---|---|---|---|
| **S-R1** (cites R5) | `findUser` is an orphan handler-graph: schema file, handler file, and fieldMapping entry exist but the manifest's `slackNodes` export array does NOT include it. Workflow builder never lists it. | `lib/workflows/actions/slack/findUser.ts` + `lib/workflows/nodes/providers/slack/actions/findUser.schema.ts` + `components/workflows/configuration/config/fieldMappings.ts:254` | V2 does not carry the orphan. If the action is wanted, ship as V2-native (`users.lookupByEmail`) without the V1 baggage. |
| **S-R2** (cites R3) | **Five+ divergent Slack scope lists** across V1 with no common subset. Production OAuth uses the 20-scope mega-list at `generate-url/route.ts:318` — most other registries are stale. | See §1 "Scope definitions" table | V2 manifest has one scope list (3 required + 1 optional). Port additions update the manifest only. |
| **S-R3** (cites R8) | Webhook signature verification silently returns `true` when `SLACK_SIGNING_SECRET` env is missing OR when `x-slack-signature`/`x-slack-request-timestamp` headers are absent. Comment says "Allow unsigned webhooks for development" — but the same code path runs in production. | `lib/webhooks/verification.ts:19,28` | V2 [`webhooks/receive.ts:50-58`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/webhooks/receive.ts#L50) **throws** on missing secret/headers (no silent bypass). No mitigation needed beyond not regressing. |
| **S-R4** (cites R2) | `lib/integrations/slack.ts` defines BOTH `sendSlackMessage(accessToken, channel, text)` (function, line 132) AND `SlackService.sendChannelMessage(...)` (class method, line 161) with overlapping behavior. Plus `SlackService.refreshToken` at line 198 is documented as a no-op. | `lib/integrations/slack.ts` lines 132, 150, 198 | V2 has one Slack API helper module (`api/chatPostMessage.ts`). Don't port the `SlackService` class. |
| **S-R5** (cites R10) | V1's `sendSlackMessage` (line 132) `throw new Error("Failed to send Slack message")` swallows the original Slack API error code. The `SlackService` variant (line 174) preserves the code — inconsistent ActionResult shape between the two paths. | `lib/integrations/slack.ts:144` vs `:174` | V2's [`SlackApiError`](c:/Users/marcu/source/repos/ChainReactV2/integrations/slack/api/chatPostMessage.ts#L42) preserves the Slack error code uniformly. |
| **S-R6** | V1's `sendMessage.ts` round-trips file attachments through Supabase storage (download from `workflow-files` → upload to `slack-attachments` public bucket → pass URL to Slack). Heavy, Supabase-coupled, and relies on a public bucket Slack can fetch. | `lib/workflows/actions/slack/sendMessage.ts:60-180` (approx) | V2 `uploadFile` port: drop the storage round-trip; accept URL or buffer at the action boundary. Document as the port-time design choice. |
| **S-R7** | V1's `updateSlackProviderPlan` writes a `provider_plan` column on the integrations table (workspace plan tracking — `free`/`pro`/`business+`). This is a V1-specific feature for plan-aware behavior; the column may not exist in V2's schema. | `lib/integrations/slack.ts:226-249` | Skip the port unless V2 has explicit demand for plan-aware behavior. Treat as a future feature, not parity. |
| **S-R8** | V1 normalizer at [normalizer.ts:21](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/normalizer.ts#L21) emits `slack_trigger_message_deleted` from `message.subtype=message_deleted` — but **no trigger schema** exists for it. Dead emit. | `lib/webhooks/normalizer.ts:21-26` | V2 should not emit canonical eventTypes that don't have corresponding trigger config schemas. |
| **S-R9** (cites R11) | V1's "trigger lifecycle" for Slack is **eager-bulk-by-OAuth** — every workspace that connects gets all 10 trigger types live. No per-workflow activation. | implicit pattern; no `lib/integrations/slack/lifecycle.ts` | This is actually correct for Slack's Events API model (one webhook URL per app). Don't redesign — document the workspace-wide model in V2 manifest comments and skip per-workflow lifecycle for Slack. The "lifecycle" is the Events API event subscription list at the Slack-app level, configured once per V2 deployment. |
| **S-R10** | V1's OAuth scope list at `generate-url/route.ts:318` includes `chat:write.public` — sends to channels the bot is NOT a member of. **Security/UX trade-off:** if V2 includes this, bots can spam any public channel; if it doesn't, every channel needs an invite first. | `app/api/integrations/auth/generate-url/route.ts:321` (comment line) | V2 should explicitly decide. Recommendation: include in optional scope set, document the trade-off, default to **not requesting**. |

---

## 9. V2 dependency map

Every ported action depends on (existing V2 contracts):

- [`contracts/integration.ts`](c:/Users/marcu/source/repos/ChainReactV2/contracts/integration.ts) — `ProviderManifest`, `ProviderOAuth`, `ActionResult`.
- [`contracts/triggerEvent.ts`](c:/Users/marcu/source/repos/ChainReactV2/contracts/triggerEvent.ts) — `TriggerEvent`, `TriggerEventSchema`.
- [`services/execution/handlers/types.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/execution/handlers/types.ts) — `ActionHandler` shape.
- [`repositories/integrations.ts`](c:/Users/marcu/source/repos/ChainReactV2/repositories/integrations.ts) — `getActiveForExecution(userId, provider, accountId)`.
- [`core/encryption/tokens.ts`](c:/Users/marcu/source/repos/ChainReactV2/core/encryption/tokens.ts) — `decryptToken`.
- [`core/integrations/parseRecipients.ts`](c:/Users/marcu/source/repos/ChainReactV2/core/integrations/parseRecipients.ts) — for `inviteUsersToChannel` (R14).

### Per-handler-batch additional dependencies

- **Messaging batch:** none beyond core.
- **Reactions/pins batch:** none beyond core.
- **Interactive (`postInteractiveBlocks`):** Slack Block Kit JSON shape — no V2 dependency, just schema validation.
- **Channel CRUD batch:** none beyond core.
- **Membership batch:** `parseRecipients` for multi-user invite.
- **Users batch:** none beyond core for read; **P-S1** (user-token storage) for `updateUserStatus` + `setUserPresence`.
- **Files batch:** **P-S3** (file output contract) for `downloadFile`; redesigned (no Supabase round-trip) `uploadFile`.

### Trigger dependencies

- All 10 triggers depend on **P-S2** (per-trigger dispatcher filter logic) for the workflow builder to render distinct trigger cards and the dispatcher to filter on per-workflow config.
- `userJoinedWorkspace` depends on `users:read` scope being elevated from optional → required (or per-trigger-scope-request logic V2 doesn't have).

---

## 10. Required platform gaps

Three gaps surfaced by this audit. Each is a separate slice candidate, NOT bundled into the parity port.

### P-S1 — User-token (xoxp) support

**What:** Slack distinguishes bot tokens (`xoxb-…`, sent as `Authorization: Bearer`) from user tokens (`xoxp-…`, also Bearer but acts on behalf of the authorizing user). V2's `ProviderOAuth` contract assumes **one access token per integration row**. To support `updateUserStatus` and `setUserPresence` (and the V1 `sendAsUser` flag if ported), V2 needs:

- A way to request both bot AND user tokens at OAuth time (Slack's `oauth.v2.access` returns both when `user_scope` is set).
- A way to store both encrypted tokens in the integrations row (current schema has one `access_token_encrypted` column).
- A way for handlers to select which token to use per-action.

**Options:**
- **(a)** Extend integrations schema with a separate `user_access_token_encrypted` column. Manifest declares per-action token type. Handler picks at execution time.
- **(b)** Store both tokens in a single JSONB column with named slots. More flexible, slightly less type-safe.
- **(c)** Skip user-token actions entirely. `updateUserStatus` and `setUserPresence` are deferred until product asks; fewer actions but no platform change.

**Slice:** Independent design slice. Not bundled into Slack parity.

### P-S2 — Per-trigger dispatcher filter logic

**What:** V2 emits one canonical TriggerEvent per Slack `event_callback`, with `eventType = payload.event.type`. The workflow builder needs to:

- Render distinct cards for each Slack trigger (`newMessageChannel`, `reactionAdded`, etc.).
- Persist per-workflow filter config (channel id, reaction emoji, channel type filter).
- The dispatcher must filter incoming events against each subscribed workflow's filter config before invoking the workflow.

**Where the gap is:**
- Trigger config schemas don't yet exist for Slack-specific event filters.
- The dispatcher's filter-matching logic may already exist generically (check `core/triggers/` for per-trigger filter primitives) — confirm at design time.

**Slice:** Likely a Slack-driven extension to the existing trigger contract; could ship alongside the first parity slice that needs it (Phase 2.1 — messaging triggers).

### P-S3 — File output contract

**What:** `downloadFile` and `getFileInfo` produce file content / metadata. Downstream actions (e.g. "save file to S3", "post file to another Slack channel") need a standard contract for consuming file output. V2 doesn't have a generic file-output shape today.

**Options:**
- **(a)** ActionResult.output carries a `file: { url, contentType, sizeBytes, content?: Buffer }` field with documented semantics.
- **(b)** ActionResult.output carries a presigned-URL-only reference; no buffer; downstream actions re-fetch.
- **(c)** Skip `downloadFile` for now; ship `getFileInfo` (metadata only) which doesn't need the contract.

**Slice:** Independent design. Could ship as part of the Phase 2.3 (Slack files batch) or land separately.

---

## 11. Effort estimate

Per master plan §6 sizing matrix. Slack is "Slack-sized" in name but the audit reveals the surface is larger than the master plan's pre-audit estimate (33 actions vs ~13 estimated; 10 triggers vs 4 estimated). Recommend split into **3 parity slices**:

### Phase 2.1 — Slack messaging + reactions (highest frequency)

**Scope:** 12 actions + 5 triggers. Closes the "Slack as a messaging system" use case.

| Commits | Content |
|---|---|
| 1 (audit) | This doc. |
| 2 | feat(slack): port message lifecycle actions (sendDirectMessage, getMessages, updateMessage, deleteMessage, getThreadMessages) |
| 3 | feat(slack): port scheduled message actions (scheduleMessage, cancelScheduledMessage, listScheduledMessages) |
| 4 | feat(slack): port reactions + pins (addReaction, removeReaction, pinMessage, unpinMessage) |
| 5 | feat(slack): port postInteractiveBlocks (Block Kit) |
| 6 | feat(slack): per-trigger filter logic (P-S2) — landed alongside first triggers that need it |
| 7 | feat(slack): port message triggers (newMessageChannel, newDirectMessage, newGroupDirectMessage) |
| 8 | feat(slack): port reaction triggers (reactionAdded, reactionRemoved) |
| 9 | test(e2e): extend slack walkthrough with 2.1 surface |

**Estimate: 9 commits.** Largest single parity slice in Phase 2 so far.

### Phase 2.2 — Slack channels + users

**Scope:** 14 actions + 3 triggers. Channel management + user reads.

| Commits | Content |
|---|---|
| 1 (audit ref) | (no separate audit; this audit covers it) |
| 2 | feat(slack): port channel CRUD (createChannel, archiveChannel, unarchiveChannel, joinChannel, leaveChannel, renameChannel, getChannelInfo, listChannels) |
| 3 | feat(slack): port channel membership + metadata (inviteUsersToChannel, removeUserFromChannel, setChannelTopic, setChannelPurpose) |
| 4 | feat(slack): port user reads (getUserInfo, listUsers) |
| 5 | feat(slack): port channel triggers (channelCreated, memberJoinedChannel, memberLeftChannel) |
| 6 | test(e2e): extend slack walkthrough with 2.2 surface |

**Estimate: 5 commits.**

### Phase 2.3 — Slack files + advanced

**Scope:** 3–5 actions + 1–2 triggers. Files (gated by P-S3 design), user-token actions (gated by P-S1), `addReminder` (gated by API status check), `userJoinedWorkspace` trigger (gated by scope decision).

| Commits | Content |
|---|---|
| 1 | (no separate audit; this audit covers it) |
| 2 | feat(slack): port `getFileInfo` and `uploadFile` (uploadFile redesigned per S-R6) |
| 3 | feat(slack): port `downloadFile` (after P-S3 contract slice lands) |
| 4 | feat(slack): port `addReminder` (only if Slack reminders API still supported) |
| 5 | feat(slack): port `fileUploaded` trigger |
| 6 | feat(slack): port `userJoinedWorkspace` trigger (after scope decision) |
| 7 | feat(slack): port `updateUserStatus` + `setUserPresence` (after P-S1 ships) |
| 8 | test(e2e): extend slack walkthrough with 2.3 surface |

**Estimate: 7 commits, but several are gated by P-S1 / P-S3 / product decisions.**

### Cross-slice totals

- **Total commits across 3 parity slices: ~21** (9 + 5 + 7).
- **Total ports: ~41** (39 baseline + 2 user-token actions if P-S1 ships).
- **Approximate calendar effort:** Phase 2.1 alone is ~2× a typical Phase 1 slice. Plan Phase 2 cadence accordingly — Slack is the highest-effort parity provider.

---

## 12. Risk estimate

Top 3 risks with likelihood × impact × mitigation:

### R-1 — User-token contract gap holds back 2 actions indefinitely

- **Likelihood:** high. P-S1 needs separate design + schema migration + handler-side per-action token selection.
- **Impact:** medium. `updateUserStatus` + `setUserPresence` are user-facing-status-toggle actions; usage in workflow automation is niche.
- **Mitigation:** Defer in Phase 2.3 with explicit doc note. Re-evaluate when P-S1 design starts (or skip permanently if no demand).

### R-2 — `uploadFile` redesign produces a less-functional V2 port than V1

- **Likelihood:** medium. V1's Supabase round-trip handles the case where the source file lives only inside V1's storage; if a workflow has an action upstream that produced a file by storing it in `workflow-files`, V2's redesigned `uploadFile` won't read from there transparently.
- **Impact:** medium. Workflow templates that chain "produce file → upload to Slack" via V1's storage hop break on port.
- **Mitigation:** Design `uploadFile` to accept either a URL (re-fetched at handler time) or a buffer (passed via TriggerEvent / upstream output). Document the source-file-shape requirement clearly. P-S3 (file output contract) makes this cleaner.

### R-3 — Per-trigger filter logic (P-S2) needs more design than expected

- **Likelihood:** medium. V2's dispatcher may already filter on per-workflow trigger config (need to confirm during the Phase 2.1 design pass). If not, P-S2 expands from "Slack-driven" to "general trigger contract change."
- **Impact:** high if it grows. Touches the trigger contract that every other provider also uses.
- **Mitigation:** Spike P-S2 design **before** Phase 2.1 implementation starts (post-audit-acceptance). If general filter primitives already exist, Slack just adds per-trigger config schemas. If not, scope the expansion explicitly in a separate design slice.

---

## 13. Recommended parity batch plan

Sequence of slices and the order they ship in. Each slice is its own audit-accepted unit; this plan is the recommendation, not the commitment.

1. **Slack 2.1 — Messaging + reactions** (9 commits) — closes the highest-leverage gap. Forces P-S2 (per-trigger filter logic) design, which unblocks every later parity slice that ships triggers.
2. **Slack 2.2 — Channels + users** (5 commits) — natural continuation; reuses P-S2; no new gaps.
3. **Slack 2.3 — Files + advanced** (7 commits, partially gated) — landed in priority order: `getFileInfo` + redesigned `uploadFile` first; `downloadFile` after P-S3 ships; `addReminder` after API check; `userJoinedWorkspace` after scope decision; `updateUserStatus` + `setUserPresence` after P-S1 ships (or deferred).

**Across all 3 slices:**
- Update master plan §3 priority table: Slack drops out as priority 1 once 2.1 lands; subsequent providers (Gmail at priority 2) proceed.
- Append to master plan §5 rot catalog: any new patterns surfaced during port (likely none — S-R1 through S-R10 are all already-cataloged-pattern instances).

**Cross-cutting:**
- Promote V1's S-R10 trade-off (`chat:write.public` opt-in) into the V2 manifest as a documented optional scope with rationale comment.
- Confirm Slack reminders API status (S-R action `addReminder`) before Phase 2.3 starts.

---

## 14. Exit checklist

This audit is complete when Marcus has:

- [ ] Read sections 1–13.
- [ ] Confirmed the action port/skip/defer table (§7) — especially the **DEFER** decisions (`updateUserStatus`, `setUserPresence`) and the **NEEDS PRODUCT DECISION** items (`addReminder`, `userJoinedWorkspace`).
- [ ] Confirmed the trigger port/skip/defer table (§7).
- [ ] Confirmed the 3 platform gaps (§10) are filed as separate slice candidates: **P-S1** user-token storage, **P-S2** per-trigger filter logic, **P-S3** file output contract.
- [ ] Confirmed the recommended split into **3 parity slices** (§11) with an estimated **~21 commits total**.
- [ ] Decided whether to:
  - **(a)** start Phase 2.1 immediately after acceptance, with P-S2 design as the first design pass; OR
  - **(b)** spike P-S2 separately first, then start Phase 2.1; OR
  - **(c)** modify the slice boundary (e.g. fold messaging into a single mega-slice).
- [ ] Decided on the `chat:write.public` scope question (S-R10): include in optional scopes, exclude entirely, or include in required.
- [ ] Decided on the `userJoinedWorkspace` scope question (§7 trigger row): all V2 Slack users get `users:read`, or per-trigger scope-request.
- [ ] Verified Slack reminders API status (`addReminder`) before Phase 2.3 starts.

**Implementation does NOT begin before Marcus checks every box above.**
