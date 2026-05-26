# Microsoft Teams — Builder Metadata Coverage Plan (TEAMS-META-1)

**Slice:** 4.TEAMS-META-1 (this plan) → TEAMS-META-2 (resolvers) → TEAMS-META-3 (metas + trigger + COVERED flip)
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Sibling precedents:** [`onedrive-metadata-coverage-plan.md`](./onedrive-metadata-coverage-plan.md) + [`excel-metadata-coverage-plan.md`](./excel-metadata-coverage-plan.md) (Microsoft Graph resolver patterns), [`trello-metadata-coverage-plan.md`](./trello-metadata-coverage-plan.md) (resolver-first, opaque ids), [`builder-options-multi-parent-dependencies.md`](./builder-options-multi-parent-dependencies.md).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Microsoft Teams is the **6th** of the (now) 4 pending-metadata providers (after Shopify, Excel, Airtable, Trello, OneDrive). **Current state (code-verified):** **5 runtime actions + 1 webhook trigger** registered and real; **0 ActionMeta, 0 TriggerMeta, 0 options resolvers**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Teams renders as **"coming soon"**.

**Four facts drive the slice plan:**

1. **`teamId` / `channelId` are opaque Graph ids** (`19:...@thread.tacv2` etc.) → Teams is **resolvers-first**. A team → channel cascade is required for a usable builder.
2. **Every picker's parent is ALREADY a real schema field.** `channelId` always co-occurs with a real `teamId` field; a (deferred) `messageId` picker would hang off the real `teamId`+`channelId`. So **Teams needs ZERO UI-scope schema additions** (contrast Trello `boardId` / OneDrive `parentItemId`). The metas are pure additive metadata — **no runtime touch at all** in META-3.
3. **The `api/` helpers are per-resource get/send — there is NO list helper.** `teamMembersList` exists, but nothing lists teams (`/me/joinedTeams`) or channels (`/teams/{id}/channels`). So META-2 needs **2 new read helpers** (`teamsList`, `channelsList`) — contrast OneDrive (which reused `driveItemsList`).
4. **Auth is refreshable** (OAuth v2 + `offline_access`) → resolvers use `refreshAndRetry` (Excel/OneNote/OneDrive pattern), NOT Trello's decrypt-direct.

---

## 1. Current Teams runtime inventory

**Manifest** ([`integrations/microsoft-teams/manifest.ts`](../../../integrations/microsoft-teams/manifest.ts)): id `microsoft-teams`, displayName "Microsoft Teams". OAuth v2, `tokenScope:"user"`, `apiVersion:"v1.0"`, `refreshable:true`, `healthCheckIntervalMs:6h`. Scopes (8, narrow — V1 had 19): `offline_access`, `User.Read`, `ChannelMessage.Send`, `ChannelMessage.Read.All`, `Channel.ReadBasic.All`, `Team.ReadBasic.All`, `TeamMember.Read.All`, `Chat.ReadWrite`. Capabilities `oauth/webhookTrigger/actions:true`, `pollingTrigger:false`. **`Channel.ReadBasic.All` + `Team.ReadBasic.All` already cover the teams/channels resolver reads — no scope change / reconnect.**

**Shared transport** ([`integrations/_shared/microsoft/api/`](../../../integrations/_shared/microsoft/api/)): `graphApiBase()`, `NotFoundError`, `surfaceGraphError()`, `Unauthorized401Error` (from `refreshAndRetry`). Teams `api/*.ts` wrappers `fetch` Graph with `Authorization: Bearer`; handlers wrap in `refreshAndRetry({provider:"microsoft-teams", accountId})`.

**API helpers** ([`api/`](../../../integrations/microsoft-teams/api/)): `channelGet` (single channel), `channelMessageGet` (single message — trigger hydration), `channelMessageSend`, `channelMessageReply`, `chatMessageSend`, `teamMembersList` (`GET /teams/{id}/members` — **reusable**), `types`. **NO `teamsList` / `channelsList` — those are the META-2 gap (§3).**

### 1.1 Registered action handlers (5)

Source of truth: [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts). `*` = required at the schema layer. "Picker" = field wanting an options resolver.

| # | Action key | File | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `send_channel_message` | sendChannelMessage.ts | teamId*, channelId*, content*, contentType(text\|html, default html) | `{messageId, createdDateTime, lastModifiedDateTime, replyToId, subject, bodyContent, bodyContentType, fromUserId, fromUserDisplayName, webUrl, teamId, channelId}` | create → **medium** | `bodyContent` | teamId→teams; channelId→channels(dep teamId) |
| 2 | `reply_to_channel_message` | replyToChannelMessage.ts | teamId*, channelId*, messageId*, content*, contentType | same shape + `parentMessageId` | create → **medium** | `bodyContent` | teamId→teams; channelId→channels; messageId→**text (deferred, §3)** |
| 3 | `send_chat_message` | sendChatMessage.ts | chatId*, content*, contentType | same shape + `chatId` | create → **medium** | `bodyContent` | chatId→**text (deferred, §3)** |
| 4 | `get_channel_details` | getChannelDetails.ts | teamId*, channelId* | `{teamId, channelId, displayName, description, email, membershipType, createdDateTime, webUrl}` | read → **low** | `email` (channel email — forced) | teamId→teams; channelId→channels |
| 5 | `get_team_members` | getTeamMembers.ts | teamId*, top?(1–999) | `{teamId, members:[{memberId, displayName, email, userId, roles, isOwner}], count, hasMore, nextLink}` | read → **low** | nested `members[].email` (forced) | teamId→teams |

**Notable:** All 5 are **writes (medium) or reads (low)** — **NO destructive action** (no delete/archive/remove-member in the surface; V1's `Channel.Delete.All` / `TeamMember.ReadWrite.All` scopes were deliberately not ported). So Teams has **no destructive trio** (like Trello). `contentType` defaults to `html` (V1-normalized). `send_chat_message` identifies the target by an opaque `chatId` only (no participant-email resolution — §3).

### 1.2 Registered trigger (1 — webhook subscription-watch)

[`triggers/newChannelMessage/`](../../../integrations/microsoft-teams/triggers/newChannelMessage/) — `index.ts` does `registerActivation("microsoft-teams","new_channel_message",activate)` + `registerDeactivation(...)` + `registerSubscriptionHandler(...)`. Imported at `integrations/_registry.ts` → loads at module init (`trigger-meta-activation-invariant` passes with no `_registry` change + no exemption).

| Trigger key | Normalized type | Model | Lifecycle | User config | Ship now? |
|---|---|---|---|---|---|
| `new_channel_message` | microsoft-teams.new_channel_message | **webhook** (Graph subscription on `/teams/{teamId}/channels/{channelId}/messages`, `changeType:"created"`) | `activate` → `POST /subscriptions` (clientState, expiresAt persisted); **renewal** before the ~70.5h expiry (renew at 1h-before, via `subscriptionRegistry`); `deactivate` deletes; receive hydrates via `channelMessageGet` (`includeResourceData:false`) | `teamId`*, `channelId`* (per-(team,channel)) | ✅ yes |

Payload (from [`normalize.ts`](../../../integrations/microsoft-teams/triggers/newChannelMessage/normalize.ts)): `messageId`, `teamId`, `channelId`, `subject`, `bodyContent`, `bodyContentType`, `bodyPreview`, `importance`, `messageType`, `replyToId`, `fromUserId`, `fromUserDisplayName`, `createdDateTime`, `lastModifiedDateTime`, `webUrl`, `changeType`. **Ships TriggerMeta** — config = `teamId` + `channelId` pickers (the per-(team,channel) subscription anchors).

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts`. **Field names camelCase**, verbatim to the runtime schemas: `teamId`, `channelId`, `messageId`, `chatId`, `content`, `contentType`, `top`.

**Common defaults:** `requiresIntegration:true`; **`category:"messaging"`** (Teams is a chat/messaging tool — same call as Slack/Discord); sequential `displayOrder` (10..50); `producesFileRef:false`, `consumesFileRef:false` for all (no FileRef surface — Teams actions take/return text, no attachments in the Batch-1 surface). _(Reminder: every `: ActionMeta` literal must set `producesFileRef`/`consumesFileRef`/`isDestructive`/`requiresConfirmation` explicitly — Zod `.default()` applies only at `.parse()`, per the AIRTABLE-META-3 learning.)_

**Risk classification:**
- **low** — `get_channel_details`, `get_team_members` (pure reads).
- **medium** — `send_channel_message`, `reply_to_channel_message`, `send_chat_message` (post a message; recoverable — Teams messages are deletable).
- **No high / destructive / requiresConfirmation** — the surface has no delete/archive/remove action (contrast Airtable/Excel/OneDrive deletes). Same shape as Trello.

**Field-type mapping** (every type from [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) `FieldTypeSchema`):
- `teamId` → **combobox + `optionsSource:"microsoft-teams:teams"`** (no dep), required. The cascade root.
- `channelId` → **combobox + `optionsSource:"microsoft-teams:channels"`, `dependsOn:"teamId"`**, required. `teamId` is already a real sibling field — **no UI-scope addition needed.**
- `messageId` (reply) → **text**, required. Picker deferred (§3 — commonly flows from the `new_channel_message` trigger; channel-message listing is expensive). Placeholder: "Parent message id (e.g. from the trigger)."
- `chatId` (send_chat_message) → **text**, required. Picker deferred (§3 — chat labeling is hard; open Marcus decision). Placeholder.
- `content` → **textarea**, required (the message body; Markdown/HTML per `contentType`).
- `contentType` → **select** (`html` / `text`), `defaultValue:"html"` (UI hint; schema owns the authoritative default).
- `top` (get_team_members) → **number**, optional, `numeric:{min:1,max:999,integer:true}`.

**Sensitive outputs:**
- **Forced by `sensitive-output-coverage`** (name ∈ suspicious set): `get_channel_details.email` (the channel's email address), `get_team_members.members[].email` (nested PII), trigger `bodyPreview`. These MUST be marked or the test fails.
- **Plan-marked (message content)**: `bodyContent` on `send_channel_message` / `reply_to_channel_message` / `send_chat_message` outputs + the trigger payload — user-authored message text (mirrors Slack message-body sensitivity).
- **NOT marked** (ids / names / urls — consistent with the Trello/Airtable/Slack "ids & names not over-marked" precedent): `messageId`, `teamId`, `channelId`, `memberId`, `userId`, `displayName`, `fromUserId`, `fromUserDisplayName`, `webUrl`, `subject`, `roles`, `isOwner`, `membershipType`, dates, `count`, `hasMore`, `nextLink`, `importance`, `messageType`. _(`webUrl` is a Teams UI deeplink, not a signed/secret URL — not marked, consistent with Trello `url`. `userId`/`fromUserId` are AAD object ids — ids, not marked; the PII that IS marked is the `email`.)_ No secret-shaped output names exist.

**Task cost:** per the central policy ([`lib/workflows/cost-calculator.ts`](../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`), each Teams action bills **1 task on success** (reads included). No per-meta override.

---

## 3. Options resolver audit

Teams **needs resolvers** (`teamId`/`channelId` opaque). **Auth refreshable** → `refreshAndRetry({provider:"microsoft-teams", accountId})`. All read-only against the existing `Team.ReadBasic.All` / `Channel.ReadBasic.All` scopes → **no scope change, no reconnect.**

| Resolver | Serves | Endpoint / **new helper** | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `microsoft-teams:teams` | teamId on all 4 team-scoped actions + the trigger | **MISSING** — new `teamsList` (`GET /me/joinedTeams?$select=id,displayName,description`) | none | **REQUIRED (META-2)** | No — opaque id |
| `microsoft-teams:channels` | channelId on send/reply/get_channel_details + the trigger | **MISSING** — new `channelsList` (`GET /teams/{teamId}/channels?$select=id,displayName,membershipType`) | `["teamId"]` | **REQUIRED (META-2)** | No |
| `microsoft-teams:members` | — | (reuse `teamMembersList`) | `["teamId"]` | **REJECT (v1)** — **no action takes a member/user id as input.** `get_team_members` *outputs* members but consumes no member picker; `send_chat_message` uses an opaque `chatId`, not member emails. No runtime consumer → don't build it (Trello-checklists precedent). | n/a |
| `microsoft-teams:chats` | send_chat_message.chatId | (would need new `chatsList` — `GET /chats?$expand=members`) | none | **DEFER (v1)** — chatId typeable. **Open Marcus decision** (§5). | chatId typeable |
| `microsoft-teams:messages` | reply_to_channel_message.messageId | (would need new `channelMessagesList`) | `["teamId","channelId"]` (multi-parent) | **DEFER (v1)** — messageId commonly flows from the `new_channel_message` trigger; a channel-message picker is large + ordering-ambiguous. | messageId typeable / trigger-fed |

**No UI-scope schema additions (the key simplification):** unlike Trello (`boardId`) / OneDrive (`parentItemId`), **every Teams picker's parent is already a real field** — `channelId` cascades off the real `teamId`; a future `messages` resolver would cascade off the real `teamId`+`channelId` (multi-parent, BUILDER-OPTIONS-1). So **META-3 touches no runtime schema** — it is pure additive metadata.

**The `chats` deferral (the main UX gap — open Marcus decision):** `send_chat_message` targets an opaque `chatId`, which is awkward to obtain from the Teams UI. A `microsoft-teams:chats` resolver is *feasible* (`GET /chats?$expand=members`, label = `topic` for group chats || joined member `displayName`s for 1:1 chats) but **non-trivial**: 1:1 chats have no name (labeling requires participant expansion → larger/expensive calls + the connected user must be filtered out), and chat lists can be long. **Recommendation:** ship `chatId` as a **typeable text field** in the first pass (META-3) and revisit a `chats` resolver as a follow-up; flag this as the one weak-UX spot. _Marcus decision: ship a basic `chats` resolver in META-2, or accept typeable `chatId` for v1?_

**The `messages` deferral:** `reply_to_channel_message.messageId` is the parent message id — it almost always arrives from the `new_channel_message` trigger (`{{trigger.messageId}}`), and a channel-message picker is expensive (no cheap bounded list; ordering ambiguous). **Recommendation:** typeable text for v1 (don't overbuild — matches the task's "don't overbuild expensive message pickers" guidance).

**Resolver mechanics** (per [`services/options/types.ts`](../../../services/options/types.ts); mirror Excel/OneDrive): each `OptionsResolver { source, provider:"microsoft-teams", requiresIntegration:true, requiredDeps?, resolve(ctx) }`; `resolve` calls the read helper via `refreshAndRetry`, maps `{value:id, label:displayName ?? id, description?}`, returns `{items, hasMore}`. **value = the opaque Graph id.** `hasMore = nextLink !== null` (Graph paging; teams/channels lists are small). q filter client-side on label. `microsoft-teams:channels`: missing `teamId` → `MISSING_DEPENDENCY` (no API call); `NotFoundError` (team gone) → empty items (cascade fallback). Auth → `INTEGRATION_DISCONNECTED`; other → `PROVIDER_ERROR` (static — never leak token / raw Graph body / member emails / message content).

**Recommendation:** build **2 resolvers + 2 new read helpers** in META-2 (`teams` + `channels`). Reject `members`. Defer `chats` (open decision) + `messages`.

---

## 4. Trigger metadata audit

The single `new_channel_message` trigger is runtime-real, webhook (Graph subscription-watch with renewal), activation-registered + loaded → **ships TriggerMeta in this arc.**

`TriggerMeta` (`activation:"webhook"`, `category:"messaging"`, `requiresIntegration:true`):
- **Fields:** `teamId` (combobox → `microsoft-teams:teams`, required) + `channelId` (combobox → `microsoft-teams:channels`, `dependsOn:"teamId"`, required) — the per-(team,channel) subscription anchors (`activate` reads both).
- **payloadShape:** the 16 normalized fields (§1.2). Sensitive: `bodyContent` (content) + `bodyPreview` (forced). Ids / names / `webUrl` / `subject` / dates / `importance` / `messageType` / `changeType` not marked.
- **Activation invariant:** satisfied — `registerActivation("microsoft-teams","new_channel_message",…)` loaded via `integrations/_registry.ts`. No `SHARED_INFRA_EXEMPT_KEYS` entry (real per-subscription webhook).
- Trigger coverage is **not** enforced by `discovery-meta-coverage` (precedent: all Phase-4 providers) — `trigger-meta-activation-invariant` is the gate, and it passes.

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is settled (Slice 16 shipped 5 actions + 1 trigger; V1's 19 scopes, `Channel.Delete.All`, `TeamMember.ReadWrite.All`, `Team.Create`, `User.Invite.All`, `Chat.Create`, OnlineMeetings, separate `TEAMS_CLIENT_ID` app were deliberately not ported). Metadata-only decisions:

- **All 5 actions + the trigger → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime behavior change. **No UI-scope schema additions** (parents are real fields).
- **`teamId`/`channelId` → ADAPT to resolver-backed comboboxes** (`microsoft-teams:teams`; `microsoft-teams:channels` dep `teamId`).
- **2 resolvers + 2 read helpers → ADD (META-2).** `teamsList` (`/me/joinedTeams`) + `channelsList` (`/teams/{id}/channels`).
- **`microsoft-teams:members` → REJECT (v1):** no input consumer.
- **`microsoft-teams:chats` → DEFER (v1):** `chatId` typeable; chat labeling hard (open Marcus decision — ship a basic chats resolver in META-2, or accept typeable chatId?).
- **`microsoft-teams:messages` → DEFER (v1):** `messageId` trigger-fed/typeable; channel-message picker expensive.
- **`content` → textarea, `contentType` → select(html/text), `top` → number.** No FieldType mismatch.
- **No destructive action → no destructive trio.** All writes medium, reads low.
- **REJECT (runtime, already decided — not re-litigated):** channel/team create/delete, member add/remove, chat create, online meetings, the 11 deferred V1 scopes.

---

## 6. Implementation slices

| Slice | Scope | Files (implementation slices — NOT this slice) |
|---|---|---|
| **TEAMS-META-1** (this) | Audit + plan (doc-only) | this doc |
| **TEAMS-META-2** | 2 read helpers + 2 resolvers + resolver tests | new `integrations/microsoft-teams/api/{teamsList,channelsList}.ts`; `integrations/microsoft-teams/options/{teams,channels}.ts` + shared `_shared.ts`; register in `services/options/_registry.ts`; resolver unit tests (mock the Graph boundary) |
| **TEAMS-META-3** | 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | `integrations/microsoft-teams/actions/*.meta.ts` (5); `integrations/microsoft-teams/triggers/newChannelMessage/newChannelMessage.meta.ts` (1); new `services/discovery/providers/microsoft-teams.ts`; wire into `services/discovery/_registry.ts`; add `"microsoft-teams"` to `COVERED_PROVIDERS`; tests (§7). **No schema files touched** (no UI-scope additions). |

**Why 3 slices (same shape as Excel/Airtable/Trello/OneDrive):** Teams has a single-parent team→channel cascade, so META-2 is a clean 2-resolver slice. META-3 combines 5 ActionMeta + 1 TriggerMeta + sub-registry + COVERED flip — and is **even lighter than its siblings because it touches no runtime schema** (no UI-scope fields). **2-slice compression is viable** (only 2 resolvers, no schema work) — META-2 + META-3 could merge; the default here is the standard resolver-first 3-slice cadence for reviewability.

---

## 7. Tests required

- **Resolver tests (META-2):** `microsoft-teams:teams` lists `/me/joinedTeams` mapped `{value:id,label:displayName}`; `microsoft-teams:channels` `requiredDeps:["teamId"]` short-circuits `MISSING_DEPENDENCY` (no API call) when absent, lists a team's channels otherwise; `q` filter; `hasMore` from `nextLink`; team gone (`NotFoundError`) → empty items; auth → `INTEGRATION_DISCONNECTED`; other → `PROVIDER_ERROR`; **no token / raw-Graph-body / member-email / message-content leakage**; **Graph boundary mocked — no real API calls**. Registry block: both keys registered; `microsoft-teams:members` / `:chats` / `:messages` absent.
- **ActionMeta shape (META-3):** 5 metas parse; `key==="microsoft-teams:<type>"`; `category:"messaging"`; outputs mirror handler returns; `teamId`→teams (no dep), `channelId`→channels (dep teamId); `messageId`/`chatId` text (no optionsSource); `content` textarea; `contentType` select(html/text); `get_channel_details.email` + `get_team_members.members[].email` + `bodyContent` sensitive; reads low / writes medium; none destructive; all `producesFileRef/consumesFileRef:false`.
- **TriggerMeta shape (META-3):** 1 meta parses; `activation:"webhook"`; `teamId`+`channelId` pickers (channel dep team); payload `bodyContent` + `bodyPreview` sensitive.
- **Discovery + provider route:** `listActionMetasForProvider("microsoft-teams")`→5, `listTriggerMetasForProvider("microsoft-teams")`→1, `listProvidersWithMetadata()` includes it; `/api/providers`→`hasMetadata:true`; `/actions`→5; `/triggers`→1 (new `microsoft-teams-provider-route.test.ts` + `microsoft-teams-discovery.test.ts` + `microsoft-teams-triggers-discovery.test.ts`).
- **Structural invariants:** `discovery-meta-coverage` passes with `microsoft-teams` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 5); `trigger-meta-activation-invariant` passes (no exemption); `sensitive-output-coverage` passes (channel `email` / member `email` / `bodyPreview` covered).
- **Guards:** no secret-shaped output names; no provider API calls in metadata tests; `microsoft-teams:members`/`:chats`/`:messages` never referenced by a shipped field.

---

## 8. Acceptance criteria

Teams is metadata/builder-complete only when:

- [ ] all 5 runtime actions have `ActionMeta` (1:1 with the handler registry);
- [ ] the `new_channel_message` webhook trigger has `TriggerMeta` (team+channel pickers) with a passing activation invariant;
- [ ] `microsoft-teams:teams` + `microsoft-teams:channels` resolvers exist (+ the 2 new read helpers); `members` rejected; `chats`/`messages` deferred with rationale (or `chats` shipped per the Marcus decision);
- [ ] `/api/providers` reports Teams `hasMetadata:true` (no longer "coming soon"); actions render with working team→channel pickers;
- [ ] `microsoft-teams` is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Teams tests (§7) pass;
- [ ] **no Teams runtime handler behavior changed** (metadata-only — no schema additions);
- [ ] the `chats` resolver decision (§3/§5) is signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) (Teams → covered; **23/26 covered, 3 pending**).

---

## Appendix — risks / blockers summary

1. **2 new read helpers required** (`teamsList` + `channelsList`) — `api/` is per-resource get/send with no list helper (contrast OneDrive's reusable `driveItemsList`). META-2; read-only against existing scopes → no scope change / reconnect.
2. **NO UI-scope schema additions** — `teamId`/`channelId` are already real fields, so the channel picker cascades with zero runtime touch (contrast Trello `boardId` / OneDrive `parentItemId`). META-3 is pure metadata.
3. **`chats` resolver deferred — main UX gap (open Marcus decision)** — `send_chat_message.chatId` is opaque + awkward to obtain; a chats resolver is feasible but labeling 1:1 chats needs participant expansion (expensive/ambiguous). Recommend typeable `chatId` for v1; revisit. _Marcus: ship basic chats resolver in META-2, or accept typeable chatId?_
4. **`messages` resolver deferred** — `reply_to_channel_message.messageId` is trigger-fed/typeable; channel-message picker expensive. Typeable for v1.
5. **`members` resolver rejected** — no action consumes a member/user id input (get_team_members only OUTPUTs members). Don't build without a consumer.
6. **No destructive action** — all writes medium, reads low; Teams has no delete/archive (differs from Airtable/Excel/OneDrive). Documented.
7. **Sensitive outputs** — `get_channel_details.email`, `get_team_members.members[].email`, trigger `bodyPreview` are FORCED by the suspicious-name set; `bodyContent` (message text) marked by plan. Must be marked or `sensitive-output-coverage` fails.
8. **Auth = refreshable** — resolvers use `refreshAndRetry({provider:"microsoft-teams", accountId})` (Excel/OneDrive pattern), NOT decrypt-direct.
9. **Multi-parent available but unused in v1** — a future `messages` resolver would be `dependsOn:["teamId","channelId"]` (BUILDER-OPTIONS-1); not needed for the first pass.

---

## 9. TEAMS-META-2 outcomes (shipped 2026-05-25)

**Scope delivered:** 2 read helpers + 2 options resolvers + shared helpers + tests. **No** ActionMeta/TriggerMeta, **no** `COVERED_PROVIDERS` flip — those remain TEAMS-META-3. Teams is still `hasMetadata:false` ("coming soon") after this slice; resolver-first, matching the Excel/Airtable/Trello/OneDrive order.

### 9.1 Read helpers added (`integrations/microsoft-teams/api/`, new files)

| Helper | Endpoint | Fields ($select) | Notes |
|---|---|---|---|
| `teamsList({accessToken})` | `GET /v1.0/me/joinedTeams` | `id,displayName,description` | NEW — `api/` had no team-list helper |
| `channelsList({accessToken,teamId})` | `GET /v1.0/teams/{teamId}/channels` | `id,displayName,description,membershipType` (**no `email`**) | NEW — `channelGet` is single-fetch only |

Both mirror the existing `teamMembersList` Graph transport (direct `fetch` + `Authorization: Bearer` + 401→`Unauthorized401Error`, 404→`NotFoundError`, else generic `Error` via `surfaceGraphError`). Read-only against the existing `Team.ReadBasic.All` / `Channel.ReadBasic.All` scopes — no scope change / reconnect. `channelsList` deliberately omits the sensitive channel `email` from `$select`. No transport/error-mapping duplicated; no runtime handler behavior changed.

### 9.2 Resolvers added (`integrations/microsoft-teams/options/`)

| Source | requiredDeps | helper | value | label | description | order | hasMore |
|---|---|---|---|---|---|---|---|
| `microsoft-teams:teams` | — | `teamsList` | team id | displayName → id | team `description` (trimmed/capped 160) | **alpha sort** (root) | `nextLink !== null` |
| `microsoft-teams:channels` | `["teamId"]` | `channelsList` | channel id | displayName → id | channel `description` else `membershipType` | preserve Graph order (General first) | `nextLink !== null` |

Shared helpers in `options/_shared.ts`: `requireTeamsIntegration`, `requireDep`, `mapTeamsOptionsError`, `filterByLabelOrDescription`, `safeDescription`.

### 9.3 Dependency name + auth

`microsoft-teams:channels` depends on **`teamId`** (verbatim — already a real field on every consumer, so **NO UI-scope addition** needed). Single-parent cascade. **Auth = refreshable** → both resolvers wrap the Graph read in `refreshAndRetry({provider:"microsoft-teams", accountId: providerAccountId})` (Excel/OneDrive pattern), NOT decrypt-direct.

### 9.4 Mapping / cascade fallback / sanitization

value = opaque Graph id; q filters on `label` OR `description` (display names collide — e.g. many "General" channels). `channels`: missing/empty `teamId` → `MISSING_DEPENDENCY` (no API call); deleted/no-access team (`NotFoundError`) → **empty items** (cascade fallback). Both: `IntegrationActionRequiredError`/`Unauthorized401Error` → `INTEGRATION_DISCONNECTED`; other → `PROVIDER_ERROR` (static message). No token / raw Graph body / **channel email** / **message content** leakage (regression test: a channel `email` in the payload never reaches resolver output).

### 9.5 Rejected / deferred resolvers (unchanged)

`microsoft-teams:members` REJECTED (no input consumer); `microsoft-teams:chats` DEFERRED (Marcus decision — chatId typeable v1); `microsoft-teams:messages` DEFERRED (messageId trigger-fed/typeable). Registry test asserts all three stay absent.

### 9.6 Tests

- `tests/unit/integrations/microsoft-teams/api/{teamsList,channelsList}.test.ts` — endpoint/method/`$select`/Bearer (channels: no `email` in `$select`; teamId URL-encoded), typed return + nextLink, 401→`Unauthorized401Error`, 404→`NotFoundError(resource)`, no-token-in-error.
- `tests/unit/integrations/microsoft-teams/options/{teams,channels}.test.ts` — shape, refreshAndRetry-pinned-to-accountId, helper-call args, mapping value/label/description, alpha sort (teams) / order-preserved (channels), q filter (label OR description), hasMore, `MISSING_DEPENDENCY` (channels), `NotFoundError`→empty (channels), **no channel-email leak**, auth → `INTEGRATION_DISCONNECTED`, other → `PROVIDER_ERROR` no-leak.
- Registry block in `tests/unit/services/options/_registry.test.ts` — both keys registered, deps verbatim, `members`/`chats`/`messages` absent.

### 9.7 Carried to TEAMS-META-3

5 ActionMeta + 1 TriggerMeta (team+channel pickers) + discovery sub-registry + `COVERED_PROVIDERS` flip. **No schema files touched** (no UI-scope fields). Sensitive: `get_channel_details.email` + `get_team_members.members[].email` + trigger `bodyPreview` (forced) + `bodyContent` (plan). category `messaging`; no destructive action.
