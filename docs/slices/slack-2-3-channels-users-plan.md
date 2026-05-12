# Slack 2.3 — Channels + users plan

**Status:** Plan / not yet accepted. **Doc-only commit.** No implementation begins until Marcus accepts.
**Branch:** `v2-provider-port-local` (local-only).
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**Predecessors:**
- [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md) (shipped)
- [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](slack-2-2-private-channels-and-lifecycle.md) (shipped)

**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/slack/`](../../integrations/slack/).

This is the third Slack parity slice. Scope is **channel utility actions + user lookup actions** that fit the existing bot-token architecture. File actions, user-status / presence, `userJoinedWorkspace`, P-S1 (user-token storage), and P-S3 (file output contract) all remain deferred.

---

## 1. Slack 2.3 scope

### In

- **Channel read actions** — `list_channels`, `get_channel_info`.
- **Channel lifecycle / admin actions** — `create_channel`, `archive_channel`, `unarchive_channel`, `rename_channel`, `join_channel`, `leave_channel`.
- **Channel membership actions** — `invite_users_to_channel`, `remove_user_from_channel`.
- **Channel metadata actions** — `set_channel_topic`, `set_channel_purpose`.
- **User lookup actions** — `get_user_info`, `list_users`.
- **Scope additions** required to power the above (see §7).

Public-channel and private-channel coverage is unified: every channel action accepts both `C…` and `G…` channel ids and uses the modern scope split (`channels:manage` + `groups:write`) so a single action works for both kinds.

### Explicitly out

- **`find_user_by_email`** (`users.lookupByEmail`) — V1's `findUser` schema is an orphan / dead-code per audit S-R1; the API requires `users:read.email` (PII scope). **Skip in 2.3** pending a product decision. See §6, decision 3.
- **`users:read.email` scope** — workspace-wide PII expansion. **Defer.** V2's `get_user_info` / `list_users` will return user objects with `profile.email` set to `null` until and unless `users:read.email` is granted. Same trade-off V1 took silently; V2 makes it explicit.
- **File actions** (`upload_file`, `download_file`, `get_file_info`) — Slack 2.4 (requires P-S3 file output contract).
- **User-status / presence** (`update_user_status`, `set_user_presence`) — gated by P-S1 user-token storage; indefinite defer.
- **`user_joined_workspace` trigger** — gated by per-trigger scope-request design (audit open question).
- **`add_reminder`** — pending Slack API status check (parity-slack §13).
- **Channel-name → channel-id resolution** in handlers. V2 requires the channel id (`C…` / `G…`). Workflow authors that have only a name use `list_channels` upstream and pick the id. V1 quietly accepted both via name resolution — that's a scope expansion we don't take in 2.3.

### Why this scope

- **Closes the largest remaining Slack action gap.** 14 actions in one slice; 0 of them require P-S1 or P-S3.
- **Bot-token-only.** Same auth architecture as 2.1 and 2.2 — no new platform gaps.
- **Modernizes V1's scope set.** V1 requests legacy `channels:write` (broad, deprecated in modern Slack apps). V2 splits into the modern minimum: `channels:manage` for public admin, `channels:join` for public join, `groups:write` for private admin, `users:read` promoted from optional for user lookups.

---

## 2. Slack 2.3 actions

14 ports. Grouped by domain.

### Channel reads (2)

| # | V2 action key | V1 reference | Slack API endpoint | Required scope | New scope? |
|---|---|---|---|---|---|
| 1 | `list_channels` | `listChannels.ts` (47 LoC) | `conversations.list` | `channels:read` + `groups:read` | — (both present) |
| 2 | `get_channel_info` | `getChannelInfo.ts` (71 LoC) | `conversations.info` | `channels:read` + `groups:read` | — (both present) |

### Channel lifecycle / admin (6)

| # | V2 action key | V1 reference | Slack API endpoint | Required scope | New scope? |
|---|---|---|---|---|---|
| 3 | `create_channel` | `createChannel.ts` (258 LoC — trim) | `conversations.create` | `channels:manage` (public) or `groups:write` (private) | both NEW |
| 4 | `archive_channel` | `archiveChannel.ts` (61 LoC) | `conversations.archive` | `channels:manage` + `groups:write` | (added by #3) |
| 5 | `unarchive_channel` | `unarchiveChannel.ts` (40 LoC) | `conversations.unarchive` | `channels:manage` + `groups:write` | — |
| 6 | `rename_channel` | `renameChannel.ts` (38 LoC) | `conversations.rename` | `channels:manage` + `groups:write` | — |
| 7 | `join_channel` | `joinChannel.ts` (33 LoC) | `conversations.join` | `channels:join` (public) + `groups:write` (private) | `channels:join` NEW |
| 8 | `leave_channel` | `leaveChannel.ts` (38 LoC) | `conversations.leave` | bot's own membership (no extra scope) | — |

### Channel membership (2)

| # | V2 action key | V1 reference | Slack API endpoint | Required scope | New scope? |
|---|---|---|---|---|---|
| 9 | `invite_users_to_channel` | `inviteUsersToChannel.ts` (195 LoC — trim) | `conversations.invite` | `channels:manage` + `groups:write` | — |
| 10 | `remove_user_from_channel` | `removeUserFromChannel.ts` (46 LoC) | `conversations.kick` | `channels:manage` + `groups:write` | — |

### Channel metadata (2)

| # | V2 action key | V1 reference | Slack API endpoint | Required scope | New scope? |
|---|---|---|---|---|---|
| 11 | `set_channel_topic` | `setChannelTopic.ts` (38 LoC) | `conversations.setTopic` | `channels:manage` + `groups:write` | — |
| 12 | `set_channel_purpose` | `setChannelPurpose.ts` (38 LoC) | `conversations.setPurpose` | `channels:manage` + `groups:write` | — |

### User lookups (2)

| # | V2 action key | V1 reference | Slack API endpoint | Required scope | New scope? |
|---|---|---|---|---|---|
| 13 | `get_user_info` | `getUserInfo.ts` (80 LoC) | `users.info` | `users:read` | promote (optional → required) |
| 14 | `list_users` | `listUsers.ts` (45 LoC) | `users.list` | `users:read` | — (same promotion) |

**`profile.email` field on user objects.** Returned as `null` (or absent) without `users:read.email`. V2 surfaces what Slack returns. The action schema documents the trade-off. Bumping to `users:read.email` is a product decision tracked in §6.

### V1 actions in this domain that are NOT being ported

| V1 action | Reason | Status |
|---|---|---|
| `findUser` (`users.lookupByEmail`) | Orphan / dead-code in V1 (audit S-R1) + requires PII scope. | SKIP. Defer with product decision. |
| `updateUserStatus` | Requires user token (xoxp). | Defer behind P-S1. |
| `setUserPresence` | Requires user token (xoxp). | Defer behind P-S1. |

### Action surface delta after Slack 2.3

| Before 2.3 | After 2.3 | Net |
|---|---|---|
| 14 actions (1 from slice 1 + 13 from 2.1) | 28 actions | +14 |

---

## 3. Triggers

**No new triggers.** Slack 2.3 is action-only. The 9 trigger filters shipped in 2.1 + 2.2 already cover the trigger surface this slice depends on.

---

## 4. API wrappers

Each action gets one matching `api/<endpoint>.ts` helper following the existing 2.1 + 2.2 pattern (one file per Slack API endpoint, no helper classes). Wrappers:

- `api/conversationsList.ts` — `conversations.list` with cursor pagination + `types` filter (`public_channel` / `private_channel`).
- `api/conversationsInfo.ts` — `conversations.info`.
- `api/conversationsCreate.ts` — `conversations.create` with `is_private` boolean.
- `api/conversationsArchive.ts` — `conversations.archive`.
- `api/conversationsUnarchive.ts` — `conversations.unarchive`.
- `api/conversationsRename.ts` — `conversations.rename`.
- `api/conversationsJoin.ts` — `conversations.join`.
- `api/conversationsLeave.ts` — `conversations.leave`.
- `api/conversationsInvite.ts` — `conversations.invite` with comma-separated user ids.
- `api/conversationsKick.ts` — `conversations.kick`.
- `api/conversationsSetTopic.ts` — `conversations.setTopic`.
- `api/conversationsSetPurpose.ts` — `conversations.setPurpose`.
- `api/usersInfo.ts` — `users.info`.
- `api/usersList.ts` — `users.list` with cursor pagination.

All use the existing `_request.ts` HTTP client + `errors.ts` SlackApiError. No new shared infra.

---

## 5. Behavioral contracts

### 5.1 Channel id discipline (Q-style contract)

- Every channel-targeted action accepts a single resolved `channel` id field of shape `^[CG][A-Z0-9]+$`. Workflow author is responsible for resolution. The handler does NOT call `conversations.list` to translate names → ids.
- Rationale: avoids hidden round-trips, avoids ambiguity when a name matches both a public and a private channel, keeps handlers idempotent.

### 5.2 `create_channel` — no hidden defaults (Q11 echo)

- `is_private` is required. No silent default to public — mirrors the V1 fix that landed in Q11 (`requireExplicitField`).
- `name` is sanitized client-side (lowercase, `[a-z0-9-_]`, max 80 chars). Slack also sanitizes server-side; client-side sanitization is purely a UX nicety and is documented as such.
- V2 drops V1's `initialMembers`, `autoArchiveSettings`, `customChannelHeader` fields. V1 implemented these via post-create round-trips that aren't `conversations.create` capabilities (initial-members is a follow-up `conversations.invite`; auto-archive is a Slack workspace setting, not per-channel; channel-header is non-standard). Workflow authors compose the multi-step flow themselves in the workflow builder.
- V2 drops V1's `users:read` coupling on `create_channel`. The API call itself doesn't need user reads; V1 added it to power an enrichment side-effect that isn't part of the action's stated purpose.

### 5.3 `invite_users_to_channel` — bulk semantics (no auto-join fallback)

- Accept `users: string[]` (array) or `users: string` (CSV — same handling as Q7 multi-recipient parsing in the messaging actions).
- Single `conversations.invite` call with comma-joined ids. On bulk failure, return the Slack error verbatim. V1's fallback that retries each user individually is **not** ported — it masks failures and produces partial-success states that are hard to recover from in a workflow.
- V1's pre-flight `conversations.join` call (bot joins channel before inviting) is **not** ported. The workflow author chains a `join_channel` action explicitly if needed. This keeps the action single-purpose and avoids surprising scope expansion.
- V1's `customWelcomeMessage` field is **not** ported. Workflow authors chain `send_channel_message` after `invite_users_to_channel`.
- Q11 — V1's `sendInviteNotification` required-field check is preserved (notifications happen server-side; the field is acknowledgement, not control).

### 5.4 Output shape

Every handler returns:
```ts
{
  success: true,
  output: { ...slack-returned-fields, raw: <slack-response> },
  message?: string  // user-facing summary
}
```

`raw` always present so workflow authors can grab any field Slack returns even if V2's named-field projection is too minimal. Same pattern as V2's other actions.

### 5.5 OAuth 401 handling

Every handler wraps its principal outbound call in `refreshAndRetry` per the Q3 contract — even though Slack is non-refreshable, the contract mandates the wrapper for consistency. Non-refreshable providers route a 401 to a `token_revoked` health signal.

### 5.6 Within-session idempotency (Q4)

`create_channel`, `archive_channel`, `unarchive_channel`, `rename_channel`, `invite_users_to_channel`, `remove_user_from_channel`, `set_channel_topic`, `set_channel_purpose` all write provider state and **MUST** bracket their principal call with `checkReplay` / `recordFired`. Pure reads (`list_channels`, `get_channel_info`, `get_user_info`, `list_users`) and self-membership (`join_channel`, `leave_channel`) **MAY** be excluded — but staying uniform is cheap. Decision in §6.

---

## 6. Decisions needed before implementation

| # | Decision | Recommendation |
|---|---|---|
| 1 | Promote `users:read` from optional to required. Existing workspaces will see a re-OAuth prompt before they can use 2.3 user actions. | **Promote.** The user-lookup actions need it. Optional-scope plumbing for "this action requires this scope" doesn't exist yet — defer that mechanism to a later slice and take the required promotion now. |
| 2 | Channel id-only contract for handlers (no name resolution). | **id-only.** Matches §5.1. Workflow authors with a name compose `list_channels` upstream. |
| 3 | `find_user_by_email` action + `users:read.email` scope. | **SKIP in 2.3.** No clear workflow-author use case beyond the V1 dead-code orphan. Document as deferred + add product-decision question for a future slice. |
| 4 | Drop V1's `create_channel` `users:read` coupling. | **Drop.** API doesn't need it. The action's stated purpose is create-only. |
| 5 | Apply Q4 idempotency to read-only and self-membership actions too (uniform), or only to mutating actions (minimal)? | **Uniform — apply to every action.** Cheaper than per-action analysis; benign for reads. |
| 6 | Trim `create_channel` extras (`initialMembers`, `autoArchiveSettings`, `customChannelHeader`) and `invite_users_to_channel` extras (`customWelcomeMessage`, auto-join, individual-retry fallback). | **Trim.** Single-purpose actions; multi-step flows belong to the workflow builder. Matches §5.2 + §5.3. |
| 7 | `channels:join` as a separate required scope vs. relying on `channels:manage` covering join. | **Add `channels:join` separately.** Defensive — Slack scope coverage for `conversations.join` varies; explicit beats implicit. |

---

## 7. Slack scopes for Slack 2.3

### Required (added to manifest)

- `channels:manage` — **NEW** — public channel admin (`conversations.create`/`.archive`/`.unarchive`/`.rename`/`.setTopic`/`.setPurpose`/`.invite`/`.kick`).
- `channels:join` — **NEW** — public channel join (`conversations.join`).
- `groups:write` — **NEW** — private channel admin (covers all of the above for private channels + leave).
- `users:read` — **PROMOTE** from optional → required (powers `users.info` + `users.list`; existing optional grant in some workspaces means a re-OAuth prompt may be needed for the actions to work).

**Total new required scopes: 3 added + 1 promoted = 4 scope changes.**

### Optional (no changes)

- `users:read` — **REMOVED from optional** (promoted to required per above).
- `chat:write.public` — unchanged (still optional; Slack 2.1 decision).

### Deferred (NOT added in 2.3)

- `users:read.email` — required to populate `profile.email` in user objects. Defer with product decision; see §6 #3. Workflow authors that need email by user id can read from a directory-of-record outside Slack.
- `files:read` / `files:write` — Slack 2.4 (P-S3).
- `channels:write.invites` — Slack ships a narrower scope specifically for invite-only. `channels:manage` covers the same call; narrower scope is a future minimization concern, not 2.3 scope.
- `team:read` — V1 used for `updateSlackProviderPlan` (S-R7); skip indefinitely.
- All user-token scopes — gated by P-S1.

### Honesty check

`webhookTrigger: true` and `actions: true` capability flags remain honest. 2.3 grows the action count from 14 to 28 — capabilities flag's meaning ("at least one of each kind exists") was already true.

---

## 8. V1 rot to fix during Slack 2.3

From parity-slack.md §8 — 2.3 takes ownership of these rot rows:

- **S-R1 (orphan `findUser`).** Permanent skip per audit. **Action: explicit "skipped" entry in slack-2-3 retro doc + in CLAUDE.md.**
- **S-R2 (V1 legacy `channels:write` scope).** V2 modernizes to `channels:manage` + `channels:join` + `groups:write`. **Action: do not request `channels:write` in the V2 manifest.**
- **S-R4 (V1 dual `sendSlackMessage` function vs `SlackService` class).** V2 already has one helper module per Slack endpoint. 2.3 ports keep that discipline. **Action: per-action enforce one `api/conversations<Verb>.ts` file; no helper classes.**
- **S-R5 (V1 inconsistent ActionResult shape).** V2 uses `SlackApiError` uniformly. **Action: per-handler grep for `SlackApiError` usage during review.**
- **V1 fields with no API coverage** — `create_channel.{initialMembers,autoArchiveSettings,customChannelHeader}` and `invite_users_to_channel.{customWelcomeMessage,auto-join,individual-retry}`. **Action: drop per §5.2 + §5.3.**
- **V1 `create_channel` `users:read` coupling.** **Action: drop per §6 #4.**
- **V1 silent name→id resolution.** **Action: id-only contract per §5.1 + §6 #2.**

Not in scope for 2.3 (handled in later Slack slices):
- S-R6 (Supabase-coupled `uploadFile`) — Slack 2.4.
- S-R7 (`updateSlackProviderPlan`) — skip indefinitely.

---

## 9. Implementation batch plan

6 commits total. All under branch `v2-provider-port-local`. Each commit's gates pass before next starts.

| # | Commit | What lands |
|---|---|---|
| 1 | (this doc) | `docs(slack): plan Slack 2.3 channels and users` |
| 2 | `feat(slack): port channel read actions (2)` | `list_channels`, `get_channel_info` + `api/conversationsList.ts` + `api/conversationsInfo.ts` + tests. No new scopes. |
| 3 | `feat(slack): port channel lifecycle + membership + metadata actions (10)` | `create_channel`, `archive_channel`, `unarchive_channel`, `rename_channel`, `join_channel`, `leave_channel`, `invite_users_to_channel`, `remove_user_from_channel`, `set_channel_topic`, `set_channel_purpose` + 10 matching `api/` helpers + tests per action. Adds `channels:manage` + `channels:join` + `groups:write` scopes. |
| 4 | `feat(slack): port user lookup actions (2)` | `get_user_info`, `list_users` + `api/usersInfo.ts` + `api/usersList.ts` + tests. Promotes `users:read` to required. |
| 5 | `test(e2e): extend Slack walkthrough with channels + users (Slack 2.3)` | Per §10 e2e additions. |
| 6 | `docs(slack): document Slack 2.3 outcomes` | Slack 2.3 retro doc + CLAUDE.md update if any new durable pattern landed (probably none — same shape as 2.1/2.2 ports). |

**Estimate sanity check.** 6 commits for 14 actions = ~2.3 actions/commit average. Commit 3 carries 10 actions but they share API client pattern, validation pattern, and test pattern; the marginal cost per action is low. Same per-commit volume as Slack 2.1's commit 4 (5 actions) and 6 (4 actions) — proven manageable.

### Gates per commit

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

E2e gate runs on commit 5 (e2e), 6 (doc) skips per master-plan convention.

### Rollback per commit

- Commit 1 — doc-only — trivial.
- Commits 2, 3, 4 — handler ports — rollback removes the manifest entries; no DB migrations; safe.
- Commit 5 — e2e additions — pure test rollback; safe.
- Commit 6 — doc-only — trivial.

---

## 10. E2e coverage plan

One new top-level test in `tests/e2e/slice-1-slack-walkthrough.spec.ts`, mirroring the multi-phase pattern from Slack 2.1 + 2.2.

**Test name:** `"channels + users: full Slack 2.3 surface — list / info / CRUD / membership / metadata / user lookups"`.

**Workflow shape.** One workflow with a Slack message trigger that fans out through every 2.3 action in a single chain. Avoids the multi-workflow setup overhead and proves all 14 handlers end-to-end against the mock Slack server.

### Mock Slack server additions

Mock helper at `tests/e2e/helpers/mockSlackServer.ts` gains 14 new endpoints:

- `POST /api/conversations.list` — paginated; returns 1 public + 1 private channel.
- `POST /api/conversations.info` — returns a single channel object by id.
- `POST /api/conversations.create` — returns the created channel object.
- `POST /api/conversations.archive` — returns `{ok: true}`.
- `POST /api/conversations.unarchive` — returns `{ok: true}`.
- `POST /api/conversations.rename` — returns the renamed channel object.
- `POST /api/conversations.join` — returns the joined channel object.
- `POST /api/conversations.leave` — returns `{ok: true}`.
- `POST /api/conversations.invite` — returns the channel object with updated members.
- `POST /api/conversations.kick` — returns `{ok: true}`.
- `POST /api/conversations.setTopic` — returns `{topic: <new>}`.
- `POST /api/conversations.setPurpose` — returns `{purpose: <new>}`.
- `POST /api/users.info` — returns a single user object by id.
- `POST /api/users.list` — paginated; returns 2 users.

Mock state tracks the call count + body per endpoint for the `__inspect` surface (same pattern as the 2.1 + 2.2 tests).

### Phases (single workflow, sequential)

1. **List channels** — assert mock got one `conversations.list` call; output has both public + private channels.
2. **Get channel info** — for the public channel id; assert id + name match.
3. **Create channel** (private) — assert mock body has `is_private: true`; output has the new id.
4. **Rename channel** — assert mock body has new name; output reflects.
5. **Invite user** — comma-joined ids; assert mock body matches.
6. **Set topic + set purpose** — two mock calls; bodies match.
7. **Remove user** — assert mock body has user id.
8. **Join + leave** — two mock calls; output `ok: true`.
9. **Archive + unarchive** — two mock calls; lifecycle endpoint touched both ways.
10. **Get user info** — single user; assert output has id + name.
11. **List users** — assert mock got one `users.list` call; output has 2 users.

End-of-test asserts: 14 distinct mock endpoints touched; total mock call count = 14 (one per phase). Existing 2.1 + 2.2 tests are untouched.

### Local gate

Run sequentially (CI's `workers: 1`) — same as 2.1 + 2.2:

```
npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts \
  --project chromium --workers=1 --reporter=line
```

Expected: **4 passed** (1 base + Slack 2.1's filter test + Slack 2.2's lifecycle test + Slack 2.3's channels-and-users test).

Local parallel runs continue to share the mock-Slack `__inspect` counter across workers and continue to fail; same pre-existing structural property documented in Slack 2.2.

---

## 11. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | `users:read` promotion causes existing workspace OAuth grants to need a re-prompt. | Document in the manifest comment + Slack 2.3 retro doc + CLAUDE.md. No production users yet so no migration step needed. |
| 2 | Slack scope coverage for `conversations.join` varies — some docs say `channels:manage` covers it, others say `channels:join` is required. | Add both to the manifest (defensive). Cost: one extra scope on the OAuth consent screen. Benefit: zero "missing scope" runtime surprises. |
| 3 | `conversations.invite` fails with `not_in_channel` if the bot isn't already a member of the target channel. V1 mitigated by auto-joining; 2.3 doesn't. | Document in the action description ("bot must be a member; chain `join_channel` first") + surface Slack's error verbatim. Workflow authors compose the multi-step explicitly. |
| 4 | `users.list` is rate-limited harshly by Slack (Tier 2 — 20 req/min per workspace). Workflow authors who chain `list_users` in a loop will hit it. | Document in the action description + return Slack's `Retry-After` if surfaced in the error. No automatic retry — workflow author handles. |
| 5 | `users.info` returns minimal fields without `users:read.email`. Workflow authors may expect email. | Action schema's description explicitly notes email is `null` unless `users:read.email` is granted. Tracked as a product decision in §6 #3. |
| 6 | V1's `getChannelInfo` accepted name OR id (silent name→id resolution). Workflows that relied on this and migrate forward will fail. | No production users yet. Document the contract change in the retro doc. |
| 7 | Mock Slack server endpoint additions touch a single helper file (`mockSlackServer.ts`); diffing risk if the file is also edited by a concurrent slice. | Slack work is local-only on a single branch (`v2-provider-port-local`); no concurrent edits. |

---

## 12. Exit checklist

This plan is accepted (and Slack 2.3 implementation can begin) when Marcus has:

- [ ] Read sections 1–11.
- [ ] Confirmed the **action list** (§2) — 14 ports; no `find_user_by_email`, no user-status / presence, no file actions.
- [ ] Confirmed the **trim list** (§5.2 + §5.3) — V2 drops V1's `create_channel.{initialMembers, autoArchiveSettings, customChannelHeader}` and `invite_users_to_channel.{customWelcomeMessage, auto-join, individual-retry}` extras.
- [ ] Confirmed the **id-only channel contract** (§5.1 + §6 #2).
- [ ] Confirmed the **scope additions** (§7) — `channels:manage`, `channels:join`, `groups:write` newly required; `users:read` promoted from optional to required; `users:read.email` deferred.
- [ ] Confirmed the **V1 rot fixes scoped to 2.3** (§8).
- [ ] Confirmed the **6-commit batch plan** (§9).
- [ ] Confirmed the **e2e coverage plan** (§10).

**Implementation does NOT begin before Marcus checks every box above.**
