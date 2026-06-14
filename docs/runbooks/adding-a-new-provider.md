# Runbook: Adding a New Provider / App to ChainReactV2

> **Audience.** A coding agent (Claude or other) or engineer who is being asked
> "add `<provider>` to ChainReact." This runbook is the canonical playbook for
> doing that end‑to‑end in ChainReactV2. It is intentionally repo‑grounded —
> every pattern below is sourced from the actual implementation of
> `microsoft-teams`, `airtable`, `shopify`, `trello`, `gmail`, etc.
>
> **Companion rules** (read first time only):
> [`docs/rules/provider-registry.md`](../rules/provider-registry.md),
> [`docs/rules/oauth-dispatcher.md`](../rules/oauth-dispatcher.md),
> [`docs/rules/webhook-receipt-routes.md`](../rules/webhook-receipt-routes.md),
> [`docs/rules/token-ingest-auth.md`](../rules/token-ingest-auth.md),
> [`docs/rules/account-ownership-model.md`](../rules/account-ownership-model.md),
> [`docs/rules/testing-strategy.md`](../rules/testing-strategy.md).
> For the **permission model** a new provider inherits (who can connect / reconnect /
> disconnect / share by role and credential class), see §4.8 and
> [`docs/slices/phase-4/apps-permissions-matrix-closeout.md`](../slices/phase-4/providers/apps-permissions-matrix-closeout.md).

---

## §0 — TL;DR / Golden Path (read this first)

### 0.1 Two modes — declare which one you are running

This runbook supports two execution modes. Decide **before opening the editor**:

| Mode | Output | When |
|---|---|---|
| **Mode A — Research & plan only** | Research summary (§1.4) + planning checklist (§2.2) presented to Marcus. STOP. | Default. Run this every time before code. Wait for sign‑off. |
| **Mode B — Implement end‑to‑end** | Backend + frontend + tests + final report (§7). | Only after Marcus has signed off on the §2 planning checklist. |

A coding agent MUST run Mode A first and stop. Do not start writing files until
Marcus has approved scopes, actions, triggers, env vars, and any blockers.

### 0.2 Hard stop‑and‑ask points (Marcus approval required)

Stop and ask before proceeding when any of these are in play:

- **OAuth scopes** — surface the exact list with justification per scope.
- **Paid plan or paid API tier** — confirm budget before requesting it.
- **App review / production approval** — confirm timeline + scope before submitting.
- **Webhook limitations** — provider only supports polling, or only premium webhooks, or has hard rate limits that affect feasibility.
- **Destructive / high‑risk actions** (`isDestructive: true` or `riskLevel: "high"`) — confirm shape and copy.
- **Deviation from the canonical pattern** — if the provider doesn't fit any of the §0.4 profiles cleanly, ask before improvising.
- **Multi‑tenant input** at connect time (Shopify‑style shop domain) — confirm UX and validation.
- **API key / non‑OAuth flow** — confirm the credential entry UX.
- **Unusual `accountIdField`** (anything other than `email`) — confirm.

### 0.3 Golden‑path checklist (straightforward refreshable OAuth provider)

For a provider that matches Profile 1 (§0.4) — refreshable OAuth, webhook
trigger, normal scopes. Follow top to bottom; do not skip:

1. [Mode A] Research the provider (§1) → fill the research output (§1.4).
2. [Mode A] Build the planning checklist (§2) → present to Marcus.
3. [Marcus] Approves scopes, actions, triggers, env vars, deferred items.
4. [Mode B] Create the folder skeleton (§3.1).
5. [Mode B] Write `manifest.ts` (§3.2). Parse via `ProviderManifestSchema` in‑file so the build fails on drift.
6. [Mode B] Write `oauth.ts` (§3.3) implementing `ProviderOAuth`.
7. [Mode B] Register the manifest + OAuth in [`integrations/_registry.ts`](../../integrations/_registry.ts) and [`services/oauth/dispatcher.ts:OAUTH_BY_PROVIDER`](../../services/oauth/dispatcher.ts).
8. [Mode B] Add env vars to [`.env.example`](../../.env.example).
9. [Mode B] Add provider SVG icon at [`public/integrations/<provider-id>.svg`](../../public/integrations/).
10. [Mode B] For each action: write `<action>.schema.ts`, `<action>.ts` (handler), `<action>.meta.ts`. Register the handler in [`services/execution/handlers/_handlerInventory.ts`](../../services/execution/handlers/_handlerInventory.ts) and the meta in [`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts).
11. [Mode B] For each trigger: write `index.ts` (registrations) + `activate.ts` + `deactivate.ts` + `normalize.ts` + `<trigger>.meta.ts`; for webhook subscription‑watch also write `pull.ts` + `renew.ts`; for polling also write `poll.ts`. Add the side‑effect import in `integrations/_registry.ts` and the meta in `_metaInventory.ts`.
12. [Mode B] For webhook providers: write `integrations/<provider>/webhooks/receive.ts` + thin route at `app/api/webhooks/<provider>/route.ts`.
13. [Mode B] For dynamic dropdowns: write `integrations/<provider>/options/<resolver>.ts` and register it in [`services/ai/tools/options.ts`](../../services/ai/tools/options.ts).
14. [Mode B] Tests (§6). Mandatory categories with risk‑based depth.
15. [Mode B] Run completeness gates (§5).
16. [Mode B] Fill the completion report (§7) and hand back to Marcus.

### 0.4 Provider profile → canonical example to copy

| Your provider's shape | Profile | Copy from | Reason |
|---|---|---|---|
| OAuth 2.0 + PKCE + refresh + per‑resource webhook subscription that expires | **1: Refreshable subscription‑watch** | [`integrations/microsoft-teams/`](../../integrations/microsoft-teams/) | Gold standard. Full 3‑registry trigger (activate + deactivate + renew). |
| OAuth 2.0 + PKCE + refresh + token rotation + non‑email accountId | **2: Refreshable with rotation** | [`integrations/airtable/`](../../integrations/airtable/) | Enforces rotation invariant; `userId` from `whoami`. |
| OAuth 2.0 + non‑refreshable + per‑tenant input (shop / dc / region) | **3: Non‑refreshable multi‑tenant** | [`integrations/shopify/`](../../integrations/shopify/) | `validateProviderHint()` + JWT‑bound shop domain. |
| Token ingest (fragment flow, not auth‑code) | **4: Token ingest** | [`integrations/trello/`](../../integrations/trello/) | Only `ProviderTokenIngestAuth` example. |
| OAuth + polling‑only triggers (no webhooks) | **5: Polling** | [`integrations/gmail/triggers/newEmail/`](../../integrations/gmail/triggers/newEmail/) | Snapshot‑seeding pattern. |
| OAuth + permanent webhook (no expiry / renewal) | **6: Permanent webhook** | [`integrations/shopify/triggers/webhookReceived/`](../../integrations/shopify/triggers/webhookReceived/) or [`integrations/trello/triggers/`](../../integrations/trello/triggers/) | No `subscriptionRegistry` registration. |
| Webhook + polling fallback | **7: Mixed** | [`integrations/airtable/`](../../integrations/airtable/) | Best mixed example. |

If your provider doesn't cleanly fit any profile, STOP and ask Marcus.

### 0.5 Provider completeness gates — a provider is NOT done until all are green

A provider implementation is considered complete only when **every** gate
below passes. The completion report (§7) reproduces this checklist verbatim
and Claude must mark each ✅ / ❌ honestly.

1. ✅ Manifest registered in [`integrations/_registry.ts`](../../integrations/_registry.ts) AND `ProviderManifestSchema.parse()` passes at module load.
2. ✅ OAuth (or token‑ingest) registered in [`services/oauth/dispatcher.ts`](../../services/oauth/dispatcher.ts).
3. ✅ Provider appears on the **Apps page** (`/apps`) when `isEnabled: true` and `isExperimental` is false or default. (Verified by hitting the page in dev OR by a route test.)
4. ✅ Connect / disconnect flow works end‑to‑end against a real test account at the provider.
5. ✅ **Every action** has `<action>.ts` + `<action>.schema.ts` + `<action>.meta.ts`. Handler registered in [`services/execution/handlers/_handlerInventory.ts`](../../services/execution/handlers/_handlerInventory.ts). Meta registered in [`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts).
6. ✅ **Every trigger** has the right registration set (activate + deactivate + [subscription | polling]). Meta registered in `_metaInventory.ts`. Side‑effect import added to `integrations/_registry.ts`.
7. ✅ Actions appear in the builder's **ActionPicker** for this provider. ([`features/workflow-builder/panels/ActionPicker.tsx`](../../features/workflow-builder/panels/ActionPicker.tsx) reads the discovery registry.)
8. ✅ Triggers appear in the builder's **TriggerPicker** for this provider.
9. ✅ All `optionsSource` strings used in `FieldMeta` are registered in [`services/ai/tools/options.ts`](../../services/ai/tools/options.ts) AND have a real resolver (typically under `integrations/<provider>/options/`).
10. ✅ **React Agent / AI catalog** sees the provider, every action, every trigger with the correct keys, required fields, and outputs. (Verified by a discovery test at `tests/unit/services/discovery/<provider>-discovery.test.ts` — the AI catalog is built from the discovery registry, so passing discovery tests = AI sees it.)
11. ✅ **Required fields** are correctly marked `required: true` in `FieldMeta` AND in the handler's Zod schema. (Two‑source rule — see §3.6.)
12. ✅ **Outputs** declared in `ActionMeta.outputs[]` / `TriggerMeta.payloadShape[]` so the variable picker shows them. Top‑level names match what the handler actually returns.
13. ✅ **Sensitive outputs** marked `sensitive: true` for any output containing PII, message bodies, signed URLs, payment data, tokens.
14. ✅ Runtime tests exist with risk‑based depth per §6.
15. ✅ Env vars declared in [`.env.example`](../../.env.example).
16. ✅ Provider SVG icon at [`public/integrations/<provider-id>.svg`](../../public/integrations/).
17. ✅ Marcus personal setup checklist (§8) is complete.
18. ✅ **Permission model wired (§4.8).** Provider classified in [`core/integrations/credentialSharing.ts`](../../core/integrations/credentialSharing.ts) (`personal` vs `account`). For `account`-class providers: Connect / Connect-another / Reconnect / Disconnect render for owner/admin only, and the `restrictedToAdmins` member copy renders (no silent blank state). A permission/DTO test pins the classification (§6.1).

---

## §0.6 — Claude prompt template (copy/paste to start a provider)

Paste this to kick off a new-provider task. It encodes the Mode-A-first rule, the
approval gates, and the permission step so nothing is skipped:

```
Add <PROVIDER> to ChainReactV2, following docs/runbooks/adding-a-new-provider.md.

Run Mode A FIRST and stop for my sign-off:
- Research the provider (§1) and fill the §1.4 research output: auth model
  (OAuth code_callback / token_ingest; refreshable?), exact scopes with
  per-scope justification, webhooks vs polling, rate limits, tokenScope,
  accountIdField, sandbox/test account, app-review needs.
- Propose the §2.2 plan: manifest fields, launch-scope actions/triggers
  (defer the rest with reasons), env vars, developer-console setup, blockers.
- Classify the provider as `personal` or `account` per §4.8.1 and state how
  that sets connect/reconnect/disconnect/share permissions (§4.8.2). Justify
  the class (does each teammate sign in as themselves, or as one shared org
  account?).
- STOP. Do not write code until I approve scopes, actions, triggers, env vars,
  the credential classification, and any blockers (§0.2).

After I approve, run Mode B end-to-end (§3–§7):
- Backend (§3), frontend/builder visibility (§4) INCLUDING the §4.8 permission
  wiring (classify in credentialSharing.ts; verify owner/admin gating +
  restrictedToAdmins copy for account-class providers), AI visibility (§5).
- Tests (§6) with risk-based depth, including a permission/DTO test (§6.1).
- Run the §0.5 completeness gates and the §7 completion report. Honest ✅/❌.

Constraints: local only, no push/deploy/db:push unless I say so; no AI/MCP/
billing changes unless in scope; OAuth account-binding + no-leak DTO rules are
non-negotiable (§2 binding rules, §4.8.3).
```

---

## §1 — Research phase (Mode A)

Do all of this on the web before opening the editor. The output of this phase
is §1.4 — a structured research summary you hand to Marcus.

### 1.1 What to research

For each provider, find authoritative answers:

- **Official docs.** Top‑level API docs URL + the OAuth / auth section URL + the rate‑limits page + the webhook docs page.
- **OAuth model.**
  - Authorization Code with secret? With PKCE (S256)? Token ingest (fragment)? API key only? Bot token? Personal access token?
  - Does it return a `refresh_token`? Is it rotated on each refresh? What is the access‑token lifetime?
  - Is `offline_access` (or equivalent) required to get a refresh token?
- **Scopes.** Verbatim provider strings. Distinguish required for our actions/triggers vs nice‑to‑have. Note any scopes that require **tenant admin consent** or **app review** — those are blockers, not "we'll just ask later."
- **Account identity.** What endpoint returns the canonical account identifier after OAuth? (Microsoft: Graph `/me` → `mail` with `userPrincipalName` fallback. Trello: `GET /1/members/me` → `id`. Airtable: `GET /v0/meta/whoami` → `id`. Shopify: shop domain validated at connect time.)
- **Webhook system.**
  - Per‑resource subscriptions (Graph) vs app‑level webhook (Shopify, Stripe) vs none.
  - Subscription TTL + renewal mechanism (Graph: ~70.5h. Airtable: 7d.).
  - Signature scheme + header name (HMAC algorithm; e.g. `X-Hub-Signature-256` for GitHub, `X-Shopify-Hmac-Sha256` for Shopify).
  - Validation handshake (Graph echoes `validationToken`; some providers POST a probe).
- **Polling fallback.** If we want a trigger and the provider has no webhook, what endpoint do we poll? What pagination / cursor / `since` semantics? What is the "first‑poll‑miss" risk (events arriving between activation and first poll being dropped)?
- **Rate limits.** Calls per second / per app / per token. Burst vs sustained. Penalty for 429 (back‑off seconds, header, exponential).
- **Pagination.** Cursor, offset, page token, link header?
- **Per‑user vs per‑workspace tokens.** Does one user have one token, or one per workspace / team / shop? (Microsoft: per‑user. Slack: per‑workspace. Shopify: per‑shop.)
- **Sandbox / test mode.** Is there a dev / sandbox environment? Free? What is the test‑account creation flow?
- **App review / production approval.** Is the app blocked from production traffic until review? Approximate timeline + cost.
- **Known limitations / quirks.** Anything you can find — undocumented behavior, scope drift, payload edge cases, deletion semantics.
- **Security concerns.** Does it surface PII by default? Audit log expectations? GDPR / data residency notes?
- **Feasibility per candidate action/trigger.** For each thing we want, check the API actually supports it and identify the endpoint.

### 1.2 Sources to prefer

Provider's official docs first. Provider's developer changelog second. Third‑party
write‑ups only to corroborate the official answer — never as the sole source.
If the docs disagree with each other (common with Microsoft Graph beta vs v1.0,
Slack v1 vs v2), surface the conflict to Marcus.

### 1.3 What NOT to do

- Do not assume "OAuth 2.0" means refreshable. Many providers issue long‑lived non‑refreshable tokens (Shopify, Slack v2 default, Discord without offline scope, GitHub Apps with offline token).
- Do not assume "they have webhooks" means "we can use webhooks." Some providers require enterprise plans for webhook delivery (early Asana, some Salesforce tiers).
- Do not assume a scope is grant‑on‑request. Tenant‑admin scopes on Microsoft Graph, sensitive Slack scopes, certain GitHub App permissions all require explicit approval and may block our launch.

### 1.4 Research output format (give this to Marcus)

```markdown
## Provider research: <Provider Name>

### Docs
- Top‑level: <url>
- Auth: <url>
- Webhooks: <url>
- Rate limits: <url>

### Auth model
- Type: OAuth 2.0 Authorization Code | OAuth 2.0 + PKCE | Token ingest | API key | Bot token
- PKCE: required | optional | not supported
- Refreshable: yes (rotated | not rotated) | no (long‑lived | short‑lived)
- offline_access (or equivalent) required: yes | no | n/a
- Account identity endpoint: <method + url> → field <name>

### Scopes
| Scope | Why we need it | Requires admin consent / review? |
|---|---|---|
| <scope> | <action/trigger that needs it> | yes / no |

### Webhooks
- Model: per‑resource subscription | app‑level | none
- TTL: <duration> (or permanent)
- Renewal: <mechanism> (or none)
- Signature: <algorithm> on header <name>
- Validation handshake: yes (<mechanism>) | no

### Polling fallback (if applicable)
- Endpoint: <method + url>
- Pagination: cursor | offset | page token | none
- "Since" semantics: <how we track what's new>
- First‑poll‑miss risk: <yes/no + mitigation>

### Rate limits
- Calls/sec/app: <n>
- Burst: <n>
- 429 handling: <back‑off mechanism>

### Token scope
- user | workspace
- accountIdField: <field name>

### Sandbox / test account
- Available: yes (<url>) | no
- Setup steps Marcus must do: <list>

### App review
- Required for production: yes | no
- Timeline: <estimate>
- Cost: <free | $X>

### Candidate actions
| Action | Risk | Endpoint | Notes |
|---|---|---|---|
| `create_<x>` | medium | POST /v1/<x> | … |

### Candidate triggers
| Trigger | Activation | Notes |
|---|---|---|
| `new_<x>` | webhook | per‑resource subscription, TTL 7d |

### Known limitations / quirks
- <bullets>

### Security concerns
- <bullets>

### Blockers / decisions for Marcus
- <bullets — anything we need approval on before coding>
```

---

## §2 — Provider planning phase (Mode A)

Convert the §1.4 research into the planning checklist below. Present to
Marcus and **stop**. Do not write code until each "Marcus decision" item has
an answer.

### 2.1 Naming and id conventions

- Provider id is **kebab‑case** and matches the folder name under `integrations/`. Schema regex: `/^[a-z][a-z0-9_-]*$/` ([`contracts/integration.ts:17`](../../contracts/integration.ts)).
- Existing convention: dash‑separated families (`microsoft-teams`, `microsoft-onedrive`, `google-calendar`). Stay consistent — don't introduce `ms_teams` or `googcal`.
- Action type strings are **snake_case** (`send_channel_message`). The composite `ActionMeta.key` is `"${provider}:${type}"` and the discovery registry rejects metas whose key drifts ([`contracts/actionMeta.ts:445`](../../contracts/actionMeta.ts)).
- Trigger type strings are also snake_case (`new_channel_message`). Same key contract.

### 2.2 Planning checklist (present this to Marcus)

```markdown
## Plan: <Provider Name>

### Manifest fields
- id: <provider-id>
- displayName: <Provider Name>
- tokenScope: user | workspace
- accountIdField: <field>  ← required when tokenScope='workspace'
- apiVersion: <version string>  ← if provider has versioned APIs
- healthCheckIntervalMs: 4h (Slack/Discord/GitHub tier) | 6h (Google/Microsoft) | 12h (others)
- refreshable: true | false
- authFlow: code_callback (default) | token_ingest
- isExperimental: false (default) | true if behind feature flag

### Final scope list (Marcus sign‑off required)
- required: [<scopes>]
- optional: [<scopes>]
- deprecated: [<scopes>]

### Actions in launch scope
| Type | Display name | Risk | Destructive? | Requires confirmation? | Notes |
|---|---|---|---|---|---|
| create_x | Create X | medium | no | no | |
| delete_x | Delete X | high | YES | YES | |

### Actions deferred (with reason)
| Type | Reason |

### Triggers in launch scope
| Type | Display name | Activation | Webhook TTL / poll cadence | Notes |
|---|---|---|---|---|
| new_x | New X | webhook | 7d, renew at 6d | per‑resource Airtable webhook |
| updated_y | Updated Y | polling | every 5 min | snapshot seeds at activate |

### Triggers deferred (with reason)
| Type | Reason |

### Env vars
| Variable | Where to obtain |
|---|---|
| `<PROVIDER>_CLIENT_ID` | <provider> developer console |
| `<PROVIDER>_CLIENT_SECRET` | same |
| `<PROVIDER>_WEBHOOK_SECRET` | webhook config in console |
| `<PROVIDER>_AUTHORIZE_BASE` (optional) | for test overrides |
| `<PROVIDER>_API_BASE` (optional) | for test overrides |

### Developer‑console setup (Marcus task list)
- [ ] <step>
- [ ] <step>

### User‑facing setup (during connect)
- [ ] e.g. shop domain entry
- [ ] e.g. choose workspace at first connect

### Production blockers
- App review required: yes/no — timeline / cost
- Paid plan required: yes/no — plan name / cost
- Tenant admin consent for any scope: yes/no — which scopes

### Decisions needed from Marcus before coding
- <bullets — must be answered>
```

If any "Decisions needed from Marcus" line lacks an answer, **STOP** and ask.

---

## §3 — Backend implementation (Mode B)

### 3.1 Folder skeleton

Create:

```
integrations/<provider-id>/
├── manifest.ts
├── oauth.ts                   (or auth.ts — see §3.3 legacy note)
├── actions/
│   ├── <action1>.ts
│   ├── <action1>.schema.ts
│   ├── <action1>.meta.ts
│   ├── ...
│   └── _normalize.ts          (optional, when multiple actions share output normalization)
├── triggers/
│   └── <trigger1>/
│       ├── index.ts           (the registrations)
│       ├── activate.ts
│       ├── deactivate.ts
│       ├── normalize.ts
│       ├── schema.ts          (user-config Zod)
│       ├── <trigger1>.meta.ts
│       ├── pull.ts            (webhook subscription-watch only — id-fetch hydration)
│       ├── renew.ts           (webhook subscription-watch only)
│       └── poll.ts            (polling only)
├── webhooks/
│   └── receive.ts             (webhook providers only)
├── api/
│   ├── <resource>.ts          (per-endpoint API wrappers)
│   └── _base.ts               (base URL, error mapping)
└── options/
    └── <picker>.ts            (dynamic dropdown resolvers)
```

Folder presence rules (going‑forward standard, with legacy noted):

- `webhooks/` directory should exist whenever the provider has any webhook trigger — even app‑level webhooks. *Legacy: Shopify and Trello inline webhook handling in the route; do not refactor them in this slice but new providers must use `webhooks/receive.ts`.*
- `oauth.ts` is the filename for all auth modules going forward, regardless of whether the export implements `ProviderOAuth` or `ProviderTokenIngestAuth`. *Legacy: Trello's file is `auth.ts` — grandfathered, do not rename.*
- `api/` is optional but recommended even for tiny providers; it keeps handlers readable. Use `_shared/<provider-family>/` for cross‑provider helpers (Microsoft Graph, Google APIs).

### 3.2 `manifest.ts` — the registry entry

The manifest IS the registry entry. There is no separate provider definition.
Contract is [`ProviderManifestSchema`](../../contracts/integration.ts).
Parse it inline so a malformed manifest fails the build.

Canonical example: [`integrations/microsoft-teams/manifest.ts`](../../integrations/microsoft-teams/manifest.ts).

Skeleton:

```ts
import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

export const fooManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "foo",
  displayName: "Foo",
  isEnabled: true,
  apiVersion: "v1",
  tokenScope: "user",              // or "workspace" — then accountIdField required
  oauthFlows: ["v2"],
  accountIdField: "email",         // required iff tokenScope: "workspace"
  scopes: {
    required: ["read:thing", "write:thing"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,                    // flip true ONLY when oauth.ts is registered
    webhookTrigger: false,          // flip true ONLY when a webhook trigger exists
    pollingTrigger: false,          // flip true ONLY when a polling trigger exists
    actions: false,                 // flip true ONLY when handlers are registered
  },
  healthCheckIntervalMs: 6 * 60 * 60 * 1000,  // 6h Microsoft/Google; 4h Slack/Discord/GitHub; 12h others
  refreshable: true,
  // authFlow defaults to "code_callback"; declare "token_ingest" for Trello-style flows
});
```

**Capability flag honesty rule:** flip a capability to `true` only when its
implementation actually registers at module load. The discovery test pattern
will assert this (a manifest claiming `capabilities.actions: true` must have at
least one action meta registered for that provider).

Register in [`integrations/_registry.ts`](../../integrations/_registry.ts):

```ts
import { fooManifest } from "./foo/manifest";
// ... in the ALL_MANIFESTS / providers list, add fooManifest in alphabetical/group order ...
```

### 3.3 `oauth.ts` — three templates

The OAuth dispatcher at [`services/oauth/dispatcher.ts`](../../services/oauth/dispatcher.ts)
is the only caller of provider OAuth modules. Each module exports an object
implementing one of two contracts from [`contracts/integration.ts`](../../contracts/integration.ts):

- `ProviderOAuth` — standard authorization‑code flow.
- `ProviderTokenIngestAuth` — fragment / token‑ingest flow (Trello only today).

After writing `oauth.ts`, register in
[`services/oauth/dispatcher.ts:OAUTH_BY_PROVIDER`](../../services/oauth/dispatcher.ts):

```ts
import { fooOAuth } from "@/integrations/foo/oauth";
// ... in OAUTH_BY_PROVIDER object literal, add foo: fooOAuth ...
```

#### Template A — refreshable OAuth + PKCE (Profile 1 / 2)

Copy [`integrations/microsoft-teams/oauth.ts`](../../integrations/microsoft-teams/oauth.ts)
(uses the shared Microsoft helpers under `integrations/_shared/microsoft/`).
For non‑family providers, copy [`integrations/airtable/oauth.ts`](../../integrations/airtable/oauth.ts)
(standalone, enforces refresh‑token rotation invariant).

Key contract points (from [`contracts/integration.ts:200`](../../contracts/integration.ts)):

```ts
export const fooOAuth: ProviderOAuth = {
  generatePkce: () => ({ codeChallenge, codeChallengeMethod: "S256", codeVerifier }),
  buildAuthUrl: (state, scopes, pkce, providerHint) => "<authorize url>",
  handleCallback: async (code, state, pkce, providerHint) => ({
    tokens: { accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt, scopes },
    account: { providerAccountId, displayName, metadata },
  }),
  refreshToken: async (refreshToken) => ({ ...EncryptedTokens }),  // throw RefreshNotSupportedError if non-refreshable
  revoke: async (token) => { /* best-effort */ },
};
```

Token encryption (`accessTokenEncrypted` / `refreshTokenEncrypted` fields) is
done with [`core/encryption/tokens.ts`](../../core/encryption/tokens.ts)
before the values reach the contract. The repository layer never sees
plaintext.

**Rotation invariant** (Airtable‑style): if your provider rotates the refresh
token on each refresh, throw if the response is missing a new refresh token.
See [`integrations/airtable/oauth.ts`](../../integrations/airtable/oauth.ts).

#### Template B — non‑refreshable (Profile 3 — Shopify, or Profile 6 without refresh)

Same shape as Template A but `refreshable: false` in the manifest, and
`refreshToken()` throws:

```ts
import { RefreshNotSupportedError } from "@/contracts/integration";

refreshToken: async () => { throw new RefreshNotSupportedError("foo"); }
```

For per‑tenant input (Shopify shop domain), implement
`validateProviderHint(hint)` and use the value inside `buildAuthUrl` /
`handleCallback`. See [`integrations/shopify/oauth.ts`](../../integrations/shopify/oauth.ts).
The dispatcher binds the validated value into the signed OAuth state JWT so
the callback can re‑verify it.

#### Template C — token ingest (Profile 4 — Trello)

The provider returns the token in the URL fragment; a client page POSTs it to
[`/api/integrations/oauth/<provider>/ingest`](../../app/api/integrations/oauth/[provider]/ingest/route.ts).
Implement `ProviderTokenIngestAuth`:

```ts
import {
  type ProviderTokenIngestAuth,
  TokenIngestVerificationError,
} from "@/contracts/integration";

export const fooAuth: ProviderTokenIngestAuth = {
  buildAuthUrl: (state, scopes) => "<authorize url with response_type=token>",
  verifyAndIngestToken: async ({ token, state }) => {
    // Verify the token by calling a /me-style endpoint. Throw TokenIngestVerificationError
    // on failure (NEVER log the token in the error).
    return { tokens, account };
  },
  revoke: async (token) => { /* best-effort */ },
};
```

Register in [`services/oauth/dispatcher.ts`](../../services/oauth/dispatcher.ts)
in the token‑ingest map (a separate map from `OAUTH_BY_PROVIDER`). Manifest
declares `authFlow: "token_ingest"` and `refreshable: false`; the schema
enforces that combination.

### 3.4 Action handlers — the 3‑file pattern

Every action is exactly three files. Contract is [`ActionHandler`](../../services/execution/handlers/types.ts).

Canonical example: [`integrations/microsoft-teams/actions/sendChannelMessage.ts`](../../integrations/microsoft-teams/actions/sendChannelMessage.ts) + `.schema.ts` + `.meta.ts`.

#### `<action>.schema.ts` — runtime Zod (authoritative)

```ts
import { z } from "zod";

export const CreateThingConfigSchema = z.object({
  thingId: z.string().min(1),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
}).strict();

export type CreateThingConfig = z.infer<typeof CreateThingConfigSchema>;
```

`.strict()` is the rule — extra keys must fail. The engine pre‑resolves
`{{...}}` references before dispatch ([`docs/rules/variable-resolver.md`](../rules/variable-resolver.md)),
so the handler always receives a fully resolved object.

#### `<action>.ts` — the handler

```ts
import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { CreateThingConfigSchema } from "./createThing.schema";
import { thingsCreate } from "../api/thingsCreate";

export const createThing: ActionHandler = async (input) => {
  const config = CreateThingConfigSchema.parse(input.config);

  // providerAccountId comes from the trigger event when same-provider, else null.
  const providerAccountId =
    input.triggerEvent.provider === "foo"
      ? input.triggerEvent.providerAccountId
      : null;

  const thing = await refreshAndRetry({
    accountId: input.accountId,
    provider: "foo",
    providerAccountId,
    apiCall: (accessToken) =>
      thingsCreate({ accessToken, ...config }),
  });

  return {
    output: {
      thingId: thing.id,
      name: thing.name,
      url: thing.url,
      createdAt: thing.created_at,
    },
  };
};
```

**Rules:**

- Use `input.accountId` (NOT `input.userId`) for integration lookups. Per
  [`docs/rules/account-ownership-model.md`](../rules/account-ownership-model.md)
  and `ActionHandlerInput` JSDoc at [`services/execution/handlers/types.ts`](../../services/execution/handlers/types.ts).
- Wrap the principal outbound call in `refreshAndRetry`. The API wrapper
  must throw `Unauthorized401Error` on HTTP 401 — that's the signal
  `refreshAndRetry` reads.
- Non‑refreshable providers (Shopify, Trello) STILL wrap in `refreshAndRetry`.
  It surfaces the correct `IntegrationActionRequiredError("refresh_not_supported")`
  on 401, which the health engine reads to flag the integration for reconnect.
- Output keys must match the names declared in `<action>.meta.ts:outputs[]`
  (top‑level only — nested fields not required to match top‑level meta).
- Do NOT call `repositories/integrations.ts` directly. Token lookup +
  decryption is owned by `refreshAndRetry`.

Register the handler in
[`services/execution/handlers/_handlerInventory.ts`](../../services/execution/handlers/_handlerInventory.ts)
(the explicit inventory feeding the action handler registry).

#### `<action>.meta.ts` — builder + AI metadata

Canonical example: [`integrations/microsoft-teams/actions/sendChannelMessage.meta.ts`](../../integrations/microsoft-teams/actions/sendChannelMessage.meta.ts).

```ts
import type { ActionMeta } from "@/contracts/actionMeta";

export const fooCreateThingMeta: ActionMeta = {
  key: "foo:create_thing",
  provider: "foo",
  type: "create_thing",
  displayName: "Create Thing",
  description: "Create a new thing in Foo.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "thingId",
      label: "Parent ID",
      type: "combobox",
      required: true,
      optionsSource: "foo:things",  // dynamic dropdown — see §3.7
      placeholder: "Search things…",
    },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea", required: false },
  ],
  outputs: [
    { name: "thingId", type: "string", description: "The new thing id." },
    { name: "name", type: "string" },
    { name: "url", type: "string" },
    { name: "createdAt", type: "string", description: "ISO-8601 created." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "medium",
  riskDescription: "Creates a Thing (recoverable — delete the Thing to undo).",
};
```

Register in [`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts).

**Rules:**

- `key === "${provider}:${type}"` — the contract's `superRefine` will reject
  drift at module load.
- `requiresIntegration: true` for any provider action; only `native:*` actions are false.
- `riskLevel`: `low` for pure reads, `medium` for recoverable writes,
  `high` for destructive / financial / irreversible / arbitrary‑egress.
- `isDestructive: true` OR `requiresConfirmation: true` MUST be paired with
  `riskLevel: "high"` — enforced by the contract.
- `optionsSource` and static `options[]` are mutually exclusive.
- `dependsOn` for cascading fields — see §3.7.
- Mark `sensitive: true` on outputs containing message bodies, PII, signed
  URLs, payment data, tokens, customer emails. The redaction layer at
  [`app/api/workflows/_shared.ts`](../../app/api/workflows/_shared.ts) reads this.
- Defaults are UI hints only (`defaultValue`); the handler schema's
  `.default()` is the runtime authority. Avoid declaring defaults in two places.

### 3.5 Triggers — registrations + lifecycle

Triggers self‑register via side‑effect imports. Three registries depending on
trigger type:

| Trigger type | Registries used | Renewal? |
|---|---|---|
| Webhook (per‑resource subscription, expiring) | `activationRegistry` + `deactivationRegistry` + `subscriptionRegistry` | YES — `runRenewals` cron |
| Webhook (permanent / app‑level) | `activationRegistry` + `deactivationRegistry` | NO |
| Polling | `activationRegistry` + `pollingRegistry` | NO |

Files involved per trigger type:

```
triggers/<trigger>/
├── index.ts                  (the 2 or 3 registrations + re-exports)
├── activate.ts               (create subscription OR seed snapshot)
├── deactivate.ts             (delete subscription OR clean snapshot)
├── schema.ts                 (user config Zod)
├── normalize.ts              (provider event → TriggerEvent)
├── <trigger>.meta.ts         (TriggerMeta)
├── pull.ts                   (webhook subscription-watch: id-fetch hydration)
├── renew.ts                  (webhook subscription-watch: renewal handler)
└── poll.ts                   (polling: cron handler)
```

Canonical examples:

- **Subscription‑watch (Profile 1):** [`integrations/microsoft-teams/triggers/newChannelMessage/`](../../integrations/microsoft-teams/triggers/newChannelMessage/)
- **Polling (Profile 5):** [`integrations/gmail/triggers/newEmail/`](../../integrations/gmail/triggers/newEmail/) — `index.ts` shows the 2‑registration pattern.

#### `index.ts` — webhook subscription‑watch

```ts
import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerDeactivation } from "@/services/triggers/deactivationRegistry";
import { registerSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { activate } from "./activate";
import { deactivate } from "./deactivate";
import { fooNewThingSubscriptionHandler } from "./renew";

registerActivation("foo", "new_thing", activate);
registerDeactivation("foo", "new_thing", deactivate);
registerSubscriptionHandler(fooNewThingSubscriptionHandler);

export { activate, deactivate, fooNewThingSubscriptionHandler };
```

#### `index.ts` — polling

```ts
import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { fooNewThingPollingHandler } from "./poll";

registerActivation("foo", "new_thing", activate);
registerPollingHandler(fooNewThingPollingHandler);

export { activate, fooNewThingPollingHandler };
```

#### `activate.ts` rules

- For subscription‑watch: call the provider's "create subscription" API; persist `subscriptionId` + `clientState` + selectors + `expiresAt` to `trigger_resources.config` ([`repositories/triggerResources.ts`](../../repositories/triggerResources.ts)). Use `config.type: "subscription-watch"` so `services/triggers/runRenewals.ts` picks it up.
- For polling: fetch current state (latest message id, latest modified time, etc.) and persist the snapshot. **This is the "first‑poll‑miss" fix** — without an initial snapshot, the first poll would treat every event as new OR (worse) treat the baseline as historical and silently drop events that arrived during activation.
- For permanent webhooks: create the webhook in the provider's console‑configured app, persist any per‑workflow routing config.

#### Then add the side‑effect import to [`integrations/_registry.ts`](../../integrations/_registry.ts):

```ts
import "./foo/triggers/newThing";
```

Without this import, the registrations never happen and the trigger silently
fails to activate. The receive route and the cron route both transitively
import `_registry` so registrations are present in every worker.

#### `<trigger>.meta.ts` — builder + AI metadata

Canonical: [`integrations/microsoft-teams/triggers/newChannelMessage/newChannelMessage.meta.ts`](../../integrations/microsoft-teams/triggers/newChannelMessage/newChannelMessage.meta.ts).

```ts
import type { TriggerMeta } from "@/contracts/triggerMeta";

export const fooNewThingTriggerMeta: TriggerMeta = {
  key: "foo:new_thing",
  provider: "foo",
  type: "new_thing",
  displayName: "New Thing",
  description: "Fires when a new Thing is created in Foo.",
  category: "data",
  activation: "webhook",          // webhook | polling | manual | scheduled
  requiresIntegration: true,
  fields: [
    { name: "thingId", label: "Parent", type: "combobox", required: true, optionsSource: "foo:things" },
  ],
  payloadShape: [
    { name: "thingId", type: "string" },
    { name: "name", type: "string" },
    { name: "createdAt", type: "string" },
    { name: "bodyContent", type: "string", sensitive: true },
  ],
  displayOrder: 10,
};
```

Register in [`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts).

### 3.6 Required‑field two‑source rule

A field's "is this required" is declared in TWO places. They MUST agree:

- **Runtime** — handler Zod schema (`<action>.schema.ts`): `z.string().min(1)` (or `z.optional()` for not required).
- **UI / AI** — `FieldMeta.required: true | false`.

If the Zod schema marks it required but the meta does not (or vice versa), the
builder will let the user save an incomplete config that the runtime then
rejects, or the planner will treat an optional field as mandatory. Cross‑check
both before considering the action done.

### 3.7 Dynamic options resolvers (cascading dropdowns)

For fields whose options come from the provider's API (channel list, board
list, etc.) declare `optionsSource: "<provider>:<resource>"` in `FieldMeta`,
and write a resolver under `integrations/<provider>/options/<resource>.ts`.

Register the resolver in [`services/ai/tools/options.ts`](../../services/ai/tools/options.ts)
under the same string. Both the builder UI and the AI planner read from this
registry — the resolver is the single source.

Cascade dependencies are declared via `dependsOn`:

```ts
{ name: "channelId", optionsSource: "foo:channels", dependsOn: "thingId" }
{ name: "viewId", optionsSource: "foo:views", dependsOn: ["baseId", "tableId"] }  // multi-parent
```

The contract enforces that every `dependsOn` name refers to a sibling field in
the same `fields[]` array ([`contracts/triggerMeta.ts:87`](../../contracts/triggerMeta.ts)).
Children are gated until every parent has a value.

**Going‑forward rule:** resolvers always go through `refreshAndRetry` even for
non‑refreshable providers. *Legacy: Trello resolvers `decryptToken` and call
directly — do not refactor in this slice but don't copy the pattern.*

### 3.8 Webhook receive — thin route + provider receive

Webhook route: [`app/api/webhooks/<provider>/route.ts`](../../app/api/webhooks/microsoft-teams/route.ts).
Canonical example: [Teams route](../../app/api/webhooks/microsoft-teams/route.ts) (102 lines).

The route is thin (~30 to ~100 lines): receive → dispatch → ack.

```ts
import { NextResponse } from "next/server";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveFooWebhook } from "@/integrations/foo/webhooks/receive";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import "@/integrations/_registry";  // side-effect: ensure registrations exist

export async function POST(request: Request) {
  let result: Awaited<ReturnType<typeof receiveFooWebhook>>;
  try {
    result = await receiveFooWebhook(request);
  } catch (err) {
    if (err instanceof InvalidSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    return NextResponse.json({ error: "receive failed" }, { status: 500 });
  }

  if (result.kind === "validation") {
    return new NextResponse(result.token, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let dispatched = 0;
  for (const event of result.events) {
    const r = await dispatchTriggerEvent(event);
    dispatched += r.enqueued;
  }
  return NextResponse.json({ ok: true, dispatched });
}
```

The `receive.ts` module owns signature verification, payload parsing,
validation‑handshake detection, and normalization. See
[`docs/rules/webhook-receipt-routes.md`](../rules/webhook-receipt-routes.md)
for the full contract. Returns a discriminated union:

```ts
export type ReceiveResult =
  | { kind: "validation"; token: string }
  | { kind: "events"; events: TriggerEvent[] };
```

Dedup of duplicate event deliveries is owned by
[`repositories/webhookEventDedup.ts`](../../repositories/webhookEventDedup.ts)
and is invoked inside `dispatchTriggerEvent` — the receive module does not
need to dedupe.

### 3.9 API wrappers — `api/` folder

Per‑endpoint thin functions. Two patterns:

- **Per‑provider:** `integrations/<provider>/api/<resource>.ts`.
- **Shared family** (Microsoft Graph, Google APIs): `integrations/_shared/<family>/api/<resource>.ts` consumed by every provider in the family.

Each function takes `accessToken` + typed inputs, calls the provider, throws
`Unauthorized401Error` on HTTP 401, and returns the parsed body. Keep them
pure — no `accountId`/`userId` arguments, no logging of the token.

---

## §4 — Frontend / builder visibility (Mode B)

Most of the frontend visibility is **automatic** once §3 is done. The
following are the things you actually have to do.

### 4.1 Provider on Apps page (`/apps`)

Automatic. [`app/apps/_shared.ts:resolveAppCatalog`](../../app/apps/_shared.ts) calls
`listProviders().filter(p => p.isEnabled && !p.isExperimental)` from
[`integrations/_registry.ts`](../../integrations/_registry.ts).

What you must provide for the card to render correctly:
- Manifest's `displayName`.
- SVG icon at `public/integrations/<provider-id>.svg` — `providerIconUrl()` returns this path.
- Description registered at [`lib/apps/providerCategories.ts`](../../lib/apps/providerCategories.ts) (`descriptionFor()`) — add an entry for your provider.
- Category registered at the same file (`categoryFor()`).

### 4.2 Actions / triggers in builder pickers

Automatic. [`features/workflow-builder/panels/ActionPicker.tsx`](../../features/workflow-builder/panels/ActionPicker.tsx)
and [`TriggerPicker.tsx`](../../features/workflow-builder/panels/TriggerPicker.tsx)
call `listActionMetasForProvider()` / `listTriggerMetasForProvider()` from
[`services/discovery/_registry.ts`](../../services/discovery/_registry.ts).

What you must provide: register every action/trigger meta in
[`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts).

### 4.3 Config form rendering

Automatic. [`features/workflow-builder/config-modal/SchemaForm.tsx`](../../features/workflow-builder/config-modal/SchemaForm.tsx)
renders one renderer per `FieldType`. Each type maps to a file under
[`features/workflow-builder/config-modal/fields/`](../../features/workflow-builder/config-modal/fields/).

Available types ([`contracts/actionMeta.ts:67`](../../contracts/actionMeta.ts)):
`text`, `textarea`, `select`, `combobox`, `keyvalue`, `number`, `boolean`,
`file`, `cron`, `router-routes`, `string-array`, `file-array`.

What you must provide:
- Correct `type` for each field. Don't use `text` for an enum (use `select`).
- For `select` / `combobox` with dynamic options: `optionsSource` + a resolver registered per §3.7.
- For cascading dropdowns: `dependsOn` references to sibling fields.
- For file‑producing/consuming actions: `producesFileRef` / `consumesFileRef`.
- For multi‑select: `multiple: true` on `select` / `combobox`.
- Static enums use `options: [{value, label}]` (mutually exclusive with `optionsSource`).

### 4.4 High‑risk action confirmation

For `isDestructive: true` / `requiresConfirmation: true` actions, the builder
surfaces a typed‑confirmation modal via
[`features/workflow-builder/panels/DestructiveActionConfirmationModal.tsx`](../../features/workflow-builder/panels/DestructiveActionConfirmationModal.tsx).
No per‑action wiring needed — the modal reads the meta.

### 4.5 Variable picker

Automatic. The picker reads `payloadShape[]` (for triggers) and
`outputs[]` (for actions) and renders one chip per top‑level name.

What you must provide:
- Declare every top‑level output name in `outputs[]` / `payloadShape[]`.
- Mark sensitive outputs `sensitive: true` so the picker shows a redacted
  preview but still allows the variable to wire downstream.

### 4.6 Connect / disconnect UX

Automatic for `code_callback` providers — the Apps page card calls
`POST /api/integrations/oauth/<provider>/connect` and redirects.
For `token_ingest` providers, the Apps page mounts a client component that
reads the URL fragment and POSTs to `/api/integrations/oauth/<provider>/ingest`.
See [`docs/rules/token-ingest-auth.md`](../rules/token-ingest-auth.md).

### 4.7 User‑facing copy guidelines

- `displayName` — exact provider brand name (capitalize as the provider does: "GitHub" not "Github", "Microsoft Teams" not "MS Teams").
- `ActionMeta.displayName` — verb‑first, title case ("Send Channel Message", "Create Card", "Update Inventory").
- `description` — one sentence ending in a period. State what the action does, not what it could be used for.
- Field `label` — title case, short ("Team", not "Teams team").
- Field `description` — sentence case, ends in a period. Explain what the user types here AND any non‑obvious effect (e.g. "Pick a team first").
- Field `placeholder` — sentence case with ellipsis when the field is search‑style ("Search teams…").
- `riskDescription` — one sentence stating *what* happens and *whether it's recoverable*.

### 4.8 Provider permission model (classification → connect / reconnect / disconnect / share)

**This is the part most new-provider work forgets.** A provider's *credential
class* decides who on a team account may connect and manage it. Get the
classification right and the whole permission surface — backend gate, Apps DTO
booleans, and UI copy — falls out automatically. Get it wrong and a member can
either be wrongly locked out of their own personal app, or wrongly able to
overwrite a shared org credential.

Canonical matrix + audit: [`docs/slices/phase-4/apps-permissions-matrix-closeout.md`](../slices/phase-4/providers/apps-permissions-matrix-closeout.md).

#### 4.8.1 Classify the provider (you MUST do this)

Add an entry for your provider id to the `POLICY` map in
[`core/integrations/credentialSharing.ts`](../../core/integrations/credentialSharing.ts).
The registry **coverage test fails the build** if a registered provider is
unclassified, so this is not optional — but choose the *correct* class, not just
whatever passes:

- **`account`** — the credential is a **shared org resource** the whole team
  jointly operates (a workspace bot token, a store, a business portal). Examples
  in-repo: `slack`, `notion`, `stripe`, `shopify`, `hubspot`, `mailchimp`.
- **`personal`** — the credential **acts as the connecting human** (their mailbox,
  drive, chat, or calendar identity). Examples: `gmail`, all `google-*` and
  `microsoft-*` user apps, `dropbox`, `discord`, `github`, `facebook`, `airtable`,
  `trello`, `monday`. **Unknown providers default to `personal`** (fail-safe — never
  auto-share a credential we didn't deliberately mark shareable).

> Rule of thumb: if two teammates connecting the same provider would each be
> signing in *as themselves*, it's `personal`. If they'd both be authorizing *the
> same shared account*, it's `account`.

#### 4.8.2 What the classification buys you (no per-provider code)

The permission rule is enforced **once**, centrally — you do not write
per-provider authz. Backend gates: connect at
[`app/api/integrations/oauth/[provider]/connect/route.ts`](../../app/api/integrations/oauth/[provider]/connect/route.ts)
(`requireAccountRole` for account providers), reconnect at
[`services/integrations/reconnect.ts`](../../services/integrations/reconnect.ts),
disconnect at [`services/integrations/disconnect.ts`](../../services/integrations/disconnect.ts),
share/unshare at [`services/integrations/connectionSharing.ts`](../../services/integrations/connectionSharing.ts).

| Action | Account/service provider | Personal provider |
|---|---|---|
| Connect / Connect another | **owner/admin only** | any member (their own identity) |
| Reconnect | **owner/admin only** | **connector only** |
| Disconnect | **owner/admin only** | connector **or** owner/admin (safety) |
| Share / Unshare | n/a — `account_provider_not_shareable` | Share: connector only · Unshare: connector or owner/admin (audited) |
| View connected rows | any member | any member |

The one intentional asymmetry: owner/admin may **disconnect** a personal
connection (safety) but may **not reconnect** it — only the connecting human can
re-authorize their own identity.

#### 4.8.3 Apps DTO booleans (all server-derived, no-leak)

[`app/apps/_shared.ts`](../../app/apps/_shared.ts) derives these from
`(provider class, caller role, connector, sharing flag)` and emits **only**
booleans/enums — never role, provider class, `connected_by_user_id`, tokens,
scopes, `provider_account_id`, or the raw sharing scope:

- `canConnect` — gates Connect + "Connect another" (account providers require owner/admin).
- `canReconnect` — per-row reconnect (account ⇒ owner/admin; personal ⇒ connector-only).
- `canDisconnect` — per-row disconnect (account ⇒ owner/admin; personal ⇒ owner/admin or connector).
- `canShare` / `canUnshare` — personal only, gated by `ENABLE_CONNECTION_SHARING` (default **OFF**).
- `restrictedToAdmins` — **true when the provider is `account`-class and the caller is not owner/admin.** Drives the member-facing explanation so the card is never silently blank.

The routes re-authorize authoritatively, so a stale `true` can never bypass anything.

#### 4.8.4 Member-facing copy (don't ship a silent blank state)

When `restrictedToAdmins` is true, [`features/apps/AppCard.tsx`](../../features/apps/AppCard.tsx)
(testid `app-card-admin-required`) renders the explanation instead of a blank
action area:
- Not connected: *"Only an owner or admin can connect this app for the team."*
- Connected (expanded): *"Only an owner or admin can reconnect or disconnect this team connection."*

This is automatic for any `account`-class provider — but **verify it renders** for
your provider, and never re-introduce a hidden-action-with-no-explanation state.

#### 4.8.5 Per-role visible states (what each person sees)

- **owner / admin** — full controls for any provider class (Connect / Connect
  another / Reconnect / Disconnect; Share/Unshare only on personal).
- **member, account/service provider** — no actionable controls; the
  `restrictedToAdmins` copy explains why. Can still view connected rows.
- **member, personal provider** — can Connect their own; Reconnect/Share only on
  the rows **they** connected (connector); cannot manage another member's row.
- **non-member / cross-account** — no-leak: `not_found` (404) on
  reconnect/disconnect/share; connect collapses to `403` (no role/existence oracle).
- **frozen account** (`pending_deletion`) — every mutating action is blocked safely
  before any write (`account_frozen`).

#### 4.8.6 What you must add for permissions

1. Classify in `credentialSharing.ts` (§4.8.1).
2. If `account`-class: confirm Connect/Reconnect/Disconnect show only for
   owner/admin and that the `restrictedToAdmins` copy renders for members.
3. Add a permission test row (§6.1) — at minimum a DTO test asserting
   `canConnect`/`restrictedToAdmins` for member vs owner/admin on your provider's
   class. The central authz is already covered; you're pinning the classification.

---

## §5 — AI / React Agent visibility (Mode B)

The AI catalog at [`services/ai/tools/providerCatalog.ts`](../../services/ai/tools/providerCatalog.ts)
is built by `getProviderCatalog()` from:

- [`integrations/_registry.ts`](../../integrations/_registry.ts) — provider list.
- [`services/discovery/_registry.ts`](../../services/discovery/_registry.ts) — action and trigger metas.

If your manifest and metas are correctly registered, the React Agent sees
your provider automatically.

### 5.1 What the agent reads (and the hard constraint)

From the [planner prompt](../../services/ai/planner/buildWorkflowPlanPrompt.ts):
> "Use ONLY the providers, actions, triggers listed in the catalog. NEVER
> invent. If the user asks for something not in the catalog, set proposedPatch
> to null and add an `unsupportedRequests` entry."

For each action/trigger the agent receives:
- `key`, `displayName`, `category`, `riskLevel`, `requiresIntegration`.
- `configFields[]` with `name`, `type`, `required`, optional `multiple`.
- `configOptions[]` — static enum values, when present.
- `outputs[]` / `payloadShape[]` — top‑level names + `type` + `sensitive` flag.

### 5.2 Rules to follow so the agent uses your provider correctly

1. **Key format.** `ActionMeta.key` MUST equal `"${provider}:${type}"`. Drift breaks lookup. Enforced by the contract.
2. **Provider id format.** Schema regex enforces kebab‑case at module load. No camelCase, no dots.
3. **Required fields.** `FieldMeta.required` must match the Zod schema's required‑ness. If they drift, the agent will mark a config "complete" that the runtime rejects.
4. **`optionsSource` strings must resolve.** Every `optionsSource` value must be registered in [`services/ai/tools/options.ts`](../../services/ai/tools/options.ts). If a meta references an unregistered options source, the planner cannot prompt the user with a value list and may guess.
5. **Static enums.** When a field is a fixed set ("html" / "text"), use `options: [{value, label}]`. The agent gets these via `configOptions[]` and picks a real value.
6. **Outputs.** Declare every top‑level output the handler returns. Missing outputs cause downstream `{{nodeId.field}}` references to fail variable‑reference validation.
7. **Sensitive flag.** Mark sensitive outputs so the variable picker shows a redaction. The variable is still INSERTABLE — `sensitive` is a UI hint, not a flow gate.

### 5.3 Provider id reservations / collisions

The native provider id is `native` and is reserved. Provider ids in
[`integrations/_registry.ts`](../../integrations/_registry.ts) are
hand‑maintained — verify your id isn't already used by an existing provider
before you start.

### 5.4 What proves the agent sees the provider

The discovery tests at `tests/unit/services/discovery/<provider>-discovery.test.ts`
ARE the AI catalog visibility tests, because `getProviderCatalog()` is a pure
projection over the discovery registry. If your discovery test passes —
correct keys, correct fields, correct outputs, no drift — the React Agent sees
the provider correctly. There is no separate AI‑side fixture to keep in sync.

---

## §6 — Testing phase (Mode B)

Required test **categories** + **risk‑based depth**. Counts vary by provider
risk profile; there is no fixed count target.

### 6.1 Mandatory categories (every provider)

| Category | File pattern | What it asserts |
|---|---|---|
| Manifest validation | `tests/unit/integrations/<p>/manifest.test.ts` | Parses against `ProviderManifestSchema`; id matches folder; required scopes non‑empty for OAuth; capabilities honest. |
| OAuth flow | `tests/unit/integrations/<p>/oauth.test.ts` | `buildAuthUrl` constructs correct URL; `handleCallback` exchanges code; `refreshToken` rotates or throws `RefreshNotSupportedError`; `revoke` best‑effort. |
| Provider route | `tests/unit/app/api/providers/<p>-provider-route.test.ts` | `GET /api/providers/<p>` returns manifest projection. |
| Discovery registry | `tests/unit/services/discovery/<p>-discovery.test.ts` | Per‑provider action surface in correct displayOrder; every key equals provider:type; required fields correctly marked; sensitive outputs marked; cascading `dependsOn` references valid. **This is the AI catalog visibility test.** |
| Action handlers | `tests/unit/integrations/<p>/actions/<a>.test.ts` (per action) | Schema accepts good config, rejects bad config; handler returns expected output shape on good path; refresh+retry triggers on 401; non‑refreshable surfaces `IntegrationActionRequiredError`. |
| Webhook route (if webhook trigger) | `tests/unit/app/api/webhooks/<p>.route.test.ts` | Signature verification rejects forged requests; validation handshake echoes correctly; dispatch returns 200 on success and 5xx on enqueue failure. |
| Trigger activation/deactivation | `tests/unit/integrations/<p>/triggers/<t>/` | `activate` creates subscription/snapshot; `deactivate` cleans up; `normalize` produces correct `TriggerEvent`; `pull`/`renew` for subscription‑watch. |
| Options resolvers | `tests/unit/integrations/<p>/options/<r>.test.ts` (per resolver) | Returns `{value, label}[]` shape; respects `dependsOn` parent values; handles empty / pagination / 401 correctly. |
| Permission / Apps DTO (§4.8) | `tests/unit/app/apps/_shared.test.ts` (extend) or a provider-scoped case | For the provider's credential class: `canConnect` / `restrictedToAdmins` correct for member vs owner/admin; `canReconnect` connector-only for personal; no role/identity/token in the DTO (no-leak). Pins the `credentialSharing.ts` classification. |

### 6.2 Risk‑based depth (add when applicable)

- **Destructive actions** (`isDestructive: true`) — add a confirmation test ensuring the builder modal surfaces. Add an idempotency/safety test if the provider supports idempotency keys (Stripe).
- **Financial actions** (Stripe writes, payment moves) — preflight policy tests (livemode guard), parity tests against the engine's test‑mode short‑circuit.
- **OAuth‑heavy** (multiple OAuth flows, tenant‑specific consent) — add per‑flow tests.
- **Multi‑tenant** (Shopify shop domain, providerHint) — add `validateProviderHint` tests, JWT‑binding test, host‑injection rejection test.
- **Webhook‑heavy** — add tests for every webhook topic/event type; dedup test; signature‑mismatch test per topic.
- **Polling with snapshot** — add a "first‑poll‑miss" guard test: activation seeds the snapshot, the first poll after activation correctly identifies "new" vs "baseline."
- **Token rotation** (Airtable) — add a test that `refreshToken` throws when the rotation response is missing a new refresh token.
- **Sensitive outputs** — add a test that the run‑details API redacts `sensitive: true` fields.

### 6.3 Tests NOT required for low‑risk providers

A provider with one read‑only action, no triggers, no destructive operations
does not need: confirmation tests, polling‑snapshot tests, dedup tests,
rotation tests. Cover the mandatory categories only.

### 6.4 E2E walkthrough

For meaningful providers (≥3 actions or ≥1 trigger), add an E2E test at
`tests/e2e/slice-N-<provider>-walkthrough.spec.ts` that:
1. Connects the provider against a stubbed authorize endpoint.
2. Drags one action into a workflow.
3. Fills config (including a cascading dropdown if applicable).
4. Saves; runs; asserts the run completes successfully.

### 6.5 Test commands

```bash
npm run test                # Jest unit + integration
npm run test:watch          # Jest watch
npm run test:e2e            # Playwright
npm run lint                # ESLint
npm run lint:structure      # leaf-folder counts
npm run typecheck           # tsc --noEmit
```

Run `npm run test` + `npm run typecheck` + `npm run lint` before considering
the provider done.

---

## §7 — Final completion report (Mode B)

Copy this template into the slice doc / PR description and fill every line.
Empty lines or "TBD" are not acceptable.

```markdown
# Provider Implementation Report: <Provider Name>

## Branch / commit
- Branch: <branch-name>
- Final commit: <sha>

## Scope summary
- Actions implemented: <count>
- Triggers implemented: <count>
- Actions deferred: <count>
- Triggers deferred: <count>

## OAuth scopes (verbatim)
- required: [<scopes>]
- optional: [<scopes>]
- deprecated: [<scopes>]

## Env vars (with source)
| Variable | Source |
|---|---|
| `<PROVIDER>_CLIENT_ID` | <provider> developer console |

## Developer‑console steps Marcus must do
- [ ] <step>
- [ ] <step>

## Actions implemented
| Type | Risk | Destructive? | Confirmation? | Notes |
|---|---|---|---|---|
| create_x | medium | no | no | … |

## Triggers implemented
| Type | Activation | Webhook TTL / poll cadence | Notes |
|---|---|---|---|

## Actions / triggers deferred (with reason)
| Type | Reason |
|---|---|

## Items requiring Marcus decisions
- <bullets, or "none">

## Production blockers
- App review: <status> / <expected timeline>
- Paid plan: <required y/n>
- Tenant admin consent: <required y/n>

## Security concerns
- <bullets>

## Testing completed
- [ ] Manifest validation
- [ ] OAuth flow (init + callback + refresh + revoke)
- [ ] Provider route
- [ ] Discovery registry / AI catalog visibility
- [ ] Action handlers (good + bad + 401 paths)
- [ ] Webhook route (validation + signature + dispatch) — N/A if no webhook
- [ ] Trigger activation/deactivation/pull/normalize
- [ ] Options resolvers
- [ ] Risk‑based depth tests added: <list>
- [ ] Sensitive‑output redaction tests
- [ ] E2E walkthrough (slice spec) — if applicable
- [ ] `npm run test` green
- [ ] `npm run typecheck` green
- [ ] `npm run lint` green

## Known limitations
- <bullets — rate limits, edge cases, undocumented provider behavior>

## Completeness gates (§0.5)
- [ ] Manifest registered + parses
- [ ] OAuth registered in dispatcher
- [ ] Apps page shows provider (verified in dev)
- [ ] Connect / disconnect works end‑to‑end against real test account
- [ ] All actions: handler + schema + meta + registered
- [ ] All triggers: full registration set + meta + registered
- [ ] ActionPicker shows actions
- [ ] TriggerPicker shows triggers
- [ ] All `optionsSource` strings registered
- [ ] AI catalog / discovery test passes
- [ ] Required fields agree across Zod + meta
- [ ] Outputs declared; variable picker shows them
- [ ] Sensitive outputs marked
- [ ] Tests with risk‑based depth exist
- [ ] Env vars in `.env.example`
- [ ] SVG icon present
- [ ] Marcus personal setup checklist complete

## Next recommended slice
<one sentence>
```

---

## §8 — Marcus personal setup checklist

Things only Marcus can do, per provider:

- [ ] Create developer account at provider.
- [ ] Create the OAuth app (or equivalent: bot, integration, API token).
- [ ] Configure redirect URLs:
  - Dev: `http://localhost:3000/api/integrations/oauth/<provider-id>/callback`
  - Prod: `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/<provider-id>/callback`
  - For token‑ingest: `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/<provider-id>/ingest`
- [ ] Enable any APIs / products in the provider's console (Google APIs library, Microsoft Graph permissions, Shopify scopes consent).
- [ ] Request any scopes that require admin consent or review.
- [ ] Submit app for review if production traffic requires it.
- [ ] Register the webhook callback URL in the provider's console (if app‑level webhook):
  - Prod: `${NEXT_PUBLIC_APP_URL}/api/webhooks/<provider-id>`
- [ ] Copy client id / client secret / webhook signing secret into `.env.local` AND Vercel production env vars (matching the names declared in §2.2).
- [ ] Verify dev / sandbox account access (create a test account at the provider).
- [ ] Approve any paid plan or API tier upgrade.
- [ ] Drop the provider SVG icon at `public/integrations/<provider-id>.svg`.
- [ ] After deploy: run the connect flow against a real production account once and verify the integration row in Supabase.

---

## §9 — "Do not do this" — anti‑patterns

- ❌ Hand‑rolling token storage. Always go through `services/oauth/dispatcher.ts`. The repository layer is dispatcher‑canonical.
- ❌ Calling `repositories/integrations.ts` directly from an action handler. Token lookup + decryption belongs to `refreshAndRetry`.
- ❌ Skipping `refreshAndRetry` for "non‑refreshable" providers. The helper still surfaces the correct `IntegrationActionRequiredError("refresh_not_supported")` on 401, which the health engine reads.
- ❌ Putting webhook signature verification in the route file. It lives in `integrations/<provider>/webhooks/receive.ts`.
- ❌ Adding to `integrations/_registry.ts` before the manifest passes `ProviderManifestSchema.parse()`. Parse inline in the manifest file.
- ❌ Using display names as field keys. Field `name` is the schema key; field `label` is what the user sees.
- ❌ Shipping without the discovery test. That test IS the AI catalog visibility test.
- ❌ Marking benign outputs `sensitive: true`. It hides preview values from the variable picker for no security benefit.
- ❌ Adding a provider without updating `.env.example`. Other engineers (and CI) won't know which env vars to set.
- ❌ Creating `auth.ts` for a new provider instead of `oauth.ts`. Trello is grandfathered; new providers use `oauth.ts` regardless of whether they implement `ProviderOAuth` or `ProviderTokenIngestAuth`.
- ❌ Omitting `accountIdField` when `tokenScope: "workspace"`. Schema rejects this at load.
- ❌ Setting `capabilities.actions: true` before any action handler is registered. Manifest capability flags are honest.
- ❌ Setting `isDestructive: true` or `requiresConfirmation: true` without `riskLevel: "high"`. Contract rejects this combination.
- ❌ Declaring both `options[]` (static) and `optionsSource` (dynamic) on the same field. Mutually exclusive.
- ❌ Renaming a provider id. It breaks integration row foreign keys and webhook subscription lookup.
- ❌ Implementing a polling trigger without seeding the snapshot at activation. Events between activation and first poll will be silently dropped.
- ❌ Refactoring legacy provider drift (Trello's `auth.ts`, Shopify's inline webhook, etc.) inside a new‑provider slice. New providers follow the going‑forward standard; legacy gets cleaned up in a dedicated slice.

---

## §10 — Special cases

### 10.1 Polling‑only providers (Profile 5)

- Activation seeds the snapshot (latest id, latest modified time) into `trigger_resources.config`.
- The cron route at [`app/api/cron/poll-triggers/route.ts`](../../app/api/cron/poll-triggers/route.ts) imports `integrations/_registry` and runs every registered polling handler on its declared cadence.
- `pollingRegistry` exposes the handler; the cron route discovers it.
- No `subscriptionRegistry` registration. No renewal cron.
- Example: [`integrations/gmail/triggers/newEmail/`](../../integrations/gmail/triggers/newEmail/).

### 10.2 Webhook subscription‑watch (expiring subscriptions, Profile 1)

- `activate.ts` calls the provider's create‑subscription API; persists `subscriptionId`, `clientState`, selectors, `expiresAt`.
- `deactivate.ts` deletes the subscription on workflow disable; tolerate 404 / 403.
- `pull.ts` does id‑fetch hydration when the provider sends notifications without resource data (Microsoft Graph default behavior).
- `renew.ts` exports the handler the renewal cron at [`services/triggers/runRenewals.ts`](../../services/triggers/runRenewals.ts) calls before expiry.
- Webhook route at `app/api/webhooks/<provider>/route.ts` handles validation handshake + dispatch.
- Example: [`integrations/microsoft-teams/triggers/newChannelMessage/`](../../integrations/microsoft-teams/triggers/newChannelMessage/).

### 10.3 Permanent webhooks (no expiry, Profile 6)

- Same as 10.2 but NO `subscriptionRegistry` registration and NO `renew.ts`. The webhook never expires.
- For app‑level webhooks (one URL configured in the provider's console for the entire app, not per‑resource), use query‑string routing (`?workflowId=X&nodeId=Y`) on the receive URL so the route can look up the right trigger.
- Examples: [`integrations/shopify/triggers/webhookReceived/`](../../integrations/shopify/triggers/webhookReceived/), [`integrations/trello/triggers/`](../../integrations/trello/triggers/), [`integrations/monday/triggers/`](../../integrations/monday/triggers/).

### 10.4 Mixed (webhook + polling fallback, Profile 7)

- Implement the webhook trigger as primary.
- Register a polling handler as the fallback path; activation conditionally seeds the snapshot.
- Use the same `<trigger>.meta.ts` (UI doesn't distinguish).
- Example: [`integrations/airtable/`](../../integrations/airtable/).

### 10.5 No‑OAuth providers (API key)

- Manifest: `capabilities.oauth: false`, omit OAuth scopes (`scopes.required: []` — but the schema rejects this if `oauth: true`).
- No `oauth.ts`. Credential entry UX is a custom Apps‑page form posting to a provider‑specific endpoint that stores an encrypted API key in the same integrations table (same encryption path; `accessTokenEncrypted` holds the API key, `refreshTokenEncrypted: null`).
- Handlers use `refreshAndRetry` too — for an API key, the `refresh` path will throw `RefreshNotSupportedError` on 401 and surface the right reconnect signal.
- This pattern is rare in V2 today. If your provider needs it, STOP and ask Marcus for a design walkthrough before coding.

### 10.6 Multi‑tenant providers (Profile 3 — Shopify pattern)

- Implement `validateProviderHint(hint: ProviderHint)` on the OAuth module — throw on invalid input. The dispatcher calls this BEFORE creating the OAuth state row.
- `buildAuthUrl` and `handleCallback` receive the hint as their 4th parameter; use it to build per‑tenant URLs.
- The hint is bound into the signed OAuth state JWT — re‑verify against any provider‑echoed parameter inside `handleCallback`.
- `accountIdField` is typically the normalized tenant id (Shopify: shop domain).
- Example: [`integrations/shopify/oauth.ts`](../../integrations/shopify/oauth.ts).

### 10.7 Token‑ingest providers (Profile 4 — Trello pattern)

- Manifest: `authFlow: "token_ingest"`, `refreshable: false` (the schema enforces this combination).
- Implement `ProviderTokenIngestAuth` from [`contracts/integration.ts`](../../contracts/integration.ts).
- The client component reads the URL fragment and POSTs to `/api/integrations/oauth/<provider>/ingest`.
- Verify the token by calling a `/me`‑style endpoint inside `verifyAndIngestToken`. Throw `TokenIngestVerificationError` on failure — NEVER include the token in the error message.
- See [`docs/rules/token-ingest-auth.md`](../rules/token-ingest-auth.md).

---

## Appendix A — Critical file map

Single‑source‑of‑truth file paths the playbook references:

| Concern | Path |
|---|---|
| Provider manifest schema | [`contracts/integration.ts`](../../contracts/integration.ts) |
| ActionMeta schema | [`contracts/actionMeta.ts`](../../contracts/actionMeta.ts) |
| TriggerMeta schema | [`contracts/triggerMeta.ts`](../../contracts/triggerMeta.ts) |
| TriggerEvent schema | [`contracts/triggerEvent.ts`](../../contracts/triggerEvent.ts) |
| Apps page DTO | [`contracts/apps.ts`](../../contracts/apps.ts) |
| Provider credential class (permissions, §4.8) | [`core/integrations/credentialSharing.ts`](../../core/integrations/credentialSharing.ts) |
| Connection sharing service | [`services/integrations/connectionSharing.ts`](../../services/integrations/connectionSharing.ts) |
| Reconnect authz service | [`services/integrations/reconnect.ts`](../../services/integrations/reconnect.ts) |
| Disconnect authz service | [`services/integrations/disconnect.ts`](../../services/integrations/disconnect.ts) |
| Provider registry aggregator | [`integrations/_registry.ts`](../../integrations/_registry.ts) |
| OAuth dispatcher | [`services/oauth/dispatcher.ts`](../../services/oauth/dispatcher.ts) |
| OAuth state (HMAC + DB row) | [`services/oauth/state.ts`](../../services/oauth/state.ts) |
| Refresh + retry helper | [`services/oauth/refreshAndRetry.ts`](../../services/oauth/refreshAndRetry.ts) |
| Per‑(account,provider) refresh lock | [`services/oauth/refreshLock.ts`](../../services/oauth/refreshLock.ts) |
| Action handler types | [`services/execution/handlers/types.ts`](../../services/execution/handlers/types.ts) |
| Action handler inventory | [`services/execution/handlers/_handlerInventory.ts`](../../services/execution/handlers/_handlerInventory.ts) |
| Action handler registry | [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts) |
| Trigger activation registry | [`services/triggers/activationRegistry.ts`](../../services/triggers/activationRegistry.ts) |
| Trigger deactivation registry | [`services/triggers/deactivationRegistry.ts`](../../services/triggers/deactivationRegistry.ts) |
| Trigger polling registry | [`services/triggers/pollingRegistry.ts`](../../services/triggers/pollingRegistry.ts) |
| Trigger subscription registry | [`services/triggers/subscriptionRegistry.ts`](../../services/triggers/subscriptionRegistry.ts) |
| Trigger dispatch | [`services/triggers/dispatch.ts`](../../services/triggers/dispatch.ts) |
| Trigger renewal cron | [`services/triggers/runRenewals.ts`](../../services/triggers/runRenewals.ts) |
| Discovery meta inventory | [`services/discovery/_metaInventory.ts`](../../services/discovery/_metaInventory.ts) |
| Discovery registry | [`services/discovery/_registry.ts`](../../services/discovery/_registry.ts) |
| AI provider catalog | [`services/ai/tools/providerCatalog.ts`](../../services/ai/tools/providerCatalog.ts) |
| AI options resolver registry | [`services/ai/tools/options.ts`](../../services/ai/tools/options.ts) |
| AI planner prompt | [`services/ai/planner/buildWorkflowPlanPrompt.ts`](../../services/ai/planner/buildWorkflowPlanPrompt.ts) |
| AI catalog narrowing | [`services/ai/planner/narrowProvidersForPlan.ts`](../../services/ai/planner/narrowProvidersForPlan.ts) |
| Integrations repository | [`repositories/integrations.ts`](../../repositories/integrations.ts) |
| OAuth states repository | [`repositories/oauthStates.ts`](../../repositories/oauthStates.ts) |
| Trigger resources repository | [`repositories/triggerResources.ts`](../../repositories/triggerResources.ts) |
| Webhook event dedup repository | [`repositories/webhookEventDedup.ts`](../../repositories/webhookEventDedup.ts) |
| Token encryption | [`core/encryption/tokens.ts`](../../core/encryption/tokens.ts) |
| Trigger errors | [`core/triggers/errors.ts`](../../core/triggers/errors.ts) |
| Apps page resolver | [`app/apps/_shared.ts`](../../app/apps/_shared.ts) |
| Apps page route | [`app/apps/page.tsx`](../../app/apps/page.tsx) |
| OAuth connect route | [`app/api/integrations/oauth/[provider]/connect/`](../../app/api/integrations/oauth/[provider]/connect/) |
| OAuth callback route | [`app/api/integrations/oauth/[provider]/callback/`](../../app/api/integrations/oauth/[provider]/callback/) |
| OAuth ingest route | [`app/api/integrations/oauth/[provider]/ingest/`](../../app/api/integrations/oauth/[provider]/ingest/) |
| Builder ActionPicker | [`features/workflow-builder/panels/ActionPicker.tsx`](../../features/workflow-builder/panels/ActionPicker.tsx) |
| Builder TriggerPicker | [`features/workflow-builder/panels/TriggerPicker.tsx`](../../features/workflow-builder/panels/TriggerPicker.tsx) |
| Builder SchemaForm | [`features/workflow-builder/config-modal/SchemaForm.tsx`](../../features/workflow-builder/config-modal/SchemaForm.tsx) |
| Destructive confirmation modal | [`features/workflow-builder/panels/DestructiveActionConfirmationModal.tsx`](../../features/workflow-builder/panels/DestructiveActionConfirmationModal.tsx) |
| Env example | [`.env.example`](../../.env.example) |
| Provider icons | [`public/integrations/`](../../public/integrations/) |

## Appendix B — Canonical provider examples by case

| Case | Provider |
|---|---|
| Refreshable OAuth + PKCE + webhook subscription | [`integrations/microsoft-teams/`](../../integrations/microsoft-teams/) |
| Refreshable + token rotation + non‑email accountId | [`integrations/airtable/`](../../integrations/airtable/) |
| Non‑refreshable + multi‑tenant providerHint | [`integrations/shopify/`](../../integrations/shopify/) |
| Token ingest (fragment) | [`integrations/trello/`](../../integrations/trello/) |
| Polling trigger with snapshot seeding | [`integrations/gmail/triggers/newEmail/`](../../integrations/gmail/triggers/newEmail/) |
| Permanent webhook (no renewal) | [`integrations/shopify/triggers/webhookReceived/`](../../integrations/shopify/triggers/webhookReceived/) |
| Webhook + polling fallback | [`integrations/airtable/`](../../integrations/airtable/) |
| Shared‑family OAuth helpers | [`integrations/_shared/microsoft/`](../../integrations/_shared/microsoft/) and [`integrations/_shared/google/`](../../integrations/_shared/google/) |

## Appendix C — Known repo drift (do not refactor in a new‑provider slice)

These deviations exist in the repo today. Document the going‑forward standard
(this playbook does), but do not refactor legacy providers as part of a
new‑provider slice. Legacy cleanup is its own dedicated slice.

| Drift | Where | Going‑forward standard |
|---|---|---|
| `auth.ts` filename for token‑ingest | [`integrations/trello/auth.ts`](../../integrations/trello/auth.ts) | New providers use `oauth.ts` regardless of contract. |
| No `webhooks/` folder; receive inlined in route | [`integrations/shopify/`](../../integrations/shopify/), [`integrations/trello/`](../../integrations/trello/) | New webhook providers always have `integrations/<p>/webhooks/receive.ts`. |
| Options resolver decrypts token + calls API directly | Trello options/ | New resolvers always go through `refreshAndRetry`. |
| Inconsistent `sensitive: true` marking | Pre‑Slice‑3.SEC‑7 metas | New metas mark every PII / message body / signed URL / payment / token output. |
