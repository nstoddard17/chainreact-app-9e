# Discord Metadata + Runtime-Port Audit — Slice 3.DISCORD-1

**Status:** Audit + planning slice. Doc-only. **No metadata, no resolvers, no runtime changes ship in this commit.**
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Predecessor:** [`./mailchimp-metadata-plan.md`](./mailchimp-metadata-plan.md). Mailchimp closed the largest fully-uncovered provider arc; Discord is the next user-visible provider in scope.
**Companion plans:** [`./options-source-plan.md`](./options-source-plan.md), [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md), [`../phase-1-provider-completion-audit.md`](../phase-1-provider-completion-audit.md) §4.2 (the original Discord deferral rationale).

Every claim below was verified by reading live files. Where V2 lacks a Discord surface, V1 paths under `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/**` are cited so the runtime port slice can mirror them deterministically.

---

## 1. Headline finding — Discord has NO V2 runtime

A directory listing of `integrations/` confirms:

```
integrations/_registry.ts
integrations/_shared/
integrations/airtable/        integrations/github/          integrations/gmail/
integrations/google-calendar/ integrations/google-drive/    integrations/google-sheets/
integrations/hubspot/         integrations/mailchimp/       integrations/microsoft-excel/
integrations/microsoft-onedrive/  integrations/microsoft-outlook/
integrations/microsoft-outlook-calendar/  integrations/microsoft-teams/
integrations/native/          integrations/notion/          integrations/shopify/
integrations/slack/           integrations/stripe/          integrations/trello/
```

**No `integrations/discord/` exists.** The only mentions of `discord` anywhere in `integrations/` + `services/` + `contracts/` + `core/` are two:

- [`services/notifications/channel.ts:14`](../../../services/notifications/channel.ts) — `ChannelName` union enumerates `"discord"` as a future user-notification channel. Unrelated to Discord-as-integration; it's about ChainReact pinging users via Discord webhook for workflow-failure alerts.
- [`contracts/integration.ts:8`](../../../contracts/integration.ts) — doc-comment example only.

No `services/discovery/_registry.ts` entry, no [`services/options/_registry.ts`](../../../services/options/_registry.ts) entry, no `services/execution/handlers/_registry.ts` registration, no webhook receive route, no manifest, no action handlers, no trigger handlers, no schemas, no Zod types, no tests. **The Discord arc is a green-field port, not a metadata layer on top of an existing runtime.**

This is materially different from every prior Phase 3 provider arc (HubSpot / Google Sheets / Mailchimp / Slack / Stripe / Notion all had the runtime already shipped by Phase 2; Phase 3 only added the builder-facing metadata layer on top). Discord requires the runtime port FIRST.

**Recommendation up-front:** This slice produces this audit doc and STOPS. The next Discord slice MUST be a runtime port (`DISCORD-2` — provider port), not a metadata layer. Without action handlers + trigger infrastructure to point at, `ActionMeta` / `TriggerMeta` files would have no runtime contracts to mirror — the meta surface would describe code that does not exist.

The Phase 1 audit at [`../phase-1-provider-completion-audit.md`](../phase-1-provider-completion-audit.md) §4.2 deferred Discord for exactly this reason. Three accepted Phase 2 exits were named there: (a) port actions only and skip triggers; (b) port a minimum-viable trigger via Discord Application Webhooks (limited topic surface); (c) skip Discord entirely until Phase 6 when a durable queue can absorb a gateway worker. **This slice does not resolve that product decision** — it surfaces it again with everything needed to make it.

---

## 2. V1 Discord surface (reference for the future runtime port)

All counts and shapes verified against V1 at `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/**`.

### 2.1 User-facing manifest counts

Per [V1's manifest](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/discord/index.ts) (508 lines, one file):

| Surface | Count | V1 keys |
| --- | --- | --- |
| **Actions** | **5** | `discord_action_send_message`, `discord_action_edit_message`, `discord_action_delete_message`, `discord_action_fetch_messages`, `discord_action_assign_role` |
| **Triggers** | **3** | `discord_trigger_member_join`, `discord_trigger_new_message`, `discord_trigger_slash_command` |

### 2.2 V1 action handler file is monolithic

[V1 `lib/workflows/actions/discord.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/discord.ts) is **2075 lines** with **23 exported handler functions**. Only 5 are surfaced in the user manifest; the remaining 18 are either:

- **Unsurfaced V1 handlers** (potential future actions) — `createDiscordCategory`, `deleteDiscordCategory`, `createDiscordChannel`, `editDiscordChannel`, `deleteDiscordChannel`, `listDiscordChannels`, `sendDiscordDirectMessage`, `addDiscordReaction`, `removeDiscordReaction`, `fetchDiscordGuildMembers`, `listDiscordRoles`, `createDiscordRole`, `updateDiscordRole`, `deleteDiscordRole`, `addDiscordRole`, `removeDiscordRole`, `kickDiscordMember`, `banDiscordMember`, `unbanDiscordMember`.
- These widen the eventual Discord surface considerably (moderation, channel CRUD, role CRUD, reactions, DMs) but are out of scope for the V2 port until product confirms which subset ships.

**V2 port rule** (per all prior provider arcs): split per-handler at port time; do NOT re-create the monolith.

### 2.3 V1 trigger architecture is incompatible with V2

[V1 `lib/integrations/discordGateway.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/discordGateway.ts) (1565 lines) maintains a long-lived **WebSocket** connection to Discord's gateway (`wss://...`) at `lib/integrations/discordGateway.ts:301-308`. All three V1 triggers (`member_join`, `new_message`, `slash_command`) consume events from this single global socket and dispatch into the workflow engine.

**V2 has NO websocket / persistent-connection trigger contract.** The trigger lifecycle service (`services/triggers/lifecycle.ts`) recognizes only:

- `webhook` (provider POSTs to a route) — used by Stripe / Shopify / GitHub / HubSpot / Microsoft Graph / Mailchimp `audience_event`.
- `polling` (server-side cron polls provider API) — used by Gmail / Google Sheets / Mailchimp polling triggers.
- `manual` (user clicks Run Now) — native only.
- `scheduled` (cron expression fires) — native only.

Per [`contracts/triggerMeta.ts:39-44`](../../../contracts/triggerMeta.ts) the `TriggerActivationSchema` enum has only those 4 values. There is no fifth value for "long-lived process consumes a gateway socket". Adding one is **a Phase-level infrastructure change**, not a metadata slice.

The Phase 1 audit names this gap explicitly:
> Discord's "trigger" surface is a persistent gateway websocket connection, not webhooks or polling. V1 runs a long-lived `discordGateway.ts` process. V2's trigger lifecycle has no analog: no "websocket-trigger" registry, no presence runtime.

**Implication for the metadata arc:** trigger metas cannot ship until the trigger contract decision is made. Three possible runtime-port outcomes:

1. **Port actions only.** Discord goes into `COVERED_PROVIDERS` with 5 actions + 0 triggers. Workflow authors get send/edit/delete/fetch/assign-role but cannot react to Discord events.
2. **Replace gateway with Discord Application Webhooks.** Discord recently added an HTTP-webhook subscription model (`event_webhooks_url`) covering a limited subset of events (application authorization, quest events, payments). It does NOT cover `MESSAGE_CREATE` / `GUILD_MEMBER_ADD` — the events V1's three triggers fire on. So this option would ship 0 of the 3 V1 triggers as direct ports; only a new "user-installed-bot" trigger family would work.
3. **Port polling-style "message-replay-since" triggers.** Discord exposes `GET /channels/{id}/messages?after=` which can power a `new_message` polling trigger; `GET /guilds/{id}/members?after=` does NOT include join-timestamp sort and can't power `member_join` cleanly. Slash commands are user-interactive and have no polling equivalent. So this option ships ~1 of the 3 V1 triggers as a partial port.
4. **Defer triggers to a separate `DISCORD-N-triggers` slice after the actions arc.** Decouples the metadata layer from the trigger-architecture question. Recommended.

### 2.4 V1 OAuth + bot-installation model

Per [V1 manifest](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/discord/index.ts), every Discord action declares `requiredScopes: ["bot"]`. V1 uses a Discord **bot token + per-server install** flow:

- Bot identity is global (one ChainReact bot, one token).
- Bot must be **added to each Discord server** the workflow targets via Discord's "Add to Server" OAuth scope-grant page.
- API calls authenticate as the bot, not as the end user.

**V2 implication:** the existing `OAuth2` / `non-refreshable` auth-scheme contracts at [`lib/integrations/authSchemes.ts`](../../../lib/integrations/authSchemes.ts) need a `bot-token` extension OR Discord uses the existing non-refreshable scheme with the integration row holding the bot token (the bot is global; the integration is per-user-per-server). Slack's "single-bot-per-workspace" pattern is the closest analog and proves it works; the port slice should follow it.

### 2.5 V1 dynamic data resolvers

[V1 `app/api/integrations/discord/data/handlers/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/discord/data/handlers/) exposes 13 handler files:

| V1 dynamic key | V1 handler | Used by V1 action/trigger | V2 resolver needed? |
| --- | --- | --- | --- |
| `discord_guilds` | `guilds.ts` | All 5 actions + 3 triggers | **YES — `discord:guilds`** (no `requiredDeps`; account-scoped) |
| `discord_channels` | `channels.ts` | All 5 actions + new_message trigger | **YES — `discord:channels`** (`requiredDeps: ["guildId"]`) |
| `discord_members` | `members.ts` | assign_role + delete_message (filter) + fetch_messages (filter) | **YES — `discord:members`** (`requiredDeps: ["guildId"]`) |
| `discord_channel_members` | `channel-members.ts` | new_message trigger (authorFilter) | **YES — `discord:channel_members`** (`requiredDeps: ["channelId"]`) OR fold into `discord:members` |
| `discord_messages` | `messages.ts` | edit_message + delete_message | **YES — `discord:messages`** (`requiredDeps: ["channelId"]`) |
| `discord_roles` | `roles.ts` | assign_role | **YES — `discord:roles`** (`requiredDeps: ["guildId"]`) |
| `discord_commands` | `slash-commands.ts` | slash_command trigger | **DEFER** with the slash-command trigger itself. |
| `discord_categories` | `categories.ts` | (unsurfaced) channel-CRUD handlers | **DEFER** — only needed when category-CRUD actions port. |
| `discord_banned_users` | `banned-users.ts` | (unsurfaced) unban handler | **DEFER** — only needed when moderation actions port. |
| `discord_invites` | `invites.ts` | member_join trigger invite tracking | **DEFER** — only needed when the trigger arc resolves. |
| `discord_reactions` | `reactions.ts` | (unsurfaced) reaction handlers | **DEFER** |
| `discord_users` | `users.ts` | (admin/internal) | **DEFER** |
| `index.ts` | dispatcher | — | N/A |

**Six resolvers required for the action arc:** `discord:guilds`, `discord:channels`, `discord:members`, `discord:channel_members` (or merged), `discord:messages`, `discord:roles`. The `discord:messages` resolver is special: it has to filter to "messages our bot is allowed to edit/delete" — the V1 handler scopes to bot-authored messages for the edit-message picker and to recent-100 for the delete-message picker.

### 2.6 V1 specialized field type — `discord-rich-text`

V1's `send_message` / `edit_message` actions use a custom `discord-rich-text` field type with `supportsVariables: true`. The renderer at V1 `components/workflows/...` handles Discord-specific markdown (`**bold**`, `__underline__`, `<@user>`, `<#channel>`, `<:emoji:>`, slash mentions).

**V2 has no such FieldType.** [`contracts/actionMeta.ts:FieldTypeSchema`](../../../contracts/actionMeta.ts) enumerates: `text`, `textarea`, `select`, `combobox`, `keyvalue`, `number`, `boolean`, `file`, `cron`, `router-routes`, `string-array`, `file-array`. Discord rich-text would either (a) add a new `discord-rich-text` FieldType (cross-cutting builder slice), or (b) use `textarea` with description that documents the Discord markdown / mention syntax (V2 author edits raw markdown). **Recommendation: option (b) for V1 port parity; option (a) tracked as a future builder polish slice.**

---

## 3. Proposed V2 Discord surface (recommended scope for the runtime port + metadata arc)

Pure **V1 manifest port** (5 actions + 3 triggers — no expansion of the unsurfaced 18 handlers in this arc). Per-action field names below mirror V1 schemas verbatim; the port slice must preserve them under the same "no field-name normalization" rule that applied to Mailchimp.

### 3.1 Actions (5)

| Action | Required fields | Optional fields | Output shape (V1) | Resolver needs |
| --- | --- | --- | --- | --- |
| `discord:send_message` | `guildId`, `channelId`, `message` (rich-text / textarea per §2.6) | — | `{messageId, content, channelName, timestamp, success}` | `discord:guilds`, `discord:channels` (deps `guildId`) |
| `discord:edit_message` | `guildId`, `channelId`, `messageId`, `content` | — | `{messageId, content, channelId, timestamp, success}` | `discord:guilds`, `discord:channels` (deps `guildId`), `discord:messages` (deps `channelId`) |
| `discord:delete_message` | `guildId`, `channelId` | `messageIds[]`, `userIds[]`, `keywords[]`, `keywordMatchType` (enum: partial/whole/exact, default `"partial"`) | `{deletedCount, messageIds[], channelId, timestamp, success}` | `discord:guilds`, `discord:channels` (deps `guildId`), `discord:messages` (deps `channelId`), `discord:members` (deps `guildId`) |
| `discord:fetch_messages` | `guildId`, `channelId` | `limit` (default 20, max 100), `sortOrder` (newest/oldest, default newest), `filterType` (enum 9-value), `filterAuthor` (member combobox, conditional on filterType=author), `filterContent` (text, conditional on filterType=content), `caseSensitive` (boolean, conditional on filterType=content) | `{messages[], count, channelId, channelName, hasMore}` | `discord:guilds`, `discord:channels` (deps `guildId`), `discord:members` (deps `guildId`) |
| `discord:assign_role` | `guildId`, `userId`, `roleId` | — | `{success, guildId, userId, roleId, timestamp}` | `discord:guilds`, `discord:members` (deps `guildId`), `discord:roles` (deps `guildId`) |

**Field-name preservation warnings:**

- All 5 V1 actions use `guildId` + `channelId` (camelCase). The V2 port must mirror this verbatim — drift to `guild_id` / `channel_id` would silently break the runtime handler.
- `delete_message.messageIds` is **plural array** even though `edit_message.messageId` is **singular string** — this is the V1 convention and is load-bearing for the multi-select-vs-single-select renderer choice in the meta.
- `fetch_messages.filterAuthor` uses `discord:members` (server-wide), NOT `discord:channel_members` (channel-scoped). V1 chose this deliberately so authors can filter on a member who left the channel; the meta must follow.
- `assign_role.userId` (not `memberId`) — Discord API uses both terms interchangeably; V1 chose `userId`; the meta must follow.

### 3.2 Triggers (3 — gated on trigger-architecture decision in §2.3)

| Trigger | V1 activation | V2 port path | Recommended outcome |
| --- | --- | --- | --- |
| `discord:member_join` | WebSocket gateway `GUILD_MEMBER_ADD` event | No clean polling analog (members.list lacks join-time sort). Discord Application Webhooks do NOT cover this event. | **Defer** until trigger-architecture decision lands. |
| `discord:new_message` | WebSocket gateway `MESSAGE_CREATE` event | Polling: `GET /channels/{id}/messages?after=` works but loses sub-minute latency. | **Optional ship via polling** with snapshot-after-id; mark "near-real-time" instead of "real-time" in description. |
| `discord:slash_command` | WebSocket gateway `INTERACTION_CREATE` event (slash command response is HTTP-back) | Interactions endpoint URL can be set per-application — Discord POSTs to it. This is a **webhook-style** trigger and CAN work in V2. Adds complexity: command registration via `PUT /applications/{appId}/commands` at activate time. | **Optional ship via interactions endpoint** in a follow-on slice; requires Discord application config + `INTERACTIONS_PUBLIC_KEY` env. |

**Triggers are NOT planned for `DISCORD-2` (runtime port) or the action-metas arc.** They land in a separate `DISCORD-N-triggers` slice after the architecture decision.

### 3.3 Required OptionsSource resolvers

Six resolvers, sequenced before any action meta lands (resolver-first pattern, same as HubSpot / Mailchimp):

| Resolver key | `requiredDeps` | Endpoint | Notes |
| --- | --- | --- | --- |
| `discord:guilds` | (none) | `GET https://discord.com/api/v10/users/@me/guilds` against bot OR `GET /guilds/{id}` per cached install list — V1 caches `installed_guilds` per integration row. V2 should mirror. | Account-scoped picker for the bot's installed servers. |
| `discord:channels` | `["guildId"]` | `GET /guilds/{guildId}/channels` | Filter by `type=0` (GUILD_TEXT) + `type=15` (GUILD_FORUM) — most actions only make sense for text-shaped channels. `send_message` shouldn't list voice channels. |
| `discord:members` | `["guildId"]` | `GET /guilds/{guildId}/members?limit=1000` (or paginated) | Server-wide member list. Large servers need pagination; V1 caps at 1000. |
| `discord:channel_members` | `["channelId"]` | Computed from `GET /channels/{id}/messages?limit=100` distinct authors. Discord has no per-channel member endpoint for text channels. | V1 uses this for `new_message` trigger's authorFilter. **Optional** — `discord:members` can substitute at the cost of showing members who never posted in the channel. |
| `discord:messages` | `["channelId"]` | `GET /channels/{channelId}/messages?limit=100` | For `edit_message`: filter to messages where `author.id === bot.id`. For `delete_message`: no filter (bot can delete any message with `Manage Messages` permission). The resolver may need a `bot_only` query arg to distinguish, or two separate resolvers (`discord:bot_messages`, `discord:messages`). **Decision deferred to the action-metas slice.** |
| `discord:roles` | `["guildId"]` | `GET /guilds/{guildId}/roles` | Filter to roles the bot is allowed to assign (roles below the bot's own highest role in Discord's hierarchy). V1 leaves this filtering to runtime; the picker shows all roles. |

**Resolver dep names** are pinned to the V1 action schemas' field names (`guildId` / `channelId`) so the dep-cascade works without normalization. Per the Mailchimp `mailchimp:segments` decision, the dep name must match the consumer field name verbatim.

---

## 4. Risk classification proposal

Per user instruction: do NOT over-classify communication-platform actions. ChainReact owns API-action classification, confirmation requirements, intent, sensitive output handling. Discord owns delivery, permissions, moderation enforcement, API validation.

| Action | Risk | `isDestructive` | `requiresConfirmation` | Reason |
| --- | --- | --- | --- | --- |
| `discord:fetch_messages` | **low** | false | false | Pure read. Output exposes message bodies + author identifiers → `messages[]` marked sensitive. |
| `discord:send_message` | **medium** | false | false | Single message to a single channel. Can include `@everyone` / `@here` mentions which broadcast — flag in description, but the schema doesn't gate them (Discord's permissions do, on the bot's role). Not destructive; recoverable via `edit_message` / `delete_message`. |
| `discord:edit_message` | **medium** | false | false | Edit of bot's own message (Discord API restriction enforces this; bots cannot edit user messages). Reversible by another edit. |
| `discord:assign_role` | **medium** | false | false | Adds a role to a user. Reversible via the (unsurfaced V1) `remove_role` handler — recommend porting that one alongside in the actions arc so the inverse exists. May grant elevated permissions (admin role, mod role) — description must warn authors to scope the picker carefully. |
| `discord:delete_message` | **HIGH** + `isDestructive: true` + `requiresConfirmation: true` | true | true | **Irreversible** (Discord retains no per-channel undelete). Supports BULK delete via `messageIds[]` / `userIds[]` / `keywords[]` — up to 100 messages per call. Bulk-delete with keyword filter is the highest-impact destructive action in V1 Discord; the destructive-trio gate stops accidental wipes. `riskDescription` must mention bulk delete + irreversibility + the `keywordMatchType: "partial"` default (wide match radius). |

If the unsurfaced V1 handlers ever land (moderation: `kick_member`, `ban_member`, `unban_member`; channel CRUD: `delete_channel`, `delete_category`; role CRUD: `delete_role`), all of those are **HIGH + destructive + requiresConfirmation** — kicks/bans affect users' access; deleting a channel/role is irreversible. **Out of scope for the 5-action port** but pre-classified here so the future slice doesn't need to re-litigate.

### 4.1 Trigger risk (when triggers eventually ship)

| Trigger | Risk classification when it ships |
| --- | --- |
| `discord:new_message` | **low** for the trigger itself. Payload carries `content` + `authorName` → mark sensitive. |
| `discord:member_join` | **low** for the trigger itself. Payload carries invite-tracking metadata + member identity → mark `inviteCode`, `inviteUrl`, `inviterId`, `memberTag` sensitive. |
| `discord:slash_command` | **low** for the trigger itself. Payload carries user input (`options`) → mark `options` sensitive. The activation hook PERFORMS A WRITE (registers the slash command via `PUT /applications/.../commands`) — that side-effect is not configurable by the workflow, but the activation flow itself should be documented as "creates a real slash command in your Discord server". |

---

## 5. Sensitive output proposal

Per the suspicious-name structural guard at [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts), V2's heuristic flags `body` / `content` / `text` / `message` / `messages` / `users` / `email` / `to` etc. as suspicious-by-default. Discord outputs hit this set heavily.

### 5.1 Action outputs

| Action | Sensitive (must be marked) | Non-sensitive (opaque IDs / counts / structural) |
| --- | --- | --- |
| `discord:send_message` | `content` (echo of sent message body — could carry workflow-author-supplied PII via `{{variable}}` interpolation) | `messageId`, `channelName`, `timestamp`, `success` |
| `discord:edit_message` | `content` (echo of new content) | `messageId`, `channelId`, `timestamp`, `success` |
| `discord:delete_message` | — (output has no message bodies; only counts + IDs) | `deletedCount`, `messageIds`, `channelId`, `timestamp`, `success` |
| `discord:fetch_messages` | `messages[]` (whole array — per-row `content` + `author` + `attachments` + `mentions` — bulk PII collection; matches the `users` / `messages` suspicious-name pattern) | `count`, `channelId`, `channelName`, `hasMore` |
| `discord:assign_role` | `userId` (Discord user id — semi-public on Discord, but the EVENT of being assigned a specific role is privileged info) — recommend sensitive on `userId` | `success`, `guildId`, `roleId`, `timestamp` |

### 5.2 Trigger payloads (when triggers land)

| Trigger | Sensitive (must be marked) | Non-sensitive |
| --- | --- | --- |
| `discord:new_message` | `content`, `authorId`, `authorName`, `attachments`, `mentions` | `messageId`, `channelId`, `channelName`, `guildId`, `guildName`, `timestamp` |
| `discord:member_join` | `memberId`, `memberTag`, `memberUsername`, `memberDiscriminator`, `memberAvatar`, `inviteCode`, `inviteUrl`, `inviterId`, `inviterTag`, `inviteChannelId`, `inviteChannelName` | `guildId`, `guildName`, `joinedAt`, `inviteUses`, `inviteMaxUses`, `timestamp` |
| `discord:slash_command` | `userId`, `userName`, `options` (workflow-author-defined parameter values) | `commandName`, `channelId`, `channelName`, `guildId`, `guildName`, `timestamp` |

### 5.3 Defense-in-depth — no secret-shaped names

The bot token MUST NEVER appear as an output field, sensitive or not. The secret-name regression guard at `sensitive-output-coverage.test.ts:251` enforces `clientSecret` / `client_secret` / `secret` / `token` / `apiKey` / `accessToken` / `refreshToken` / `webhookSecret` are absent from every meta. V1 doesn't surface the bot token in any handler return; the V2 port must preserve that.

---

## 6. Proposed slice sequence

The Discord arc spans **4 slices minimum** because the runtime port is missing. Resolver-first + per-arc sub-registry pattern carries over from Mailchimp.

| Slice | Scope | Estimated commits | Coverage gain |
| --- | --- | --- | --- |
| **DISCORD-1** (this slice) | Audit + plan doc only. | 1 (this commit). | None — doc-only. |
| **DISCORD-2** (runtime port) | Port the 5 V1 actions: handlers (one file each), Zod schemas (one file each), shared API wrappers under `integrations/_shared/discord/api/`, `integrations/discord/manifest.ts`, OAuth route + bot-installation flow, handler registration in `services/execution/handlers/_registry.ts`. **NO triggers, NO metas, NO resolvers**. ~10–15 files. | 1 commit per action handler + 1 for manifest + 1 for OAuth = ~7 commits. | +5 action handlers in the execution registry. Discord NOT yet in `COVERED_PROVIDERS` (no metas + no triggers). |
| **DISCORD-3** (resolvers) | Add 6 options-source resolvers + tests. Mirrors `MAILCHIMP-2`. ~15 files. | 1 commit. | 6 resolvers; no provider-coverage flip. |
| **DISCORD-4** (action metas + COVERED flip-with-asterisk) | 5 ActionMeta files + sub-registry at `services/discovery/providers/discord.ts` + provider-route tests + targeted integration tests (`send_message`, `delete_message` destructive, `assign_role` cascade). Flip Discord into `COVERED_PROVIDERS` with a comment that triggers remain deferred. | 1 commit. | 5 actions covered; provider in COVERED. Trigger meta gap acknowledged in the coverage comment. |
| **DISCORD-N-triggers** (later, gated) | Resolve the trigger-architecture decision per §2.3; ship whichever of the 3 V1 triggers fit the chosen architecture (polling for `new_message`, interactions-webhook for `slash_command`, defer `member_join`). | Separate arc. | Trigger metas eventually. |

**Recommendation for the FIRST implementation slice:** `DISCORD-2` (runtime port — actions only). **Do NOT start with metadata.** Without runtime handlers the meta files would describe code that doesn't exist; the structural coverage test forbids that (every meta needs a matching registered handler).

---

## 7. V1 behavior — what to copy, what NOT to copy

### 7.1 Copy as-is

- **Field names** (`guildId`, `channelId`, `messageId`, `messageIds`, `userId`, `roleId`, `userIds`, `keywords`, `keywordMatchType`, `limit`, `sortOrder`, `filterType`, `filterAuthor`, `filterContent`, `caseSensitive`, `message`, `content`). Preserve 1:1 per the no-normalization rule.
- **Default values** that already exist in V1: `delete_message.keywordMatchType = "partial"`, `fetch_messages.limit = 20`, `fetch_messages.sortOrder = "newest"`, `fetch_messages.filterType = "none"`, `fetch_messages.caseSensitive = false`. These are deliberate UX defaults; do not regress per Q11.
- **Conditional field visibility** (`fetch_messages.filterAuthor` / `filterContent` / `caseSensitive` all `conditional: { field: "filterType", value: ... }`). V2's `FieldMeta` supports `dependsOn` but not arbitrary `conditional` — the port slice may need to widen `FieldMeta` to support it, OR expose all three conditionally-shown fields as always-visible with documentation. **Decision deferred to the meta slice.**
- **Bulk delete capabilities** in `delete_message` (`messageIds[] | userIds[] | keywords[]` filter union). This is the V1 design intent and should not be quietly removed in the port.

### 7.2 Do NOT copy

- **Monolithic action handler file.** V2 ports always split per-handler (one file per action). The 2075-line `lib/workflows/actions/discord.ts` becomes 5 files (one per action) plus shared API wrappers.
- **Persistent gateway socket.** [`lib/integrations/discordGateway.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/discordGateway.ts) (1565 lines) + [`lib/integrations/discordBotPresence.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/discordBotPresence.ts) (301 lines) do not survive the port. Trigger architecture is rebuilt from the V2-supported activation modes only.
- **V1 invite-tracking side-channel.** `discordInviteTracker.ts` (per V1 CLAUDE.md, deferred in V1's own V2-consolidation plan). Member-join trigger is deferred entirely; if it ever ships, the invite-tracking side-channel is REBUILT against V2's webhook contract, not lifted from V1.
- **The 18 unsurfaced handler exports** in `lib/workflows/actions/discord.ts`. They were never user-facing in V1; the V2 port should ship only the 5 manifest-declared actions. The unsurfaced handlers (moderation / channel CRUD / role CRUD / DMs / reactions) wait for product confirmation before porting.
- **`requiredScopes: ["bot"]` as a literal V1-shaped string.** V2's manifest uses `scopes: { required, optional, deprecated }`. The port maps "bot" to whatever Discord OAuth scopes the bot install actually grants (`bot` + `applications.commands`).
- **`discord-rich-text` custom FieldType.** V1's specialized renderer doesn't have a V2 equivalent and adding one is a builder-polish slice. Use `textarea` with a description that documents Discord markdown syntax (`**bold**`, `<@user>`, `<#channel>`).

---

## 8. Open product decisions before `DISCORD-2` starts

Three decisions must be made before any code lands:

### D-DC1 — Are triggers in scope for the Discord arc?

The Phase 1 audit named three exits: (a) actions only, (b) limited triggers via Application Webhooks (does not cover V1's 3 trigger types), (c) defer entirely. This audit recommends:

> **Ship actions arc first (`DISCORD-2` through `DISCORD-4`). Triggers in a follow-on slice gated on a separate trigger-architecture decision (`DISCORD-N-triggers`).** The trigger decision shouldn't block actions coverage — actions are independently useful (workflows that REACT to non-Discord events and POST to Discord work fine without triggers).

### D-DC2 — Which dynamic-resolver split does `discord:messages` take?

Two consumers with different filter needs:

- `edit_message` — picker must show ONLY messages the bot authored (Discord blocks editing other users' messages).
- `delete_message` — picker shows ALL recent messages (bot can delete any with `Manage Messages` permission).

Three options:

1. **One resolver `discord:messages` + query arg** (`bot_only=true|false`). Requires `OptionsResolverContext` to carry the query arg through to the resolver; current contract carries `q` for search but no arbitrary kwargs.
2. **Two resolvers** `discord:bot_messages` (for edit) + `discord:messages` (for delete). Clean separation but doubles the resolver count.
3. **One resolver, always return all** and let the runtime fail if the picker chose a non-bot message for edit. Bad UX.

**Recommended: option 2 (two resolvers).** Mirrors the HubSpot per-object resolver pattern (`hubspot:deal_pipelines` vs `hubspot:ticket_pipelines`) and keeps the runtime contract correct.

### D-DC3 — Does the Discord arc port the unsurfaced 18 handlers?

V1's `lib/workflows/actions/discord.ts` has 18 exported handlers (moderation, channel CRUD, role CRUD, DMs, reactions, etc.) that V1's manifest never exposed. Do they ship in the V2 port?

**Recommended: NO for the initial arc.** Port the 5 V1-manifest-declared actions only. Adding any of the 18 means making the destructive-trio classification call per-action (kick/ban/unban especially), the channel/role CRUD picker UX decisions, and the cross-cutting `discord_categories` / `discord_banned_users` resolvers. A clean 5-action ship is achievable; a 23-action ship is a Phase-level effort.

---

## 9. Out of scope for this slice

- Writing any Discord ActionMeta / TriggerMeta file.
- Writing any Discord OptionsSource resolver file.
- Writing any Discord runtime handler / schema / manifest.
- Writing any Discord OAuth callback / bot-installation flow.
- Adding `discord` to `COVERED_PROVIDERS`.
- Touching the discovery / handlers / options-source / triggers registries.
- Adding `discord` to the trigger-meta-activation-invariant test's `SHARED_INFRA_EXEMPT_KEYS`.
- Resolving D-DC1, D-DC2, or D-DC3 (decisions, not code).

---

## 10. Acceptance for this slice

This slice is doc-only. Acceptance criteria:

- This file (`docs/slices/phase-3/discord-metadata-plan.md`) committed.
- No other source / test / config files modified.
- Gates green: `tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`. No new jest assertions; structural tests untouched.
- Dirty parallel-work files (`app/page.tsx`, `docs/rules/database-security.md`, `features/workflows/WorkflowsList.tsx`, `PACKAGES.md`, `scripts/list-users.mjs`, `scripts/reset-user-password.mjs`) remain unstaged.

---

## 11. Recommended next slice

**`DISCORD-2` — Discord Runtime Port (Actions Only).** Per §6 + §7 + §8. Ports the 5 V1-manifest-declared action handlers + Zod schemas + shared API wrappers + manifest + OAuth route. Does NOT touch metas, resolvers, triggers, or the `COVERED_PROVIDERS` flip. Expected scope: ~10–15 files; ~7 commits if broken into sub-slices per action.
