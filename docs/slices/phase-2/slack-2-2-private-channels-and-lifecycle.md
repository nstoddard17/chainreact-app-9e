# Slack 2.2 — Private channels + channel lifecycle

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**Predecessor:** [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/slack/`](../../integrations/slack/).

This slice adds the trigger surface deferred from Slack 2.1: private-channel
message events and channel lifecycle events (`channel_created`,
`member_joined_channel`, `member_left_channel`). No new actions; the existing
`get_messages` / `get_thread_messages` actions begin working against private
channels once `groups:history` lands.

---

## 1. Scope shipped

### In
- 1 new message trigger filter: `slack.message.group` (private channel messages).
- 3 new lifecycle trigger filters: `slack.channel_created`,
  `slack.member_joined_channel`, `slack.member_left_channel`.
- Normalizer change: emit `slack.message.group` when
  `event.channel_type === "group"` (Slack-authoritative).
- Normalizer tightening: drop the historic `G…`-prefix fallback that
  mapped to `slack.message.mpim`. Ambiguous payloads now emit generic
  `slack.message` and are dropped by the dispatcher.
- 2 new required scopes: `groups:history` (private message delivery +
  history reads) and `groups:read` (lifecycle event delivery for private
  channels).
- One new top-level e2e test exercising the full 2.2 trigger surface.

### Explicitly out (deferred to later Slack slices)
- Channel CRUD / membership / metadata actions
  (`createChannel`, `archiveChannel`, `renameChannel`,
  `inviteUsersToChannel`, `removeUserFromChannel`, `setChannelTopic`,
  `setChannelPurpose`, `getChannelInfo`, `listChannels`,
  `joinChannel`, `leaveChannel`, `unarchiveChannel`).
- File triggers (`fileUploaded`) and file actions.
- `userJoinedWorkspace` trigger (`team_join`) — pending the
  per-trigger scope-request design open question.
- Payload enrichment helpers — workflow authors add downstream
  `getUserInfo` / `getChannelInfo` actions when names are required.
  Normalizer stays pure.

---

## 2. Canonical eventType taxonomy

Slack 2.2 finalizes the message-channel-kind canonical eventType set:

| Slack `channel_type` | Canonical eventType | Notes |
|---|---|---|
| `channel` | `slack.message.channel` | public channel — Slack 2.1 |
| `group` | `slack.message.group` | private channel — Slack 2.2 |
| `im` | `slack.message.im` | DM — Slack 2.1 |
| `mpim` | `slack.message.mpim` | group DM — Slack 2.1 |
| (absent + `C…` id) | `slack.message.channel` | id-prefix fallback |
| (absent + `D…` id) | `slack.message.im` | id-prefix fallback |
| (absent + `G…` id) | `slack.message` | ambiguous → dropped — Slack 2.2 tightening |
| (otherwise) | `slack.message` | unknown → dropped |

Lifecycle eventTypes added by Slack 2.2:
- `slack.channel_created`
- `slack.member_joined_channel`
- `slack.member_left_channel`

Forward-compat namespace `slack.<event.type>` continues to apply for any
Slack event type with no registered filter (dispatcher drops with
`matched=0`).

---

## 3. Scope changes

| Scope | Status | Purpose |
|---|---|---|
| `groups:history` | NEW required (Commit 2) | Receive `message` events for private channels (`channel_type === "group"`) + unlock `get_messages`/`get_thread_messages` for private channels. |
| `groups:read` | NEW required (Commit 3) | Receive `member_joined_channel`/`member_left_channel` for private channels; future channel-info reads for private channels. |

`chat:write.public` remains optional (Slack 2.1 decision). No promotion
of `users:read` to required.

---

## 4. Decisions (Marcus, pre-implementation)

**Decision 1 — G-prefix fallback tightening: accepted.** No production
users; better to correct the contract now. `channel_type` is the
authoritative signal; payloads with no `channel_type` and a `G…`
channel id fall through to generic `slack.message` rather than guessing
mpim. Documented as a Deep Gotcha entry in `CLAUDE.md`.

**Decision 2 — payload enrichment: stay out of scope.** Normalizer
remains pure. Workflow authors add downstream `getUserInfo` /
`getChannelInfo` steps when names are required. No API call-outs
inside the normalizer.

---

## 5. Files shipped

### Source
- `integrations/slack/webhooks/normalize.ts` — channel_type=group +
  G-prefix tightening (Commit 1).
- `integrations/slack/triggers/newMessagePrivateChannel/filter.ts`
  (Commit 2).
- `integrations/slack/triggers/channelCreated/filter.ts` (Commit 3).
- `integrations/slack/triggers/memberJoinedChannel/filter.ts`
  (Commit 3).
- `integrations/slack/triggers/memberLeftChannel/filter.ts` (Commit 3).
- `integrations/slack/triggers/index.ts` — register the 4 new filters
  (Commits 2 + 3).
- `integrations/slack/manifest.ts` — add `groups:history` (Commit 2)
  and `groups:read` (Commit 3).

### Tests
- `tests/unit/integrations/slack/webhooks/normalize.test.ts` — 3 new
  cases for `channel_type === "group"` + contract-change update for
  `G…`-prefix fallback (Commit 1).
- `tests/unit/integrations/slack/triggers/newMessagePrivateChannel/
  filter.test.ts` — 10 tests (Commit 2).
- `tests/unit/integrations/slack/triggers/channelCreated/
  filter.test.ts` — 5 tests (Commit 3).
- `tests/unit/integrations/slack/triggers/memberJoinedChannel/
  filter.test.ts` — 9 tests (Commit 3).
- `tests/unit/integrations/slack/triggers/memberLeftChannel/
  filter.test.ts` — 9 tests (Commit 3).
- `tests/unit/integrations/slack/triggers/registration.test.ts` —
  positive assertions for 4 new canonical eventTypes (Commits 2 + 3).
- `tests/unit/integrations/slack/manifest.test.ts` — assert
  `groups:history` + `groups:read` present (Commits 2 + 3).
- `tests/e2e/slice-1-slack-walkthrough.spec.ts` — one new top-level
  test covering Phases A–E across 5 workflows (Commit 4).

---

## 6. Commit breakdown (5)

| # | Commit | What landed |
|---|---|---|
| 1 | `feat(slack): normalize channel_type=group + tighten G-prefix fallback` | Pure normalizer change — adds `slack.message.group`, drops the `G…`-prefix fallback. |
| 2 | `feat(slack): add private-channel message trigger filter` | `slack.message.group` filter + `groups:history` scope. |
| 3 | `feat(slack): add channel lifecycle trigger filters` | `channel_created`, `member_joined_channel`, `member_left_channel` filters + `groups:read` scope. |
| 4 | `test(e2e): extend Slack walkthrough with private channels + lifecycle (Slack 2.2)` | One new top-level e2e test covering 5 workflows × 5 phases including the G-prefix tightening drop. |
| 5 | `docs(slack): document Slack 2.2 outcomes` | This retro doc + CLAUDE.md Deep Gotcha entry + parity status update. |

Each commit individually passed:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test` (466 suites / 4122 tests after Commit 3)

The Commit 4 e2e gate ran locally with `--workers=1` (the same setting
CI applies via `playwright.config.ts`'s `process.env.CI` branch). All
3 Slack walkthrough tests (the 2 from Slack 2.1 + the new 2.2 test)
pass sequentially. Local parallel runs share the mock-Slack
`__inspect` counter across workers and are not the supported run
mode — this is a pre-existing structural property of the spec, not
introduced by Slack 2.2.

---

## 7. Acceptance criteria (post-merge)

- [x] `channel_type === "group"` emits `slack.message.group`.
- [x] `G…`-prefixed payloads with no `channel_type` emit generic
      `slack.message` (no filter registered → drop).
- [x] `slack.message.group` filter accepts optional `channelId` with
      regex `^[CG][A-Z0-9]+$`.
- [x] `slack.channel_created` filter matches every payload (no config
      surface).
- [x] `slack.member_joined_channel` / `slack.member_left_channel`
      filters accept optional `channelId` with regex `^[CG][A-Z0-9]+$`.
- [x] Manifest required scopes include `groups:history` and
      `groups:read`.
- [x] Unit tests cover identity, match-all, channelId match / no-match,
      parse fail-closed on each new filter.
- [x] Registration test asserts all 4 new filters are registered.
- [x] E2e walkthrough exercises the full 2.2 trigger surface end-to-end
      and the G-prefix tightening contract change.
- [x] Each commit's gates green locally.
