# Phase 3 — Slack Broader Action Metadata Plan

**Status:** Plan only. No metadata / runtime / handler changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Checkpoint reference:** [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md) §10 marked Slack as the next provider to make metadata-complete after the async-options-source infrastructure landed.
**Companion plans:** [`./options-source-plan.md`](./options-source-plan.md), [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md), [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md).

This plan sequences the remaining Slack action metas onto the existing builder infrastructure. By the end of the arc, Slack flips into `COVERED_PROVIDERS` and the structural test enforces 1:1 handler-to-meta coverage from then on.

---

## 1. Current Slack metadata state

| Surface | Status |
| --- | --- |
| Triggers (10 metas) | Complete — all 10 registered handlers have metas (`channel_created`, `file_uploaded`, `member_joined_channel`, `member_left_channel`, `new_direct_message`, `new_group_direct_message`, `new_message_channel`, `new_message_private_channel`, `reaction_added`, `reaction_removed`). |
| Action metas | 2 of 31 — `slack:download_file` (Slice 3.26), `slack:upload_file` (Slice 3.27, channel field upgraded to async combobox in Slice 3.32). |
| Async options source | `slack:channels` ships ([`integrations/slack/options/channels.ts`](../../../integrations/slack/options/channels.ts) — Slice 3.32). `slack:users` does NOT exist yet. |
| `COVERED_PROVIDERS` membership | NOT included — Slack stays partial coverage until every handler has a meta. |
| Outstanding action handlers | **29** (full inventory in §2). |

---

## 2. Full Slack action handler inventory

Verified by reading [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) lines 244-277. Every registered Slack action handler is listed; cross-referenced with the existence of an `*.meta.ts` file under `integrations/slack/actions/**`.

| # | Handler key | Schema file | Meta? | Notes |
| --- | --- | --- | --- | --- |
| 1 | `slack:send_channel_message` | [`sendChannelMessage.schema.ts`](../../../integrations/slack/actions/sendChannelMessage.schema.ts) | ❌ | `{channel, text, threadTs?}` |
| 2 | `slack:send_direct_message` | [`sendDirectMessage.schema.ts`](../../../integrations/slack/actions/sendDirectMessage.schema.ts) | ❌ | `{userId, text, threadTs?}` — user-id field |
| 3 | `slack:update_message` | [`updateMessage.schema.ts`](../../../integrations/slack/actions/updateMessage.schema.ts) | ❌ | `{channel, ts, text}` |
| 4 | `slack:delete_message` | [`deleteMessage.schema.ts`](../../../integrations/slack/actions/deleteMessage.schema.ts) | ❌ | `{channel, ts}` |
| 5 | `slack:get_messages` | [`getMessages.schema.ts`](../../../integrations/slack/actions/getMessages.schema.ts) | ❌ | `{channel, limit?, oldest?, latest?, cursor?}` |
| 6 | `slack:get_thread_messages` | [`getThreadMessages.schema.ts`](../../../integrations/slack/actions/getThreadMessages.schema.ts) | ❌ | `{channel, threadTs, limit?, oldest?, latest?, cursor?}` |
| 7 | `slack:schedule_message` | [`scheduleMessage.schema.ts`](../../../integrations/slack/actions/scheduleMessage.schema.ts) | ❌ | `{channel, text, postAt, threadTs?}` |
| 8 | `slack:cancel_scheduled_message` | [`cancelScheduledMessage.schema.ts`](../../../integrations/slack/actions/cancelScheduledMessage.schema.ts) | ❌ | `{channel, scheduledMessageId}` |
| 9 | `slack:list_scheduled_messages` | [`listScheduledMessages.schema.ts`](../../../integrations/slack/actions/listScheduledMessages.schema.ts) | ❌ | `{channel?, limit?, oldest?, latest?, cursor?}` |
| 10 | `slack:add_reaction` | [`addReaction.schema.ts`](../../../integrations/slack/actions/addReaction.schema.ts) | ❌ | `{channel, ts, reaction}` |
| 11 | `slack:remove_reaction` | [`removeReaction.schema.ts`](../../../integrations/slack/actions/removeReaction.schema.ts) | ❌ | `{channel, ts, reaction}` |
| 12 | `slack:pin_message` | [`pinMessage.schema.ts`](../../../integrations/slack/actions/pinMessage.schema.ts) | ❌ | `{channel, ts}` |
| 13 | `slack:unpin_message` | [`unpinMessage.schema.ts`](../../../integrations/slack/actions/unpinMessage.schema.ts) | ❌ | `{channel, ts}` |
| 14 | `slack:post_interactive_blocks` | [`postInteractiveBlocks.schema.ts`](../../../integrations/slack/actions/postInteractiveBlocks.schema.ts) | ❌ | `{channel, blocks[], text?, threadTs?}` — Block Kit JSON |
| 15 | `slack:list_channels` | [`channels/listChannels.schema.ts`](../../../integrations/slack/actions/channels/listChannels.schema.ts) | ❌ | `{kind?, excludeArchived?, limit?, cursor?}` |
| 16 | `slack:get_channel_info` | [`channels/getChannelInfo.schema.ts`](../../../integrations/slack/actions/channels/getChannelInfo.schema.ts) | ❌ | `{channel}` |
| 17 | `slack:create_channel` | [`channels/createChannel.schema.ts`](../../../integrations/slack/actions/channels/createChannel.schema.ts) | ❌ | `{name, isPrivate}` — Q11 (no hidden default on `isPrivate`) |
| 18 | `slack:archive_channel` | [`channels/archiveChannel.schema.ts`](../../../integrations/slack/actions/channels/archiveChannel.schema.ts) | ❌ | `{channel}` |
| 19 | `slack:unarchive_channel` | [`channels/unarchiveChannel.schema.ts`](../../../integrations/slack/actions/channels/unarchiveChannel.schema.ts) | ❌ | `{channel}` |
| 20 | `slack:rename_channel` | [`channels/renameChannel.schema.ts`](../../../integrations/slack/actions/channels/renameChannel.schema.ts) | ❌ | `{channel, name}` |
| 21 | `slack:join_channel` | [`channels/joinChannel.schema.ts`](../../../integrations/slack/actions/channels/joinChannel.schema.ts) | ❌ | `{channel}` |
| 22 | `slack:leave_channel` | [`channels/leaveChannel.schema.ts`](../../../integrations/slack/actions/channels/leaveChannel.schema.ts) | ❌ | `{channel}` |
| 23 | `slack:invite_users_to_channel` | [`channels/inviteUsersToChannel.schema.ts`](../../../integrations/slack/actions/channels/inviteUsersToChannel.schema.ts) | ❌ | `{channel, users(CSV \| array), sendInviteNotification}` — Q11 + multi-user |
| 24 | `slack:remove_user_from_channel` | [`channels/removeUserFromChannel.schema.ts`](../../../integrations/slack/actions/channels/removeUserFromChannel.schema.ts) | ❌ | `{channel, user}` — single user id |
| 25 | `slack:set_channel_topic` | [`channels/setChannelTopic.schema.ts`](../../../integrations/slack/actions/channels/setChannelTopic.schema.ts) | ❌ | `{channel, topic}` (topic ≤ 250) |
| 26 | `slack:set_channel_purpose` | [`channels/setChannelPurpose.schema.ts`](../../../integrations/slack/actions/channels/setChannelPurpose.schema.ts) | ❌ | `{channel, purpose}` (purpose ≤ 250) |
| 27 | `slack:get_user_info` | [`users/getUserInfo.schema.ts`](../../../integrations/slack/actions/users/getUserInfo.schema.ts) | ❌ | `{user}` — single user id |
| 28 | `slack:list_users` | [`users/listUsers.schema.ts`](../../../integrations/slack/actions/users/listUsers.schema.ts) | ❌ | `{limit?, cursor?}` |
| 29 | `slack:upload_file` | [`files/uploadFile.schema.ts`](../../../integrations/slack/actions/files/uploadFile.schema.ts) | ✅ | Slice 3.27 + 3.32 |
| 30 | `slack:download_file` | [`files/downloadFile.schema.ts`](../../../integrations/slack/actions/files/downloadFile.schema.ts) | ✅ | Slice 3.26 |
| 31 | `slack:get_file_info` | [`files/getFileInfo.schema.ts`](../../../integrations/slack/actions/files/getFileInfo.schema.ts) | ❌ | `{fileId, includeComments?}` — produces FileRef(provider_url) |

**Totals:** 31 handlers · 2 metas · **29 metas missing** · 0 permanent-skip handlers (every handler is in scope for metadata coverage).

---

## 3. Recommended sub-slice grouping

Five working groups by Slack surface area. Each group is sized for a single PR that reviewers can scan in one sitting (3-9 actions per slice, predictable test surface).

### 3.1 Group A — Messaging core (8 actions)

`send_channel_message`, `send_direct_message`, `update_message`, `delete_message`, `get_messages`, `get_thread_messages`, `schedule_message`, `cancel_scheduled_message`.

Why grouped together: every action keys on `(channel, ts?)` or `(channel, text)` semantics and shares the channel-picker + message-reference UX shape. `schedule_message` + `cancel_scheduled_message` ride together because the latter's `scheduledMessageId` field naturally consumes the former's output.

### 3.2 Group B — Reactions & message ops (5 actions)

`add_reaction`, `remove_reaction`, `pin_message`, `unpin_message`, `list_scheduled_messages`.

Why grouped: all small `{channel, ts, …}`-shape actions with no user-id fields. `list_scheduled_messages` lands here because it's a read companion to `schedule_message` / `cancel_scheduled_message` — tiny meta, no fields beyond pagination, fits the "small-action" bucket.

### 3.3 Group C — Channel management (12 actions)

`list_channels`, `get_channel_info`, `create_channel`, `archive_channel`, `unarchive_channel`, `rename_channel`, `join_channel`, `leave_channel`, `set_channel_topic`, `set_channel_purpose`, `invite_users_to_channel`, `remove_user_from_channel`.

Why grouped: every action either reads or mutates channel state, all live under [`integrations/slack/actions/channels/`](../../../integrations/slack/actions/channels/) on the runtime side, and every channel-bearing field uses the same `slack:channels` picker. `invite_users_to_channel` + `remove_user_from_channel` ride here despite involving user ids — see §4 for user-field strategy.

### 3.4 Group D — Users + remaining files (3 actions)

`get_user_info`, `list_users`, `get_file_info`.

Why grouped: `get_user_info` and `list_users` are the two `users.*` actions; `get_file_info` rounds out the files trio (alongside `upload_file` / `download_file` already shipped).

### 3.5 Group E — Block-kit + coverage flip (2 actions + structural)

`post_interactive_blocks` plus the `COVERED_PROVIDERS` flip + final regression sweep.

Why grouped: `post_interactive_blocks` is the one Slack action with an interactive-payload field shape (`blocks[]`) that no other meta exercises — its design deserves a dedicated slot. The coverage flip lands in the same PR so it gates on all 29 metas being present.

---

## 4. Field metadata strategy

### 4.1 Channel fields → async combobox sourced from `slack:channels`

Every `channel` / `channel?` field uses:

```ts
{
  name: "channel",
  label: "Channel",
  type: "combobox",
  optionsSource: "slack:channels",
  required: <schema-driven>,
  placeholder: "Search channels…",
  description: "…the saved value is the underlying channel id (C…/G…/D…).",
}
```

This is the exact shape `slack:upload_file.channel` ships today (Slice 3.32). 21 of the 29 outstanding metas have a `channel` field.

**Note on schema regex variance:**
- `send_channel_message.channel` accepts `C…`/`D…`/`#name` (Slack resolves names server-side).
- Channel-management actions (`archive_channel`, etc.) accept `^[CG][A-Z0-9]+$` only.
- `get_channel_info.channel` accepts `^[CDG][A-Z0-9]+$`.
- DMs (`D…`) appear in `send_direct_message`-derived flows.

The picker surfaces public + private channels visible to the bot (per Slice 3.32's `slack:channels` resolver). DM channels and `#name` shortcuts won't appear in the picker — authors who need those still type them manually using the underlying text-mode behaviour (NOT in scope for v1; combobox is single-select-from-list only). Per-action regex tightening is the runtime handler's job, not the meta's. If a meta needs to accept DM ids and the picker resolver doesn't return them, that's a follow-up resolver work-item; metadata defers it.

### 4.2 User fields → stay `text` for now, with optional follow-up resolver

Four actions carry user-id fields:

| Action | Field | Shape |
| --- | --- | --- |
| `send_direct_message` | `userId` | single user id (`^U[A-Z0-9]+$`) |
| `get_user_info` | `user` | single user id (`^U[A-Z0-9]+$`) |
| `remove_user_from_channel` | `user` | single user id (`^U[A-Z0-9]+$`) |
| `invite_users_to_channel` | `users` | CSV string OR `string[]` of user ids |

**Recommendation:** ship these as `type: "text"` (or `"string-array"` for the `invite_users_to_channel.users` field) in the first batch. Reasoning:

- The builder already ships `string-array` (Slice 3.13) — perfect fit for `invite_users_to_channel.users`. No new infrastructure needed.
- `useOptionsSource` + combobox does NOT support multi-select today (deferred from Slice 3.7). Even with a `slack:users` resolver, `invite_users_to_channel` couldn't use a picker today — it'd still need the chip-based `string-array` UI.
- Slack workspaces routinely exceed several hundred members; `slack:users` would need pagination plumbing through the route / hook / renderer that Slice 3.30 deferred (per options-source-plan §3.4).
- The three single-user fields (`send_direct_message.userId`, `get_user_info.user`, `remove_user_from_channel.user`) are usually wired from upstream `{{trigger.user}}` / `{{slack:list_users.users[*].id}}` references — the variable picker already handles that case.

A `slack:users` resolver remains a worthwhile follow-up after the broad metadata batch lands, but it should not gate Group A-E. If/when it ships:

1. Add `integrations/slack/options/users.ts` (analog of `channels.ts`, single-page via `users.list`).
2. Flip `send_direct_message.userId`, `get_user_info.user`, `remove_user_from_channel.user` from `text` → `combobox` with `optionsSource: "slack:users"`.
3. Leave `invite_users_to_channel.users` on `string-array` until multi-select combobox lands (separate, larger slice).

### 4.3 Other field-type mappings

| Schema field type | Meta field type | Notes |
| --- | --- | --- |
| `z.string()` (long-form: `text`, `topic`, `purpose`, `name`, `body`) | `text` or `textarea` | `text` for one-line fields; `textarea` for message bodies (`text` in send_channel_message / send_direct_message / schedule_message / update_message; also `topic`, `purpose` ≤ 250 stay `text`). |
| `z.string()` (timestamp form: `ts`, `threadTs`, `oldest`, `latest`, `postAt`) | `text` with explicit placeholder | Slack timestamp format (`1730000000.000123`); placeholder shows shape; helper text explains the field comes from upstream Slack actions. `parsePostAt` accepts strict formats — placeholder mirrors them. |
| `z.string()` (opaque ids: `scheduledMessageId`, `fileId`) | `text` with placeholder | Per audit, these are passed through from upstream outputs; no picker affordance worth building. |
| `z.string()` (reaction name) | `text` with placeholder `:thumbsup:` | Could be a `slack:emoji` picker later but Slack's emoji list is dynamic per workspace and Slack does not expose a clean list endpoint. Defer. |
| `z.number()` (limit) | `number` with `numeric.{min,max,integer}` mirrors of Zod schema | `limit` for paginated actions; defaults absent per Q5. |
| `z.boolean()` (`isPrivate`, `excludeArchived`, `sendInviteNotification`, `includeComments`) | `boolean` | Q11 / required where the schema marks them required. |
| `z.enum(["public","private","both"])` (`list_channels.kind`) | `select` with static options | Renders as a Radix Select; v1 static path. |
| `z.union([CSV, string[]])` (`invite_users_to_channel.users`) | `string-array` | The Slice 3.13 chip renderer writes `string[]` natively. The handler accepts CSV OR array (Q7 `parseRecipients` on the runtime side); the meta only writes array. Required, ≥ 1 item enforced at runtime — the meta sets `required: true`. |
| `z.array(z.object({type: string}).passthrough())` (`post_interactive_blocks.blocks`) | `textarea` with paste-JSON placeholder | Block Kit JSON is too freeform for any structured editor today. Authors paste a JSON literal or a `{{...}}` reference. No `optionsSource`, no `string-array`. Helper text explains Block Kit + links to Slack docs. |
| `cursor` | DO NOT EXPOSE | Server-managed pagination handle. Meta omits the field entirely; authors call the action again with `{{prev.nextCursor}}` if they want page 2. Per the existing `list_*` patterns. |

### 4.4 Required vs optional

Mirror the Zod schemas exactly. Q5 (preserve user explicit `false`/`0`) + Q11 (no hidden high-risk defaults) ride along — when a Zod schema declares `z.boolean({ required_error: ... })`, the meta must mark the field `required: true` and provide NO `defaultValue`.

### 4.5 What metas MUST NOT expose

- Server-managed pagination cursors (see §4.3).
- Internal handler knobs (`debug` flags, retry budgets, etc.) — none currently exist on Slack handlers but the rule stands.
- Workspace selectors (`workspace`, `asUser`, `fileSource`) — Slack 2.4 `get_file_info` schema explicitly dropped these (per `getFileInfo.schema.ts` comment). Metas match the schemas.
- Raw bytes / base64 / content / data — FileRef discipline already enforces this at the contract level.

---

## 5. Output metadata strategy

Mirror handler return shapes verbatim. Verified by reading the runtime handlers; output shapes are stable per the Slack 2.x rot fixes.

### 5.1 Per-group output shapes

**Messaging (Group A):**
- `send_channel_message` / `send_direct_message` → `{channel, ts, message}`. Outputs: `channel: string`, `ts: string`, `message: object` (Slack message body — useful for variable picker drilling).
- `update_message` → `{channel, ts, text}`.
- `delete_message` → `{channel, ts}`.
- `get_messages` / `get_thread_messages` → `{messages, count, hasMore, nextCursor}`. `messages: array`, `count: number`, `hasMore: boolean`, `nextCursor: string` (nullable). Critical: `messages` is an `array` output — the variable picker treats it as a list source.
- `schedule_message` → `{channel, scheduledMessageId, postAt}`.
- `cancel_scheduled_message` → `{channel, scheduledMessageId}` (echoed, plus implicit success).

**Reactions / pins (Group B):**
- `add_reaction` / `remove_reaction` → `{channel, ts, reaction}` (echoed from config).
- `pin_message` / `unpin_message` → `{channel, ts}` (echoed).
- `list_scheduled_messages` → `{scheduledMessages, count, hasMore, nextCursor}`.

**Channels (Group C):**
- `list_channels` → `{channels, count, hasMore, nextCursor}`.
- `get_channel_info` → channel object (`{id, name, is_private, is_archived, …}`). One `channel: object` output plus salient bounded scalars (`id`, `name`, `is_private`).
- `create_channel` → `{channel: object, id, name, is_private}`. Echoes the salient ids inline so downstream actions don't need to drill `channel.id`.
- `archive_channel` / `unarchive_channel` / `rename_channel` / `join_channel` / `leave_channel` → bounded confirmation (`{channel: string}` plus action-specific extras like `{name}` for rename).
- `set_channel_topic` / `set_channel_purpose` → `{channel, topic|purpose}` (echoed).
- `invite_users_to_channel` → `{channel, invitedUsers: string[], notificationSent: boolean}` (verified at meta-implementation time against the handler).
- `remove_user_from_channel` → `{channel, removedUser}`.

**Users + files (Group D):**
- `get_user_info` → user object (`{id, name, real_name, profile, …}`). One `user: object` output; salient scalars per the runtime shape.
- `list_users` → `{users, count, hasMore, nextCursor}`.
- `get_file_info` → `{file: FileRef(provider_url), fileId, fileName, title, fileType, mimeType, sizeBytes, permalink, permalinkPublic, uploaderId, channels, comments?}`. **`producesFileRef: true`**, `consumesFileRef: false`. `comments` only present when `config.includeComments === true`; the meta documents the conditionality but still declares the output since the variable picker handles missing fields gracefully.

**Block kit (Group E):**
- `post_interactive_blocks` → `{channel, ts, message}` (same shape as `send_channel_message`).

### 5.2 Output discipline reminders

- No raw Slack response spreads. Outputs name the fields explicitly.
- No `bytes` / `base64` / `content` / `data` siblings on FileRef-producing outputs (Slack 2.4 / FileRef rules).
- `producesFileRef: true` only for `get_file_info` (and the already-shipped `download_file` / `upload_file`).
- `consumesFileRef: true` only for `upload_file` (already shipped) — no other Slack action takes a FileRef input.
- Output descriptions must be useful in the variable picker context ("Slack message timestamp used as `ts` for follow-up update/delete/react actions").

---

## 6. `optionsSource` strategy

| Source | Status | Used by |
| --- | --- | --- |
| `slack:channels` | Shipped (Slice 3.32) | All channel-bearing fields in this arc. |
| `slack:users` | NOT shipped — recommended FOLLOW-UP after Groups A-E | Would flip `send_direct_message.userId`, `get_user_info.user`, `remove_user_from_channel.user` from `text` to `combobox`. |

**Recommendation:** ship the entire Slack metadata batch (Groups A-E) using `text` for user-id fields. Land a small `slack:users` resolver slice afterward IF user-field UX feedback warrants. Do not gate the batch on the resolver — the value of unlocking 29 actions in the builder dwarfs the marginal UX improvement on three single-user fields.

If the resolver does land:

1. **Slice 3.39 (proposed)** — `slack:users` resolver. Mirror `slack:channels` but call `users.list` instead of `conversations.list`. Same scope already granted (`users:read`). Pagination behavior identical to channels (single page, `hasMore` advisory).
2. Subsequent micro-slice flips the three text fields to combobox + `optionsSource: "slack:users"`. Integration tests updated.

---

## 7. `COVERED_PROVIDERS` strategy

Slack stays out of [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) `COVERED_PROVIDERS` until the final Group E slice. Until then the structural test treats Slack as partial-coverage (`{native, github, gmail, microsoft-outlook}` only).

The flip itself is one line + a green regression sweep:

```ts
const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
  "slack",           // ← added at the end of Slice 3.38
]);
```

The structural test will then enforce: every Slack handler in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) (31 entries) MUST have a meta in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts). Drift becomes a build error.

The flip MUST land in the same PR as the last batch of metas (Group E) so the test goes green in one move. Splitting it would mean a red `main` between PRs.

---

## 8. Testing strategy

### 8.1 Per-slice registry tests

Each implementation slice adds metas to [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts) and extends [`tests/unit/services/discovery/_registry.test.ts`](../../../tests/unit/services/discovery/_registry.test.ts) with per-action assertions:

- Field names + types + required flags mirror the Zod schema.
- `optionsSource` set correctly for channel fields.
- Outputs match the handler return shape verbatim.
- `producesFileRef` / `consumesFileRef` flags correct.
- `category` consistent (see §9).
- `displayOrder` is unique within Slack and produces a stable sort.

### 8.2 Provider-route count test

[`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) currently asserts `["slack:download_file", "slack:upload_file"]` (lines 168-202). Each Slack slice updates this list. Final assertion after Group E will be a 31-entry array sorted by displayOrder.

### 8.3 Integration tests (per-group scope)

Add tests sparingly — one canonical builder-shell flow per major UX shape, not one per action:

| Group | Canonical integration test |
| --- | --- |
| A | `slack-send-channel-message-config.test.tsx` — channel picker (`slack:channels`) + text field + optional thread-ts. Mirrors the structure of [`slack-upload-file-config.test.tsx`](../../../tests/integration/features/workflow-builder/slack-upload-file-config.test.tsx). |
| A | `slack-schedule-message-config.test.tsx` — `postAt` field shape + the `parsePostAt` placeholder, plus the picker. |
| B | None — small-action group; per-action registry + provider-route tests cover it. |
| C | `slack-create-channel-config.test.tsx` — `isPrivate` required boolean, no hidden default (Q11). |
| C | `slack-invite-users-to-channel-config.test.tsx` — `string-array` chip flow for `users` + channel picker. |
| D | `slack-get-user-info-config.test.tsx` — plain text user-id field; future `slack:users` migration test target. |
| E | `slack-post-interactive-blocks-config.test.tsx` — JSON paste for `blocks` field. |

Total: 6 new integration tests across the 5 implementation slices. Existing `slack-upload-file-config.test.tsx` stays unmodified.

### 8.4 Structural test

The `COVERED_PROVIDERS` flip in Slice 3.38 triggers the structural test's full 1:1 sweep. The same PR must produce zero violations.

---

## 9. Implementation sequence

Four implementation slices + a coverage-flip closer.

| Slice | Group | Adds | Total Slack metas after |
| --- | --- | --- | --- |
| **3.34 (this doc)** | — | Plan only. | 2 |
| **3.35 — Slack messaging metadata** | A (8) | `send_channel_message`, `send_direct_message`, `update_message`, `delete_message`, `get_messages`, `get_thread_messages`, `schedule_message`, `cancel_scheduled_message` | 10 |
| **3.36 — Slack reactions & message ops** | B (5) | `add_reaction`, `remove_reaction`, `pin_message`, `unpin_message`, `list_scheduled_messages` | 15 |
| **3.37 — Slack channel management** | C (12) | `list_channels`, `get_channel_info`, `create_channel`, `archive_channel`, `unarchive_channel`, `rename_channel`, `join_channel`, `leave_channel`, `set_channel_topic`, `set_channel_purpose`, `invite_users_to_channel`, `remove_user_from_channel` | 27 |
| **3.38 — Slack users + remaining files + coverage flip + block-kit** | D + E (4) | `get_user_info`, `list_users`, `get_file_info`, `post_interactive_blocks` + Slack added to `COVERED_PROVIDERS` | 31 |
| **3.39+ (proposed follow-up)** | (resolver) | Optional `slack:users` resolver + flip 3 user-id text fields to combobox. | — |

### 9.1 Slice size rationale

- 3.35 is the heaviest pure-meta slice (8 actions). Acceptable because the metas share shape (channel + text + optional threadTs). Plus two integration tests.
- 3.36 is the smallest (5 actions, mostly `{channel, ts, …}` echo-outputs). Single-day slice.
- 3.37 is the largest action count (12) but the metas are uniform (channel-id + small specifics). Two integration tests.
- 3.38 bundles two distinct surfaces (Group D + E) with the coverage flip. The block-kit meta is intentionally last — its JSON-paste field is a one-off and lives in its own integration test.

### 9.2 Category + displayOrder assignment

Categories already in use across the codebase: `developer`, `email`, `files`, `http`, `logic`, `messaging`, `scheduling`, `transform`. Slack triggers all use `messaging` (even `channel_created` and `reaction_added`); existing Slack file actions use `files`. To minimize new categories and stay consistent:

- **`messaging`** — Groups A, B, C, E (every channel/message/reaction/pin/block-kit action). Matches the trigger convention.
- **`files`** — Group D's `get_file_info` only.

Sub-category sorting via `displayOrder` (10-multiples; existing `download_file=10`, `upload_file=20` stay):

| Range | Actions |
| --- | --- |
| 10-20 | `download_file`, `upload_file` (existing) |
| 30-100 | Group A messaging core, ordered: send_channel, send_direct, update, delete, get_messages, get_thread_messages, schedule, cancel_scheduled |
| 110-150 | Group B reactions: add_reaction, remove_reaction, pin_message, unpin_message, list_scheduled_messages |
| 160-270 | Group C channels: list_channels, get_channel_info, create_channel, archive_channel, unarchive_channel, rename_channel, join_channel, leave_channel, set_channel_topic, set_channel_purpose, invite_users_to_channel, remove_user_from_channel |
| 280-310 | Group D + E remaining: get_user_info, list_users, get_file_info, post_interactive_blocks |

`displayOrder` is non-load-bearing for correctness; the numbers above are an opening proposal that each implementation slice can adjust within its range. The key invariant is uniqueness within the provider.

---

## 10. Out of scope

- **Runtime Slack handler changes.** Every meta mirrors the existing schema; no schema rewrites, no handler reshaping, no new Slack API calls.
- **Slack OAuth scope changes.** All scopes for currently-registered handlers already ship in [`integrations/slack/manifest.ts`](../../../integrations/slack/manifest.ts) (`users:read` is already required, so `slack:users` follow-up needs no scope change).
- **New Slack actions.** Adding `chat.postEphemeral` / `conversations.open` / etc. is not part of metadata coverage.
- **`slack:users` resolver in the main arc.** Scoped as Slice 3.39+ (post-coverage flip).
- **Multi-select combobox.** Slice 3.7 deferral stands; `invite_users_to_channel.users` stays on `string-array`.
- **Type-aware variable picker filtering.** Out of scope per FileRef deferrals (D-FRA-6 / D-SFR-10).
- **Slack canvas / file-share rendering polish.** Out of scope.
- **Pushing / PR creation.** Local-only branch.

---

## 11. Open decisions for Marcus

Recommended defaults listed first; mark disagreements when accepting the plan.

| Decision | Recommended default | Why |
| --- | --- | --- |
| Should `slack:users` resolver land BEFORE user-targeted action metas? | **No — defer to 3.39+.** Ship Groups A-E with `text` user-id fields first. | Unblocks 29 actions immediately; `slack:users` resolver isn't a blocker for any single-user field thanks to variable picker references. `invite_users_to_channel` can't use single-pick combobox anyway. |
| Should Slack actions be grouped by category in the picker now? | **No — keep `messaging` + `files`.** Match the existing trigger category convention. | The picker UI already groups by category visually; introducing Slack-specific categories (`channels`, `reactions`, `scheduling`) would diverge from the established naming and force a wider rename pass. |
| Should Slack metadata ship as one big PR or several smaller slices? | **Four slices: 3.35 / 3.36 / 3.37 / 3.38.** | A 29-meta single PR is reviewable but unforgiving — any one meta error blocks the whole batch. The four-slice split maps to natural Slack surface areas, keeps each PR around 5-12 metas, and lets each integration test land near its meta. |
| Should low-use Slack actions be deferred? | **No — include all 29 for COVERED_PROVIDERS completeness.** | The structural test gates on 1:1 handler-to-meta coverage. Deferring even one action keeps Slack out of `COVERED_PROVIDERS`, which means continued drift risk and no automated regression guard. The marginal effort to write a meta for `unpin_message` is tiny; the regression value of full coverage is high. |
| Should the `block_kit` meta use a structured JSON editor (future field type) or the textarea-paste approach? | **Textarea-paste for v1.** | Block Kit JSON is freeform with Slack-side validation; a structured editor would duplicate Slack's BlockKit Builder UI. Authors paste from Block Kit Builder or upstream actions. A `code`/`json-textarea` field type is a separate infrastructure investment. |
| Should `slack:list_users.includeProfileEmails` (V1 feature) be re-added? | **No — out of scope.** Schema already drops V1's `users:read.email` upgrade path. | Re-adding it requires a Slack OAuth re-prompt for the entire workspace; runtime change, not meta change. |
| Should existing Slack output shapes be tightened (e.g. flatten `message: object`) before the metas ship? | **No — metas mirror current handlers exactly.** | Reshaping outputs is a runtime concern. Metas are a documentation surface — if a handler returns `{message: object}`, the meta declares `message: object` and lets the variable picker drill. A future runtime cleanup slice can tighten shapes; until then, meta accuracy beats meta aspiration. |
| Should `post_interactive_blocks` use a `keyvalue` field for `blocks` instead of textarea? | **No — textarea-paste only.** | `keyvalue` is `Record<string,string>`; Block Kit blocks are nested objects. Wrong shape. |

---

## 12. Acceptance criteria for the arc

By the end of Slice 3.38:

- ✅ All 31 Slack action handlers have metas in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts).
- ✅ Slack is in `COVERED_PROVIDERS` and [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) passes.
- ✅ `npm test` green, `tsc` clean, lint clean (apart from the existing `_registry.ts` max-lines warning that predates this arc).
- ✅ Six new integration tests covering the canonical UX shapes (per §8.3).
- ✅ [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) asserts the full 31-action Slack list.
- ✅ Every meta field mirrors its Zod schema (required/optional, type, regex pattern via `placeholder`/`description`).
- ✅ No runtime Slack handler changes shipped under this arc.
- ✅ Local-only branch `v2-provider-port-local`; no pushes.

Stretch (Slice 3.39+):

- ✅ `slack:users` resolver shipped; `send_direct_message.userId` / `get_user_info.user` / `remove_user_from_channel.user` flipped from `text` to `combobox` + `optionsSource: "slack:users"`.
