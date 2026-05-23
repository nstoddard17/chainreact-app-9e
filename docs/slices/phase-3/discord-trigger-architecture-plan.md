# Discord Trigger Architecture — Decision + V2-Native Trigger Plan

**Slice:** 3.DISCORD-5 — doc-only.
**Predecessors:** [`./discord-metadata-plan.md`](./discord-metadata-plan.md) (DISCORD-1 audit) → DISCORD-2..4 (runtime + resolvers + metas + COVERED flip shipped).
**Branch:** `v2-provider-port-local`.
**Replaces the indefinite D-DC1 deferral** with an evidence-based per-trigger answer.

> **TL;DR — Final recommendation:**
>
> 1. **`discord:slash_command`** → **ship now** via Discord's Interactions Endpoint URL as a V2-native `webhook` trigger. This is the trigger most natively suited to V2's contract: pure HTTP, Ed25519 signature, no gateway dependency, per-guild command registration in `activate()`. Becomes **DISCORD-6**.
> 2. **`discord:new_message`** → **ship next** as a `polling` trigger over `GET /channels/{id}/messages?after={id}`. Honest about the latency tradeoff (3-5 minute polling cadence ≠ V1's gateway real-time). Acceptable for content-moderation / digest / archive use cases. Becomes **DISCORD-7**.
> 3. **`discord:member_join`** → **defer with a named blocker, not indefinitely.** Discord's REST `GET /guilds/{id}/members` sorts by user id, NOT join time — there is no reliable polling path. Lands when either (a) V2 adds gateway-worker infrastructure as a Phase-level slice, OR (b) Discord ships an outgoing webhook for `GUILD_MEMBER_ADD` (product roadmap, no current ETA). Tracked as **DISCORD-N-member-join** with the revisit condition above.
>
> This answer meets Marcus's provider-completeness standard: 2 of V1's 3 Discord triggers ship in V2 via native architectures; the third has a real, documented blocker rooted in Discord's own API surface — not an architecture-preference deferral.

---

## 1. V1 Discord trigger inventory + how each worked

V1's 3 user-facing Discord triggers are declared in [V1 `lib/workflows/nodes/providers/discord/index.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/discord/index.ts). All three depend on V1's single global Discord gateway connection at [V1 `lib/integrations/discordGateway.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/discordGateway.ts) (1565 lines).

### 1.1 `discord_trigger_member_join`

- **Discord event consumed:** Gateway opcode `GUILD_MEMBER_ADD` (V1 gateway lines 499 / 814-872).
- **Privileged intent required:** `GUILD_MEMBERS` (gated; requires Developer Portal opt-in).
- **Payload enrichment:** V1 maintains a per-guild invite cache (V1 gateway lines 1154-1178 — `initializeInviteCache` on READY; lines 764-809 — INVITE_CREATE / INVITE_DELETE updates). On member join, V1 fetches current invites, walks the cache to find the invite whose `uses` count incremented, and attaches `{inviteCode, inviteUrl, inviterId, inviteUses, inviteMaxUses, inviteChannelId, inviteChannelName}` to the payload.
- **Output:** 22 fields per V1 manifest (memberId, memberTag, joinedAt, plus the invite metadata block).
- **Activation:** **none per-workflow.** The gateway runs once globally; every workflow that has a `member_join` trigger receives every `GUILD_MEMBER_ADD` event the bot sees, with the dispatcher filtering by `guildId` at trigger-dispatch time.

### 1.2 `discord_trigger_new_message`

- **Discord event consumed:** Gateway opcode `MESSAGE_CREATE` (V1 gateway lines 496 / 554-591).
- **Privileged intent required:** `MESSAGE_CONTENT` (gated; the content field arrives empty without it).
- **Filtering:** V1 manifest config supports `contentFilter` (keyword list) and `authorFilter`; runtime filters the gateway event before dispatch (V1 lines 574: bots dropped; later steps apply per-trigger filters).
- **Output:** 11 fields (messageId, content, authorId, authorName, channelId, channelName, guildId, guildName, timestamp, attachments[], mentions[]).
- **Activation:** **none per-workflow** — same as `member_join`.

### 1.3 `discord_trigger_slash_command`

- **Discord event consumed:** Gateway opcode `INTERACTION_CREATE` in V1 (search of `lib/integrations/discordGateway.ts` confirms **no `INTERACTION_CREATE` case in the switch** — V1 actually relies on guild-specific command registration via `PUT /applications/{app_id}/guilds/{guild_id}/commands` and a separately-configured Interactions Endpoint URL outside the gateway). This is important: **slash commands in V1 are already HTTP-mediated** even though they sit alongside the gateway-only triggers in the manifest.
- **Output:** 9 fields (commandName, userId, userName, channelId, channelName, guildId, guildName, options, timestamp).
- **Activation:** V1 registers the slash command with Discord via REST per-guild when the workflow is activated (the registration is per-app + per-guild, not per-workflow — multiple workflows can listen for the same command).

### 1.4 Gateway operational cost (V1)

V1's gateway implementation runs as a side-effect of the Next.js process via [V1 `lib/startup/discordBot.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/startup/discordBot.ts):

- **Single long-lived WebSocket connection** per process (V1 line 294-309). Singleton; cannot scale horizontally.
- **Reconnect / resume / heartbeat infrastructure** (V1 lines 213-290 connection setup, 471-480 hello + identify, 546-549 resume, 1257-1269 heartbeat, 1310-1354 reconnect strategy with 5-attempt exponential backoff capped at 10 minutes).
- **No sharding.** Discord's documented threshold is 2500+ guilds per shard; bots crossing that ceiling MUST shard or Discord will refuse the IDENTIFY. V1 is not sharded — would break for large deployments.
- **A second, independent Discord client** at [V1 `lib/services/discordInviteTracker.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/services/discordInviteTracker.ts) (lines 96/437) maintains its own invite cache and its own gateway connection using the same bot token. Redundant with the primary gateway; the tracker's existence is a symptom of how invasive invite-tracking-via-deltas is.
- **Fatal close codes** (4004 token, 4010 invalid shard, 4011 sharding required, 4013/4014 disallowed intent) are detected and trigger persistent-reconnect disable (V1 lines 337-397).
- **Privileged intents** (`GUILD_MEMBERS`, `MESSAGE_CONTENT`, `GUILD_INVITES`) must be enabled in the Discord Developer Portal AND approved by Discord once the bot is verified (100+ guilds). Unapproved → 4014 close code, gateway refuses.
- **Health check at the 10-minute mark** (V1 lines 1375-1386) — if no gateway activity for 10 minutes, force a reconnect.

---

## 2. V2 trigger contract — what activation modes are available today

[`contracts/triggerMeta.ts:39-44`](../../../contracts/triggerMeta.ts) defines `TriggerActivationSchema`:

```typescript
export const TriggerActivationSchema = z.enum([
  "webhook",
  "polling",
  "manual",
  "scheduled",
]);
```

- **`webhook`** — provider creates a subscription resource at workflow activate-time (Stripe `webhookEndpoints.create`, GitHub repo webhook, etc.). Receive route at `app/api/webhooks/<provider>/route.ts` verifies signature and dispatches via `dispatchTriggerEvent`. **No long-running connection required.**
- **`polling`** — server-side cron polls per-workflow snapshots at a fixed cadence (Gmail `new_email` over `historyId`; Google Sheets `row_changed` over row hashes). Activation hook seeds an initial snapshot ([Gmail `new_attachment` activate.ts:23-38](../../../integrations/gmail/triggers/newAttachment/activate.ts)). Dedup is provider-keyed and per-event-id at [`integrations/gmail/triggers/newAttachment/dedup.ts`](../../../integrations/gmail/triggers/newAttachment/dedup.ts).
- **`manual`** — fired only by `POST /api/workflows/[id]/run-now`. Native triggers only.
- **`scheduled`** — server-side cron fires on a cron expression. Native trigger only (`scheduled_trigger`).

[`services/triggers/lifecycle.ts:47-103`](../../../services/triggers/lifecycle.ts) wires activation/deactivation through the per-trigger registries. The lifecycle service has NO fifth mode for "long-lived process consumes a gateway socket." Adding one is a Phase-level infrastructure change — a parallel queue + worker + reconnect manager + dispatch service.

**No structural test would prevent us from adding a fifth mode**, but doing so means:
- New activation hook signature.
- New worker / queue infrastructure (Redis BullMQ or similar; Vercel functions can't host long-running sockets).
- New deploy topology (Vercel serverless ≠ persistent-connection host; would need a separate Fly.io / Render / Railway worker).
- New observability surface (gateway health, reconnect storms, intent rejections).
- New billing / cost model (the worker runs 24/7 across all customers; single-tenant cost model).

That is exactly the "Phase-level infrastructure" cost the original D-DC1 deferral cited. The question DISCORD-5 must answer: is that cost necessary today, or can each V1 trigger be reasonably mapped onto V2's existing contract?

---

## 3. Option comparison — the four implementation paths

| Option | Latency | Cost to V2 | Reliability | Per-trigger fit |
| --- | --- | --- | --- | --- |
| **A. Persistent gateway worker** | Real-time (sub-second) | HIGH — new activation mode, new worker infra, new deploy topology, reconnect / sharding / heartbeat code, privileged-intent operator setup | High once stable; single point of failure | Required for `member_join` reliably. Required for `new_message` if real-time matters. Required for V1-fidelity invite tracking. |
| **B. Polling over Discord REST** | 3-5 minute cadence | LOW — fits V2's existing `polling` activation mode 1:1 (Gmail / Google Sheets template) | Reliable for cursor-pagination endpoints (`GET /channels/{id}/messages?after={id}`); UNRELIABLE for `GET /guilds/{id}/members` (sorts by user-id, not join-time) | Good for `new_message`. Cannot do `member_join` (no time-sorted endpoint). |
| **C. Interactions Endpoint URL (HTTP)** | <3 second response budget (Discord-enforced) | LOW-to-MEDIUM — new Ed25519 signature verification helper (one-off; ~50 lines), per-guild slash-command registration in `activate()`, `INTERACTIONS_PUBLIC_KEY` env. Fits V2's `webhook` activation mode 1:1 | High — Discord owns delivery / retry; signature is Ed25519 (not HMAC). | **Perfect fit for `slash_command`.** Cannot do `member_join` or `new_message` (those events aren't HTTP-delivered). |
| **D. Discord Application Webhooks / Event Webhooks** | Real-time (HTTP push) | LOW — fits V2's `webhook` mode | High | Covers ONLY Social SDK events + monetization (`ENTITLEMENT_CREATE`, etc.). Does **NOT** cover `MESSAGE_CREATE` or `GUILD_MEMBER_ADD` as of 2025 per Discord docs (verified by WebFetch on developers.discord.com). **Not a substitute for the V1 trigger set.** |

The matrix says: **`slash_command` fits C natively**, **`new_message` fits B with a real latency tradeoff**, and **`member_join` requires A** (or a later API change from Discord, which we cannot rely on as a plan).

---

## 4. Per-trigger recommendation

### 4.1 `discord:slash_command` — **SHIP NOW** (Option C)

**Architecture:** V2-native `webhook` trigger backed by Discord's Interactions Endpoint URL.

**Why it's the right fit:**
- Already HTTP in V1 — even V1 doesn't deliver slash commands via the gateway. The gateway dependency for this trigger has been mythological from the start.
- Discord's interactions architecture is pure HTTP: bot receives `POST` to a configured endpoint URL, must respond within 3 seconds with the interaction reply, signature is Ed25519 over `${timestamp}${rawBody}`.
- Fits V2's existing `webhook` mode without any new contract or runtime work.

**Runtime work required (DISCORD-6):**
1. New shared helper `integrations/_shared/discord/webhooks/signature.ts` — Ed25519 verification (use Node's `crypto.verify("ed25519", ...)` API; no external deps). ~50 lines.
2. New receive route `app/api/webhooks/discord/route.ts` — strict-direct-lookup via `?workflowId=X&nodeId=Y` query params (Stripe / GitHub pattern). PING/PONG handshake. Signature verify → dispatch.
3. New trigger module `integrations/discord/triggers/slashCommand/`:
   - `activate.ts` — `PUT /applications/{app_id}/guilds/{guild_id}/commands` to register the command for the configured guild.
   - `deactivate.ts` — `DELETE /applications/{app_id}/guilds/{guild_id}/commands/{cmd_id}` to remove it.
   - `index.ts` — `registerActivation` + `registerDeactivation`.
   - `normalize.ts` — extracts `commandName / userId / channelId / options` from Discord's `INTERACTION_CREATE` HTTP payload.
4. New env vars: `DISCORD_INTERACTIONS_PUBLIC_KEY` (per-app, found in Developer Portal).
5. New manifest scope addition: `applications.commands` (the OAuth scope authorizing slash-command registration in user-installed guilds; already implied by `bot` but documenting explicitly).

**Metadata work (DISCORD-6):**
- `integrations/discord/triggers/slashCommand/slashCommand.meta.ts`:
  - `activation: "webhook"`, `requiresIntegration: true`.
  - Fields: `guildId` (combobox → `discord:guilds`), `command` (text — the slash-command name authors register), `commandDescription` (optional text), `commandOptions` (keyvalue — option name → option type).
  - `payloadShape`: 9 fields from V1 manifest, with `userId` + `options` marked `sensitive` per the DISCORD-1 §5.2 audit.
- Register in `services/discovery/providers/discord.ts` → `DISCORD_TRIGGER_METAS`.
- Wire activation hook into the activation registry — the trigger-meta-activation-invariant test will then pass without a `SHARED_INFRA_EXEMPT_KEYS` entry.

**Tests (DISCORD-6):**
- Unit: signature verify (good / bad sig / replay-stale / malformed header), normalize (payload → TriggerEvent), activate (registers command, captures `command_id` in patch), deactivate (deletes command).
- Route: PING→PONG, valid interaction → dispatch, invalid signature → 401, unknown workflow → 200 ack, dispatch failure → 500.
- Discovery: trigger meta registered, sensitive flags pinned, activation hook found.

**Risks & tradeoffs:**
- Operator setup: `DISCORD_INTERACTIONS_PUBLIC_KEY` must be set per deploy, and the Interactions Endpoint URL must be configured in the Discord Developer Portal pointing at `{NEXT_PUBLIC_APP_URL}/api/webhooks/discord`. Same operator burden as Stripe webhooks — already documented.
- 3-second response budget — V2's dispatcher must `enqueueRun` without awaiting workflow execution. Existing webhook trigger pattern already does this (Stripe / GitHub return 200 immediately after enqueue).
- Slash commands are per-guild — workflows targeting a different guild need to re-activate to register against the new guild. Activation hook handles this cleanly because deactivate cleans up the prior registration first.

**Estimated cost:** ~12-15 files (shared helper, route, 4 trigger module files, meta, sub-registry update, ~6 tests). Comparable to a Stripe trigger slice.

### 4.2 `discord:new_message` — **SHIP NEXT** (Option B) with explicit latency disclosure

**Architecture:** V2-native `polling` trigger over `GET /channels/{id}/messages?after={lastSeenMessageId}`.

**Why it's the right fit (with caveats):**
- Discord's `GET /channels/{id}/messages` is cursor-paginated by message id; `after={id}` returns messages strictly newer than the cursor. Reliable for snapshot-based polling.
- Fits V2's existing `polling` activation mode 1:1 — clone the Gmail `new_email` pattern: seed `lastSeenMessageId` in `activate()`, poll every 5 minutes, advance snapshot.
- No long-running infrastructure; runs on the existing poll-triggers cron.

**The honest tradeoff:**
- V1 was real-time (gateway sub-second). V2 polling adds **3-5 minute latency** for new messages. Most real-time-feeling Discord use cases (chatbot replies, real-time mention notifications) will FEEL degraded.
- For NON-real-time use cases (content moderation digests, archival pipelines, "new message in #releases" → Slack mirror, scheduled engagement scoring), polling is fine.

**Runtime work required (DISCORD-7):**
1. `integrations/discord/triggers/newMessage/`:
   - `activate.ts` — fetch most-recent message in the configured channel (via `messagesList({channelId, limit: 1})`), store its id as `lastSeenMessageId`.
   - `poll.ts` — read snapshot, call `messagesList({channelId, after: lastSeenMessageId, limit: 100})`, filter system messages (mirrors `fetch_messages` action's `isUserVisibleMessage` helper), apply per-trigger `contentFilter` / `authorFilter` config, dispatch per-message TriggerEvents, advance snapshot to newest fetched id.
   - `dedup.ts` — per-`messageId` dedup (Discord message ids are globally unique snowflakes).
   - `index.ts` — `registerActivation` + polling registration.
2. Manifest scope addition: requires **MESSAGE_CONTENT privileged intent** at the bot level for the bot to receive non-empty `content` on messages it didn't author. **Operator setup burden:** enable MESSAGE_CONTENT in Developer Portal AND get Discord approval if bot is verified (100+ guilds).

**Metadata work (DISCORD-7):**
- `newMessage.meta.ts`:
  - `activation: "polling"`, `requiresIntegration: true`.
  - Fields: `guildId` + `channelId` (cascade via existing DISCORD-3 resolvers), `contentFilter` (string-array, optional), `authorFilter` (combobox → `discord:members`, deps `["guildId"]`, optional).
  - `payloadShape`: 11 fields per V1, with `content` + `authorName` + `attachments` + `mentions` flagged sensitive.
  - Description explicitly states "near real-time — polled every 5 minutes" so workflow authors set expectations correctly.

**Tests (DISCORD-7):** Mirror Gmail `new_email` test shape — activate seeds snapshot, poll returns new messages, dedup handles repeats, system-messages stripped, filters applied client-side, snapshot advances.

**Risks & tradeoffs:**
- **Rate limit headroom:** Discord allows ~50 requests/minute per channel under standard tier. A workflow polling 1 channel every 5 minutes = 12 requests/hour. A user with 10 workflows × 10 channels = 100 channels polled every 5 minutes = 1200 requests/hour total. Manageable for small deployments; needs review at scale.
- **Latency expectations** must be set in the meta description AND ideally in the builder UI as a chip ("Polled every 5 min").
- **MESSAGE_CONTENT intent** is a privileged-intent operator setup burden (carried into the missing-providers-status doc as a follow-up). For now, accept that `content` may arrive empty if the operator hasn't enabled the intent.

**Estimated cost:** ~8-10 files (4 trigger module files, meta, sub-registry update, ~4 tests). Comparable to a Gmail polling trigger slice.

### 4.3 `discord:member_join` — **DEFER** with named blocker (not indefinite)

**Why polling cannot work:**
- Discord's `GET /guilds/{id}/members?after={user_id}&limit=1000` sorts by **user id**, not join time. There is no `?after_joined_at=` parameter. Cursor-based polling cannot reliably detect "new members joined since T."
- Discord's audit log (`GET /guilds/{id}/audit-logs`) does not record member-join events (only role changes, kicks, bans, channel mods, etc.). Verified against Discord audit log action-type enum.
- Discord's Application Webhooks / Event Webhooks (Option D) covers **Social SDK + monetization only** as of 2025 (verified via WebFetch on developers.discord.com — `MESSAGE_CREATE` / `GUILD_MEMBER_ADD` are explicitly NOT in the supported event list). This may change in a future Discord API release; we cannot plan against it.
- The V1 invite-tracking enrichment (which invite was used) requires gateway `INVITE_CREATE` / `INVITE_DELETE` / `GUILD_MEMBER_ADD` events to maintain the delta-detection cache. None of these are HTTP-pollable in a useful way.

**The deferral is rooted in Discord's own API surface, not architectural preference.** No amount of V2-side cleverness produces a reliable member-join trigger today.

**Revisit conditions** (any one is sufficient):
1. V2 ships gateway-worker infrastructure (a Phase-level slice — not part of provider-completeness work). At that point, `member_join` ports under the same activation contract V1 used.
2. Discord adds `GUILD_MEMBER_ADD` to its Event Webhooks supported event list. We monitor [the Discord Webhook Events docs](https://docs.discord.com/developers/events/webhook-events) page; when it appears, `member_join` ships as a webhook trigger (Option D).
3. Discord adds a join-time-indexed REST endpoint (e.g. `?after_joined_at=`). Unlikely; no public roadmap signal.

**Tracked as:** `DISCORD-N-member-join` — explicitly NOT a "someday" deferral; it has the three named conditions above and either of (1) or (2) is on the realistic horizon.

---

## 5. Slice sequencing — next 2-3 commits

1. **DISCORD-6 (next)** — `discord:slash_command` via Interactions Endpoint URL. ~12-15 files. Adds the first Discord trigger meta + activation hook + receive route + Ed25519 signature helper. After landing: Discord has 5 actions + 1 trigger, still in `COVERED_PROVIDERS`, and the trigger-meta-activation-invariant test passes without exemption.
2. **DISCORD-7 (after)** — `discord:new_message` via REST polling. ~8-10 files. Reuses the existing poll-triggers cron + Gmail snapshot pattern. After landing: Discord has 5 actions + 2 triggers. Operator setup note for MESSAGE_CONTENT intent surfaces in `missing-providers-status.md`.
3. **DISCORD-N-member-join (gated, not next)** — defers until one of the §4.3 revisit conditions fires. Documented in `missing-providers-status.md`.

After DISCORD-7, the Discord provider arc is "actions + 2 of 3 V1 triggers + 1 blocked-at-Discord deferral." That meets the provider-completeness standard for what is achievable against Discord's current API surface.

---

## 6. Why this satisfies Marcus's "provider-completeness" standard

- We are **not** copying V1 blindly. V1's gateway-worker approach is genuinely high-cost and only NECESSARY for one of the three triggers.
- We are **not** rejecting V1 blindly. V1's slash-command flow is already HTTP and ports natively. V1's `new_message` is degraded (real-time → 5-min polling) but ships.
- The one trigger we defer (`member_join`) has a HARD architectural blocker (Discord's REST surface lacks join-time indexing) — not a "we don't feel like building it" deferral. The deferral has named revisit conditions, not an indefinite hand-wave.
- Two of three V1 triggers ship in V2 via V2-native architectures. Compared to D-DC1's "defer all three indefinitely," this is materially more complete and architecturally honest.

---

## 7. Out of scope for DISCORD-5

- Implementing any trigger meta, activation hook, or webhook route.
- Adding `INTERACTIONS_PUBLIC_KEY` env or `applications.commands` scope.
- Touching `services/discovery/providers/discord.ts` `DISCORD_TRIGGER_METAS` (still empty until DISCORD-6 lands).
- Modifying the trigger-meta-activation-invariant test exemption set (still no exemptions needed; this slice keeps Discord at zero registered trigger metas).
- Updating `missing-providers-status.md` operator-setup notes — those land in DISCORD-6 / DISCORD-7 alongside the actual work.

## 8. Acceptance for DISCORD-5

Doc-only slice. Acceptance criteria:

- This file (`docs/slices/phase-3/discord-trigger-architecture-plan.md`) committed.
- No other source / test / config files modified.
- Gates green: `tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`. Targeted jest not applicable (no source change).
- Dirty parallel-work files (`app/page.tsx`, `docs/rules/database-security.md`, `features/workflows/WorkflowsList.tsx`, `PACKAGES.md`, `scripts/list-users.mjs`, `scripts/reset-user-password.mjs`) remain unstaged.

## 9. Recommended next slice

**DISCORD-6 — Discord slash-command trigger (Interactions Endpoint URL).** Ships the highest-value, lowest-architectural-risk Discord trigger via V2's existing `webhook` activation contract. See §4.1 for the file inventory + test plan.
