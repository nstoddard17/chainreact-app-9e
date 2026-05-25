# Facebook — Audit + V2-Native Port Plan (FACEBOOK-1)

**Status:** Doc-only audit. No source / runtime / resolver / metadata changes. No `COVERED_PROVIDERS` flip.
**Branch:** `v2-provider-port-local` (local-only). **Do not push.**
**V1 reference:** `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e`.
**V2 baseline:** [`integrations/`](../../../integrations/), [`contracts/`](../../../contracts/), [`docs/slices/p-s3-file-output-contract-plan.md`](../p-s3-file-output-contract-plan.md), the just-shipped Dropbox arc ([`dropbox-metadata-plan.md`](./dropbox-metadata-plan.md)).
**Queue position:** 6th in the provider-completion queue ([`missing-providers-status.md`](./missing-providers-status.md)) — Discord → Google Docs → OneNote → Monday → Dropbox → **Facebook** → Google Analytics.

---

## 1. Headline finding

**Current V2 Facebook status: GREEN-FIELD.** There is no `integrations/facebook/` directory, no Facebook manifest in [`integrations/_registry.ts`](../../../integrations/_registry.ts) `ALL_MANIFESTS`, no handlers, schemas, resolvers, metas, tests, migrations, or webhook route. A repo-wide grep for `facebook` across `integrations/`, `services/`, `app/`, `contracts/` returns **zero** matches. **Runtime must come before metadata** — FACEBOOK-2 (runtime) precedes FACEBOOK-4 (metas), same as every prior arc.

**V1 status: REAL + FULLY user-visible (NO comingSoon), but carrying four rot points.** V1 Facebook is genuinely functional — 8 working action handlers + 2 webhook triggers with real Graph API calls. None are flagged `comingSoon` (unlike V1 Dropbox's trigger). It is NOT a stub. But:
- **Webhook signature verification was never implemented.** [`app/api/webhooks/facebook/route.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/facebook/route.ts) `POST` calls `request.json()` and processes immediately — it NEVER verifies `X-Hub-Signature-256`. The GET handshake's `VERIFY_TOKEN` even falls back to the app secret or a hardcoded `'chainreact-facebook-verify'` default. (Exact parallel to the V1 Dropbox webhook gap DROPBOX-5 just closed.)
- **Monolithic handler file.** [`lib/workflows/actions/facebook.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/facebook.ts) is 1497 lines / 9 exported functions in one file — overdue for the per-handler split every V2 provider uses.
- **Media upload routes bytes through V1's Supabase `workflow-files` bucket.** `uploadFacebookPhoto` / `uploadFacebookVideo` / `createFacebookPost` call `getFileBuffer(photoFile, userId)` to pull bytes from V1 storage, then multipart-upload to Graph — exactly the source-handling antipattern V2's P-S3 FileRef contract replaces.
- **OAuth version drift.** [`oauthConfig.ts:245`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) pins Graph `v14.0`; [`provider-registry.ts:1136`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts) pins `v19.0`. V2 should pin one current version.

**Key product/architecture decision: SHIP Facebook (Pages surface) in V2, as a V2-native rewrite of the rotted bits — NOT a verbatim port. Land the code now; Meta App Review is a GA gate, not a code blocker.** The Phase-1 audit ([`phase-1-provider-completion-audit.md`](../phase-1-provider-completion-audit.md) §4.6) marked Facebook **"needs product decision,"** naming three V2-fit blockers. **All three are now retired:**

| Phase-1 §4.6 blocker | Why it is now retired |
| --- | --- |
| "Page-level vs user-level tokens — V2's `ProviderOAuth` assumes one token per integration row." | The user long-lived token is the one row token; **page tokens are derived at runtime** from it via `/me/accounts` (exactly what V1's `getPageAccessToken(pageId, userToken)` already does). No new auth-contract shape needed — page tokens are never stored. |
| "Webhook subscription is per-app, not per-user — V2 has no analog for global app-level webhook configuration." | **DROPBOX-5 just shipped that analog.** V2 now has the app-level-webhook + per-account-fan-out + cursor/id-routing pattern (`/api/webhooks/dropbox`). Facebook is the same shape: one app-level URL (Meta App Dashboard, like the Dropbox App Console), routed by `entry[].id` (pageId) to per-page trigger rows. Per-page `subscribed_apps` activation maps onto the Monday `create_webhook` activation-hook pattern. |
| "Reviewer-approval gate — write scopes require Meta app review (2–6 week external dependency)." | Still real, but **not a code blocker.** A Meta app in **Development Mode** grants the app's own admins/developers/testers **Standard Access** to all these scopes WITHOUT review — so the V2 code is fully testable + usable by the app team the day it lands. App Review (Advanced Access) is only needed to open it to EXTERNAL users; it runs in parallel and gates GA, not the merge. Recommendation: **schedule Meta App Review now** so it completes around the time the arc does. |

The base64/Supabase rot is solved by the live P-S3 FileRef contract; the missing webhook signature is solved by the GitHub/Monday/Dropbox HMAC-hex verifier pattern. So the historical blockers are all retired — Facebook is a clean V2-native port, scoped to **Pages** (publishing + engagement + insights + page Messenger). Ads / Groups / broad Messenger-marketing are out of scope (V1 never built Ads; group publishing is Graph-deprecated).

---

## 2. V1 surface

### 2.1 Action inventory (8)

Manifest: [`lib/workflows/nodes/providers/facebook/index.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/facebook/index.ts) (933 lines, per phase-1 §4.6). Handlers: `lib/workflows/actions/facebook.ts` (1497 lines, monolithic). **None `comingSoon`.**

| V1 node `type` | Title | Handler | Required scopes | Graph endpoint(s) | Notes |
| --- | --- | --- | --- | --- | --- |
| `facebook_action_create_post` | Create Post | `createFacebookPost` (L30) | `pages_manage_posts` | `POST /{pageId}/feed` (+ `/photos` for attached media) | Message + optional media (multi-photo), scheduled publish, product/paid-partnership fields. Media = FileRef consumer. |
| `facebook_action_get_page_insights` | Fetch Page Insights | `getFacebookPageInsights` (L522) | `pages_read_engagement`, `read_insights` | `GET /{pageId}/insights` | Read-only analytics. |
| `facebook_action_send_message` | Send Message | `sendFacebookMessage` (L669) | `pages_messaging` | `POST /{pageId}/messages` | Messenger send to a conversation/recipient. **Highest review friction** (Messenger Platform review is a separate, stricter track). |
| `facebook_action_comment_on_post` | Comment On Post | `commentOnFacebookPost` (L821) | `pages_manage_posts` (engagement) | `POST /{postId}/comments` | Public comment. |
| `facebook_action_delete_post` | Delete Post | `deleteFacebookPost` (L948) | `pages_manage_posts` | `DELETE /{postId}` | **Destructive — irreversible** (no API restore). |
| `facebook_action_update_post` | Update Post | `updateFacebookPost` (L1027) | `pages_manage_posts` | `POST /{postId}` | Edit message of a published post. |
| `facebook_action_upload_photo` | Upload Photo | `uploadFacebookPhoto` (L1135) | `pages_manage_posts` | `POST /{pageId}/photos` (+ `/albums` create) | Media = FileRef consumer; album-select-or-create. |
| `facebook_action_upload_video` | Upload Video | `uploadFacebookVideo` (L1291) | `pages_manage_posts` | `POST /{pageId}/videos` | Media = FileRef consumer. |

Internal helper (not a node): `uploadMediaToFacebook` (L484) — shared multipart upload used by the media actions.

### 2.2 Trigger inventory (2)

| V1 node `type` | Title | Handler | Model |
| --- | --- | --- | --- |
| `facebook_trigger_new_post` | New post published | `FacebookTriggerLifecycle` + `app/api/webhooks/facebook` | **App-level webhook + per-page `subscribed_apps`** |
| `facebook_trigger_new_comment` | New comment on post | same | same |

**Critical architecture note (Facebook's webhook model):**
- The webhook URL is configured **once, in the Meta App Dashboard** — for the whole app's user base. There is **no per-workflow webhook-creation API**.
- Per-page opt-in: [`FacebookTriggerLifecycle.onActivate`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/FacebookTriggerLifecycle.ts) calls `POST /{pageId}/subscribed_apps` with `subscribed_fields=feed` (needs `pages_manage_metadata` + a page token); `onDeactivate` unsubscribes. This is REAL per-page activation work.
- Notification body: `{ object: 'page', entry: [{ id: PAGE_ID, changes: [{ field: 'feed', value: { item: 'post'|'comment'|… } }] }] }` — routed by `entry[].id` (pageId), then `value.item` → trigger type.
- **Verification handshake:** GET `?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` → echo the challenge as text/plain.
- **Signature:** `X-Hub-Signature-256` = `sha256=`-prefixed hex HMAC-SHA256 of the raw body, keyed with the **app secret**. **V1 never verified this** (POST processes unsigned).

### 2.3 Dynamic resolver inventory (6)

Source: [`app/api/integrations/facebook/data/handlers/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/facebook/data/handlers/index.ts).

| V1 key | Fetches | Deps | Graph endpoint |
| --- | --- | --- | --- |
| `facebook_pages` | The user's managed Pages | none | `GET /me/accounts` |
| `facebook_posts` | Posts on a Page | pageId | `GET /{pageId}/posts` |
| `facebook_albums` | Photo albums on a Page | pageId | `GET /{pageId}/albums` |
| `facebook_conversations` | Messenger conversations | pageId | `GET /{pageId}/conversations` |
| `facebook_groups` | The user's Groups | none | `GET /me/groups` |
| `facebook_monetization_eligibility` | Monetization status | pageId | `GET /{pageId}` monetization fields |

### 2.4 OAuth / scopes

- **Authorize:** `https://www.facebook.com/v{N}/dialog/oauth` · **Token:** `https://graph.facebook.com/v{N}/oauth/access_token` (GET-based exchange). **Version drift:** `v14.0` (oauthConfig) vs `v19.0` (provider-registry).
- **Long-lived tokens:** user token exchanged for a ~60-day long-lived token via `grant_type=fb_exchange_token` ([`oauthConfig.ts:257`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) `additionalRefreshParams`). `refreshTokenExpirationSupported: false`. No true refresh token — re-exchange extends the window.
- **Page tokens:** derived at runtime via `getPageAccessToken(pageId, userToken)` (`/me/accounts` / `/{pageId}?fields=access_token`). Page tokens inherit the user token's validity; not separately stored.
- **Account identity:** `GET /me?fields=email,name,picture` → the Facebook user id + email/name (provider-registry L1178).
- **Scopes (per action, from the manifest `requiredScopes`):** `pages_show_list` (implicit, to list pages), `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `pages_messaging`, `pages_manage_metadata` (trigger subscription). **All require Meta Advanced Access (App Review) for external users.**
- **Env:** `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` (+ a webhook verify token).

### 2.5 Media upload mechanism (the rot)

`uploadFacebookPhoto` (L1165) / video / `createFacebookPost`: `getFileBuffer(photoFile, userId)` pulls bytes from V1's Supabase `workflow-files` bucket → `FormData` multipart → `POST /{pageId}/photos|videos`. The `photoFile` / `mediaFile` config is a V1 upload-field id (string / `{id}` / `{fileIds}` shapes). This is the same Supabase-intermediary source antipattern P-S3 bans; V2 replaces it with a FileRef consumer (`fetchFileBytes`).

### 2.6 API style

Pure Graph API REST (no GraphQL): `graph.facebook.com/v{N}`. JSON for most calls; **multipart/form-data** for media (`/photos`, `/videos`). Plus the app-level **webhook** trigger model (§2.2). No polling.

### 2.7 V1 tests

None located (`find __tests__ -iname '*facebook*'` → empty). The actions + webhook are untested in V1.

### 2.8 Verdict

**Real, fully user-visible (no `comingSoon`), but carrying four rot points** (no webhook signature, monolithic handlers, Supabase-bucket media source, OAuth version drift). Worth shipping in V2 — the rot points are exactly what V2 already solved generically (HMAC verifier + FileRef contract + per-handler split + manifest versioning), so the port is cleaner than V1. The one real external constraint is Meta App Review, which is a GA gate, not a code blocker (Dev Mode covers the app team).

---

## 3. V1 → V2 Decision Matrix

| Area | V1 behavior | V2 recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- | --- |
| **Ship at all?** | 8 actions + 2 triggers, deferred in Phase 1 | **SHIP (Pages subset)** | Marcus re-included Facebook in the completion queue; all three phase-1 blockers are retired (§1). Dev-Mode usage works pre-review. | Full FACEBOOK-2..5 arc. |
| **Auth model** | OAuth2, long-lived user token via `fb_exchange_token`, ~60d, GET exchange, no PKCE | **ADAPT (copy the shape)** | Matches V2's confidential-client refreshable pattern; the `fb_exchange_token` re-exchange is the "refresh." | `integrations/facebook/{manifest,oauth}.ts`. Pin ONE Graph version (current, e.g. `v21.0`). The V2 OAuth dispatcher must support the `fb_exchange_token` grant (open decision §9.4). |
| **Page tokens** | `getPageAccessToken(pageId, userToken)` at runtime | **COPY (runtime-derive; never store)** | Resolves the phase-1 "one token per row" concern — the row holds the USER token; page tokens are derived per call + always fresh. | `integrations/_shared/facebook/api/getPageAccessToken.ts` (cached per request). `providerAccountId` = the FB user id. |
| **API transport** | Graph REST + multipart for media | **COPY** | This is Facebook's only API. | `integrations/_shared/facebook/api/_request.ts` (JSON-RPC-ish) + a multipart variant for media. Per-operation wrapper files (one per call), same convention as `_shared/dropbox/api/` / `_shared/monday/api/`. |
| **Actions — publishing** | `create_post`, `update_post` | **ADAPT → keep, split per-file** | Core Pages value. | `facebook:create_post`, `facebook:update_post`. Per-handler files under `integrations/facebook/actions/`. |
| **Actions — engagement** | `comment_on_post` | **ADAPT → keep** | Public engagement. | `facebook:comment_on_post`. |
| **Actions — media** | `upload_photo`, `upload_video`, media in `create_post` | **REPLACE source-handling; keep the actions** | The `getFileBuffer` Supabase-bucket source is the antipattern. | FileRef **consumers** via `core/files/fetchFileBytes` (mirrors `dropbox:upload_file` / `monday:add_file` / `slack:upload_file`); reject `provider_url` FileRefs with the standard config-error hint. Multipart to Graph. |
| **Actions — insights** | `get_page_insights` | **COPY** | Read-only analytics. | `facebook:get_page_insights`. |
| **Actions — Messenger** | `send_message` | **ADAPT → ship, FLAG separately** | Valuable but Messenger Platform review is a DISTINCT, stricter track than Pages review. | `facebook:send_message`. Ship the handler; the metadata description + the open decisions call out the separate review track (may slip to its own slice — §9.7). |
| **Actions — delete** | `delete_post` | **ADAPT → keep, mark destructive** | Irreversible (no API restore). | `facebook:delete_post` — high + `isDestructive` + `requiresConfirmation` (parity with `dropbox:delete_file`). Structural-only output. |
| **Triggers** | `new_post`, `new_comment` (app-level webhook + per-page `subscribed_apps`) | **ADAPT → ship (FACEBOOK-5)** | The model is sound; the V2 app-level-webhook analog now exists (DROPBOX-5). | Global `/api/webhooks/facebook` route; per-page `subscribed_apps` activation/deactivation hooks; pageId → trigger-row fan-out; dedup on post/comment id. |
| **Webhook signature** | none (processes unsigned) | **REPLACE → fail-closed HMAC** | Closes the exact gap DROPBOX-5 just closed for Dropbox. | `integrations/_shared/facebook/webhooks/signature.ts` verifying `X-Hub-Signature-256` (`sha256=`-prefixed hex HMAC-SHA256 of the raw body, key = `FACEBOOK_CLIENT_SECRET`). 503 missing secret, 401 mismatch. |
| **Webhook verify token** | falls back to app secret / hardcoded default | **REPLACE → dedicated env, fail-closed** | A predictable verify token is a weak handshake. | `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (its own env, NOT the app secret); GET handshake echoes `hub.challenge` only when the token matches. |
| **Resolvers** | 6 (`facebook_pages`, `_posts`, `_albums`, `_conversations`, `_groups`, `_monetization_eligibility`) | **ADAPT → 4; DROP 2** | Keep the ones the 8 actions actually consume; drop unused/niche. | DROP `facebook_groups` (no group action in scope; group publishing is Graph-deprecated) + `facebook_monetization_eligibility` (niche paid-partnership field). See §4 resolver needs. |
| **Field names / defaults** | `pageId`, `message`, `mediaFile`, `photoFile`, `postId`, … | **REPLACE freely** | **Green-field V2 — no load-bearing field names exist.** Drop the antipattern media-source field shapes (`mediaFile` string/`{id}`/`{fileIds}`); use a typed FileRef field. | No V1-field-preservation constraint. Pick V2 names matching the Graph API (`pageId`, `message`, `postId`, `commentId`, `photo`/`video` FileRef, `caption`, `recipientId`). See §4 warning. |
| **Output shapes** | bespoke per handler | **REPLACE → normalized + FileRef-free** | Consistent shape; no bytes/links smuggled. | `{ id/postId/commentId, permalinkUrl?, publishedAt?, … }`; media URLs sensitive; no base64. |
| **Storage primitive** | Supabase `workflow-files` (V1 infra) | **REPLACE → P-S3** | `core/files/fetchFileBytes` is the canonical consumer primitive. | Add `facebook: <N> * MB` to [`core/files/limits.ts`](../../../core/files/limits.ts) `FILE_REF_SIZE_GUIDANCE` (FACEBOOK-2). |
| **Rate limits** | unhandled | **DEFER** | Graph returns coded throttling errors; V2's pattern is a typed error + log, no auto-backoff (matches Monday/Dropbox). | `_request.ts` throws a typed `RateLimitError`; backoff deferred to FACEBOOK-N. |
| **External constraints** | Meta App Review; app-level webhook config | **NOTE / open decision** | Production GA needs App Review (Advanced Access) + the webhook URL set in the Meta App Dashboard (one-time operator setup, like Dropbox's App Console). Not a code blocker for FACEBOOK-2..4. | Documented operator follow-up; gates GA + the trigger (FACEBOOK-5), not the actions. |

---

## 4. Proposed V2 surface

### Actions to SHIP (FACEBOOK-2) — 8

Full Pages publishing + engagement + insights + page Messenger surface:

| V2 key | Category | FileRef role | Graph endpoint(s) | Notes |
| --- | --- | --- | --- | --- |
| `facebook:create_post` | messaging* | **consumer** (optional media) | `POST /{pageId}/feed` (+ `/photos`) | Message + optional FileRef media + scheduled publish. |
| `facebook:update_post` | messaging* | — | `POST /{postId}` | Edit the message of a published post. |
| `facebook:comment_on_post` | messaging* | — | `POST /{postId}/comments` | Public comment. |
| `facebook:upload_photo` | files | **consumer** | `POST /{pageId}/photos` (+ `/albums`) | FileRef → multipart. Album select-or-create. |
| `facebook:upload_video` | files | **consumer** | `POST /{pageId}/videos` | FileRef → multipart. |
| `facebook:get_page_insights` | data | — | `GET /{pageId}/insights` | Read-only analytics. |
| `facebook:send_message` | messaging | — | `POST /{pageId}/messages` | Messenger send. **Flagged: separate Messenger Platform review track.** |
| `facebook:delete_post` | messaging* | — | `DELETE /{postId}` | **Destructive** (no restore). High + confirmation. |

\* Category: the builder `ActionCategory` enum has no "social" — use `messaging` for the publishing/engagement/Messenger actions (closest fit; they post visible content), `files` for the media uploads, `data` for insights. (Confirm in FACEBOOK-4 against the enum in [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts).)

### Actions to DEFER / REJECT

- **Ads / Marketing API** (campaigns, ad sets, audiences) — **REJECT**: V1 never built it; separate product surface + separate (stricter) review. Out of the Pages scope.
- **Group publishing** (`/{groupId}/feed`) — **REJECT**: Graph deprecated Groups API publishing (April 2024). `facebook_groups` resolver becomes dead.
- **Reels / Stories / scheduled-post management / post boosting** — **DEFER (FACEBOOK-N)**: niche; revisit on demand.

### Triggers to SHIP (FACEBOOK-5) — 2

- `facebook:new_post`, `facebook:new_comment` — **app-level webhook + per-page `subscribed_apps`**. Architecture (mirrors DROPBOX-5's route shape + Monday's per-resource activation):
  - **Route:** one global `/api/webhooks/facebook` (URL registered once in the Meta App Dashboard). No `?workflowId=&nodeId=` — Facebook can't carry them.
  - **GET** `?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` → echo `hub.challenge` as text/plain when the token matches the dedicated `FACEBOOK_WEBHOOK_VERIFY_TOKEN`. (Not signature-gated — verification step.)
  - **POST** → verify `X-Hub-Signature-256` (fail-closed). Body `{ object:'page', entry:[{ id:pageId, changes:[{field:'feed', value:{item}}] }] }`.
  - **Fan-out:** for each `entry[].id` (pageId) → trigger rows for `(facebook, new_post|new_comment)` whose configured `pageId` matches → classify `value.item` (post → new_post; comment → new_comment) → normalize → dispatch. Dedup on the post/comment id.
  - **Activation hook:** `POST /{pageId}/subscribed_apps` (`subscribed_fields=feed`, page token) — REAL per-page work, satisfies `trigger-meta-activation-invariant` WITHOUT an exemption (like Monday). **Deactivation hook:** `DELETE /{pageId}/subscribed_apps` (best-effort).
  - **No cursor** — Facebook pushes the event payload (unlike Dropbox's account-only ping); the payload carries the post/comment, so no `list/continue` reconcile is needed.

### Triggers to DEFER / REJECT

- `new_message` (Messenger inbound) — **DEFER (FACEBOOK-N)**: separate Messenger Platform review + 24h-window policy; revisit with `send_message`.
- `new_reaction` / `new_mention` — **DEFER**: incremental once `feed` triggers ship.

### Exact field-name preservation warning

**There is NO V1-field-preservation requirement for Facebook** — V2 is green-field, so no existing V2 workflow config references any Facebook field. Field names are the V2 author's choice, picked to match the Graph API (`pageId`, `message`, `postId`, `commentId`, `recipientId`, `photo`/`video` FileRef, `caption`, `scheduledPublishTime`). The V1 antipattern media-source field shapes (`mediaFile` as string/`{id}`/`{fileIds}`, `photoFile` upload-id) MUST NOT be carried forward — they're replaced by a typed FileRef field. Contrast with Monday/Slack where camelCase runtime field names had to be preserved 1:1; that constraint does not apply here.

### Resolver needs (FACEBOOK-3)

- `facebook:pages` — Page picker (account-scoped, no deps). **Required** — every action needs `pageId`. Value = page id; label = page name.
- `facebook:posts` — `dependsOn: ["pageId"]` — for `comment_on_post` / `delete_post` / `update_post`.
- `facebook:albums` — `dependsOn: ["pageId"]` — for `upload_photo` `targetAlbum` (select existing; new-album-by-name stays a typed text alternative).
- `facebook:conversations` — `dependsOn: ["pageId"]` — for `send_message` recipient/conversation pick. (Ship only if `send_message` ships in the same arc; otherwise DEFER with it.)
- **DROP** `facebook_groups` (no group action) + `facebook_monetization_eligibility` (niche). REJECT unless a future action needs them.

### Output shape proposal

Normalized, FileRef-free, no bytes/links smuggled as raw strings:
- `create_post` / `upload_photo` / `upload_video` → `{ postId, permalinkUrl?, publishedAt? }` (+ `mediaId` for media).
- `update_post` → `{ postId, success }`.
- `comment_on_post` → `{ commentId, postId }`.
- `send_message` → `{ messageId, recipientId }`.
- `get_page_insights` → `{ metrics: [...] }` (per-metric name + values).
- `delete_post` → `{ success, deletedPostId, deletedAt }` (structural-only — no echoed content).
- Media URLs / permalinks → `sensitive`. Bytes / base64 **never** in output.

### FileRef / media behavior proposal

| Action | FileRef behavior |
| --- | --- |
| `upload_photo` | **Consumer.** `config.photo: FileRef`. `fetchFileBytes` for `v2_storage` / `signed_url`; **reject `provider_url`** with the standard hint. Multipart `POST /{pageId}/photos`. |
| `upload_video` | **Consumer.** `config.video: FileRef`. Multipart `POST /{pageId}/videos`. |
| `create_post` | **Consumer (optional).** Optional `photos: FileRef[]` (the `file-array` field type — first social consumer after Outlook attachments) → upload each → attach ids to `/feed`. |
| (producers) | **None** in scope. A future `get_post_media` producer (Graph media URL → `FileRef(signed_url)`) is DEFER (FACEBOOK-N). |
| size guidance | Add `facebook: <N> * MB` to `core/files/limits.ts` (FACEBOOK-2; photos ~10 MB, videos larger — pick a conservative simple-upload bound; resumable/chunked video upload DEFER). |

---

## 5. Risk classification

| Action(s) | riskLevel | isDestructive | requiresConfirmation | Rationale |
| --- | --- | --- | --- | --- |
| `get_page_insights` | low | no | no | Read-only analytics of the user's own page. |
| `create_post`, `update_post`, `upload_photo`, `upload_video` | medium | no | no | **Public** publishing — recoverable (delete/edit), but public visibility is security-relevant egress (parity with `dropbox:create_shared_link`). |
| `comment_on_post` | medium | no | no | Public comment under the page's identity; recoverable by delete. |
| `send_message` | medium | no | no | Sends a real message to a real person (Messenger); not cleanly recallable, but not destructive. Description flags the separate Messenger review track. |
| `delete_post` | **high** | **yes** | **yes** | Irreversible — Graph `DELETE` has no restore. Destructive trio (parity with `dropbox:delete_file` / `monday:delete_item`). Structural-only output. |
| `new_post` / `new_comment` triggers | low | — | — | Observational. Activation creates a per-page subscription (provider-side), mutates no business data. |

---

## 6. Sensitive output proposal

Mark `sensitive: true`:
- **Page names** (`pageName`) — business identity.
- **Post / comment / message text** (`message`, `commentText`, `messageText`, any body/snippet) — user-authored content + potential PII.
- **Media URLs, permalinks, share URLs** (`permalinkUrl`, `mediaUrl`, `pictureUrl`) — access-bearing / public-surface links (matches the structural guard's `signedUrl`/`downloadUrl` suspicious names; also mark the non-suspicious-named ones).
- **Recipient / sender / user names + PSIDs + emails** (`recipientId`, `senderName`, `from`, `email`) — PII (PSIDs are stable per-user identifiers).
- **Insights metric values** (`metrics`/`values` arrays) — business analytics.
- Trigger payloads (`new_post` / `new_comment`): `message`/`commentText`, author name, `permalinkUrl` sensitive; opaque `postId` / `commentId` / `pageId` non-sensitive.

Non-sensitive: opaque ids (`postId`, `commentId`, `pageId`, `messageId`, `mediaId`, `albumId`), timestamps, booleans, `success`.

**Banned from outputs entirely** (structural `sensitive-output-coverage` guard): no `token` / `accessToken` / `refreshToken` / `pageAccessToken` / `secret` / `clientSecret` / `apiKey` / `appsecret_proof` / `webhookSecret` field names. The app secret, user token, and derived page tokens NEVER enter any output or error message (sanitize Graph transport errors — surface only Graph's `error.message`/`code`, never tokens, the `appsecret_proof`, media bytes, or raw bodies).

---

## 7. Slice sequence

| Slice | Scope |
| --- | --- |
| **FACEBOOK-1** (this doc) | Audit + V2-native port plan. Doc-only. |
| **FACEBOOK-2** | Runtime port: `manifest.ts` (pin one Graph version), `oauth.ts` (`fb_exchange_token` long-lived), `_shared/facebook/api/` wrappers (JSON + multipart + `getPageAccessToken`), 8 action handlers + Zod schemas (per-file split), `errors.ts`, handler-registry wiring, `FILE_REF_SIZE_GUIDANCE` entry, unit tests. |
| **FACEBOOK-3** | OptionsSource resolvers: `facebook:pages`, `facebook:posts`, `facebook:albums`, (`facebook:conversations` if `send_message` ships here). |
| **FACEBOOK-4** | 8 ActionMetas + **COVERED_PROVIDERS flip** (enforces 1:1 handler↔meta). |
| **FACEBOOK-5** | `new_post` + `new_comment` webhook triggers: global `/api/webhooks/facebook` route (GET `hub.challenge` + fail-closed `X-Hub-Signature-256`), `_shared/facebook/webhooks/signature.ts`, per-page `subscribed_apps` activation/deactivation hooks, pageId → trigger-row fan-out + dispatch, 2 TriggerMetas, manifest `webhookTrigger: true`, tests. |
| **FACEBOOK-N** | Deferred polish (named blockers): `new_message` trigger + Messenger track, `get_post_media` producer, reels/stories, chunked video upload, rate-limit backoff, Groups/monetization (only if un-deprecated / requested). |

---

## 8. What to copy vs not copy

- **COPY:** the OAuth wire shape (long-lived `fb_exchange_token` user token, GET exchange), the two-host-free Graph REST transport + multipart for media, runtime page-token derivation (`getPageAccessToken`), the GET `hub.challenge` echo, the per-page `subscribed_apps` activation model, pageId-based webhook routing.
- **ADAPT:** monolithic `facebook.ts` → 8 per-handler files under `integrations/facebook/actions/`; `facebook_pages`/`_posts`/`_albums`/`_conversations` → `facebook:pages`/etc.; the inline album create-or-select → keep but typed.
- **REPLACE:** the `getFileBuffer` Supabase-bucket media source → P-S3 FileRef consumer (`fetchFileBytes`); the missing/unsigned webhook → fail-closed `X-Hub-Signature-256` HMAC; the predictable verify-token default → a dedicated `FACEBOOK_WEBHOOK_VERIFY_TOKEN`; the OAuth version drift → one pinned current Graph version; bespoke outputs → normalized + sensitive-marked.
- **DEFER:** `new_message` + Messenger track, media producers, reels/stories, chunked video, rate-limit backoff — each with the revisit condition named in §4/§7.
- **REJECT:** Ads / Marketing API (never built, separate review), Group publishing (Graph-deprecated), the `facebook_monetization_eligibility` resolver (niche).

---

## 9. Open decisions before implementation

1. **Ship Facebook at all?** → Recommended **YES** (product re-included it; all three phase-1 blockers retired). Confirm.
2. **Scope = Pages only** (publishing + engagement + insights + page Messenger), Ads/Groups REJECTED. Confirm.
3. **Ship code now vs wait for Meta App Review?** → Recommend **ship code now**; Dev-Mode covers the app team; schedule App Review in parallel (it gates external GA, not the merge). Confirm the Dev-Mode-first posture is acceptable.
4. **Auth: `fb_exchange_token` long-lived user token.** The V2 OAuth dispatcher must support the `fb_exchange_token` grant + the GET-based exchange. Confirm the dispatcher can carry these (or add the seam in FACEBOOK-2). Pin which Graph version (recommend the current GA `v21.0`).
5. **Page-token handling.** Recommend **runtime-derive + never store** (one row = user token). Confirm vs storing page tokens in `accountMetadata`.
6. **Webhook keys.** Recommend `X-Hub-Signature-256` keyed on `FACEBOOK_CLIENT_SECRET` (fail-closed) + a dedicated `FACEBOOK_WEBHOOK_VERIFY_TOKEN` for the GET handshake (NOT the app secret). Confirm.
7. **`send_message` / Messenger.** Messenger Platform review is a separate, stricter track than Pages review. Ship `send_message` in FACEBOOK-2 (Dev-Mode testable), or split it (+ its `conversations` resolver + a future `new_message` trigger) into its own sub-slice gated on the Messenger review track? Recommend **ship in FACEBOOK-2, flag in metadata**; revisit if Messenger review blocks GA.
8. **App-Dashboard webhook URL operator setup.** FACEBOOK-5 requires the webhook URL + verify token + `feed` field subscription set once in the Meta App Dashboard (one-time operator step, like Dropbox's App Console). Acceptable for FACEBOOK-5? (Does not affect FACEBOOK-2..4.)
9. **`delete_post` semantics.** Graph `DELETE` is irreversible (no restore). Recommend high + destructive + confirmation (parity with `dropbox:delete_file`). Confirm.
10. **FileRef media field shape.** `upload_photo`/`upload_video` take a single `FileRef`; `create_post` takes optional `photos: FileRef[]` (the `file-array` type). Confirm multi-photo posts are in scope for FACEBOOK-2 or DEFER to single-media first.

---

## 10. Acceptance criteria

- [x] Doc-only — no source / runtime / resolver / metadata changes.
- [x] No `integrations/facebook/` runtime files added.
- [x] No metadata added; no resolvers added; no triggers added.
- [x] Facebook NOT added to `COVERED_PROVIDERS`.
- [x] Gates run: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`.
- [x] Doc staged with explicit path; unrelated dirty files untouched.
- [ ] Marcus accepts §9 open decisions before FACEBOOK-2 begins.
