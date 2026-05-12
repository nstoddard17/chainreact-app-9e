# Trello token-ingest auth contract — design + implementation plan

**Branch:** `v2-provider-port-local`.
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Predecessor:** `docs/slices/slice-17-trello.md` (Commit `21570b87f` — DEFER-recommendation audit).
**Goal:** Design and implement a generic, manifest-declared **token-ingest** auth contract that sits alongside the existing `ProviderOAuth` contract. The token-ingest contract is what unblocks the Trello port; it is intentionally generic so future API-key + per-user-token providers (Atlassian "API token" model, Asana PAT-via-fragment, certain Square surfaces) can use it without further contract changes.

**Recommendation:** Pattern A from the audit — manifest-declared `authFlow` discriminator + a new `ProviderTokenIngestAuth` interface + a new dispatcher operation `handleTokenIngest`. **Reuses every existing state primitive** (`createState`, `consumeState`, `oauth_states` table). No DB migration.

---

## 1. Problem statement

### Why the existing contract doesn't fit Trello

V2's `ProviderOAuth` (`contracts/integration.ts:168-222`) assumes:

- `buildAuthUrl(state, scopes, pkce, providerHint) → string` — redirect to provider.
- `handleCallback(code, state, pkce, providerHint) → { tokens, account }` — server-side code exchange.

Trello's actually-used "client authorization" flow:

```
[user] → V2 /connect → [Trello authorize page]
       ← Trello redirects browser → ${return_url}#token=...
       (the token lives in the URL fragment; never sent to the server)
[browser JS] → POSTs the captured fragment token to a V2 server endpoint
[V2 server] → validates token via GET /1/members/me, encrypts, persists
```

The `code` parameter on which `ProviderOAuth.handleCallback` depends **does not exist** in this flow. The token bypasses the server entirely until a client-side hand-off lifts it from the URL fragment and POSTs it back. V2's dispatcher must learn a second transport before Trello can be integrated.

### What V1 did (the cautionary tale)

V1 worked around the mismatch by:

1. Declaring a `trello` entry in the OAuth provider registry with dead config (`tokenEndpoint: ".../OAuthGetAccessToken"` — OAuth 1.0a token URL that V1 never actually calls).
2. Redirecting users to a separate static HTML page (`/apps/trello-auth.html`) instead of into the dispatcher's standard flow.
3. The static page's JavaScript parses `window.location.hash`, extracts the token, and POSTs to `/api/integrations/trello/process-token` — a direct DB-writing endpoint that **bypasses the standard OAuth state primitives entirely**. No signed state, no nonce, no replay protection.
4. The dispatcher's `customTokenExchange` path (`provider-registry.ts:1535-1541`) is **never invoked** at runtime — it reads `token` from query params expecting OAuth 2.0, but Trello returns the token in the fragment, so the URL never has `?token=...`. It's dead code.

This is exactly the precedent V2 must **not** repeat. The new contract preserves dispatcher canonicality: state primitives apply, nonce protection applies, signed-payload tamper protection applies, "all integration writes flow through one repository" applies.

### Cross-provider lessons that shape the design

- **Slice 12 (Shopify)** introduced `providerHint` for per-tenant subdomain inputs at connect-time. That same Slice-12 pattern — manifest-driven extension that doesn't change other providers' signatures — is the design template here.
- **The existing dispatcher contract has 4 operations** (`connect`, `handleCallback`, `refresh`, `revoke`). Token-ingest needs a 5th: `handleTokenIngest`. Adding an operation, not modifying existing ones, keeps existing providers untouched.
- **The `oauth_states` table already supports the lifecycle** needed: insert at connect, atomic-delete-if-fresh at consume, 15-min TTL. It needs no new columns.

---

## 2. Auth flow design

End-to-end happy path:

```
1.  User clicks "Connect Trello" in V2 UI.
2.  Client POSTs /api/integrations/oauth/trello/connect (existing route, no change).
3.  Route → dispatcher.connect({ userId, provider: "trello" }).
4.  Dispatcher reads manifest. Sees authFlow: "token_ingest".
5.  Dispatcher calls trelloIngestAuth.buildAuthUrl(state, scopes).
6.  Trello implementation returns:
        https://trello.com/1/authorize
          ?key=${TRELLO_CLIENT_ID}
          &name=ChainReact
          &scope=read,write,account
          &expiration=never
          &response_type=token
          &callback_method=fragment
          &return_url=${NEXT_PUBLIC_APP_URL}/integrations/token-ingest/trello?state=${state}
    The state is in the return_url's query string — Trello echoes it back via the fragment-mode redirect on top of the user token.
7.  Browser → Trello authorize page → user grants.
8.  Trello → 302 → ${return_url}#token=<user-token>
    (browser ends up at the V2 client page with token in the fragment and state in the query.)
9.  V2 client page (app/integrations/token-ingest/[provider]/page.tsx):
      - reads token from window.location.hash
      - reads state from the page's URL search params
      - fetch POST /api/integrations/oauth/${provider}/ingest
            body: { state, token }
      - on 200: replaces the URL with /?integration=connected&provider=trello
        (also strips the fragment via history.replaceState — the token is
         removed from the URL before the page is left visible/navigated.)
      - on error: redirects with /?integration_error=<reason>
10. /api/integrations/oauth/[provider]/ingest route handler:
      - validates the session (Supabase SSR cookie — same as connect route)
      - reads the JSON body
      - dispatcher.handleTokenIngest({ provider, state, token })
11. dispatcher.handleTokenIngest:
      - consumeState(state) — atomic JWT verify + DB row delete-if-fresh
      - JWT payload's userId is compared to the session user
        (matches OAuth callback's payload.userId/payload.provider check shape)
      - looks up TOKEN_INGEST_BY_PROVIDER[provider]
      - calls verifyAndIngestToken({ token, state })
12. Provider's verifyAndIngestToken (Trello example):
      - GET https://api.trello.com/1/members/me?key=${appKey}&token=${token}
      - on 200 + valid member id: returns { tokens: encrypted, account: { providerAccountId: member.id, displayName: member.username, metadata: { ... } } }
      - on 401/400: throws TokenIngestVerificationError("invalid token")
13. Dispatcher calls repositories/integrations.upsertActive — same shape OAuth uses.
14. Route returns 200 + { redirect: "/?integration=connected&provider=trello" }.
15. Client page navigates.
```

### Key transport differences from OAuth code/state

| Concern | OAuth code/state | Token-ingest |
|---|---|---|
| Provider-managed return URL | Server-side callback (`/api/integrations/oauth/[provider]/callback`) | Client-side ingest page (`/integrations/token-ingest/[provider]`) |
| State propagation | Provider echoes `state` as query param on callback | Provider preserves `state` in the URL **search** of `return_url`; token sits in **fragment** |
| Server-bound material in callback | `code` + `state` | `state` (token arrives later via separate POST) |
| Number of HTTP hits to V2 | One (provider → V2 callback GET) | Two (provider → V2 client page GET; client page → V2 ingest POST) |
| Replay protection | Single-use nonce in `oauth_states` | Same |
| State signature | HMAC-SHA256 in `services/oauth/state.ts` | Same |

Both flows write through `repositories/integrations.upsertActive`. Both consume `oauth_states` rows atomically. Neither bypasses dispatcher canonicality.

### Failure modes and their HTTP responses

| Failure | Route response | Client UX |
|---|---|---|
| Session missing on `/connect` POST | 401 | Re-prompt login |
| Session missing on `/ingest` POST | 401 | Re-prompt login |
| `state` missing from `/ingest` body | 400 `{ error: "state required" }` | Generic error toast |
| `token` missing from `/ingest` body | 400 `{ error: "token required" }` | Generic error toast |
| State signature invalid | 400 `{ error: "invalid state" }` (no detail leak) | "Connection link expired — try again" |
| State already consumed | 400 `{ error: "invalid state" }` | "Connection link expired — try again" |
| State expired (>15 min) | 400 `{ error: "invalid state" }` | "Connection link expired — try again" |
| State session-user mismatch | 400 `{ error: "invalid state" }` | "Connection link expired — try again" |
| Provider rejects token (401/403 on verify call) | 400 `{ error: "invalid token" }` | "Trello rejected the connection — try again" |
| Provider verify call network failure | 502 `{ error: "verify failed" }` | "Couldn't reach Trello — try again" |
| `upsertActive` DB failure | 500 `{ error: "persist failed" }` | "Couldn't save — try again" |

All failures must **fail closed**: no integration row is inserted, no logs leak the token. State row is consumed (deleted) before the verify call, so a single ingest attempt can never be replayed even if the verify call fails.

---

## 3. Contract design

### Three edits to `contracts/integration.ts`

#### Edit 1: Manifest discriminator

```ts
export const AuthFlowSchema = z.enum(["code_callback", "token_ingest"]);
export type AuthFlow = z.infer<typeof AuthFlowSchema>;
```

In `ProviderManifestSchema`:

```ts
authFlow: AuthFlowSchema.default("code_callback"),
```

`"code_callback"` is the default so **zero existing manifests need to change**. Every provider through Slice 16 (Microsoft Teams) keeps its current shape; the field is implicitly populated by Zod's `.default()`.

A `superRefine` clause adds:

```ts
if (m.capabilities.oauth && m.authFlow === "token_ingest" && m.refreshable) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["refreshable"],
    message: "token_ingest providers cannot be refreshable.",
  });
}
```

Token-ingest providers cannot store refresh tokens (they don't get one from the provider). The invariant lives next to the manifest definition so future maintainers can't forget.

#### Edit 2: New `ProviderTokenIngestAuth` interface

```ts
export interface ProviderTokenIngestAuth {
  /**
   * Build the URL the user is redirected to. The provider returns the
   * user to V2's ingest page with the token in the URL fragment (or
   * however the provider hands the token to the browser). The `state`
   * parameter is the signed token from createState(); embed it in the
   * return_url's query string so it is preserved across the
   * fragment-mode redirect and available to the ingest page.
   */
  buildAuthUrl(state: string, scopes: readonly string[]): string;

  /**
   * Verify a token submitted by the client ingest page against the
   * provider. Implementations call a provider API (e.g.,
   * /me) and return the same { tokens, account } shape ProviderOAuth's
   * handleCallback does. Throws TokenIngestVerificationError when the
   * token is invalid.
   *
   * `token` is the plaintext token received from the client page;
   * implementations are responsible for encrypting before returning it
   * inside `tokens.accessTokenEncrypted`.
   */
  verifyAndIngestToken(input: {
    token: string;
    state: string;
  }): Promise<{ tokens: EncryptedTokens; account: ProviderAccountInfo }>;

  /** Best-effort token revocation at the provider; safe to call on disconnect. */
  revoke(token: string): Promise<void>;
}
```

Notably absent: `handleCallback`, `refreshToken`, `generatePkce`, `validateProviderHint`. These don't apply to token-ingest providers.

#### Edit 3: New typed error class

```ts
export class TokenIngestVerificationError extends Error {
  constructor(provider: string, reason: string) {
    super(`Token ingest verification failed for '${provider}': ${reason}`);
    this.name = "TokenIngestVerificationError";
  }
}
```

The dispatcher catches this to return a 400 to the client rather than a 500. Distinct error class to keep the failure-mode shape explicit and testable.

### One edit to `services/oauth/dispatcher.ts`

Add a parallel registry and a new dispatcher operation:

```ts
import { trelloAuth } from "@/integrations/trello/auth"; // shipped in Commit 3

const TOKEN_INGEST_BY_PROVIDER: Readonly<Record<string, ProviderTokenIngestAuth>> =
  Object.freeze({
    trello: trelloAuth,
  });

export async function connect(input: ConnectInput): Promise<ConnectOutput> {
  // ... existing validation ...
  if (manifest.authFlow === "token_ingest") {
    const ingestAuth = TOKEN_INGEST_BY_PROVIDER[input.provider];
    if (!ingestAuth) {
      throw new Error(
        `No token-ingest implementation registered for provider '${input.provider}'.`,
      );
    }
    // Token-ingest providers do not support providerHint or PKCE; reject
    // misuse explicitly.
    if (input.providerHint !== undefined) {
      throw new Error(
        `Provider '${input.provider}' (token_ingest) does not accept providerHint.`,
      );
    }
    const requestedScopes = [...manifest.scopes.required, ...manifest.scopes.optional];
    const { token: state } = await createState({
      userId: input.userId,
      provider: input.provider,
      requestedScopes,
    });
    const redirectUrl = ingestAuth.buildAuthUrl(state, requestedScopes);
    return { redirectUrl };
  }
  // ... existing OAuth-flow path unchanged ...
}

export interface HandleTokenIngestInput {
  userId: string;
  provider: string;
  state: string;
  token: string;
}

export async function handleTokenIngest(
  input: HandleTokenIngestInput,
): Promise<HandleCallbackOutput> {
  if (!input.userId) throw new Error("handleTokenIngest: userId is required.");
  if (!input.state) throw new InvalidStateError("missing state");
  if (!input.token) throw new TokenIngestVerificationError(input.provider, "missing token");

  const manifest = getProvider(input.provider);
  if (!manifest) throw new Error(`Unknown provider: ${input.provider}`);
  if (manifest.authFlow !== "token_ingest") {
    throw new Error(`Provider '${input.provider}' does not use token_ingest auth.`);
  }
  const ingestAuth = TOKEN_INGEST_BY_PROVIDER[input.provider];
  if (!ingestAuth) {
    throw new Error(
      `No token-ingest implementation registered for provider '${input.provider}'.`,
    );
  }

  // Consume state FIRST — atomic delete-if-fresh prevents replay even if
  // the verify call subsequently fails or throws. Same precedence the
  // OAuth callback uses.
  const { payload } = await consumeState(input.state);
  if (payload.provider !== input.provider) {
    throw new InvalidStateError("provider mismatch between state and route");
  }
  if (payload.userId !== input.userId) {
    throw new InvalidStateError("session/state user mismatch");
  }

  const { tokens, account } = await ingestAuth.verifyAndIngestToken({
    token: input.token,
    state: input.state,
  });

  const integration = await upsertActive({
    userId: payload.userId,
    provider: input.provider,
    providerAccountId: account.providerAccountId,
    displayName: account.displayName,
    tokens,
    accountMetadata: account.metadata,
  });

  return { integration };
}
```

The session/state user mismatch check is **stricter** than the OAuth callback (which only checks provider mismatch). Token-ingest has both server-bound inputs from the **same session** (the ingest POST has a session cookie and the state encodes the user) so the equality is a useful defense-in-depth — guards against a stolen state token being POSTed by a different signed-in user. OAuth callback doesn't have this guarantee because the callback may arrive on a different host than the connect.

### Route additions

#### New: `app/api/integrations/oauth/[provider]/ingest/route.ts`

POST handler. Authenticates via Supabase SSR. Validates request body shape. Calls `dispatcher.handleTokenIngest`. Maps errors to typed HTTP responses per the failure table above. Returns `{ redirect: "/?integration=connected&provider=<provider>" }` on success — the client page navigates after a 200.

#### New: `app/integrations/token-ingest/[provider]/page.tsx`

Client component. Reads `state` from search params and `token` from `window.location.hash`. POSTs to `/api/integrations/oauth/${provider}/ingest`. Strips fragment via `history.replaceState` immediately on mount (token removed from the URL before the page renders any UI beyond a brief "connecting" indicator). Navigates on response.

**Security note:** This page must be `"use client"` (it reads `window.location`). It must NOT log the token. It must NOT include any analytics/telemetry hook that captures URL hashes (no Sentry breadcrumb, no Posthog `$current_url` capture for this route). The CSP / structure tests enforce a no-`@/services` / no-`@/repositories` import on this file.

---

## 4. Security requirements

These are non-negotiable for Commit 2. Tests must pin every one of them.

| # | Requirement | Mechanism |
|---|---|---|
| 1 | State must be short-lived | Existing 15-min TTL on `oauth_states` + JWT `expiresAt` (no change). |
| 2 | State must be single-use | Existing atomic DELETE-RETURNING in `consumeByNonce`. State row deleted BEFORE verify call — even if verify fails, state cannot be replayed. |
| 3 | State must be cryptographically bound to issuing user | JWT payload's `userId` compared to session user in route handler AND in `handleTokenIngest`. |
| 4 | Token must be verified server-side before persistence | `verifyAndIngestToken` MUST call a provider endpoint (e.g., `GET /1/members/me`). Implementations that don't verify are a bug — Commit 2 tests assert the verifier is called. |
| 5 | Token encrypted at rest | `verifyAndIngestToken` returns `tokens.accessTokenEncrypted` — implementations call `encryptToken()` before returning. Same as OAuth path. |
| 6 | Token must never appear in logs | (a) `verifyAndIngestToken` implementations don't log inputs; (b) `console.error` of dispatcher errors strips token. Test: enable a captured-stdout test mode, drive a 401-verify path, assert token substring is absent. |
| 7 | Token must never be returned in HTTP responses | Ingest route returns redirect URL only. `TokenIngestVerificationError.message` does NOT include the token. |
| 8 | Token must never appear in query strings | The transport from provider → client uses URL **fragment**. The client → server transport uses POST body (JSON). State is the only thing in the URL query. |
| 9 | Client fragment token removed from URL after capture | Client page calls `history.replaceState(null, "", window.location.pathname + window.location.search)` on mount, BEFORE the fetch. |
| 10 | Fail closed on missing state | 400. State consume guarded before verify. |
| 11 | Fail closed on expired state | Existing `consumeState` throws `InvalidStateError("expired")` / `("already consumed")`. |
| 12 | Fail closed on invalid token | `verifyAndIngestToken` throws `TokenIngestVerificationError`; dispatcher does NOT call `upsertActive`. |
| 13 | No dispatcher bypass | The ingest endpoint is inside the existing `app/api/integrations/oauth/[provider]/` route group, calls `dispatcher.handleTokenIngest`, uses `services/oauth/state.ts` primitives. No direct DB writes from the route. |
| 14 | Session check on every server hop | Both `/connect` POST and `/ingest` POST require `auth.getUser()`. |
| 15 | Token returned from provider over HTTPS only | `buildAuthUrl` uses `https://trello.com/...` directly. `return_url` is built from `NEXT_PUBLIC_APP_URL` (production must be HTTPS; dev `http://localhost:3000` is acceptable per the existing OAuth pattern). |

---

## 5. Data model

**No DB migration.** Existing tables suffice:

- **`oauth_states`** (services/oauth/state.ts + `repositories/oauthStates.ts`) — single-use nonce + signed JWT carrying user + provider + scopes. Token-ingest uses this verbatim. PKCE columns stay NULL (Trello doesn't use PKCE).
- **`integrations`** (repositories/integrations.ts) — already stores `provider_account_id`, encrypted access token, `refresh_token_encrypted` (NULL for Trello), `scopes`, `account_metadata` JSON. All Trello-specific fields fit `account_metadata`:
  - `metadata.appKey` (the global `TRELLO_CLIENT_ID` — useful for action calls that need `?key=...`)
  - `metadata.username` (Trello member username, e.g. `"octocat"`)
  - `metadata.fullName` (e.g. `"Octo Cat"`)
  - `metadata.avatarUrl`
  - `metadata.url` (Trello profile URL)

`providerAccountId` = Trello member **id** (a stable opaque string Trello issues, e.g. `"5d24c0e7e1b6a82e88f44e3a"`). The member id is more durable than the username — Trello allows username changes but member ids are immutable.

---

## 6. V2 files involved

Confirmed via audit (no Trello references exist in V2 yet — `git grep -i trello` confirms zero results before this slice).

### Commit 2 — contract + dispatcher plumbing

| File | Edit type | Purpose |
|---|---|---|
| `contracts/integration.ts` | Edit | Add `AuthFlowSchema`, `ProviderTokenIngestAuth`, `TokenIngestVerificationError`; add `authFlow` field to manifest; superRefine for `token_ingest` ↔ `refreshable` invariant. |
| `services/oauth/dispatcher.ts` | Edit | Add `TOKEN_INGEST_BY_PROVIDER` registry (initially empty), branch in `connect()` for `authFlow === "token_ingest"`, add `handleTokenIngest()` operation. |
| `app/api/integrations/oauth/[provider]/ingest/route.ts` | New | POST handler — auth, body validation, dispatcher call, typed-error mapping. |
| `app/integrations/token-ingest/[provider]/page.tsx` | New | Client page — fragment capture, history.replaceState, fetch POST, navigate. |
| `tests/unit/contracts/integration.test.ts` | Edit | Add cases for `authFlow` default, `token_ingest` + `refreshable: true` invariant rejection, parse round-trip. |
| `tests/unit/services/oauth/dispatcher-token-ingest.test.ts` | New | Cover all dispatcher invariants — connect routes by manifest, handleTokenIngest consumes state, rejects mismatched user, rejects mismatched provider, fails closed on verify failure, persists on success, does NOT log token. |
| `tests/unit/services/oauth/state.test.ts` | Edit (small) | If state has a per-flow flag (it doesn't — but verify nothing leaks). |
| `tests/unit/app/api/integrations/oauth/ingest-route.test.ts` | New | Route handler tests — 401 unauthenticated, 400 missing fields, 400 invalid state, 400 verify-failed, 200 + redirect on success. |

The contract / dispatcher / route files **do not import any Trello-specific code in Commit 2** — `TOKEN_INGEST_BY_PROVIDER` starts empty. Commit 3 (Trello manifest) appends the Trello entry.

### Commit 3 — Trello manifest + token-ingest auth

| File | Edit type | Purpose |
|---|---|---|
| `integrations/trello/manifest.ts` | New | `authFlow: "token_ingest"`, `capabilities.oauth: true`, `refreshable: false`, `tokenScope: "user"`, scopes `["read", "write", "account"]`, `accountIdField: "member_id"`, `healthCheckIntervalMs: 4h`. |
| `integrations/trello/auth.ts` | New | Implements `ProviderTokenIngestAuth` — `buildAuthUrl` constructs the Trello authorize URL; `verifyAndIngestToken` calls `GET /1/members/me`; `revoke` calls `DELETE /1/tokens/{token}`. |
| `integrations/_registry.ts` | Edit | Append `trelloManifest` import + entry. |
| `services/oauth/dispatcher.ts` | Edit (1 line) | Append `trello: trelloAuth` to `TOKEN_INGEST_BY_PROVIDER`. |
| `tests/unit/integrations/trello/manifest.test.ts` | New | Manifest parses; declares `authFlow: "token_ingest"`; refuses `refreshable: true` mutation. |
| `tests/unit/integrations/trello/auth.test.ts` | New | `buildAuthUrl` produces the expected Trello authorize URL with state in `return_url`; `verifyAndIngestToken` calls `GET /1/members/me`, parses member id/username, encrypts token; throws `TokenIngestVerificationError` on 401; `revoke` calls `DELETE /1/tokens/{token}`. |

---

## 7. Trello-specific plan

After the contract lands (Commit 2), Trello implementation (Commit 3) needs:

### 7.1 Token verification helper

`integrations/trello/auth.ts` exports `trelloAuth: ProviderTokenIngestAuth`.

`verifyAndIngestToken({ token })` calls:

```
GET https://api.trello.com/1/members/me?key=${TRELLO_CLIENT_ID}&token=${token}
   &fields=id,username,fullName,initials,avatarUrl,url
```

- 200 → parse JSON. Return:
  ```ts
  {
    tokens: {
      accessTokenEncrypted: encryptToken(token),
      refreshTokenEncrypted: null,    // Trello tokens don't refresh
      accessTokenExpiresAt: null,     // Trello tokens don't expire when issued with expiration=never
      scopes: [],                      // Trello scope grants are not echoed in this response
    },
    account: {
      providerAccountId: member.id,
      displayName: member.fullName || member.username,
      metadata: {
        username: member.username,
        fullName: member.fullName,
        avatarUrl: member.avatarUrl,
        url: member.url,
        appKey: process.env.TRELLO_CLIENT_ID,
      },
    },
  }
  ```
- 401 / 403 → `throw new TokenIngestVerificationError("trello", "invalid token")`
- 5xx / network error → re-throw (caller maps to 502)

### 7.2 buildAuthUrl

```ts
buildAuthUrl(state: string, _scopes: readonly string[]): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl = `${baseUrl}/integrations/token-ingest/trello?state=${encodeURIComponent(state)}`;
  const params = new URLSearchParams({
    key: getTrelloAppKey(),
    name: "ChainReact",
    scope: "read,write,account",
    expiration: "never",
    response_type: "token",
    callback_method: "fragment",
    return_url: returnUrl,
  });
  return `https://trello.com/1/authorize?${params.toString()}`;
}
```

Scopes are hardcoded `"read,write,account"` — Trello accepts them as a comma-separated string in the `scope` param. `_scopes` from the dispatcher is ignored (Trello's scope grants are managed inside the authorize page, not the URL). Documented in the file header.

### 7.3 revoke

```ts
revoke(token: string): Promise<void> {
  await fetch(
    `https://api.trello.com/1/tokens/${token}?key=${getTrelloAppKey()}`,
    { method: "DELETE" }
  );
  // Best-effort — Trello returns 404 if already revoked; don't throw.
}
```

### 7.4 Trello manifest

```ts
export const trelloManifest = ProviderManifestSchema.parse({
  id: "trello",
  displayName: "Trello",
  isEnabled: true,
  apiVersion: "1",            // Trello REST API is unversioned beyond /1/
  tokenScope: "user",
  authFlow: "token_ingest",
  oauthFlows: ["client_authorization"],
  scopes: {
    required: ["read", "write", "account"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,              // user-facing connect flow exists
    webhookTrigger: false,    // flipped in a later commit
    pollingTrigger: false,
    actions: false,           // flipped in a later commit
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000,   // 4h — "developer tier"
  refreshable: false,
});
```

---

## 8. Trello provider plan after auth (later commits)

For visibility and continuity. Not implemented in Phase B/C.

### Actions (Commit 4)

8 typed handlers — `create_card`, `update_card`, `move_card`, `archive_card`, `add_comment`, `add_label_to_card`, `create_list`, `create_board`. URL-param-auth via `?key=…&token=…`. `refreshAndRetry`-wrapped — first 401 surfaces as `IntegrationActionRequiredError(reason: "refresh_not_supported")`. Zod schemas. Defer `add_checklist`, `create_checklist_item`, `get_cards` per the audit plan.

### Triggers + webhooks (Commit 5)

6 webhook triggers, per-board lifecycle:

- `new_card`, `card_updated`, `card_moved`, `comment_added`, `member_changed`, `card_archived`
- `onActivate` → `POST /1/webhooks` w/ `idModel = boardId`; store webhook id in `trigger_resources.external_id`
- `onDeactivate` → `DELETE /1/webhooks/{webhookId}` (404 = success)
- Receive route at `/api/webhooks/trello`
- **Signature verification** via `_shared/trello/webhooks/signature.ts` — HMAC-SHA1 of `(rawBody + callbackURL)` keyed by `TRELLO_CLIENT_SECRET`, base64-compared against `X-Trello-Webhook` header — closes the V1 security gap
- Dedup by `action.id`
- Port V1 normalization logic from `lib/webhooks/normalizer.ts:213-361`

### Mocked-boundary e2e (Commit 6)

Mock Trello server at a slice port; Playwright walkthrough validates connect → action → webhook → cleanup. Asserts no real provider call, dedup works, signature mismatch returns 401.

### CLAUDE.md / docs update (Commit 7)

Only if token-ingest becomes a durable pattern (i.e., a second token-ingest provider lands). Documents the pattern in `docs/rules/` and references Trello as the inaugural provider. Likely not needed until then.

---

## 9. Batch plan (recommended)

| Commit | Scope | Files touched |
|---|---|---|
| **1. `docs: plan Trello token-ingest auth contract`** | THIS DOC. | `docs/slices/trello-token-ingest-contract-plan.md` (new) |
| 2. `feat(auth): add token-ingest provider contract` | Contract additions + dispatcher plumbing + ingest route + client ingest page + tests. NO Trello-specific code. | `contracts/integration.ts`, `services/oauth/dispatcher.ts`, `app/api/integrations/oauth/[provider]/ingest/route.ts` (new), `app/integrations/token-ingest/[provider]/page.tsx` (new), tests |
| 3. `feat(trello): manifest and token-ingest auth` | Trello manifest + `trelloAuth` (`ProviderTokenIngestAuth` implementation) + Trello entry in `TOKEN_INGEST_BY_PROVIDER` + registry. | `integrations/trello/manifest.ts` (new), `integrations/trello/auth.ts` (new), `integrations/_registry.ts` (edit), `services/oauth/dispatcher.ts` (edit), tests |
| 4. `feat(trello): actions Batch 1` | 8 typed handlers (`create_card`, `update_card`, `move_card`, `archive_card`, `add_comment`, `add_label_to_card`, `create_list`, `create_board`) + `_shared/trello/api/_request.ts` + Zod schemas + `_shared/trello/errors.ts` + handler-registry entries. | `integrations/trello/actions/**`, `integrations/_shared/trello/**`, `services/execution/handlers/_registry.ts` (edit), tests |
| 5. `feat(trello): 6 webhook triggers + signature verification + per-board lifecycle` | All 6 triggers; receive route; `_shared/trello/webhooks/signature.ts` (HMAC-SHA1-base64); normalization (port V1 logic); dedup by `action.id`. | `integrations/trello/triggers/**`, `integrations/_shared/trello/webhooks/**`, `app/api/webhooks/trello/route.ts` (new), tests |
| 6. `test(e2e): Trello walkthrough with mocked Trello boundary` | Playwright + mock Trello server. Token-ingest walkthrough + actions + webhook lifecycle + signature failure cases. | `tests/e2e/helpers/mockTrelloServer.ts`, `tests/e2e/slice-17-trello-walkthrough.spec.ts` |
| 7. (Conditional) `docs: token-ingest auth pattern` | Only if a second token-ingest provider lands. Documents the pattern in `docs/rules/`. | `docs/rules/token-ingest-auth.md` (new) |

---

## 10. Open questions

None blocking. Deliberate decisions documented inline:

- **Manifest field name `authFlow` (not `authType`).** Matches verb-based vocabulary the dispatcher uses (`connect`, `handleCallback`, `handleTokenIngest`).
- **`"code_callback"` not `"oauth"` as the discriminator value.** Both flows go through `capabilities.oauth: true` — the discriminator names the **transport**, not the auth family.
- **Token-ingest providers cannot have `providerHint`.** Trello doesn't need it; future providers that need both would require a separate design discussion. Failing-loud now (dispatcher rejects `providerHint` for `token_ingest` providers) prevents accidental coupling.
- **Token-ingest providers cannot have PKCE.** Same reasoning. PKCE protects the server-side code exchange — token-ingest has no code exchange.
- **`accountIdField` is `member_id` for Trello**, not `username`. Member ids are immutable; usernames can change.
- **No automatic webhook registration on connect.** Closes the V1 "bulk-board webhook registration" bug — webhooks are per-trigger-resource, registered in lifecycle.

---

## 11. Validation gates (per commit)

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For Commit 6 (e2e), also run all existing provider walkthroughs + the Trello walkthrough twice for stability.

---

## 12. Stop-and-report rules

- **No DB migrations.** State fits existing tables; token storage fits `integrations.access_token_encrypted` + `account_metadata`. STOP if a migration is needed and report before authoring it.
- **No dispatcher bypass.** Every persistence call flows through `repositories/integrations.upsertActive`. Every state operation flows through `services/oauth/state.ts`. STOP if a Trello-specific shortcut creeps in.
- **No OAuth 1.0a.** STOP if anything in the implementation starts signing requests with `oauth_consumer_key`/`oauth_signature` — V2 explicitly does NOT support 1.0a.
- **No token in logs.** STOP if any debug/error path needs the token to identify a row — use the V2 row id (`integrations.id`) or hash-prefix the token, never the plaintext.
- **No second concurrent auth flow shape.** The new contract is `token_ingest`; STOP if Trello (or any future provider) needs a third shape (`token_paste`, `oauth_1a`, etc.). Each new flow shape is its own design slice.
- **No edits to other providers' manifests.** Adding `authFlow` as `default("code_callback")` means existing manifests don't need to change. STOP if Commit 2 requires touching other providers' manifests.
