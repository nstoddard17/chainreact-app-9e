# Slice 17 — **Trello** provider audit (DEFER recommendation)

**Branch:** `v2-provider-port-local` (unified local working branch).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal of this commit:** Audit-only. Decide whether Trello can be ported into V2 Phase 1 alongside Microsoft Teams and (later) Slack / Discord, or whether — like Dropbox — it must be deferred until V2's OAuth contract is extended.

**Recommendation up front:** **DEFER Trello to Phase 2.** Trello's auth model is structurally incompatible with V2's current `ProviderOAuth` contract (`contracts/integration.ts:168-222`), and forcing a fit would either require a contract extension that should be designed deliberately (not under a single-provider port), or ship a security-weakened shortcut that mirrors V1's bugs. Detailed reasoning in the **Auth model** section below.

This doc answers every Commit-1 question in the slice prompt and provides a **conditional Batch-1 plan** that becomes actionable only if/when the contract is extended in a separate slice.

---

## V1 audit — paths and findings

### Manifest / node definitions

- Single manifest file: [`lib/workflows/nodes/providers/trello/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/trello/index.ts) (1047 lines). Declares **6 triggers + 10 actions** inline.
- Triggers: `trello_trigger_new_card`, `trello_trigger_card_updated`, `trello_trigger_card_moved`, `trello_trigger_comment_added`, `trello_trigger_member_changed`, `trello_trigger_card_archived`.
- Actions: `trello_action_create_card`, `trello_action_create_board`, `trello_action_create_list`, `trello_action_move_card`, `trello_action_get_cards`, `trello_action_update_card`, `trello_action_archive_card`, `trello_action_add_comment`, `trello_action_add_label_to_card`, `trello_action_add_checklist`, `trello_action_create_checklist_item` (11 in the manifest — the audit recount: `create_card`, `create_board`, `create_list`, `move_card`, `get_cards`, `update_card`, `archive_card`, `add_comment`, `add_label_to_card`, `add_checklist`, `create_checklist_item` = 11).

### Action handlers

- Two files:
  - [`lib/workflows/actions/trello.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts) (1402 lines) — most write handlers.
  - [`lib/workflows/actions/trello/getCards.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello/getCards.ts) (73 lines) — read handler split out using V2-style ExecutionContext shape (an outlier vs the rest of V1's Trello code, which uses the legacy `(config, userId, input)` signature).
  - [`lib/workflows/actions/trello/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello/index.ts) — re-export barrel pointing back at the monolithic `../trello` file.
- Endpoints (all under `https://api.trello.com/1`):
  - `createTrelloList` ([trello.ts:10](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L10)) — `POST /lists` with `idBoard` + position-resolution code that GETs the board's existing lists for "after_first" / "before_last" / "middle" / "custom" positioning.
  - `createTrelloCard` ([trello.ts:327](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L327)) — `POST /cards` then optional `POST /cards/{id}/attachments` for file/URL attachments. Includes a 200-line attachment branch with **direct-upload-to-Trello + Supabase-storage fallback** (much heavier than what V2 should ship).
  - `moveTrelloCard` ([trello.ts:669](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L669)) — `PUT /cards/{cardId}` with `idList`.
  - `createTrelloBoard` ([trello.ts:744](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L744)) — `POST /boards` plus optional **client-side template expansion** (creates 3-7 default lists per template type and seeds sample cards). Heavy / opinionated; not API-driven.
  - `updateTrelloCard` ([trello.ts:993](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L993)) — `PUT /cards/{cardId}`.
  - `archiveTrelloCard` ([trello.ts:1070](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L1070)) — `PUT /cards/{cardId}` with `closed: true|false`.
  - `addTrelloComment` ([trello.ts:1134](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L1134)) — `POST /cards/{cardId}/actions/comments`.
  - `addTrelloLabelToCard` ([trello.ts:1197](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L1197)) — `POST /cards/{cardId}/idLabels?value={labelId}`.
  - `addTrelloChecklist` ([trello.ts:1269](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L1269)) — `POST /checklists`.
  - `createTrelloChecklistItem` ([trello.ts:1333](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello.ts#L1333)) — `POST /checklists/{checklistId}/checkItems`.
  - `getTrelloCards` ([getCards.ts:10](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/trello/getCards.ts#L10)) — `GET /lists/{listId}/cards` or `GET /boards/{boardId}/cards/{filter}`.
- **Auth pattern in handlers:** every call appends `?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}` as URL query params (NOT a header). This is Trello's required auth mechanism — it doesn't accept Bearer tokens. The token comes from `getDecryptedAccessToken(userId, "trello")`; the key comes from a global env var.
- **No 401-refresh wrapper.** None of the handlers use anything like `refreshAndRetry` because Trello tokens don't refresh — they either work or are revoked. On 401, V1 surfaces a raw error string (not the typed `IntegrationActionRequiredError` V2 expects).
- **No idempotency keys.** Trello has no equivalent of Stripe's `Idempotency-Key`.

### Triggers / webhooks

**Lifecycle:** [`lib/integrations/trello/webhooks.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/trello/webhooks.ts) (60 lines).

- **No per-trigger lifecycle.** V1 has a `registerTrelloWebhooksForUser(userId)` function that lists ALL boards the user can see (`GET /members/me/boards?key=${key}&token=${token}`) and creates one webhook per board (`POST /webhooks` with `callbackURL`, `idModel: board.id`, `description`).
- This is **eager bulk registration on connect**, NOT V2's per-workflow per-trigger lifecycle pattern. V1 doesn't track which workflow needs which board — every board the connected user is a member of gets webhooked.
- No deactivation logic in the file. No webhook cleanup on integration disconnect. Orphaned webhooks accumulate.
- No `trigger_resources`-style row created per webhook. Webhook IDs returned by `POST /webhooks` are discarded.
- Triggered from [`/api/integrations/trello/register-webhooks/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/trello/register-webhooks/route.ts) (15 lines) — fired async-and-forget from the OAuth `onSuccess` hook in `provider-registry.ts:1576-1584`.

**Receive route:** [`app/api/workflow/trello/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/trello/route.ts) (35 lines).

- HEAD handler returns 200 — Trello's **callback-URL handshake** (Trello sends a HEAD when registering a webhook; the URL must respond 200 or registration fails).
- POST handler **does not verify webhook signature** — accepts every POST, inserts the raw body into a `integration_webhook_executions` audit table, and returns `{ ok: true }`. **No workflow dispatch happens here.** This is a known V1 gap (the file is essentially an audit-log sink, not a real receiver).
- The "real" routing path appears to be V1's webhook normalizer at [`lib/webhooks/normalizer.ts:213-361`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/normalizer.ts#L213) which handles `trello` events when called from V1's generic webhook receiver. But since the `/api/workflow/trello` route ignores normalization and `/api/webhooks/trello` does not exist as a generic receiver in V1, the runtime path is unclear and was likely incomplete in V1.
- **Signature verification:** [`lib/webhooks/verification.ts:35-38`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/verification.ts#L35) explicitly returns `true` for Trello with the comment "Trello webhooks do not use our generic signature mechanism. Validation is done via callback challenge." **This is a real security gap.** Trello DOES support signature verification via the `X-Trello-Webhook` header (HMAC-SHA1 of `callbackURL + rawBody` keyed by the OAuth client secret); V1 leaves it unimplemented.

### Webhook normalization (V1 has it; needs porting if Trello ships)

V1 has full normalization at [`lib/webhooks/normalizer.ts:213-361`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/normalizer.ts#L213) covering all 6 trigger types from a single `action.type` switch:

- `createCard` / `copyCard` → `trello_trigger_new_card`
- `updateCard` (with `data.listBefore.id !== data.listAfter.id`) → `trello_trigger_card_moved`
- `updateCard` (with `'closed' in data.old`) → `trello_trigger_card_archived` (priority over generic update)
- `updateCard` (any other shape) → `trello_trigger_card_updated`
- `commentCard` → `trello_trigger_comment_added`
- `addMemberToCard` / `removeMemberFromCard` → `trello_trigger_member_changed`
- `moveCardToBoard` / `moveCardFromBoard` → `trello_trigger_card_moved`

This logic is well-tested at [`__tests__/webhooks/normalization.test.ts:297-535`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/webhooks/normalization.test.ts#L297) (≈10 cases). **The normalization layer is the cleanest part of V1's Trello code** and ports directly to V2.

### Auth / OAuth files

V1 has **three** different auth paths for Trello — they conflict with each other:

1. **`provider-registry.ts:1505-1605`** — registers a `trello` entry that:
   - Redirects `${baseUrl}/apps/trello-auth` (a static HTML page) when no `token` query param is present. The page is served from `app/apps/trello-auth.html` (Next.js serves it at `/apps/trello-auth`). The HTML page invokes Trello's client-side authorize widget (`https://trello.com/1/authorize?...&callback_method=fragment&return_url=...`), reads the token from the URL fragment via JavaScript, and POSTs to `/api/integrations/trello/process-token`.
   - `customTokenExchange`: extracts `token` and `key` from URL params (assumes the static page has already done its work and re-redirected to a callback URL with the token in the **query** string — which contradicts `callback_method=fragment`).
   - Stores `access_token` (the user token), no refresh token, no expiry.
   - Calls `additionalIntegrationData` to fetch `GET /members/me?key=${key}&token=${access_token}` for username/email/avatar.
   - Calls `onSuccess` to fire-and-forget `POST /api/integrations/trello/register-webhooks` (which calls `registerTrelloWebhooksForUser` — the bulk-board-registration path).

2. **`/api/integrations/trello/process-token/route.ts`** ([153 lines](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/trello/process-token/route.ts)) — the actual receiving endpoint when the static page POSTs the token. This is the path that **really runs** in V1; the `provider-registry.ts` callback flow is dead code since Trello returns the token in the URL fragment, never as a query param.

3. **`oauthConfig.ts:308-321`** — has a Trello entry with `tokenEndpoint: "https://trello.com/1/OAuthGetAccessToken"` and `authMethod: "body"`. **This is also dead config.** That endpoint is the OAuth 1.0a token endpoint, not OAuth 2.0. V1 does not use it. `authSchemes.ts:71` marks Trello as `'oauth_with_refresh'` — also wrong; Trello tokens do not refresh.

**Net:** V1's Trello auth is a **client-side token-fragment-receiver pattern** dressed up as if it were OAuth, with three layers of contradictory dead config. The path that actually works is: redirect to static HTML → fragment auth → JS POSTs to `/api/integrations/trello/process-token` → server stores raw user token + global app key.

### Data handlers (dynamic dropdowns)

[`app/api/integrations/trello/data/handlers/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/trello/data/handlers/) — 10 handlers wired into [`handlers/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/trello/data/handlers/index.ts):

`trello-boards`, `trello-list-templates`, `trello-card-templates`, `trello-board-templates`, `trello_lists`, `trello_cards`, `trello_board_members`, `trello_board_labels`, `trello_all_cards`, `trello_card_checklists`. Heavy use of dynamic dropdowns — every Trello action depends on `boardId` cascading to `listId` / `cardId` / `labelId` / `memberId`. V2 doesn't currently have dynamic-dropdown infrastructure for any provider beyond what each provider builds inline; porting Trello in full would mean either skipping these dropdowns (degraded UX) or adding a dynamic-dropdown contract.

### Tests

- **No Trello-specific test files** in V1's `__tests__/` other than:
  - [`__tests__/webhooks/normalization.test.ts:297-535`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/webhooks/normalization.test.ts#L297) — 10 normalization cases (good coverage of the logic).
  - [`__tests__/webhooks/verification.test.ts:141-145`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/webhooks/verification.test.ts#L141) — single test asserting that `verifyWebhookSignature(req, 'trello')` returns `true` (this test **enshrines the V1 security gap**, not a real signature verification).
- 7 webhook fixture files at [`lib/workflows/testing/fixtures/webhooks/trello/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/testing/fixtures/webhooks/trello/) covering create/update/move/archive/comment/add-member/no-match scenarios. Reusable for V2 if Trello ships.
- Zero handler tests, zero OAuth tests, zero lifecycle tests.

---

## Question-by-question answers (per slice prompt)

### 1. What Trello actions exist in V1?

**11 actions** declared in the manifest (recount of the prompt's "10 candidates" list):

| V1 action type | Handler | API call |
|---|---|---|
| `trello_action_create_card` | `createTrelloCard` | `POST /cards` |
| `trello_action_create_board` | `createTrelloBoard` | `POST /boards` (+ template expansion) |
| `trello_action_create_list` | `createTrelloList` | `POST /lists` |
| `trello_action_move_card` | `moveTrelloCard` | `PUT /cards/{cardId}` |
| `trello_action_get_cards` | `getTrelloCards` | `GET /lists/{listId}/cards` or `GET /boards/{boardId}/cards/{filter}` |
| `trello_action_update_card` | `updateTrelloCard` | `PUT /cards/{cardId}` |
| `trello_action_archive_card` | `archiveTrelloCard` | `PUT /cards/{cardId}` |
| `trello_action_add_comment` | `addTrelloComment` | `POST /cards/{cardId}/actions/comments` |
| `trello_action_add_label_to_card` | `addTrelloLabelToCard` | `POST /cards/{cardId}/idLabels` |
| `trello_action_add_checklist` | `addTrelloChecklist` | `POST /checklists` |
| `trello_action_create_checklist_item` | `createTrelloChecklistItem` | `POST /checklists/{checklistId}/checkItems` |

The slice prompt's candidate list (`create_card`, `update_card`, `move_card`, `add_comment`, `create_list`, `update_list`, `create_board`, `add_member`, `add_label`, `archive_card`) maps to V1 as: **`update_list` does NOT exist in V1; `add_member` does NOT exist in V1**. The other 8 candidates do exist. V1 also ships 3 candidates not in the prompt: `add_checklist`, `create_checklist_item`, `get_cards`.

### 2. What Trello triggers exist in V1?

**6 triggers** declared in the manifest:

| V1 trigger type | Webhook source | Normalized from |
|---|---|---|
| `trello_trigger_new_card` | per-board webhook | `action.type === 'createCard' \|\| 'copyCard'` |
| `trello_trigger_card_updated` | per-board webhook | `action.type === 'updateCard'` (no list change, no archive change) |
| `trello_trigger_card_moved` | per-board webhook | `updateCard` w/ `listBefore.id !== listAfter.id` OR `moveCardToBoard` / `moveCardFromBoard` |
| `trello_trigger_comment_added` | per-board webhook | `action.type === 'commentCard'` |
| `trello_trigger_member_changed` | per-board webhook | `action.type === 'addMemberToCard' \|\| 'removeMemberFromCard'` |
| `trello_trigger_card_archived` | per-board webhook | `updateCard` w/ `'closed' in data.old` (priority over generic update) |

The prompt's candidate list (`card_created`, `card_updated`, `card_moved`, `comment_added`, `checklist_updated`, `board_updated`) maps to V1 as: **`checklist_updated` does NOT exist in V1; `board_updated` does NOT exist in V1**. V1 ships `member_changed` and `card_archived` not in the prompt.

### 3. Is Trello auth API-key + user-token, OAuth 1.0, OAuth 2.0, or custom?

**API key + user token, exchanged via Trello's "client authorization" fragment-redirect flow.** Specifically:

- **API key:** A global app-level key set as `TRELLO_CLIENT_ID` env var. NOT per-user. Used as a `?key=...` query parameter on every Trello API call.
- **User token:** Per-user, obtained by redirecting to `https://trello.com/1/authorize?key={apiKey}&name=ChainReact&scope=read,write,account&expiration=never&response_type=token&callback_method=fragment&return_url={our_url}`. Trello redirects back to `return_url` with the token in the URL **fragment** (`#token=...`). A static page reads the fragment via JavaScript and POSTs the token to a server endpoint.
- **Tokens never expire** unless explicitly revoked or `expiration` is set to a value other than `never`. **No refresh mechanism.**
- Not OAuth 2.0 (no `code` query parameter, no `tokenEndpoint` exchange, no PKCE).
- Not OAuth 1.0a (V1's `oauthConfig.ts` references the OAuth 1.0a `OAuthGetAccessToken` endpoint, but the actual runtime path is the fragment-redirect flow, not 1.0a).

Trello also offers OAuth 1.0a as an alternative auth model for some integrations, and the Atlassian-cloud rebrand of Trello has rumored plans for OAuth 2.0 — neither is what V1 uses.

### 4. Does this auth model fit V2's current provider architecture?

**No.** V2's `ProviderOAuth` contract ([`contracts/integration.ts:168-222`](c:/Users/marcu/source/repos/ChainReactV2/contracts/integration.ts#L168)) assumes:

- `buildAuthUrl(state, scopes, pkce, providerHint) → string` — the URL the user is redirected to. ✅ Trello can produce one of these.
- `handleCallback(code, state, pkce, providerHint) → { tokens, account }` — exchanges an **`authorization code`** received in the redirect query string for tokens. ❌ Trello does not return a code; it returns a token directly in the URL **fragment**, which never reaches the server.
- `refreshToken(refreshToken)` — refreshes tokens. Not a blocker (Trello returns `RefreshNotSupportedError("trello")` like Slack/Notion/Shopify/GitHub).
- `revoke(token)` — best-effort revocation. Not a blocker (Trello has `DELETE /tokens/{token}`).

The structural break is the **fragment vs query** difference. V2's dispatcher (`services/oauth/dispatcher.ts`) consumes a `?code=...&state=...` callback, looks up the state row, and calls `handleCallback(code, state, …)`. With Trello there is no code — there is a token already, sitting in a URL fragment that the browser never sends to the server.

To make Trello work, V2 needs **one of two new pieces of infrastructure** that don't exist today:

- **(a) A token-fragment-receiver page** (parallel to V1's `/apps/trello-auth.html`): a static page that reads `#token=` via JavaScript and POSTs to a token-receiving endpoint that bypasses the standard `handleCallback` shape. Requires a new dispatcher entry point AND a new endpoint AND a new page.
- **(b) An OAuth 1.0a flow** added to V2's contract: a `generateOAuth1aRequestToken()` step before redirect, and a `handleOAuth1aCallback(oauth_token, oauth_verifier)` that signs every subsequent request with HMAC-SHA1 over `(method, url, sorted-params)` keyed by `oauth_consumer_secret + "&" + oauth_token_secret`. This is a much bigger contract change.

Option (a) is the smaller change but introduces a **second auth pattern** that bypasses the dispatcher's existing security guarantees (signed state JWT, CSRF protection, dispatcher-level provider-hint binding). Option (b) is a complete second auth model with a different request-signing scheme on every call.

### 5. Would supporting Trello require a new auth pattern?

**Yes — confirmed.** Specifically:

- A new contract member on `ProviderOAuth` (e.g., `tokenIngestEndpoint?: { schema: ZodSchema, handler: (input) => Promise<{ tokens, account }> }`) that the dispatcher knows how to route to OR
- A separate `ProviderClientAuth` contract alongside `ProviderOAuth` that the dispatcher's `connect` / `callback` paths branch on based on the manifest, OR
- A direct, non-dispatcher endpoint at `/api/integrations/trello/ingest-token` (V1-style, sidesteps the dispatcher entirely — the option of last resort because it forfeits dispatcher-level security).

This work is **explicitly out of scope** for a single-provider port. It needs its own slice and its own design discussion. The cost is comparable to Slice 12's `providerHint` extension, but the security surface is larger because the auth material itself bypasses the dispatcher.

### 6. Are Trello webhooks programmatically created?

**Yes.** `POST /1/webhooks` with body `{ idModel: <board-id>, callbackURL: <our-url>, description: "…" }` and `?key=${apiKey}&token=${userToken}` query params. Returns the created webhook id; V1 discards it (a real bug — orphan-cleanup is impossible without storing the webhook id per `(workflow, node, board)`).

Webhooks are scoped to a **`idModel`** (any Trello entity id — board, list, card, member, organization). For Phase 1 the realistic scope is **board-level** (matches the V1 trigger shape; all 6 V1 triggers fire from board-level webhooks).

### 7. How does Trello verify webhook authenticity?

Trello sends an **`X-Trello-Webhook`** header on every webhook POST. The value is the **base64-encoded HMAC-SHA1** of `(rawRequestBody + callbackURL)`, keyed by the OAuth **client secret** (`TRELLO_CLIENT_SECRET` env var; the **app secret**, NOT the user token).

Reference: `https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/`

Critical implementation notes:

- **Order matters:** body comes first, callbackURL second. Reversing them produces a different HMAC and silently fails verification.
- **Body must be raw bytes**, not re-serialized JSON. The receive route MUST capture the raw body before any parsing.
- **`callbackURL` is the exact URL Trello has registered**, including scheme, host, port, path, and any trailing slash. A mismatch (different proxy host, https-vs-http, missing trailing slash) breaks verification.
- **Key is the OAuth client secret**, NOT the user's token, NOT the global app key.
- **First request after webhook creation is a HEAD** (handshake) — no signature, just needs a 200 to register the webhook as healthy.

V1 implements **none of this** — `verification.ts:35-38` returns `true` unconditionally for Trello. This is a real security gap that V2 must close if Trello ships.

### 8. What should Batch 1 include if Trello is safe to port?

**See "Conditional Batch-1 plan" below.** The conditional plan assumes a separate "auth contract extension" slice has shipped first, exposing whatever pattern V2 chooses to support fragment-receiver / OAuth 1.0a / etc.

### 9. What should be deferred?

- **Per-card webhooks** (Trello supports `idModel` = card; not needed in Batch 1 since no V1 trigger requires it).
- **Power-Up / plugin manifest authoring** (Trello supports custom Power-Ups — orthogonal to integration support).
- **Dynamic-dropdown infrastructure** for the 10 V1 data handlers (`trello-boards`, `trello-lists`, etc.) — V2 doesn't have a generic dynamic-dropdown contract; either Trello ships without dropdowns (degraded UX) or this work is its own slice.
- **Client-side template expansion** for `create_board` (V1's hardcoded template lists like Kanban / Agile / Weekly Planner — opinionated content, not API behavior; defer to a future "templates" slice if at all).
- **Direct-upload-to-Trello for attachments** in `create_card` (200 lines of attachment code in V1 with a Supabase-storage fallback — out of scope for Batch 1; ship `create_card` without attachments, add attachments in a follow-up).
- **`add_member_to_card` action** (does not exist in V1; would be net-new work).
- **`update_list` action** (does not exist in V1; would be net-new work).
- **`board_updated` trigger** (does not exist in V1; would be net-new work).
- **`checklist_updated` trigger** (does not exist in V1; would be net-new work).
- **OAuth 1.0a auth path** (only relevant if V2 chooses (b) over (a) for the auth-contract extension).

### 10. Should Trello be included in Phase 1, or deferred like Dropbox?

**DEFER.** Same shape of reasoning as the Dropbox decision:

| Concern | Dropbox decision | Trello decision |
|---|---|---|
| V1 implementation completeness | Marked `comingSoon`; webhook signature TODO unresolved | Webhook signature is `return true` (real security gap); auth path has 3 layers of dead config |
| Auth model fit with V2's `ProviderOAuth` | Standard OAuth 2.0 — fits | **Fragment-receiver flow — does NOT fit** |
| New infrastructure required | None (just port the work) | New contract member OR new dispatcher path OR sidesteps dispatcher entirely |
| Security gaps to fix | Webhook HMAC unimplemented | Webhook HMAC unimplemented + auth bypass introduced if shortcut taken |
| Phase 1 inclusion | DEFERRED | **DEFERRED** |

Trello is a higher-value port than Dropbox once shipped (richer trigger surface, cleaner normalization), but it cannot be shipped well in Phase 1 without first extending V2's auth contract. Forcing it into Phase 1 means either:

- **Ship a security-weakened shortcut** that mirrors V1's `process-token` endpoint and bypasses the dispatcher's signed-state JWT / CSRF / providerHint binding. Strong NO.
- **Stuff a contract extension into the Trello slice** that should be its own design discussion. The extension affects every other provider's TypeScript signatures and the dispatcher's security boundary; it shouldn't ride in on a single port.
- **Delay the slice indefinitely** while the contract extension is designed. Inflated scope.

DEFER is the only clean answer. The deferred work is preserved in the conditional plan below, ready to pick up once the contract is extended.

---

## Auth model — the structural mismatch in detail

V1's actually-used flow:

```
[user clicks Connect Trello]
  → V1 backend redirects to ${baseUrl}/apps/trello-auth (static HTML page)
  → static page invokes Trello widget:
      https://trello.com/1/authorize
        ?key=${TRELLO_CLIENT_ID}
        &name=ChainReact
        &scope=read,write,account
        &expiration=never
        &response_type=token
        &callback_method=fragment
        &return_url=${baseUrl}/apps/trello-auth
  → user authorizes on Trello
  → Trello redirects to return_url with #token=<token-value> in URL fragment
  → static page's JavaScript reads window.location.hash, extracts token
  → static page POSTs to /api/integrations/trello/process-token
     with body { token, userId }
  → backend stores token in integrations.access_token (encrypted)
  → backend optionally fires-and-forgets webhook bulk-registration
```

V2's `ProviderOAuth` contract assumes:

```
[user clicks Connect <provider>]
  → V2 dispatcher generates state JWT, calls oauth.buildAuthUrl(state, scopes, pkce?)
  → returns the authorize URL
  → user authorizes on provider
  → provider redirects to /api/integrations/oauth/<provider>/callback?code=...&state=...
  → V2 dispatcher consumes state, calls oauth.handleCallback(code, state, pkce?)
  → handler exchanges code for tokens, returns { tokens, account }
  → dispatcher persists tokens
```

The break is at **step 5/6 of V1**: the token comes through a URL fragment + browser-side JavaScript + a separate POST endpoint. The V2 dispatcher's `handleCallback(code, …)` shape simply has no place to receive a token that arrives via a different transport.

Three possible patterns to bridge this in a future contract-extension slice:

### Pattern A — Token ingestion endpoint declared on the manifest

Add to `ProviderOAuth`:

```ts
tokenIngest?: {
  ingestSchema: z.ZodSchema;
  handler: (input: unknown, state: string) => Promise<{ tokens, account }>;
};
```

`buildAuthUrl` returns the static-page URL (or Trello directly with `return_url` pointing at our static page). The static page reads the fragment and POSTs to `/api/integrations/oauth/<provider>/ingest`, which validates `state` exactly like the standard callback (signed JWT, single-use, expiry), validates the body against `ingestSchema`, and calls the handler.

- **Pros:** Reuses V2's state primitives for CSRF / replay protection. Single dispatcher remains canonical. Manifest-driven; no special-case branching elsewhere.
- **Cons:** Adds a new endpoint type. Requires a static page in V2 (`app/apps/trello-auth/page.tsx` or similar). Two-step ingestion is harder to reason about than the standard one-step callback.
- **Closest existing precedent:** Slice 12's `providerHint` extension — adds a manifest member + dispatcher routing, doesn't change every provider's signature.

### Pattern B — OAuth 1.0a as a second `ProviderOAuth1a` contract

Design a parallel contract with `getRequestToken()`, `getAuthorizeUrl(requestToken)`, `getAccessToken(requestToken, verifier)`, and a per-request signing helper that wraps `fetch`.

- **Pros:** Trello's OAuth 1.0a is well-documented; the model is mature.
- **Cons:** Significant complexity (3-step token dance + signing every subsequent API call). Locks Trello into 1.0a even though Trello has hinted at OAuth 2.0 in the future. No other V2 provider uses 1.0a.

### Pattern C — Direct V1-style endpoint, dispatcher-bypass

A `/api/integrations/trello/ingest-token` route mirroring V1's `process-token`. Validates a CSRF token from the static page (separate from the dispatcher's state), persists the user token directly.

- **Pros:** Smallest code change. Ships fastest.
- **Cons:** **Bypasses every security guarantee the dispatcher gives.** Sets a precedent that "if a provider doesn't fit, write a one-off endpoint." Within a year there are 6 one-off endpoints with subtly different CSRF stories and the dispatcher is no longer the canonical security boundary. Strong NO.

**Recommendation when the slice ships:** Pattern A. It's the smallest contract change that preserves dispatcher canonicality. Pattern B is acceptable but heavier; Pattern C is not acceptable.

---

## V1 bugs to fix during port (if Trello ever ships)

1. **Webhook signature verification is a no-op.** `verification.ts:35-38` returns `true` unconditionally. **V2 fix:** implement HMAC-SHA1 of `(rawBody + callbackURL)` keyed by `TRELLO_CLIENT_SECRET`, base64-compared against the `X-Trello-Webhook` header, with constant-time compare via `crypto.timingSafeEqual`. Typed result `{ valid: false, reason: "missing_header" | "malformed" | "mismatch" | "missing_secret" }`. Same shape as `_shared/github/webhooks/signature.ts`.
2. **Webhook IDs are discarded.** `webhooks.ts:46-51` POSTs `/webhooks` and ignores the returned id. Without the id, deactivation is impossible. **V2 fix:** store webhook id in `trigger_resources.external_id` keyed by `(workflow, node, board)`.
3. **Bulk-board webhook registration on connect.** `registerTrelloWebhooksForUser` registers a webhook for every board the user can see. **V2 fix:** per-trigger lifecycle — webhook created on `onActivate`, deleted on `onDeactivate`, cleaned up on workflow delete. Mirrors V2's GitHub / HubSpot lifecycle.
4. **Auth scheme misclassification.** `authSchemes.ts:71` marks Trello as `'oauth_with_refresh'`. Trello tokens do not refresh. **V2 fix:** mark `refreshable: false` in the manifest; `refreshToken()` throws `RefreshNotSupportedError("trello")`.
5. **Dead OAuth 2.0 config.** `oauthConfig.ts:308-321` declares `tokenEndpoint: "https://trello.com/1/OAuthGetAccessToken"` and `authMethod: "body"` — these are OAuth 1.0a fields V1 never uses. **V2 fix:** don't replicate; the manifest declares only what's actually used.
6. **`/api/workflow/trello/route.ts` ignores normalization.** Receives webhooks, audits them, returns `{ ok: true }` without dispatching workflows. **V2 fix:** real dispatcher path that runs verification → normalization → trigger lookup → workflow dispatch.
7. **Static HTML auth page is unmaintained.** `app/apps/trello-auth.html` is a build artifact; the source page (likely under `app/apps/trello-auth/` or similar) is unclear from the audit. **V2 fix:** ship a typed Next.js page co-located with the integration.

---

## Conditional Batch 1 plan — only if/when the auth contract is extended

**Activate only if a separate "auth contract extension" slice ships first** (preferred: Pattern A — manifest-declared `tokenIngest` member with reused dispatcher state primitives).

### Final V2 action surface — 8 typed handlers (V1's 11 trimmed for fit)

| V2 action | V1 source | Endpoint | Notes |
|---|---|---|---|
| `create_card` | `createTrelloCard` | `POST /cards` | **Without** the 200-line attachment branch — defer attachments to follow-up. |
| `update_card` | `updateTrelloCard` | `PUT /cards/{cardId}` | |
| `move_card` | `moveTrelloCard` | `PUT /cards/{cardId}` | |
| `archive_card` | `archiveTrelloCard` | `PUT /cards/{cardId}` w/ `closed: true\|false` | |
| `add_comment` | `addTrelloComment` | `POST /cards/{cardId}/actions/comments` | |
| `add_label_to_card` | `addTrelloLabelToCard` | `POST /cards/{cardId}/idLabels` | |
| `create_list` | `createTrelloList` | `POST /lists` | **Without** position-resolution code (defaults to bottom) — defer relative positioning to follow-up. |
| `create_board` | `createTrelloBoard` | `POST /boards` | **Without** template expansion (defaults to API-default lists) — V1's hardcoded Kanban / Agile / Weekly templates are opinionated content, not API behavior. |

**Deferred:** `add_checklist`, `create_checklist_item`, `get_cards`, `add_member_to_card` (V1 has none of these in scope-fit shape, and `get_cards` is a read action that doesn't drive Phase-1 value).

Each handler:

- Appends `?key=${TRELLO_CLIENT_ID}&token=${accessToken}` to the URL (Trello's required auth mechanism — no Bearer header).
- Wraps the principal write call in `refreshAndRetry` — first 401 surfaces as `IntegrationActionRequiredError(reason: "refresh_not_supported")` (Trello tokens don't refresh).
- Validates input via Zod schemas (strict shape).
- Returns useful downstream variables (`cardId`, `cardUrl`, `boardId`, etc.).

### Final V2 trigger surface — 6 webhook triggers

All 6 V1 triggers port directly, all routed through one per-board webhook:

`new_card`, `card_updated`, `card_moved`, `comment_added`, `member_changed`, `card_archived`.

- **Lifecycle:** Per-board webhook. `onActivate` → `POST /webhooks` w/ `idModel = boardId`, store webhook id in `trigger_resources.external_id`. `onDeactivate` → `DELETE /webhooks/{webhookId}`. `onDelete` → same. 404 treated as success (already deleted).
- **No expiration** (Trello webhooks don't expire). No renewal handler.
- **Filtering:** done in the receive route after normalization, NOT at the webhook subscription level (Trello's `POST /webhooks` doesn't accept event-type filters — every board webhook fires for every change).

### Webhook signature verification

- Module: `_shared/trello/webhooks/signature.ts`. Mirrors `_shared/github/webhooks/signature.ts` shape.
- Algorithm: HMAC-SHA1 of `(rawBody + callbackURL)` keyed by `TRELLO_CLIENT_SECRET`. Base64-encode the HMAC. Compare to `X-Trello-Webhook` header via `crypto.timingSafeEqual` after a length-mismatch guard.
- Typed result: `{ valid: true } | { valid: false; reason: "missing_header" | "malformed" | "mismatch" | "missing_secret" }`.
- Receive route maps `missing_secret` → 503; everything else → 401.
- HEAD handler returns 200 (Trello's webhook-registration handshake).

### Five-commit shape (conditional — only if Trello proceeds)

| Commit | Scope |
|---|---|
| **1. `docs: slice 17 trello plan`** | THIS DOC. |
| 2. `feat(trello): manifest + auth-via-{chosen-pattern} + dispatcher registration` | `integrations/trello/manifest.ts`, `integrations/trello/oauth.ts` (or `tokenIngest.ts` depending on Pattern A vs B), dispatcher entry, `_shared/trello/api/_base.ts` (constants + `?key=…&token=…` URL helper). Capabilities: `oauth: true` (or contract-extension equivalent), `actions: false`, `webhookTrigger: false` until next commits. Unit tests cover the auth-ingest endpoint with mocked Trello widget redirects. |
| 3. `feat(trello): actions Batch 1 — 8 handlers` | 8 typed handlers + Zod schemas. `_shared/trello/api/_request.ts` (URL-param-auth via `?key=…&token=…`, JSON body, `refreshAndRetry`-wrapped). `_shared/trello/errors.ts`. Handler-registry entries appended to `services/execution/handlers/_registry.ts`. `capabilities.actions: true`. |
| 4. `feat(trello): 6 webhook triggers + X-Trello-Webhook HMAC-SHA1 verification + per-board lifecycle` | `_shared/trello/webhooks/signature.ts` (HMAC-SHA1-base64 verify with typed-result + length-mismatch guard + missing-secret/missing-header distinct reasons). `integrations/trello/triggers/{newCard,cardUpdated,cardMoved,commentAdded,memberChanged,cardArchived}/{activate,deactivate,receive,index}.ts`. Receive route at `/api/webhooks/trello`. Routing by `payload.action.data.board.id` against `trigger_resources.config.boardId`. Action-type discrimination via the V1 normalization logic (port from `lib/webhooks/normalizer.ts:213-361`). Dedup by `payload.action.id`. NO renewal handler. `capabilities.webhookTrigger: true`. |
| 5. `test(e2e): add Trello walkthrough with mocked Trello boundary` | `tests/e2e/helpers/mockTrelloServer.ts`. `tests/e2e/slice-17-trello-walkthrough.spec.ts`. Asserts: token-ingest flow → `GET /members/me` resolves member id → integration row stores it; `create_card` works; `update_card` works; webhook lifecycle creates per-board hook on activation and deletes on deactivation; signed `createCard` event dispatches workflow; invalid signature → 401; missing signature header → 401; missing secret → 503; duplicate `action.id` deduped on second arrival; full workflow run succeeds end-to-end. Adapt V1's 7 webhook fixtures from [`lib/workflows/testing/fixtures/webhooks/trello/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/testing/fixtures/webhooks/trello/) plus V1's 10 normalization test cases. |

### External setup checklist (conditional)

To run the conditional Slice 17 e2e against real Trello:

1. **Trello "Power-Up"** at `https://trello.com/power-ups/admin → New`. Free; one-click setup. (Trello's app/integration registration uses the Power-Ups admin even though no actual Power-Up is shipped — the app metadata is the artifact.)
2. **App settings:**
   - **API Key:** generate at `https://trello.com/app-key` (logged-in user becomes the "owner" of the app key).
   - **OAuth Secret:** same page — also serves as the **webhook signing secret**.
   - **Allowed Origins / Return URLs:** `${NEXT_PUBLIC_APP_URL}/apps/trello-auth` (or wherever the token-ingest static page lives).
   - **Webhook callback URL:** `${NEXT_PUBLIC_APP_URL}/api/webhooks/trello` (configured per-board at activation, NOT in the app settings).
3. **Env vars** (V2 dev server):
   - `TRELLO_CLIENT_ID` — the API key from `app-key`. Used as `?key=…` on every API call.
   - `TRELLO_CLIENT_SECRET` — the OAuth/webhook secret from `app-key`. **Used for webhook HMAC verification.**
4. **For e2e:** none of the above is required. The mocked Playwright suite ships throwaway values via `playwright.config.ts` `webServer.env` and the mock server validates them shape-only.

---

## Validation gates (per commit, including this one)

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

---

## Stop-and-report rules (per CLAUDE.md)

- **Final recommendation: DEFER Trello to Phase 2.** Reasoning is structural (auth contract mismatch), not implementation-effort-based.
- **No code changes in Commit 1.** This slice ships only the audit doc.
- **No new tables, no new migrations.**
- **No edits to shared infrastructure files.** `integrations/_registry.ts` and `services/oauth/dispatcher.ts` remain untouched. (Microsoft Teams is being implemented in another chat; both files are dirty in this working tree from that work — explicitly NOT touched here.)
- **Action list deviates from the prompt's candidates** in two places — `add_member` and `update_list` do NOT exist in V1; reported above. Trigger list deviates in two places — `checklist_updated` and `board_updated` do NOT exist in V1; reported above.
- **Trigger-list candidates added beyond the prompt:** `member_changed` and `card_archived` (both exist in V1, both ship in the conditional plan).
- **Anything that grows beyond a Trello-specific change** (e.g. extending `ProviderOAuth` with a `tokenIngest` member, adding OAuth 1.0a as a parallel contract) — STOP and report. The contract extension belongs in its own slice.
