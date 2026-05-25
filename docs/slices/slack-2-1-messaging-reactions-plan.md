# Slack 2.1 — Messaging + reactions plan

**Status:** Plan / not yet accepted. **Doc-only commit.** No implementation begins until Marcus accepts.
**Branch:** `v2-provider-port-local` (local-only).
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/slack/`](../../integrations/slack/) + [`services/triggers/`](../../services/triggers/).

This is the design + batch plan for the **first** Slack parity slice. It includes the **P-S2 per-trigger dispatcher filter contract** design (a platform gap surfaced by the audit) because P-S2 is required before any Slack trigger ports can ship cleanly. P-S1 (user-token storage) and P-S3 (file output contract) are NOT designed here — both are deferred to the slices that consume them.

---

## 1. Slack 2.1 scope

### What's in

- **Messaging actions** (V2-shape ports, no user-token features).
- **Reaction + pin actions** (bot-token only).
- **Block Kit action** (`postInteractiveBlocks`) — distinct schema from text-only `send_channel_message`.
- **Message + reaction triggers** with per-trigger filter logic (the P-S2 contract).
- **One narrow expansion** of V2's existing `send_channel_message`: optional `thread_ts` field for thread replies. No attachments, no Block Kit, no user-token.
- **Scope additions** required by the above.

### What's explicitly out

- **File actions** (`uploadFile`, `downloadFile`, `getFileInfo`) — Phase 2.3.
- **Channel CRUD / membership / metadata** (`createChannel`, `inviteUsersToChannel`, `setChannelTopic`, etc.) — Phase 2.2.
- **User-token-required actions** (`updateUserStatus`, `setUserPresence`, V1's `sendAsUser` flag) — gated by P-S1; deferred.
- **Channel-event triggers** (`channelCreated`, `memberJoinedChannel`, `memberLeftChannel`) — Phase 2.2.
- **File trigger** (`fileUploaded`) — Phase 2.3.
- **`userJoinedWorkspace` trigger** — gated by per-trigger scope-request design (open question per audit §14).
- **`addReminder`** — pending Slack API status check.
- **Net-new V2 actions/triggers absent in V1** — Marcus's prompt mentioned `send_ephemeral_message` (no V1 handler), `mention` / `app_mention` (no V1 schema), `message_changed` / `message_replied` (no V1 schema), `search_message` (no V1 handler). **All are out of scope** for parity per the master plan §1 ("port proven V1 behavior over inventing new behavior"). Tracked as follow-up backlog.

### Why this scope

- **Slack 2.1 is the highest-leverage gap** in the provider parity backlog (per Phase 2 master plan §3 priority 1). Messaging + reactions are the most-used Slack capabilities in workflow automation.
- **P-S2 must land first** — every Slack trigger port depends on per-trigger filter logic. Bundling the design + the first triggers that exercise it is cheaper than two separate slices.
- **Scope kept narrow** to keep the slice ~9 commits (per audit §11 estimate).

---

## 2. Slack 2.1 actions

13 new ports + 1 expansion = 14 action touches. All bot-token only. All use the existing `chatPostMessage`-style helper pattern in [`integrations/slack/api/`](../../integrations/slack/api/).

| # | V2 action key | V1 reference | Slack API endpoint | Required scope | New scope? |
|---|---|---|---|---|---|
| 0 | `send_channel_message` (expand) | `sendMessage.ts` | `chat.postMessage` | `chat:write` | — (already present) |
| 1 | `send_direct_message` | `sendDirectMessage.ts` | `conversations.open` → `chat.postMessage` | `chat:write` + `im:write` | `im:write` NEW |
| 2 | `update_message` | `updateMessage.ts` | `chat.update` | `chat:write` | — |
| 3 | `delete_message` | `deleteMessage.ts` | `chat.delete` | `chat:write` | — |
| 4 | `get_messages` | `getMessages.ts` | `conversations.history` | `channels:history` (or `groups:history` etc. per channel kind) | — for public; private deferred to 2.2 |
| 5 | `get_thread_messages` | `getThreadMessages.ts` | `conversations.replies` | same as `get_messages` | — |
| 6 | `schedule_message` | `scheduleMessage.ts` | `chat.scheduleMessage` | `chat:write` | — |
| 7 | `cancel_scheduled_message` | `cancelScheduledMessage.ts` | `chat.deleteScheduledMessage` | `chat:write` | — |
| 8 | `list_scheduled_messages` | `listScheduledMessages.ts` | `chat.scheduledMessages.list` | `chat:write` | — |
| 9 | `add_reaction` | `addReaction.ts` | `reactions.add` | `reactions:write` | `reactions:write` NEW |
| 10 | `remove_reaction` | `removeReaction.ts` | `reactions.remove` | `reactions:write` | — (covered by #9) |
| 11 | `pin_message` | `pinMessage.ts` | `pins.add` | `pins:write` | `pins:write` NEW |
| 12 | `unpin_message` | `unpinMessage.ts` | `pins.remove` | `pins:write` | — (covered by #11) |
| 13 | `post_interactive_blocks` | `postInteractiveBlocks.ts` | `chat.postMessage` (with `blocks`) | `chat:write` | — |

### Action-by-action notes

- **#0 `send_channel_message` expansion** — single backwards-compatible field addition: optional `thread_ts` to post as a thread reply. Slack's `chat.postMessage` accepts `thread_ts` natively. No attachment handling (Phase 2.3 / P-S3 design). No `blocks` (use `post_interactive_blocks` instead). No `sendAsUser` (P-S1 deferred).
- **#1 `send_direct_message`** — two-step: `conversations.open` to resolve DM channel id from user id, then `chat.postMessage`. Idempotency: same user → same DM channel id; the open call is safe to repeat.
- **#4 `get_messages`** — reads from `channels:history` only in 2.1. Reading from private channels / DMs / mpim deferred to Slack 2.2 (which adds `groups:history`) and Slack 2.3 implicitly via the channel-CRUD parity work. Document the limitation in the action description.
- **#9–10 reactions** — `reactions.add` / `reactions.remove` need both message timestamp AND channel id to identify the message.
- **#11–12 pins** — same identifier shape as reactions.
- **#13 `post_interactive_blocks`** — distinct schema. `blocks` is required; `text` is the optional fallback (Slack uses it for notification previews when the client can't render blocks). V2 schema enforces JSON Block Kit structure validity at the boundary (Zod).

### Cross-cutting

- All handlers use [`getActiveForExecution(userId, "slack", accountId)`](../../repositories/integrations.ts) for token lookup.
- All handlers use [`decryptToken`](../../core/encryption/tokens.ts).
- All handlers wrap the API call in a `SlackApiError` shape consistent with [`api/chatPostMessage.ts`](../../integrations/slack/api/chatPostMessage.ts) — preserves Slack's error code (`channel_not_found`, `not_in_channel`, etc.) for the engine's error humanizer.
- No 401-refresh wrapper needed — Slack v2 default tokens don't refresh; `RefreshNotSupportedError` from oauth.ts handles the case.
- All handlers honor V2's strict pre-resolution rule (config arrives concrete; handlers parse against per-action Zod schema as defense-in-depth).
- Idempotency: `send_channel_message`, `send_direct_message`, `post_interactive_blocks`, `schedule_message`, `add_reaction`, `pin_message` are write actions and must be wrapped via the engine boundary's `checkReplay`/`recordFired` (Q4 contract) once V2 wires that layer. Within-Slice 2.1 idempotency is best-effort — if engine boundary doesn't yet do it, document the gap and don't add per-handler hacks.

---

## 3. Slack 2.1 triggers

5 trigger types, all delivered through V2's existing single Slack webhook endpoint (Slack Events API workspace-wide model). Each gets:

- A per-trigger config schema (new — this is the P-S2 contract).
- A canonical eventType string emitted by the normalizer.
- A filter function registered in the Slack provider directory.

| # | V2 trigger key | Canonical eventType | Slack `event.type` | Filter axes |
|---|---|---|---|---|
| 1 | `slack_new_message_channel` | `slack.message.channel` | `message` (`channel_type=channel`) | optional channel id (`C…`) |
| 2 | `slack_new_direct_message` | `slack.message.im` | `message` (`channel_type=im`) | optional user id (`U…`) (filters who-the-DM-is-with) |
| 3 | `slack_new_group_direct_message` | `slack.message.mpim` | `message` (`channel_type=mpim`) | optional channel id (`G…`) |
| 4 | `slack_reaction_added` | `slack.reaction_added` | `reaction_added` | optional reaction emoji (`:+1:`), optional channel id |
| 5 | `slack_reaction_removed` | `slack.reaction_removed` | `reaction_removed` | optional reaction emoji, optional channel id |

### Normalization changes

V2's current [`integrations/slack/webhooks/normalize.ts:42`](../../integrations/slack/webhooks/normalize.ts#L42) emits `eventType = payload.event.type` directly (e.g. `"message"`, `"reaction_added"`). For per-trigger filtering to produce a clean `(provider, eventType)` index lookup, normalize.ts will:

- For `event.type === "message"`, branch on `event.channel_type` and emit `slack.message.{channel,im,mpim}`. Mirror V1's normalizer logic at [normalizer.ts:170-189](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/normalizer.ts#L170) — channel_type is authoritative when present; fall back to channel-id-prefix only when missing.
- For `event.type === "reaction_added"` and `"reaction_removed"`, emit `slack.{reaction_added,reaction_removed}` (canonical-namespaced).
- For all other event types in 2.1's scope, emit `slack.<event.type>`. Out-of-scope event types: emit `slack.<event.type>` but no filter is registered, so dispatcher will find zero matching trigger_resources rows and silently drop. This is intentional — extensibility for Phase 2.2/2.3 doesn't require code changes here.

The canonical eventType naming convention `slack.<domain>` is a deliberate change from the existing pass-through. Documented in this slice's CLAUDE.md update.

### Subtype handling

V1's normalizer treats `message.subtype === "message_deleted"` as a separate canonical eventType (`slack_trigger_message_deleted`) but ships no schema (audit S-R8 dead emit). **V2 will NOT emit `slack.message.deleted`** in 2.1 — out of parity scope. If a `message` event has a `subtype`, V2 still emits `slack.message.{channel,im,mpim}` based on `channel_type` and includes the subtype inside `payload`; filters that care about subtype can inspect it.

Same rule applies to `subtype === "message_changed"`: included in `payload` but no separate canonical eventType, no separate trigger.

---

## 4. P-S2 per-trigger dispatcher filter design

This is the heart of Slack 2.1. Designed to be **provider-generic** so other providers can adopt it later, **Slack-honest** so Slack's filtering shape isn't crammed into a too-abstract interface.

### 4.1 Where filtering occurs

In [`services/triggers/dispatch.ts`](../../services/triggers/dispatch.ts), **between step 2 (`listForDispatch`) and step 3 (`enqueueRun`)**. New step 2.5: for each candidate `trigger_resources` row, call the registered filter for `(provider, eventType)`. If filter returns `false`, drop the row with a structured log. If no filter is registered for the (provider, eventType), default to `match` (preserves current behavior — no regression for providers that haven't opted into filtering yet).

Pseudo-code:

```ts
for (const resource of resources) {
  const state = await getStateForDispatch(resource.workflowId);
  if (state !== "active") {
    log("dispatch.dropped_inactive", ...);
    continue;
  }
  const filter = triggerFilterRegistry.get(event.provider, event.eventType);
  if (filter) {
    let matchResult: FilterResult;
    try {
      matchResult = filter.evaluate(event, resource.config);
    } catch (err) {
      log("dispatch.filter_error", { provider, eventType, workflowId, err });
      // Fail closed: do NOT enqueue when the filter throws.
      continue;
    }
    if (matchResult.kind === "no-match") {
      log("dispatch.dropped_filtered", { provider, eventType, workflowId, reason: matchResult.reason });
      continue;
    }
  }
  await enqueueRun({ workflowId, triggerNodeId: resource.nodeId, event });
  enqueued += 1;
}
```

### 4.2 Filter contract

```ts
// core/triggers/filterContract.ts (new file)

export type FilterResult =
  | { kind: "match" }
  | { kind: "no-match"; reason: string };

export interface TriggerFilter<TConfig = unknown> {
  /** Provider + eventType this filter applies to. */
  readonly provider: string;
  readonly eventType: string;
  /** Validate the persisted config shape; throw on schema mismatch. */
  parseConfig(rawConfig: unknown): TConfig;
  /** Pure function: given the event and parsed config, decide. */
  evaluate(event: TriggerEvent, parsedConfig: TConfig): FilterResult;
}
```

### 4.3 How configs are represented

**Persisted in [`trigger_resources.config`](../../repositories/triggerResources.ts) JSONB column** — already exists, no migration needed. The contract per provider/event type defines the shape; the repository stores whatever JSONB the lifecycle hook persisted.

Slack 2.1 config shapes (Zod-validated at filter boundary):

```ts
// integrations/slack/triggers/newMessageChannel/filter.ts
const NewMessageChannelConfig = z.object({
  channelId: z.string().regex(/^C[A-Z0-9]+$/).optional(),
});

// integrations/slack/triggers/newDirectMessage/filter.ts
const NewDirectMessageConfig = z.object({
  withUserId: z.string().regex(/^U[A-Z0-9]+$/).optional(),
});

// integrations/slack/triggers/reactionAdded/filter.ts
const ReactionAddedConfig = z.object({
  reactionEmoji: z.string().min(1).optional(),  // e.g. "+1" or ":+1:"
  channelId: z.string().regex(/^C[A-Z0-9]+$/).optional(),
});
```

All filter axes are optional. Empty config → match-all (filter returns `match` for every event of that type — equivalent to no filter).

### 4.4 Matching semantics

Per filter — pure function on (event payload, parsed config). Slack 2.1 semantics:

- **`new_message_channel`:** if `config.channelId` is present, return `match` only when `event.payload.channel === config.channelId`. Otherwise `match`.
- **`new_direct_message`:** if `config.withUserId` is present, return `match` only when `event.payload.user === config.withUserId`. (DM events fire when ANY user sends a DM to the bot's authed user; this filter narrows to a specific sender.) Otherwise `match`.
- **`new_group_direct_message`:** if `config.channelId` is present, match only when `event.payload.channel === config.channelId`. Otherwise `match`.
- **`reaction_added` / `reaction_removed`:** if `config.reactionEmoji` is present, normalize both sides (strip leading/trailing `:`, lowercase) and match. If `config.channelId` is present, match `event.payload.item.channel === config.channelId`. Both axes are AND-combined.

### 4.5 Unmatched events

When dispatcher's filter returns `no-match`:

1. Structured debug log: `webhook.dispatch.dropped_filtered` with `{provider, eventType, workflowId, reason}`.
2. The dedup row is already marked `seen` (dedup runs before filter — by design; see §4.7).
3. The event is NOT retried, NOT enqueued, NOT raised as an error. Silent drop.
4. Other workflows registered for the same (provider, eventType) with different configs are evaluated independently — one workflow's no-match doesn't affect the others.

### 4.6 Filter-throwing behavior

Filter throws (e.g. `parseConfig` fails because someone hand-edited the config to invalid shape):

1. Structured warn log: `webhook.dispatch.filter_error` with `{provider, eventType, workflowId, error}`.
2. **Fail closed.** Workflow does NOT enqueue. This matches the master plan principle: prefer silent skip on broken config over wrong-fire on potentially-malicious or corrupt data.
3. No retry. Operator must fix the config (or the lifecycle deactivate-and-reactivate the trigger).
4. Future: surface as a workflow-level health signal (out of scope for 2.1).

### 4.7 Dedup interaction

Dedup runs in step 1 of dispatch.ts on `(provider, eventId)` BEFORE per-row filtering. This means:

- One Slack `event_callback` is dedup-marked exactly once regardless of how many subscribed workflows match or filter out.
- A second delivery of the same `event_id` (Slack retry) finds dedup and exits early. No filters run on retry. No enqueue.
- This is correct: Slack's retry semantics guarantee the body is identical, so the second attempt would have produced the same per-workflow filter outcomes.
- Edge case: if a workflow's filter config changes between the first delivery and a Slack retry, the retry won't re-evaluate filters (dedup short-circuits). This is acceptable — Slack retries are at-least-once delivery for unacknowledged events; once V2 acks (200) the first time, the retry is a duplicate by definition.

### 4.8 Provider-specific filter, generic contract

The `TriggerFilter` contract lives in [`core/triggers/`](../../core/triggers/) — provider-agnostic shape. Each provider directory ([`integrations/slack/triggers/<eventType>/filter.ts`](../../integrations/slack/triggers/)) implements the contract for its event types and registers via a single `slackTriggerFilters` array exported from [`integrations/slack/triggers/index.ts`](../../integrations/slack/triggers/) — mirrors the existing `slackOAuth` / `slackManifest` export pattern.

Registration happens at boot via the integration registry ([`integrations/_registry.ts`](../../integrations/_registry.ts)) — same place every other provider is wired in. New optional manifest field: `triggerFilters?: readonly TriggerFilter[]`.

### 4.9 Other providers' filters

This contract works for any provider whose events fan out across many workflows where each workflow filters on different criteria:
- **GitHub** webhooks: filter by repo / branch / event sub-action. Today V2 emits `github.<event>` and dispatches; per-trigger filter would let the same `push` event route to multiple workflows on different repos.
- **Stripe** webhooks: filter by event sub-type (`invoice.payment_succeeded` already eventType-scoped, but customer/account filters are real).
- **Notion** (when ported): filter by database / page.

None of these need to ship in Slack 2.1. The contract is forward-compatible; opt-in per provider as parity audits identify the need.

### 4.10 Out of scope for P-S2

- **Field selectors / projection** (e.g. "trigger only when `message.text` contains 'urgent'"). That's a workflow-level filter, not a trigger-level one. V2's existing condition-node pattern handles it.
- **Cross-trigger rate limiting / debouncing.** Different problem space (V2's engine queue handles back-pressure).
- **Filter authoring UI.** Workflow builder wires fields → trigger config; UI is Phase 3.
- **Filter eval observability.** Logs are emitted (§4.5/4.6) but no metrics/dashboard. Phase 8 work.

---

## 5. P-S2 changes to shared trigger contracts

### Required

- **New file:** `core/triggers/filterContract.ts` defining `TriggerFilter` interface + `FilterResult` type.
- **New file:** `core/triggers/filterRegistry.ts` (in-memory map keyed on `${provider}:${eventType}`; populated at boot).
- **Modified:** [`services/triggers/dispatch.ts`](../../services/triggers/dispatch.ts) — insert filter step between `listForDispatch` and `enqueueRun` per §4.1 pseudocode.
- **Modified:** [`integrations/_registry.ts`](../../integrations/_registry.ts) — register `slackTriggerFilters` (and any future provider's) on boot.
- **Modified:** [`integrations/slack/webhooks/normalize.ts`](../../integrations/slack/webhooks/normalize.ts) — emit `slack.<domain>` canonical eventTypes per §3.

### NOT required

- **No** changes to `TriggerEvent` shape. Filters consume the existing canonical event.
- **No** changes to `trigger_resources` table or its JSONB column. `config` already holds arbitrary JSON.
- **No** migration. Existing Slack trigger_resources rows (if any) for the old `eventType="message"` will silently fail to match the new `slack.message.{channel,im,mpim}` lookup — but Slack 2.1 assumes no such rows exist (V2 hasn't shipped Slack triggers as workflow-buildable entries; the catch-all `event_callback` handling in [`webhooks/receive.ts`](../../integrations/slack/webhooks/receive.ts) was wiring-only).
- **No** changes to per-provider receive routes. Filters slot into the dispatcher; the receive route still calls `dispatchTriggerEvent(event)` once per event.

### Backwards compatibility

- Providers without registered filters: dispatcher's "if filter, evaluate; else match" path means no behavior change. Excel / Google Drive / etc. continue working.
- Workflows registered before P-S2 lands: none exist for Slack triggers. For other providers, `trigger_resources.config` is whatever the provider stored (e.g. `{ pollingEnabled: true }` for Excel) and filters aren't registered, so the dispatcher's `match` default applies.
- Future filter additions per provider: incremental; each registration is its own commit and can't break uncovered providers.

---

## 6. P-S2 testing

### Unit tests

- **Filter contract** (`core/triggers/filterContract.test.ts`): no behavior to test — type-only file. Skip.
- **Filter registry** (`core/triggers/filterRegistry.test.ts`): register / lookup / collision-safety (registering twice for same `(provider, eventType)` should throw).
- **Per-trigger filter** (`integrations/slack/triggers/<eventType>/filter.test.ts`): one test file per filter. Test:
  - Empty config → match every event.
  - Specific filter axis present + event matches → match.
  - Specific filter axis present + event mismatches → no-match (with reason populated).
  - Multiple filter axes (reactions only) — AND combination.
  - Invalid config (Zod validation failure) → throws.
  - Edge cases: missing payload fields, unexpected payload shape (filter returns no-match, not throws).
- **Slack normalizer** (`integrations/slack/webhooks/normalize.test.ts`): extend existing tests with the new canonical eventType emissions per §3 (3 message subtypes, 2 reaction event types).

### Integration tests

- **Dispatcher with filters** (`services/triggers/dispatch.test.ts`): extend existing tests with:
  - 3 trigger_resources rows for `(slack, slack.message.channel)`, each with different `channelId` configs. One incoming event matching channel `C123`. Expect: 1 enqueue (the matching row), 2 dropped-filtered logs, 0 errors.
  - 1 trigger_resources row with broken config → 0 enqueues, 1 filter_error log.
  - Workflow inactive + filter would match → still dropped on inactive (filter doesn't even run).
  - Dedup duplicate → returns early; no filter calls (assertion: filter mock not invoked).

### E2e

- Extend [`tests/e2e/slice-1-slack-walkthrough.spec.ts`](../../tests/e2e/slice-1-slack-walkthrough.spec.ts):
  - Add a workflow with `slack_new_message_channel` trigger configured for a specific channel id.
  - POST a Slack `event_callback` for that channel id → workflow runs.
  - POST a second Slack `event_callback` for a different channel id → workflow does NOT run; assert via run-history check.
  - Add a second workflow with no channel filter → both events fire it.

### What testing does NOT cover in 2.1

- Per-provider load testing (Phase 8).
- Filter-error alerting (no metrics surface yet).
- UI for filter config (Phase 3).

---

## 7. Slack scopes for Slack 2.1

### Required (added to [`integrations/slack/manifest.ts`](../../integrations/slack/manifest.ts))

- `chat:write` — already present; covers all message-write actions.
- `channels:history` — already present; covers `get_messages` / `get_thread_messages` for public channels.
- `channels:read` — already present.
- `im:write` — **NEW** — required for `send_direct_message` (`conversations.open`).
- `im:history` — **NEW** — required for `slack_new_direct_message` trigger to receive DM events.
- `mpim:history` — **NEW** — required for `slack_new_group_direct_message` trigger.
- `reactions:read` — **NEW** — required for `slack_reaction_added` / `_removed` triggers.
- `reactions:write` — **NEW** — required for `add_reaction` / `remove_reaction` actions.
- `pins:write` — **NEW** — required for `pin_message` / `unpin_message` actions.

**Total new required scopes: 6** (im:write, im:history, mpim:history, reactions:read, reactions:write, pins:write).

### Optional (added to manifest)

- `users:read` — already optional; keep optional. Used by future user-info actions but not by 2.1.
- `chat:write.public` — **NEW optional** per Marcus's call. Lets the bot post to public channels it hasn't joined. Document the trade-off: more permissive in workspaces that grant it; bot can spam public channels. Default: not requested.

### Deferred (NOT added in 2.1)

- `groups:history` — needed for reading from private channels. Defer to Slack 2.2 when channel-CRUD work brings private channel handling.
- `groups:write` — channel-management; Slack 2.2.
- `channels:join`, `channels:manage` — channel-CRUD; Slack 2.2.
- `files:read`, `files:write` — Slack 2.3.
- `team:read` — used by V1's `updateSlackProviderPlan` (S-R7 V1-specific feature); skip indefinitely.
- `users:read.email` — V1 uses for `findUser` (orphan / dead-code); skip indefinitely.
- `users:write` / `users.profile:write` — gated by P-S1; deferred.
- Anything for `userJoinedWorkspace` trigger — gated by per-trigger scope-request design (audit open question).

### Honesty rule

The manifest's `webhookTrigger: true` already-true flag stays honest in 2.1: the wiring exists, and 2.1 adds 5 actually-buildable trigger types. No new capability flag changes needed.

---

## 8. V1 rot to fix in Slack 2.1

From audit §8 — Slack 2.1 takes ownership of these rot rows:

- **S-R3 (R8) — silent webhook signature bypass.** Already fixed in V2 (`webhooks/receive.ts:50-58` throws strictly). 2.1 must not regress; the existing test [`tests/unit/integrations/slack/webhooks/receive.test.ts`](../../tests/unit/integrations/slack/webhooks/receive.test.ts) covers it. **Action: verify regression coverage.**
- **S-R4 (R2) — dual implementation `sendSlackMessage` function vs `SlackService` class in V1.** V2 already has one helper module (`api/chatPostMessage.ts`). 2.1 ports new actions into the same single-helper-module pattern (`api/chatUpdate.ts`, `api/conversationsOpen.ts`, etc.). **Action: enforce one helper file per Slack API endpoint; no provider-classes.**
- **S-R5 (R10) — inconsistent ActionResult shape.** V2's `SlackApiError` preserves Slack error code uniformly. 2.1 ports use the same error class for every new handler. **Action: per-handler grep for `SlackApiError` usage in code review.**
- **S-R8 — dead `slack_trigger_message_deleted` emit.** V1 normalizer emits it but no schema. V2 normalize.ts in 2.1 explicitly does NOT emit a `slack.message.deleted` canonical eventType. Subtype info is preserved in payload. **Action: assert in normalizer test that no `slack.message.deleted` eventType is emitted.**
- **S-R9 (R11) — workspace-wide trigger lifecycle is correct for Slack.** V2 documents this in the manifest comment; 2.1 doesn't change the model. **Action: add a short normalizer comment confirming the Events API workspace-wide model is intentional, not a missing per-workflow lifecycle.**
- **S-R10 — `chat:write.public` trade-off.** Per Marcus's call: include in optional scopes per §7. Document trade-off in manifest comment. **Action: comment block on the optional scope explaining the trade-off.**

Not in scope for 2.1 (handled in later Slack slices):
- S-R1 (orphan `findUser`) — skip permanently per audit.
- S-R2 (divergent V1 scope lists) — V2 already has one source of truth in manifest; 2.1 just adds to it.
- S-R6 (Supabase-coupled `uploadFile`) — Slack 2.3.
- S-R7 (`updateSlackProviderPlan`) — skip indefinitely.

---

## 9. Implementation batch plan

10 commits total. All under branch `v2-provider-port-local`. Each commit gates pass before next starts.

| # | Commit | What lands |
|---|---|---|
| 1 | (this doc) | `docs: add Slack 2.1 messaging and reactions plan` |
| 2 | `feat(triggers): add per-trigger filter contract (P-S2)` | `core/triggers/filterContract.ts` + `core/triggers/filterRegistry.ts` + dispatcher integration in `services/triggers/dispatch.ts` + tests. **No Slack-specific filters yet** — generic infrastructure only. |
| 3 | `feat(slack): emit per-trigger canonical eventTypes` | Update `integrations/slack/webhooks/normalize.ts` per §3. Update tests. No new triggers buildable yet (no filters registered). |
| 4 | `feat(slack): port message lifecycle actions (5)` | `send_direct_message`, `update_message`, `delete_message`, `get_messages`, `get_thread_messages`. Includes `send_channel_message` `thread_ts` expansion. Adds `im:write` scope. Tests per action. |
| 5 | `feat(slack): port scheduled message actions (3)` | `schedule_message`, `cancel_scheduled_message`, `list_scheduled_messages`. Tests per action. |
| 6 | `feat(slack): port reactions + pins (4)` | `add_reaction`, `remove_reaction`, `pin_message`, `unpin_message`. Adds `reactions:write` + `pins:write` scopes. Tests per action. |
| 7 | `feat(slack): port post_interactive_blocks` | Block Kit action with Zod-validated `blocks` schema. Tests. |
| 8 | `feat(slack): register message + reaction trigger filters` | 5 filter implementations under `integrations/slack/triggers/<eventType>/filter.ts` + index. Adds `im:history`, `mpim:history`, `reactions:read` scopes. Adds `chat:write.public` as optional. Tests per filter. |
| 9 | `test(e2e): extend Slack walkthrough with 2.1 surface` | Per §6 e2e additions. |
| 10 | `docs(claude): document P-S2 contract + Slack 2.1 outcomes` | CLAUDE.md update at the V2 root + master plan §5 rot catalog append (if any new patterns surfaced). |

**Estimate sanity check.** 10 commits is +1 over the audit's ~9-commit estimate; the +1 is the dedicated commit for normalizer canonical-eventType change (#3). Acceptable.

### Gates per commit

Every commit:
```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

E2e gate runs only on commits #2, #8, #9, #10 (commits that affect runtime behavior the e2e covers). Doc-only commits (#1, #10) skip e2e by master-plan convention.

### Rollback per commit

- Commits #1, #3, #10 are doc / pure-infrastructure / pure-doc — trivial rollback.
- Commits #2 (P-S2 contract) — rollback safe; no DB state, no runtime callers register filters, dispatcher's "no filter → match" preserves pre-PR behavior.
- Commits #4–7 (action ports) — rollback removes the manifest entries; no schema migration to revert.
- Commit #8 (trigger filters) — rollback removes manifest registration; trigger_resources rows persisted under the old eventType `message` would no longer match (but no such workflows exist; see §5 backwards compatibility note).

---

## 10. Exit checklist

This plan is accepted (and Slack 2.1 implementation can begin) when Marcus has:

- [ ] Read sections 1–9.
- [ ] Confirmed the **action list** (§2) — 13 ports + 1 expansion = 14 action touches; no `send_ephemeral_message`, no `search_message`.
- [ ] Confirmed the **trigger list** (§3) — 5 triggers; no `app_mention`, no `message_changed`, no `slack_trigger_message_deleted`.
- [ ] Confirmed the **canonical eventType naming** (§3) — `slack.<domain>` namespace (e.g. `slack.message.channel`, `slack.reaction_added`).
- [ ] Confirmed the **P-S2 design** (§4) — filter contract, dispatcher placement, fail-closed on filter throw, dedup-before-filter ordering.
- [ ] Confirmed **P-S2 changes to shared contracts** (§5) — new files in `core/triggers/`, dispatcher modification, no migration, no `TriggerEvent` change.
- [ ] Confirmed the **scope additions** (§7): 6 new required scopes + 1 new optional (`chat:write.public`); no `users:read` promotion; no `groups:*`, `files:*`, `team:read`, `users:read.email`.
- [ ] Confirmed the **V1 rot fixes scoped to 2.1** (§8) — S-R3, S-R4, S-R5, S-R8, S-R9, S-R10.
- [ ] Confirmed the **10-commit batch plan** (§9) — order, gates, rollback safety.

**Implementation does NOT begin before Marcus checks every box above.**
