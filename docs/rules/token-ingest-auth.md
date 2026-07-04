# Rule: Token-Ingest Auth

## Purpose

Define the contract for providers whose auth flow returns a per-user token **in the URL fragment** rather than via an OAuth 2.0 code/state server callback. The dispatcher still owns state issuance and persistence; only the wire transport from provider → V2 differs from `ProviderOAuth`.

Inaugural production consumer: **Trello** (Slice 17). Future API-key + per-user-token providers (Atlassian "API token", Asana PAT, Square non-refreshable OAuth, etc.) MAY reuse this pattern subject to the audit gate in §"Adding a Second Token-Ingest Provider" below.

## When to use `ProviderTokenIngestAuth`

Use `ProviderTokenIngestAuth` (declared via `manifest.authFlow = "token_ingest"`) ONLY when **all** of the following hold:

1. The provider's auth flow returns the access token to the browser via a URL fragment (`#token=…`) or some other browser-only transport that does NOT reach a server callback.
2. The token does NOT round-trip through an exchange step — there is no `code` to exchange for tokens.
3. The provider exposes a server-side endpoint that proves the token is valid AND returns durable account info (e.g., Trello `GET /1/members/me`).
4. The tokens are **non-refreshable**. Token-ingest providers cannot have refresh tokens — this is a schema invariant (see §"Manifest Requirements" below).
5. The provider does NOT need per-tenant input at connect time (no `providerHint` support). Future hybrid providers needing both fragment-token AND per-tenant input require a separate contract extension.

## When NOT to use token-ingest

DO NOT reach for `ProviderTokenIngestAuth` when:

- The provider has any working OAuth 2.0 code/state flow. Use `ProviderOAuth` even if a fragment-mode flow is also available — code/state is strictly safer (no client-side token handling, no fragment-scrubbing, no second server hop).
- The provider issues refresh tokens. Token-ingest is explicitly non-refreshable per schema invariant — adopting it would force you to drop refresh handling.
- The provider is workspace-scoped AND a single V2 user can have multiple active integrations against different workspaces of that provider. The action-handler `accountId: null` rule (§"Action-Handler accountId Rule") breaks down under multi-account; revisit before shipping.
- "Future-proofing" — do not adopt a new contract just because a provider might switch transports later. Pick the contract that matches the wire today.

## End-to-End Flow

```
[user] clicks Connect <Provider>
   → POST /api/integrations/oauth/<provider>/connect
   → dispatcher.connect():
       - reads manifest (authFlow === "token_ingest")
       - createState() → signed JWT + oauth_states row (single-use nonce)
       - calls provider.buildAuthUrl(state, scopes)
       - returns provider authorize URL whose `return_url` embeds `state`
   ← { redirectUrl }

[browser] navigates to redirectUrl (provider's authorize page)
   ← user grants
   ← provider 302s to ${return_url}#token=<user-token>
       (browsers preserve fragments through 302 redirects)

[browser] lands on /integrations/token-ingest/<provider>?state=…#token=…
   → V2 client page (use client):
       1. parses fragment from window.location.hash
       2. history.replaceState() strips fragment from URL bar
       3. reads state from window.location.search
       4. fetch POST /api/integrations/oauth/<provider>/ingest
            credentials: include
            body: { state, token }

[server] /api/integrations/oauth/[provider]/ingest:
   - auth.getUser() — session-authenticated
   - dispatcher.handleTokenIngest({ userId, provider, state, token }):
       1. consumeState(state) — atomic JWT verify + DB delete-if-fresh
       2. cross-check JWT.provider === route.provider
       3. cross-check JWT.userId === session.userId  (stricter than OAuth)
       4. provider.verifyAndIngestToken({ token, state }):
            - calls provider API endpoint that proves the token
            - 401/403 → throw TokenIngestVerificationError
            - on success: encryptToken(plaintext) → returns { tokens, account }
       5. upsertActive(...) — same repository path OAuth callbacks use
   ← 200 { redirect: "/?integration=connected&provider=<provider>" }
   ← client page navigates
```

The state row is consumed **before** the verify call. A failed verify cannot leave a replayable state row behind.

## Required State / Session Validation

Implementations MUST NOT relax any of these:

1. **State signature verified** before any other check (cheap, no DB round-trip).
2. **State row atomically consumed** — `DELETE … WHERE nonce=$1 AND expires_at > now() RETURNING …`. A second ingest with the same state token MUST be rejected.
3. **JWT.provider === route.provider.** Mismatch → `InvalidStateError("provider mismatch between state and route")`.
4. **JWT.userId === session.userId.** Mismatch → `InvalidStateError("session/state user mismatch")`. This check is **stricter than OAuth callback** because both server hops (connect + ingest) share a browser session — a state token POSTed by a different signed-in user is unambiguously a hijack attempt.
5. **State consumed BEFORE verify call.** If the verify call fails (network, 5xx, 401), the state is already gone — replay-impossible by construction.
6. **15-minute TTL** (inherited from `oauth_states` row). Expired states reject without DB inspection.

## Fragment-Token Client Page Behavior

The V2 client ingest page at `app/integrations/token-ingest/[provider]/page.tsx` MUST:

1. Be `"use client"` (reads `window.location`).
2. NOT import from `@/services`, `@/repositories`, or any server-only module. Enforced by `tests/structure/client-server-boundary.test.ts`.
3. NOT load telemetry / analytics that capture `window.location.href` — those typically run before our `history.replaceState` scrub and would leak the fragment-token to third parties.
4. NOT log the captured token to console, error reporters, or any other sink.
5. Parse `window.location.hash` for the canonical `token` key (`#token=…`). Decode percent-encoding before use.
6. Strip the fragment via `history.replaceState(null, "", pathname + search)` **immediately after parsing, BEFORE the network call.** Token leaves the URL bar before any UI render completes.
7. Read `state` from `window.location.search` (preserved across the provider's fragment-mode redirect because it was embedded in `return_url`'s query string).
8. POST to `/api/integrations/oauth/<provider>/ingest` with `{ state, token }` JSON body and `credentials: "include"`.
9. Navigate to the server's returned `redirect` path on 200, or to `/?integration_error=<reason>` on any other response.

## Consume-Before-Verify Rule

The dispatcher's `handleTokenIngest` MUST consume the state row **before** calling `provider.verifyAndIngestToken`. Order matters:

- If verify is called first and succeeds, then state is consumed → fine.
- If verify is called first and fails (network blip, transient 5xx, provider rate-limit), then state is NOT consumed → an attacker who intercepted the state token can replay it later when the provider recovers.
- If state is consumed first and verify subsequently fails, the state row is gone → replay is impossible.

This invariant is encoded in `services/oauth/dispatcher.ts:handleTokenIngest`. Do not reorder.

## Server-Side Token Verification Requirement

`verifyAndIngestToken` MUST call a provider API endpoint that proves the token is valid AND returns account-identifying info. Examples:

- Trello: `GET /1/members/me?key=…&token=…` returns `{ id, username, fullName, … }`.
- Future Atlassian "API token": `GET /rest/api/3/myself` returns `{ accountId, displayName, … }`.

The verification call MUST:

- Return account fields stable enough to use as `providerAccountId` (see §"Manifest Requirements" — `accountIdField`).
- 401 / 403 → `throw new TokenIngestVerificationError(provider, reason)`. The dispatcher maps to a 400 HTTP response (typed user-facing error). The token is NOT persisted.
- 5xx / network failure → throw any other Error. The dispatcher's route maps to a 502 (transient verifier failure). The state row IS still consumed; a replay-after-recovery is correctly rejected.
- Encrypt the plaintext token via `core/encryption/tokens.ts:encryptToken` BEFORE returning. The repository layer never sees plaintext.

A provider implementation that omits the verify call OR that persists tokens without proving them is a **contract violation** — pin a unit test that asserts the verify endpoint is actually hit before persistence happens.

## Token Encryption Requirement

`verifyAndIngestToken` MUST call `encryptToken()` from `core/encryption/tokens` and return the encrypted blob inside `tokens.accessTokenEncrypted`. Refresh token is `null` (token-ingest providers don't refresh). Access token expiry is typically `null` (Trello's `expiration=never`); set it when the provider issues a finite TTL.

The repository (`repositories/integrations.upsertActive`) never decrypts; downstream action handlers decrypt on-demand inside `refreshAndRetry`. This is the same encryption surface OAuth providers use — token-ingest does NOT introduce a parallel encryption path.

## No Dispatcher Bypass

Every persistence path for token-ingest providers flows through `dispatcher.handleTokenIngest` → `repositories/integrations.upsertActive`. The route handler does NOT write to the `integrations` table directly. Adding a one-off "ingest endpoint" outside the dispatcher (as the legacy app's `/api/integrations/trello/process-token` did) is a contract violation:

- Bypasses the signed-state JWT integrity check.
- Bypasses the atomic `oauth_states` consume (replay protection).
- Bypasses the session-user / state-user cross-check.
- Re-introduces the legacy app's "dispatcher is a suggestion" problem.

If a provider's auth flow legitimately doesn't fit through `dispatcher.handleTokenIngest`, that's a contract extension that needs its own design slice — not a per-provider shortcut.

## No Token in Logs / Errors / Responses / Query Params

The plaintext token is referenced in **two** places per ingest:

1. `verifyAndIngestToken`'s API call URL or body (provider-specific).
2. `encryptToken(token)` inside `verifyAndIngestToken`.

It MUST NOT appear in:

- HTTP response bodies (success or error). The route returns `{ redirect }` on success and `{ error: <short reason> }` on failure. Tests pin this.
- Thrown error messages. `TokenIngestVerificationError.message` = `\`Token ingest verification failed for '${provider}': ${reason}\`` — reason strings never include the token.
- Structured logs, telemetry events, error reports. Per-provider `verifyAndIngestToken` is contractually forbidden from logging inputs.
- URL query strings beyond the provider's required auth params on outbound calls (Trello uses `?key=&token=`, which is the provider's wire requirement — distinct from leakage). V2 itself NEVER puts a token in a query param of any V2-owned URL.

Pin every "no token in X" rule with a test. Slice 17 has 4 such tests; see [`tests/unit/integrations/_shared/trello/webhooks/signature.test.ts`](../../tests/unit/integrations/_shared/trello/webhooks/signature.test.ts), [`tests/unit/integrations/trello/api/_request.test.ts`](../../tests/unit/integrations/trello/api/_request.test.ts), [`tests/unit/integrations/trello/auth.test.ts`](../../tests/unit/integrations/trello/auth.test.ts), and [`tests/unit/app/api/integrations/oauth/ingest-route.test.ts`](../../tests/unit/app/api/integrations/oauth/ingest-route.test.ts).

## Provider Manifest Requirements

Token-ingest providers declare in `integrations/<provider>/manifest.ts`:

```ts
{
  id: "<provider-id>",
  displayName: "<Provider>",
  isEnabled: true,
  apiVersion: "<provider's API version>",
  tokenScope: "user",                 // see §"Action-Handler accountId Rule" for `workspace` caveats
  oauthFlows: ["<provider-specific flow name>"],
  scopes: { required: [...], optional: [], deprecated: [] },
  capabilities: {
    oauth: true,                       // user-facing connect dance exists
    webhookTrigger: false,             // flip true if + when triggers ship
    pollingTrigger: false,
    actions: false,                    // flip true if + when handlers ship
  },
  healthCheckIntervalMs: <ms>,
  refreshable: false,                  // INVARIANT: enforced by schema
  authFlow: "token_ingest",
}
```

**Schema invariants** (enforced by `ProviderManifestSchema.superRefine`):

- `authFlow: "token_ingest"` AND `refreshable: true` → manifest parse fails. Token-ingest providers cannot have refresh tokens.
- `tokenScope: "workspace"` requires `accountIdField` (inherited from base contract).
- `capabilities.oauth: true` requires `scopes.required.length > 0` (inherited from base contract).

**`accountIdField`** — the field name from the provider's verify response that uniquely identifies the account. Prefer immutable provider-issued IDs over usernames or emails (which can change). Trello uses `id` from `/1/members/me`; future Atlassian would use `accountId` from `/rest/api/3/myself`.

## Action-Handler `accountId` Rule (for `tokenScope: "user"` providers)

`TriggerEvent.accountId` carries the **event scope** (Trello = board id; future providers = whatever the webhook subscription is bound to), NOT necessarily the integration's `providerAccountId`. For `tokenScope: "user"` token-ingest providers (Trello today), action handlers MUST pass `accountId: null` to `refreshAndRetry`:

```ts
const card = await refreshAndRetry({
  userId: input.userId,
  provider: "trello",
  accountId: null,           // ← not input.triggerEvent.accountId
  apiCall: (accessToken) => cardsCreate({ accessToken, ... }),
});
```

Rationale: `getActiveForExecution(userId, provider, null)` returns the first active integration for the user — correct because `tokenScope: "user"` guarantees at most one active row. Passing `triggerEvent.accountId` (= event scope) blindly fails the integration lookup when event-scope and integration-scope disagree, which they almost always do for webhook-scoped events.

**`tokenScope: "workspace"` providers**: this rule does NOT apply directly. Workspace-scoped providers need `accountId` = the workspace id. If a future token-ingest provider is workspace-scoped, the action-handler discriminator MUST be revisited before shipping. Slice 17 audit explicitly defers workspace-scoped token-ingest as out of scope.

Slice 17 Commit 5 → Commit 6 fixed this across all 8 Trello action handlers after the e2e exposed it. Unit tests that mock `getActiveForExecution` directly will NOT catch this — the regression test is end-to-end against a real `trigger_resources` + `integrations` row pair.

## EventType Short-Form Dispatch Rule (for providers that also have webhooks)

`TriggerEvent.eventType` MUST match the short form passed to `registerActivation(provider, eventType, …)` — the same value stored in `trigger_resources.event_type`. `dispatchTriggerEvent.listForDispatch(provider, eventType)` does an equality match against the row; any mismatch produces zero matches and silently drops the event.

The provider's classified / namespaced subtype (e.g. `"trello.card.created"`) belongs in `payload.classifiedType` for advanced workflow refs, NOT in the canonical `eventType` field.

```ts
// In _shared/<provider>/normalize.ts:
return {
  provider: "<provider-id>",
  eventType: triggerEventType,   // SHORT form: "new_card" / "card_archived" / etc.
  eventId: action.id,
  occurredAt: action.date,
  accountId: <event scope id>,
  payload: {
    classifiedType,              // NAMESPACED form: "trello.card.created" etc.
    ...other fields,
  },
};
```

Slice 17 Commit 5 emitted the namespaced form into `TriggerEvent.eventType`. Commit 6 fixed it. The unit tests passed despite the bug because they tested the normalizer in isolation against a fabricated eventType — only the e2e drove `dispatchTriggerEvent` through a real lookup against a real `trigger_resources` row. Every provider with a webhook trigger MUST be sanity-checked against this rule when reviewed.

## V2 Intended Behavior

- **Single generic dispatcher operation `handleTokenIngest`** at `services/oauth/dispatcher.ts`, parallel to `handleCallback` for OAuth providers. Zero provider-specific logic in the dispatcher.
- **Per-provider modules at `integrations/<provider>/auth.ts`** implement `ProviderTokenIngestAuth`.
- **Per-provider entry in `TOKEN_INGEST_BY_PROVIDER`** in `services/oauth/dispatcher.ts`. Hand-maintained explicit registration — same pattern as `OAUTH_BY_PROVIDER`.
- **Server ingest endpoint at `app/api/integrations/oauth/[provider]/ingest/route.ts`** — generic, shared across all token-ingest providers. The `[provider]` path segment is the discriminator.
- **Client ingest page at `app/integrations/token-ingest/[provider]/page.tsx`** — generic, shared. Provider-specific behavior is limited to the fragment shape it expects (canonical key is `token`).
- **Reuses every existing primitive**: `services/oauth/state.ts` for state issuance + consume; `repositories/integrations.upsertActive` for persistence; `core/encryption/tokens.ts` for AES-256-GCM encryption.
- **No new DB migration**: state fits existing `oauth_states`; tokens fit existing `integrations.access_token_encrypted` + `account_metadata`.

```ts
interface ProviderTokenIngestAuth {
  buildAuthUrl(state: string, scopes: readonly string[]): string;
  verifyAndIngestToken(input: {
    token: string;
    state: string;
  }): Promise<{ tokens: EncryptedTokens; account: ProviderAccountInfo }>;
  revoke(token: string): Promise<void>;
}
```

Notably absent vs `ProviderOAuth`: `handleCallback` (no code to exchange), `refreshToken` (non-refreshable by invariant), `generatePkce` (no server-side code-exchange to protect), `validateProviderHint` (no per-tenant input).

## Example Implementation: Trello

Trello is the inaugural production consumer. See:

- Manifest: [`integrations/trello/manifest.ts`](../../integrations/trello/manifest.ts) — `authFlow: "token_ingest"`, `refreshable: false`, `tokenScope: "user"`, scopes `["read", "write", "account"]`, `accountIdField` = Trello member id.
- Auth: [`integrations/trello/auth.ts`](../../integrations/trello/auth.ts) — `buildAuthUrl` returns Trello's `/1/authorize?…&return_url=…#token=…` URL; `verifyAndIngestToken` calls `GET /1/members/me?key=…&token=…`; `revoke` calls `DELETE /1/tokens/{token}`.
- Outcomes retro: [`docs/slices/trello-token-ingest-outcomes.md`](../slices/trello-token-ingest-outcomes.md) — 10 sections covering rationale, flow, security, decisions, e2e validation, and two bugs the e2e caught.
- Contract design: [`docs/slices/trello-token-ingest-contract-plan.md`](../slices/trello-token-ingest-contract-plan.md).

## Adding a Second Token-Ingest Provider

Before adopting `ProviderTokenIngestAuth` for a second provider, complete this checklist:

1. **Audit the provider's auth flow.** Does the token actually arrive via URL fragment (or some other browser-only transport)? Or does the provider have a working OAuth 2.0 code/state flow? If code/state exists, use `ProviderOAuth` instead — don't reach for token-ingest just because a fragment-mode flow is "also" available.

2. **Identify the server-side verify endpoint.** Does the provider expose an endpoint that BOTH proves the token AND returns durable account info? If the only way to validate a token is "try a real API call and see what happens," the contract doesn't fit — you need a dedicated verify probe.

3. **Confirm non-refreshable.** Does the provider issue refresh tokens? If yes, token-ingest is wrong — use `ProviderOAuth` with `refreshable: true`. The schema invariant will reject `authFlow: "token_ingest"` + `refreshable: true`.

4. **Confirm `tokenScope`.** `"user"` is the supported default. If `"workspace"`, the action-handler `accountId: null` rule does NOT apply directly — revisit before shipping. Add a contract test that pins the disambiguator behavior for the new provider.

5. **Audit the fragment shape.** Does the provider use `#token=…` (Trello's canonical shape)? Some providers use `#access_token=…` or wrap multiple fields. The V2 client ingest page parses the canonical `token` key; if the provider uses something else, either (a) normalize at the client page (small per-provider extension) or (b) reject the provider and request the canonical shape from the provider's docs.

6. **Audit the webhook signing model (if the provider ships webhooks).** Each provider's HMAC variant gets its own helper at `integrations/_shared/<provider>/webhooks/signature.ts` (see Trello's). Do NOT reach for a generic HMAC verifier — each provider's canonical signing string is different (raw body alone, raw body + URL, with/without timestamp). Per-provider helpers with typed-result returns keep the failure modes distinguishable.

7. **Audit `accountIdField`.** Prefer immutable provider-issued IDs over usernames / emails. Trello uses `id`; future Atlassian would use `accountId`. Document the choice and rationale in the per-slice outcomes doc.

8. **Confirm UI handling for non-redirect flows.** Some "token-paste" providers (Atlassian API token, Asana PAT) don't redirect to an authorize page — they ask the user to paste a token they copied from the provider's UI. That's a different client-side UI (a paste form, not a redirect), but the server side (ingest endpoint + verify + persist) is identical. Future slice should design the paste-UI variant separately; until then, only fragment-redirect providers fit.

9. **Pin the contract-extension as durable.** If shipping the new provider requires changing `ProviderTokenIngestAuth` or `handleTokenIngest`, that's a contract extension — design it as its own slice and update this doc, NOT a one-off per-provider quirk.

10. **Update CLAUDE.md.** Add the new provider to the "Completed locally" list with a link to its outcomes doc. Update the durable-pattern gotcha sections if any new rule emerged.

## Resolved Decisions

**Locked for Slice 17 (shipped, Trello as inaugural consumer):**

- `ProviderTokenIngestAuth` lives alongside `ProviderOAuth`. Manifest `authFlow` discriminates. Default is `"code_callback"` so existing manifests inherit OAuth behavior.
- Schema invariant: `authFlow: "token_ingest"` AND `refreshable: true` is rejected at parse time.
- Dispatcher operation: `handleTokenIngest({ userId, provider, state, token })`. State consumed BEFORE verify call (replay protection). Session/state user equality check is stricter than OAuth callback.
- Server route: `POST /api/integrations/oauth/[provider]/ingest` — generic across all token-ingest providers, discriminator is the `[provider]` segment.
- Client page: `app/integrations/token-ingest/[provider]/page.tsx` — `"use client"`, no server-only imports, no telemetry, strips fragment before fetch, navigates on response.
- No new DB migration: state fits `oauth_states`; tokens fit `integrations.access_token_encrypted` + `account_metadata`.
- Token-ingest providers cannot accept `providerHint` — dispatcher rejects misuse explicitly.

**Deferred (out of scope for Slice 17, may be revisited):**

- **Token-paste UI variant** for Atlassian API token / Asana PAT — same server contract, different client UI. Future slice if a paste-only provider lands.
- **Workspace-scoped token-ingest providers** — action-handler `accountId: null` rule needs revision before shipping a workspace-scoped token-ingest provider.
- **OAuth 1.0a** — explicitly NOT a token-ingest variant. V2 does not support OAuth 1.0a; providers that only offer 1.0a are deferred to a future contract.

## Cross-References

- `services/oauth/dispatcher.ts` — `handleTokenIngest` operation + `TOKEN_INGEST_BY_PROVIDER` registry.
- `services/oauth/state.ts` — shared with OAuth; no token-ingest-specific changes.
- `contracts/integration.ts` — `AuthFlowSchema`, `ProviderTokenIngestAuth`, `TokenIngestVerificationError`.
- `app/api/integrations/oauth/[provider]/ingest/route.ts` — generic POST handler.
- `app/integrations/token-ingest/[provider]/page.tsx` — generic client fragment receiver.
- [`docs/rules/oauth-dispatcher.md`](./oauth-dispatcher.md) — the parent contract; token-ingest is a sibling, not a replacement.
- [`docs/slices/trello-token-ingest-contract-plan.md`](../slices/trello-token-ingest-contract-plan.md) — full design doc.
- [`docs/slices/trello-token-ingest-outcomes.md`](../slices/trello-token-ingest-outcomes.md) — retro with 12 security rules, e2e validation results, and the two e2e-found bugs.
