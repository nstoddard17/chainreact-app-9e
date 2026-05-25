# Slice 16 — **Microsoft Teams** provider port

**Branch:** `v2-provider-port-local` (local-only continuation; no separate slice branch).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Microsoft Teams from V1 as the next Phase 1 provider after Microsoft Excel. Reuses the existing V2 Microsoft OAuth foundation (`_shared/microsoft/oauth.ts`) already proven by Outlook Mail, Outlook Calendar, OneDrive, and Excel. Ships **5 typed delegated-user action handlers** and **1 webhook-subscription trigger** (`new_channel_message`) on top of V2's existing subscription registry + Graph webhook validation infrastructure. Closes a real V1 OAuth duplication bug (separate `TEAMS_CLIENT_ID/SECRET` Azure AD app for what is structurally the same Microsoft Graph surface as the four sibling Microsoft providers already in V2).

Teams is the next Phase 1 provider because the bulk of its delegated-user surface is **structurally identical to OneDrive + Outlook Calendar** — same Microsoft OAuth, same Graph base wrapper, same `/v1.0/subscriptions` lifecycle, same validation handshake, same `lifecycleNotificationUrl` shape. It validates the existing V2 Microsoft webhook-subscription pattern against a new resource family (`/teams/{id}/channels/{id}/messages`) without taking on the heaviest V1 complexity (app-only auth, tenant admin consent, `includeResourceData` certificate encryption — all confirmed NOT needed for the Batch 1 surface).

---

## V1 audit — paths and findings

### Manifest / node definitions

- Single manifest file: [`lib/workflows/nodes/providers/teams/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/teams/index.ts) (672 lines). Declares **7 triggers + 18 actions** inline.
- Triggers: `teams_trigger_new_message` (channel), `teams_trigger_user_joins_team`, `teams_trigger_new_reply`, `teams_trigger_channel_mention`, `teams_trigger_new_chat`, `teams_trigger_new_chat_message`, `teams_trigger_new_channel`.
- Actions: `teams_action_send_message`, `_send_chat_message`, `_create_channel`, `_add_member_to_team`, `_schedule_meeting`, `_send_adaptive_card`, `_get_team_members`, `_create_team`, `_reply_to_message`, `_edit_message`, `_find_message`, `_delete_message`, `_create_group_chat`, `_get_channel_details`, `_add_reaction`, `_remove_reaction`, `_end_meeting`, `_update_meeting`, plus `_start_meeting` (handler exists; not enumerated in the manifest grep but registered).
- Provider id in V1 is `teams` (not `microsoft-teams`).

### Action handlers

Handler directory: [`lib/workflows/actions/teams/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/). 19 handler files + barrel.
- All handlers use `Authorization: Bearer ${accessToken}` against `https://graph.microsoft.com/v1.0/...`.
- None of the handlers use app-only tokens — every action is delegated-user.
- Endpoints used by Batch 1 candidates:
  - **Channel message send**: `POST /teams/{teamId}/channels/{channelId}/messages` with `{ body: { contentType: 'html', content } }` ([`sendMessage.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/sendMessage.ts) — 96 lines).
  - **Chat message send**: `POST /chats/{chatId}/messages` with same body shape ([`sendChatMessage.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/sendChatMessage.ts)).
  - **Channel create**: `POST /teams/{teamId}/channels` with `{ displayName, description?, membershipType: 'standard'|'private' }` ([`createChannel.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/createChannel.ts)).
  - **Channel details get**: `GET /teams/{teamId}/channels/{channelId}` ([`getChannelDetails.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/getChannelDetails.ts)).
  - **Team members list**: `GET /teams/{teamId}/members` ([`getTeamMembers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/getTeamMembers.ts)).
  - **Reply to message**: `POST /teams/{teamId}/channels/{channelId}/messages/{messageId}/replies` ([`replyToMessage.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/teams/replyToMessage.ts)).
- Endpoints used by **deferred** actions worth flagging:
  - `addMemberToTeam` calls `GET /users?$filter=mail eq '...'` first (resolves email→userId) then `POST /teams/{teamId}/members` with `@odata.bind`. Requires `User.ReadBasic.All` + `TeamMember.ReadWrite.All` — the latter often needs tenant admin consent.
  - `createTeam` calls `GET /me` then `POST /teams` with a `template@odata.bind` payload. Needs `Team.Create`.
  - `createGroupChat` calls `POST /v1.0/invitations` then `POST /chats` — both invite + chat create involve `Chat.Create` + `User.Invite.All`.
  - `scheduleMeeting` calls Graph calendar `events` with `isOnlineMeeting: true` — needs `OnlineMeetings.ReadWrite` + `Calendars.ReadWrite`.
  - `sendAdaptiveCard` posts a channel message with `attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive' }]`. Same scope as send_message but adds adaptive-card schema validation surface.
- **No idempotency keys.** Graph Teams endpoints don't expose one. V2's session-side-effects (Q4 contract) is the gate when wired.
- **401 handling — ad-hoc per handler** (`createAdminClient` + manual `decrypt`, no retry). V2 wraps every action's principal call in `refreshAndRetry` per the established Microsoft pattern.

### Triggers — Graph change-notification subscriptions

- Lifecycle: [`lib/triggers/teams/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts) (673 lines). Unified subscription lifecycle for all 7 trigger types via `buildSubscriptionResource(triggerType, config)` switch.
- Subscription resources by trigger type:
  - `teams_trigger_new_message`, `_new_reply`, `_channel_mention` → `/teams/{teamId}/channels/{channelId}/messages`.
  - `teams_trigger_user_joins_team` → `/teams/{teamId}/members` (**app-only**).
  - `teams_trigger_new_chat_message` with `chatId` → `/chats/{chatId}/messages` (delegated). Without `chatId` → `/chats/getAllMessages` (**app-only**).
  - `teams_trigger_new_chat` → `/chats` (**app-only**).
  - `teams_trigger_new_channel` → `/teams/{teamId}/channels` (delegated).
- Subscription expiration: **4230 minutes (≈70 hours)** — matches the V2 Outlook Mail / Calendar / OneDrive precedent.
- **`includeResourceData: false`** ([line 72](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts#L72)) — V1 already opted out of encrypted resource data to avoid certificate-validation failures. The receive route does an `id`-fetch GET to hydrate message payloads instead.
- `lifecycleNotificationUrl` set to the same `notificationUrl` as primary delivery.
- App-only token path ([lines 542-574](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts#L542)): client-credentials grant requiring `TEAMS_TENANT_ID` env var + admin consent on the granted scopes — only used for the three trigger types listed above.
- Test-mode subscription reuse: V1 has a multi-step "find existing test subscription, validate it's still alive on the Graph side, reuse" path ([lines 95-189](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts#L95)). V2's lifecycle layer does not have a test-mode reuse path; the activation hook upserts fresh on each activate. **Defer this complexity.**

### Webhook receive route

[`app/api/webhooks/teams/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/teams/route.ts) (588 lines). Handles:
- `validationToken` query handshake (both POST and GET).
- `decryptResourceData` import [line 6](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/teams/route.ts#L6) — but it's behind a guard since `includeResourceData: false` means encrypted payloads never arrive in practice. The branch is dead in the current V1 config; defer the encryption-cert plumbing entirely.
- Per-notification: `clientState` check (`workflow_${workflowId}`), then GET back to Graph to fetch the message resource by id.
- Dedup via DB (V1's webhook_event_dedup analog).

### OAuth flow — V1 has its own Azure AD app row (the bug to fix)

- Config: [`lib/integrations/oauthConfig.ts:370-385`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L370).
  - **Separate `TEAMS_CLIENT_ID` / `TEAMS_CLIENT_SECRET` env vars** — distinct from `MICROSOFT_CLIENT_ID/SECRET` used by Outlook Mail / Calendar / OneDrive / Excel siblings in V2.
  - Dedicated callback path `/api/integrations/teams/callback`.
  - Same `/common/oauth2/v2.0/{authorize,token}` endpoints as every other Microsoft provider — the only thing actually different is the client_id/secret pair.
  - V1's manifest scope list is **massive** (`offline_access` + 19 Graph scopes) — covers every action V1 has ever shipped plus admin-consent ones (`Channel.Delete.All`, `TeamMember.ReadWrite.All`, `Team.Create`, `User.Invite.All`).
- **This is V1 rot.** Microsoft Graph treats one Azure AD app as the auth principal regardless of which Graph API surface the resulting token hits — the API surface is determined by the **scopes granted at consent**, not by the app id. V1 ended up with two separate Azure AD apps doing the same work because Teams was added as a separate silo. **V2 fixes this** by reusing `_shared/microsoft/oauth.ts` with `MICROSOFT_CLIENT_ID/SECRET`. Same fix already shipped for OneDrive (slice 8) and Excel (slice 15).
- Token-exchange response: standard Microsoft v2 `{ access_token, refresh_token, expires_in, scope, token_type }`. Refreshable.

### Scope-validation registry entry

[`lib/integrations/integrationScopes.ts:85-105`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/integrationScopes.ts#L85) lists 19 required scopes for `teams`. **V2 does not replicate this list.** V2's manifest declares the scopes its Batch 1 actions actually need (narrow set), and adds optional scopes only when a follow-up action lands.

### Data loaders (dynamic dropdowns)

V1 ships `teams_teams`, `teams_channels`, `teams_chats` dropdown loaders. **Out of scope for Batch 1.** V2's data-loader registry is not part of Phase 1 provider ports; the slice 15 (Excel) precedent ships actions that take id inputs as plain strings.

---

## V2 reusable infrastructure

| # | Helper | V2 file | Purpose for Teams |
|---|--------|---------|-------------------|
| 1 | Shared Microsoft OAuth (PKCE, exchange, refresh) | [`integrations/_shared/microsoft/oauth.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/_shared/microsoft/oauth.ts) | Authorize URL, token exchange, refresh — all via `MICROSOFT_CLIENT_ID/SECRET`. **Replaces V1's separate `TEAMS_CLIENT_ID/SECRET`.** |
| 2 | Graph fetch base | `integrations/_shared/microsoft/api/_base.ts` | Reuse for every Teams Graph call. |
| 3 | Account-id resolver | `integrations/_shared/microsoft/api/me.ts` | Resolves `email` for `accountIdField`. |
| 4 | Graph error parser | `integrations/_shared/microsoft/api/errors.ts` | Surfaces Graph error envelopes for action + trigger failures. |
| 5 | Subscription CRUD wrappers | [`integrations/_shared/microsoft/api/subscriptions.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/_shared/microsoft/api/subscriptions.ts) | Resource-agnostic POST / PATCH / DELETE on `/v1.0/subscriptions`. Used by Outlook Mail + Calendar + OneDrive — Teams reuses unchanged. |
| 6 | Graph webhook validation handshake | [`integrations/_shared/microsoft/webhooks/validation.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/_shared/microsoft/webhooks/validation.ts) | Pure-Request validation echo. Used by all three sibling Microsoft webhook receive routes. |
| 7 | Subscription registry + renewal cron | [`services/triggers/subscriptionRegistry.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/triggers/subscriptionRegistry.ts), [`services/triggers/runRenewals.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/triggers/runRenewals.ts) | Teams registers a SubscriptionHandler alongside Calendar / Outlook / OneDrive. Renewal cron picks it up automatically once registered. |
| 8 | Trigger lifecycle (activate / deactivate / dispatch) | [`services/triggers/{lifecycle,deactivationRegistry,dispatch}.ts`](c:/Users/marcu/source/repos/ChainReactV2/services/triggers/) | Same machinery as Outlook Mail / Calendar / OneDrive. |
| 9 | `trigger_resources.config` persistence + webhook dedup table | [`repositories/triggerResources.ts`](c:/Users/marcu/source/repos/ChainReactV2/repositories/triggerResources.ts), [`repositories/webhookEventDedup.ts`](c:/Users/marcu/source/repos/ChainReactV2/repositories/webhookEventDedup.ts) | Stores subscription metadata; webhook dispatcher consults dedup table per inbound event. |
| 10 | OneDrive provider as template | [`integrations/microsoft-onedrive/`](c:/Users/marcu/source/repos/ChainReactV2/integrations/microsoft-onedrive/) | Closest analog: same Microsoft OAuth, subscription-watch lifecycle with `includeResourceData: false`, id-fetch receive branch. Manifest + actions + trigger structure copies cleanly. |

**Not needed for Teams Batch 1:**
- `services/triggers/pollingRegistry.ts` (Teams uses Graph subscriptions, not polling — Batch 1 trigger fires on Graph push).
- Any encryption-cert utility (`includeResourceData: false`, mirroring V1).
- App-only token helper (no Batch 1 trigger or action needs it — see below).
- Tenant id env var (`TEAMS_TENANT_ID` / `MICROSOFT_TENANT_ID` not read by any Batch 1 path).

---

## Confirmed answers — Commit 1 questions

1. **Does Teams reuse the shared Microsoft OAuth app in V2, or does V1 use a separate `TEAMS_*` OAuth silo?**
   V1 uses a separate silo (`TEAMS_CLIENT_ID/SECRET` + `/api/integrations/teams/callback`). **V2 consolidates onto the shared `MICROSOFT_CLIENT_ID/SECRET`** via `_shared/microsoft/oauth.ts` — same fix already applied to OneDrive (slice 8) and Excel (slice 15).

2. **What scopes are required?**
   **Batch 1 (narrow set tied to actual handlers + trigger):**
   - `offline_access` — required for refresh-token issuance.
   - `User.Read` — Graph `/me` lookup at OAuth callback (`accountIdField: "email"`).
   - `ChannelMessage.Send` — `send_channel_message` + `reply_to_channel_message`.
   - `ChannelMessage.Read.All` — `new_channel_message` trigger receiver (id-fetch GET to hydrate the inbound message).
   - `Channel.ReadBasic.All` — `get_channel_details`.
   - `Channel.Create` — `create_channel`.
   - `Team.ReadBasic.All` — listing the user's teams in `get_team_members` precondition path.
   - `TeamMember.Read.All` — `get_team_members` (read-only; does NOT need the admin-consent `.ReadWrite.All`).
   - `Chat.ReadWrite` — `send_chat_message`.
   Total: **9 required scopes.** Significantly narrower than V1's 19. None require admin tenant consent.
   **Deferred (Batch 2+ scopes — explicitly NOT in Batch 1):**
   - `Channel.Delete.All`, `TeamMember.ReadWrite.All`, `Team.Create`, `User.Invite.All`, `Chat.Create`, `OnlineMeetings.ReadWrite`, `Calendars.ReadWrite` (when the corresponding actions/triggers ship).

3. **Which Teams actions exist in V1?**
   19 handlers: `sendMessage`, `sendChatMessage`, `createChannel`, `addMemberToTeam`, `scheduleMeeting`, `sendAdaptiveCard`, `getTeamMembers`, `createTeam`, `replyToMessage`, `editMessage`, `findMessage`, `deleteMessage`, `createGroupChat`, `getChannelDetails`, `addReaction`, `removeReaction`, `endMeeting`, `updateMeeting`, `startMeeting`.

4. **Which Teams triggers exist in V1?**
   7 subscription triggers: `new_message` (channel), `new_reply`, `channel_mention`, `user_joins_team`, `new_chat`, `new_chat_message`, `new_channel`.

5. **Which features require delegated auth vs app-only auth?**
   - **Delegated (all Batch 1):** every action handler. Channel + chat message send/read/list. Team + channel metadata. Channel creation. Reply-to-message. The `new_channel_message` trigger.
   - **App-only (deferred):** `teams_trigger_new_chat`, `teams_trigger_user_joins_team`, and the chat-aggregate variant `teams_trigger_new_chat_message` with no `chatId` (which resolves to `/chats/getAllMessages`). The same V1 file's `needsAppOnlyToken()` switch at [line 525](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts#L525) confirms this.

6. **Does any action require tenant admin consent?**
   - **Batch 1 actions (chosen below):** NO. The 5 actions use only `ChannelMessage.Send`, `Channel.ReadBasic.All`, `Channel.Create`, `TeamMember.Read.All`, `Chat.ReadWrite`, `Team.ReadBasic.All` — all delegated-user-grantable.
   - **Deferred actions:** `addMemberToTeam` (`TeamMember.ReadWrite.All` — admin), `createTeam` (`Team.Create` — typically admin-gated in real tenants), `createGroupChat` (`User.Invite.All` — admin), `addReaction` / `removeReaction` (`ChannelMessage.Edit` — admin). These come back in Batch 2 with explicit admin-consent ops requirements.

7. **Does any trigger require Microsoft Graph subscription lifecycle?**
   YES — every Batch 1 trigger is a Graph subscription. Validation handshake + `expirationDateTime` ≤ 4230 minutes + renewal before expiry. V2's `_shared/microsoft/api/subscriptions.ts` + `services/triggers/subscriptionRegistry.ts` + `services/triggers/runRenewals.ts` cover this without additions.

8. **Does Teams need `includeResourceData` / encrypted notifications, or can Batch 1 avoid certificate complexity?**
   **Batch 1 avoids certificate complexity entirely.** V1 explicitly sets `includeResourceData: false` ([line 72](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts#L72)) — the receive route does an id-fetch GET to hydrate the message resource. V2 mirrors this exactly. No certificate generation, no Graph-side public-key registration, no `decryptResourceData` import. (V1 imports `decryptResourceData` in [`route.ts:6`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/teams/route.ts#L6) but the call site is dead under the `false` config.)

9. **What can reuse existing V2 Microsoft OAuth, refreshAndRetry, Graph webhook validation, subscriptionRegistry, and dedup infrastructure?**
   All of it. Items 1–9 in the V2 reusable-infrastructure table above are reused without modification. Same precedent established by slice 7 (Calendar) + slice 8 (OneDrive).

10. **What should be deferred because it requires app-only credentials, admin consent, or certificate/encrypted notifications?**
    - 14 of 19 V1 actions — all the meeting actions (`scheduleMeeting`, `startMeeting`, `endMeeting`, `updateMeeting`), all member-management actions (`addMemberToTeam`, `createTeam`, `createGroupChat`), all message-mutation actions beyond reply (`editMessage`, `deleteMessage`, `findMessage`), reactions, `sendAdaptiveCard`.
    - 6 of 7 V1 triggers — `new_reply`, `channel_mention`, `new_chat`, `new_chat_message`, `new_channel`, `user_joins_team`. The new-channel trigger is delegated and could be a fast follow-up; deferred for Batch 1 to keep the slice scope honest.
    - Test-mode subscription reuse path (V1 lifecycle.ts lines 95-189).
    - Dynamic dropdown data-loader registry.
    - `decryptResourceData` / encryption-cert plumbing.
    - App-only token grant.

---

## Confirmed scope decisions

1. **Provider id:** `microsoft-teams` (V2 convention — V1 uses `teams`). Matches the OneDrive / Outlook-Mail / Outlook-Calendar / Excel naming pattern: one Azure AD app, separate `integrations` rows because connected-state per Graph surface is independent.
2. **OAuth model:** refreshable, PKCE S256, `/common/` multi-tenant endpoint — entirely via the shared `_shared/microsoft/oauth.ts` helpers. **Single Azure AD app via `MICROSOFT_CLIENT_ID/SECRET`** (closes V1's `TEAMS_CLIENT_ID/SECRET` duplication).
3. **Scopes (required — 9):** `offline_access`, `User.Read`, `ChannelMessage.Send`, `ChannelMessage.Read.All`, `Channel.ReadBasic.All`, `Channel.Create`, `Team.ReadBasic.All`, `TeamMember.Read.All`, `Chat.ReadWrite`. See question 2 above for rationale.
4. **Token shape:** access + refresh, `expires_in` populated. Refresh uses preserve-old policy from `refreshMicrosoftToken`.
5. **`accountIdField`:** `email` (`mail ?? userPrincipalName` fallback via shared `getMe()`). Same as the four sibling Microsoft providers.
6. **`tokenScope`:** `"user"` — one Teams integration per (user, email).
7. **Health-check interval:** Microsoft tier (6h) per CLAUDE.md §4.
8. **Action surface (Batch 1 — 5 actions):** see "Batch 1 action list" below.
9. **Action surface deferred (Batch 2 candidates — 14 actions):** see question 10. Highest-value next ports: `reply_to_channel_message` (delegated, no admin scopes — could land in a Batch 2 fast-follow), `edit_message`, `delete_message`, `find_message`, `send_adaptive_card`. Meeting actions deferred behind their admin-scope requirement.
10. **Trigger surface (Batch 1 — 1 trigger):** `new_channel_message` (Graph subscription on `/teams/{teamId}/channels/{channelId}/messages` with `changeType: created`, delegated user token).
11. **Trigger surface deferred:** `new_reply`, `channel_mention`, `user_joins_team` (app-only), `new_chat` (app-only), `new_chat_message` (delegated when scoped to a specific chat; app-only when scoped to `/chats/getAllMessages`), `new_channel` (delegated; could be a Batch 2 fast-follow).
12. **Subscription configuration (Batch 1 baseline):** `includeResourceData: false`; `lifecycleNotificationUrl` set to the same URL as `notificationUrl`; expiration 4230 minutes; `clientState` = 32 random bytes hex (matches V2 OneDrive precedent — narrower than V1's `workflow_${workflowId}` which leaks the workflow id).
13. **Webhook receive route:** `app/api/webhooks/microsoft-teams/route.ts` mirroring `microsoft-onedrive/route.ts` shape. Validation handshake via the shared helper. Per-notification: clientState verify → id-fetch GET (`/teams/{teamId}/channels/{channelId}/messages/{messageId}`) → normalize → dispatch → dedup via `webhook_event_dedup`.
14. **Webhook dedup key:** `${subscriptionId}:${messageId}` — Teams channel messages don't have a `lastModifiedDateTime` like OneDrive's `etag` proxy, so version differentiation is not required for `created`-only Batch 1.
15. **Renewal:** `_shared/microsoft/api/subscriptions.ts` PATCH wrapper. Threshold ≤ 24 hours remaining → renew (matches Outlook Mail / Calendar / OneDrive).
16. **No app-only auth in Batch 1.** Every action + trigger uses the user's delegated token. No `TEAMS_TENANT_ID` env var. No `client_credentials` grant.
17. **No new Supabase migrations.** `trigger_resources` schema + `webhook_event_dedup` already accept the Teams shape.
18. **Q11 (no hidden defaults):** the `isPrivate` boolean on `create_channel` is a behavior switch with a recommended default (`false`). Acceptable to default to `false` — this is not a high-risk default per CLAUDE.md §6 (Q11) categories.
19. **401 handling:** every action wraps its principal Graph call in `refreshAndRetry`. Refresh on first 401 → retry once → permanent failure → `token_revoked` health signal.

---

## Batch 1 action list (final — 5 actions)

| # | Action type | Title | Graph endpoint(s) | Notes |
|---|-------------|-------|-------------------|-------|
| 1 | `microsoft_teams_action_send_channel_message` | Send Channel Message | `POST /v1.0/teams/{teamId}/channels/{channelId}/messages` | HTML content via `{ body: { contentType: 'html', content } }`. |
| 2 | `microsoft_teams_action_send_chat_message` | Send Chat Message | `POST /v1.0/chats/{chatId}/messages` | Same body shape. |
| 3 | `microsoft_teams_action_reply_to_channel_message` | Reply To Channel Message | `POST /v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}/replies` | Inputs: teamId, channelId, messageId, content. |
| 4 | `microsoft_teams_action_get_channel_details` | Get Channel Details | `GET /v1.0/teams/{teamId}/channels/{channelId}` | Read-only. |
| 5 | `microsoft_teams_action_get_team_members` | Get Team Members | `GET /v1.0/teams/{teamId}/members` | Read-only. Uses `TeamMember.Read.All` (NOT `.ReadWrite.All`). |

`create_channel` was an obvious candidate but is **deferred to Batch 2** because creating a channel in a real tenant typically requires the user to be a team owner — exercising the action in e2e without that nuance risks 403s that mask other regressions. Five actions keeps the Batch 1 surface focused on the message + read paths that mirror Slack's `send_channel_message` (slice 1 + slice 11 + slice 13 precedent).

---

## Batch 1 trigger list (final — 1 trigger)

| # | Trigger type | Graph subscription resource | changeType | Notes |
|---|--------------|------------------------------|------------|-------|
| 1 | `microsoft_teams_trigger_new_channel_message` | `/teams/{teamId}/channels/{channelId}/messages` | `created` | Delegated user token. `includeResourceData: false`. Receive route does an id-fetch GET to hydrate the message body. |

Renewal handler registered alongside Outlook Mail / Calendar / OneDrive via `services/triggers/subscriptionRegistry.ts`.

---

## V1 rot to fix during port

1. **Separate Azure AD app for Teams.** V1 uses `TEAMS_CLIENT_ID/SECRET` distinct from `MICROSOFT_CLIENT_ID/SECRET`. V2 uses one app via `_shared/microsoft/oauth.ts`. Closes a real ops gap (two app registrations to maintain, two secrets to rotate, two consent screens for users connecting both Teams and OneDrive).
2. **Provider id rename `teams` → `microsoft-teams`.** Matches the V2 naming convention for the family.
3. **Massive scope list.** V1 requests 19 scopes regardless of which actions are configured. V2 requests 9 narrower scopes, all delegated-user-grantable. No tenant admin consent path required for Batch 1.
4. **`clientState` leakage.** V1 sets `clientState: workflow_${workflowId}` — leaks the workflow id in the Graph subscription record. V2 uses 32 random hex bytes (same pattern as OneDrive).
5. **`decryptResourceData` import without execution path.** V1's receive route imports the decryption helper but the configured `includeResourceData: false` means the helper is never invoked. V2 omits the import entirely.
6. **Test-mode subscription-reuse complexity** (lines 95-189 of V1 lifecycle). Defer the entire reuse path; V2 activates fresh on each activate. The Graph subscription quota concern V1 was working around is not a Batch 1 problem.
7. **Inline `Authorization: Bearer ${accessToken}` per handler.** V2 wraps in `refreshAndRetry` for uniform 401 + retry semantics.

---

## V1 patterns to skip

- **App-only `client_credentials` grant** ([lines 542-574](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/teams/index.ts#L542)) — none of the Batch 1 trigger or actions need it.
- **`/chats/getAllMessages` resource** — app-only, deferred.
- **`/chats` collection resource (new chat trigger)** — app-only, deferred.
- **`/teams/{teamId}/members` subscription** (user-joins-team trigger) — app-only, deferred.
- **Adaptive-card content schema validation** — defer with `send_adaptive_card`.
- **Multi-strategy team/channel/chat dropdown loaders** — out of Phase 1 scope.
- **Encryption-cert generation + rotation utilities** — `includeResourceData: false` makes them dead code.
- **V1's `findGraphSubscription` test-reuse helper** — not needed in V2's lifecycle model.

---

## Open questions / decisions to flag

1. **Renewal handler shape.** Outlook Mail + Calendar + OneDrive each have a small `renew.ts` that constructs `{ expirationDateTime: now + 4230min }` and PATCHes the subscription. Teams will mirror this exactly. **Not blocking Commit 1.**
2. **`Chat.ReadWrite` vs narrower `ChatMessage.Send`.** Microsoft tags `ChatMessage.Send` as "preview" in some places; `Chat.ReadWrite` is the stable surface. Start with `Chat.ReadWrite`; downgrade to `ChatMessage.Send` later if real-world consent friction surfaces. **Not blocking.**
3. **Webhook dedup key durability.** `${subscriptionId}:${messageId}` is sufficient for `created` events; if a future Batch 2 adds `updated`-change-type triggers, the key must include a version discriminator. **Not blocking Batch 1.**
4. **e2e mock plan.** The Microsoft mock server already handles `/common/oauth2/v2.0/{authorize,token}`, `/v1.0/me`, `/v1.0/subscriptions{,/id}`. Adding Teams requires: `GET /v1.0/teams/{id}/channels/{id}` (channel details), `GET /v1.0/teams/{id}/members` (members list), `POST /v1.0/teams/{id}/channels/{id}/messages` (send), `POST /v1.0/chats/{id}/messages` (chat send), `POST /v1.0/teams/{id}/channels/{id}/messages/{id}/replies` (reply), `GET /v1.0/teams/{id}/channels/{id}/messages/{id}` (id-fetch hydration for the trigger). Same scale as the OneDrive additions. **Not blocking Commit 1.**

---

## Local batch plan (5 commits)

| Commit | Scope | New files | Edits to shared files |
|--------|-------|-----------|------------------------|
| **1 (this)** | Plan doc only. | `docs/slices/slice-16-microsoft-teams.md` | None. |
| **2** | Manifest + OAuth registration via shared `_shared/microsoft/oauth.ts`. Provider folder skeleton: `integrations/microsoft-teams/{manifest.ts,oauth.ts,api/}`. Dispatcher + registry append-only entries. | `integrations/microsoft-teams/manifest.ts`, `oauth.ts`, `api/types.ts`. | `integrations/_registry.ts` (one-line append), `services/oauth/dispatcher.ts` (one-line append). |
| **3** | 5 Batch 1 actions + 5 Graph API wrappers. All wrapped in `refreshAndRetry`. Zod schemas. Unit tests colocated under `tests/unit/integrations/microsoft-teams/actions/`. Manifest `actions: true` flip. | 5 action files + 5 schema files + 5 unit-test files; `integrations/microsoft-teams/api/{channelMessageSend,chatMessageSend,channelMessageReply,channelGet,teamMembersList}.ts` + wrapper tests. | Action handler-registry append-only entries (5 rows). |
| **4** | `new_channel_message` subscription trigger + activation + deactivation + renewal + receive route. Subscription handler registration. Manifest `webhookTrigger: true` flip. | `integrations/microsoft-teams/triggers/newChannelMessage/{activate,deactivate,renew,normalize,index}.ts` + `integrations/microsoft-teams/webhooks/receive.ts`. `app/api/webhooks/microsoft-teams/route.ts`. `app/api/webhooks/microsoft-teams/lifecycle/route.ts`. Tests under `tests/unit/integrations/microsoft-teams/triggers/`. | Module import added at `integrations/_registry.ts` for registration side-effect. |
| **5** | Mocked Microsoft Graph Teams e2e walkthrough — full provider lifecycle: OAuth → activate trigger (validation handshake) → notification delivery → id-fetch hydration → action run → deactivate. Mirrors OneDrive's mocked walkthrough shape. | `tests/e2e/slice-16-microsoft-teams-walkthrough.spec.ts`, Teams mock routes appended to `tests/e2e/helpers/mockMicrosoftServer.ts` (channels, channel-messages send + reply + get, team-members list, chat-messages send). Playwright env vars unchanged (Teams reuses Microsoft mock origin). | `tests/e2e/helpers/mockMicrosoftServer.ts` (Teams routes), `tests/e2e/global-setup.ts` (no changes — Teams uses existing Microsoft handle). |

Each commit lands locally, gates green, no push.

---

## Validation gates (per commit)

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

Commit 1 only adds a markdown file under `docs/`, so all five gates should pass without code-affecting changes. Commit 5 also runs Playwright e2e (sequentially per CLAUDE.md "Mailchimp in flight" caveat).

---

## External setup (not blocking Commit 1)

- Reuse the existing Microsoft Azure AD app already configured for Outlook Mail / Calendar / OneDrive / Excel. Add the 9 Batch 1 scopes to the app's API permissions if not already granted. **No new env vars** (the same `MICROSOFT_CLIENT_ID/SECRET` are reused).
- No new public webhook URL beyond `/api/webhooks/microsoft-teams` (matches the slice 6 / 7 / 8 webhook routing).
- No new database migrations.

---

## Constraints

- No push.
- No PR.
- **Mailchimp Commit 6 is in flight in another chat.** Do NOT touch:
  - `integrations/mailchimp/**`
  - `integrations/_shared/mailchimp/**`
  - `app/api/webhooks/mailchimp/**`
  - `tests/unit/**/mailchimp/**`
  - `tests/e2e/helpers/mockMailchimpServer.ts`
  - `tests/e2e/slice-14-mailchimp-walkthrough.spec.ts`
  - Shared files Mailchimp Commit 6 is editing (`playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts`) — if Teams Commit 5 needs to edit any of these for an unrelated reason, STOP and report first.
- Do NOT touch `integrations/_registry.ts` in Commit 1 (it is dirty from Mailchimp Commit 6's trigger additions). Commit 2 edits it with a single-line append, fine.
- No new Supabase migrations.
- No app-only / tenant-admin auth.
- No `includeResourceData` encryption-cert plumbing.
- Do not start Commit 2 until Commit 1 is accepted.
