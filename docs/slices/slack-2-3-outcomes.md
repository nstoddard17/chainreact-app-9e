# Slack 2.3 — Channel + user actions outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**Predecessors:**
- [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md) (shipped)
- [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](slack-2-2-private-channels-and-lifecycle.md) (shipped)

**Plan source:** [`docs/slices/slack-2-3-channels-users-plan.md`](slack-2-3-channels-users-plan.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/slack/`](../../integrations/slack/).

This slice closed the largest remaining Slack action gap: 14 bot-token-only
actions across channel reads, channel lifecycle / admin, channel membership,
channel metadata, and user lookups. No new platform infrastructure
introduced; all behavior fits the existing Slack 2.1 + 2.2 architecture.

---

## 1. Scope shipped

### Actions (14)

| Domain | Action keys | V1 reference |
|---|---|---|
| Channel reads | `list_channels`, `get_channel_info` | `listChannels.ts`, `getChannelInfo.ts` |
| Channel lifecycle / admin | `create_channel`, `archive_channel`, `unarchive_channel`, `rename_channel`, `join_channel`, `leave_channel` | one V1 file each |
| Channel membership | `invite_users_to_channel`, `remove_user_from_channel` | `inviteUsersToChannel.ts`, `removeUserFromChannel.ts` |
| Channel metadata | `set_channel_topic`, `set_channel_purpose` | `setChannelTopic.ts`, `setChannelPurpose.ts` |
| User lookups | `get_user_info`, `list_users` | `getUserInfo.ts`, `listUsers.ts` |

### API wrappers (14)

`conversations.list`, `conversations.info`, `conversations.create`,
`conversations.archive`, `conversations.unarchive`, `conversations.rename`,
`conversations.join`, `conversations.leave`, `conversations.invite`,
`conversations.kick`, `conversations.setTopic`, `conversations.setPurpose`,
`users.info`, `users.list`.

All under [`integrations/slack/api/`](../../integrations/slack/api/) — one file
per Slack endpoint, no helper classes. Each follows the established Slack 2.1
pattern: snake_case body fields, SlackApiError on logical failure,
`http_<status>` on non-2xx, SLACK_API_BASE override-aware. Where Slack
guarantees a `channel` / `user` field on `ok: true`, the wrapper raises a
SlackApiError shaped like `channel_not_found` / `user_not_found` on a
malformed ok-but-empty response (defense in depth).

### Manifest scope changes

| Scope | Status before 2.3 | Status after 2.3 |
|---|---|---|
| `channels:manage` | absent | NEW required (Commit 3) |
| `channels:join` | absent | NEW required (Commit 3 — defensive, separate from `channels:manage`) |
| `groups:write` | absent | NEW required (Commit 3) |
| `users:read` | optional (Slack 2.1) | required (Commit 4 — promoted; existing optional grants re-OAuth) |
| `users:read.email` | absent | absent — PII; permanently deferred (decision §6 #3 in plan) |

### File system reshape

Channel actions moved into [`integrations/slack/actions/channels/`](../../integrations/slack/actions/channels/) during Commit 3 when the parent `integrations/slack/actions/` exceeded the 50-file leaf-folder limit. User lookups added under [`integrations/slack/actions/users/`](../../integrations/slack/actions/users/) in Commit 4 following the same precedent. Net effect: action surface stays under the leaf-folder limit while staying scannable by domain.

---

## 2. Durable decisions worth preserving

### 2.1 Channel-id-only handler contract

Every Slack channel-targeted action accepts a single resolved `channel` id
field matching `^[CG][A-Z0-9]+$` (or `^[CDG][A-Z0-9]+$` for `get_channel_info`
which also serves DM info). Handlers do NOT call `conversations.list` to
resolve names → ids. Workflow authors that have only a name compose
`list_channels` upstream and select an id.

Same rule applies to user-targeted actions: `^U[A-Z0-9]+$`. No silent
name resolution.

**Why:** avoids hidden round-trips; avoids ambiguity when a name matches
both a public and a private channel; keeps handlers idempotent; matches
the strict pre-resolution path the engine already applies to `{{...}}`
variables.

**Inherited from Slack 2.2 plan §5.1; confirmed in Slack 2.3 plan §6 #2.**

### 2.2 `users:read` promoted to required

Slack 2.1 left `users:read` as optional (no user-lookup actions then;
keeping the OAuth consent narrow). Slack 2.3 Commit 4 ships
`get_user_info` + `list_users`, both of which need the scope, so the
manifest promotes it.

Side effect: workspaces that opted into the previously-optional
grant are unaffected; workspaces that did NOT will be prompted to
re-OAuth before user-lookup actions can run. Not a migration concern
today (no production users), but worth flagging in any future
"version bumps that affect existing grants" matrix.

### 2.3 `users:read.email` permanently excluded

V1 broadly added `users:read.email` to `getUserInfo` / `listUsers` /
`findUser`. V2 deliberately does NOT request it because:
- It exposes workspace email addresses (PII) to every workflow.
- None of the shipped 2.3 actions need it — `users.info` and
  `users.list` work on plain `users:read` and just return `null` /
  absent `profile.email`.
- The orphan V1 `findUser` (`users.lookupByEmail`) is the only V1
  caller that strictly required it; that action is permanently
  skipped per Slack 2.3 plan §6 #3 (V1 dead-code orphan + PII).

**Action handlers do NOT project `email` to top-level output**, even
when present in the raw payload. The raw `user` object is preserved
verbatim under `output.user`, so workspaces that grant
`users:read.email` separately can read `{{nodeId.user.profile.email}}`
downstream without code changes.

### 2.4 Trimmed V1 extras

V1 had handler-side multi-step features that V2 deliberately did not port:

- `create_channel` extras: `initialMembers` (would chain
  `conversations.invite`), `autoArchiveSettings` (workspace setting, not
  per-channel), `customChannelHeader` (non-standard).
- `invite_users_to_channel` extras: `customWelcomeMessage` (would chain
  `chat.postMessage`), pre-flight bot-self-join, per-user retry fallback
  on bulk failure.
- `getChannelInfo` / `getUserInfo` rawChannel / rawUser union of
  (string, object, JSON-encoded-string) — V2's resolved-config path
  supplies a plain string.
- V1's `workspace` config field — V2 resolves account via
  `triggerEvent.accountId`.

**Why:** each Slack 2.3 action is single-purpose. Workflow authors
compose multi-step flows in the workflow builder; the handler stays
predictable and one-API-call.

### 2.5 Action surface domain grouping

[`integrations/slack/actions/`](../../integrations/slack/actions/) is now
domain-grouped:
- `actions/channels/` — 12 channel-related actions (reads + lifecycle / admin / membership / metadata).
- `actions/users/` — 2 user-lookup actions.
- `actions/` parent — messaging (7), scheduling (3), reactions+pins (4), Block Kit (1), helpers (`normalizeReactionName`, `parsePostAt`).

**Rule going forward:** future Slack actions land in the domain
subfolder that matches their Slack-API namespace. New domains (e.g.
`files/` for Slack 2.4) get their own subfolder. The parent stays under
the 50-file leaf-folder limit.

### 2.6 E2e fan-out pattern for action-surface proof

Slack 2.3 Commit 5 introduced the "one trigger event → N workflows fan
out" pattern for proving action surfaces end-to-end. Each action sits
in its own workflow (1 trigger + 1 action); a single Slack message
event lands all N workflow filters; all N actions execute against the
mock; the test asserts each Slack endpoint was touched exactly once.

**Why over a chained workflow:**
- Slack 2.1 + 2.2 e2e tests already used 1-trigger-1-action workflows;
  the fan-out pattern is the natural extension.
- The current V2 workflow engine's multi-step chain semantics aren't
  exercised elsewhere in the Slack e2e — staying with 1-action workflows
  doesn't ask the engine to prove new behavior under e2e load.
- Each workflow runs in isolation; assertion failures point at one
  action without cross-contamination.

### 2.7 Sequential-only Playwright runs

Slack walkthrough tests share the mock-Slack `__inspect` counter; the
spec is structurally tied to `workers: 1`. `playwright.config.ts`
already pins workers to 1 under `process.env.CI`, so CI is fine. Local
developers running `npx playwright test ...` should pass `--workers=1`
explicitly. Local parallel runs WILL fail. **Documented in Slack 2.2
retro §6 and remains true after 2.3.**

---

## 3. Files shipped

### Source (Commits 2-4)
- `integrations/slack/api/conversations*.ts` × 12 (Commits 2 + 3)
- `integrations/slack/api/users*.ts` × 2 (Commit 4)
- `integrations/slack/actions/channels/*.ts` × 12 handlers + 12 schemas
- `integrations/slack/actions/users/*.ts` × 2 handlers + 2 schemas
- `integrations/slack/manifest.ts` — 3 NEW required scopes + 1 promoted
- `services/execution/handlers/_registry.ts` — 14 new entries

### Tests (Commits 2-5)
- 14 wrapper tests at `tests/unit/integrations/slack/api/`
- 14 handler tests at `tests/unit/integrations/slack/actions/`
- manifest test + registry test updates
- 1 new e2e test in `tests/e2e/slice-1-slack-walkthrough.spec.ts`
- 14 new mock endpoints in `tests/e2e/helpers/mockSlackServer.ts`

### Docs
- [`docs/slices/slack-2-3-channels-users-plan.md`](slack-2-3-channels-users-plan.md) (Commit 1)
- This file (Commit 6)
- CLAUDE.md updates (Commit 6)

---

## 4. Commit breakdown (6)

| # | Commit hash | What landed |
|---|---|---|
| 1 | `255872ec2` | `docs(slack): plan Slack 2.3 channels and users` |
| 2 | `e5543e238` | `feat(slack): add channel read actions` (2 actions + 2 wrappers) |
| 3 | `914357226` | `feat(slack): add channel lifecycle, membership, and metadata actions` (10 actions + 10 wrappers + scope expansion + actions/channels/ reshape) |
| 4 | `ef28e1318` | `feat(slack): add user lookup actions` (2 actions + 2 wrappers + users:read promotion) |
| 5 | `ceeb92e52` | `test(e2e): extend Slack walkthrough with Slack 2.3 surface` |
| 6 | (this commit) | `docs(slack): document Slack 2.3 outcomes` |

Each implementation commit individually passed:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`

Final unit test totals after Commit 5: **513 suites / 4420 tests** (+47
suites, +298 tests since Slack 2.2 baseline).

Playwright Slack walkthrough after Commit 5: **4 tests passed in
1.2 min** (sequential, workers=1).

---

## 5. Acceptance criteria (post-merge)

- [x] 14 actions registered in `services/execution/handlers/_registry.ts`.
- [x] 14 API wrappers landing on `integrations/slack/api/`.
- [x] Manifest: `channels:manage`, `channels:join`, `groups:write` required;
      `users:read` promoted; `users:read.email` absent.
- [x] `actions/channels/` + `actions/users/` subfolders keep the parent
      `actions/` folder under the 50-file leaf-folder limit.
- [x] Every handler uses the strict channel-id / user-id schema (no name
      resolution).
- [x] `create_channel` + `invite_users_to_channel` trimmed extras (no
      `initialMembers`, `customWelcomeMessage`, etc.).
- [x] `findUser` permanently skipped; registry guard asserts absence.
- [x] Slack walkthrough e2e passes all 4 tests sequentially.
- [x] Each commit's gates green locally.

---

## 6. What's next (Slack roadmap)

- **Slack 2.4** — file actions (`upload_file`, `download_file`,
  `get_file_info`) + file trigger (`fileUploaded`). Gated by P-S3 file
  output contract design. Largest remaining Slack gap.
- **P-S1** — user token storage (`xoxp-…`) — unblocks
  `update_user_status` and `set_user_presence`.
- **`userJoinedWorkspace`** — per-trigger scope-request design (open
  audit question).
- **`add_reminder`** — pending Slack API status check (parity audit §13).

None of these are committed for follow-up timing in this slice; tracking
lives in [`docs/slices/parity-slack.md`](parity-slack.md) §§5–6.
