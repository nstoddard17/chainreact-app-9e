---
name: chainreactv2-provider-integration-builder
description: Use to add a NEW app/provider integration to ChainReactV2 end-to-end — manifest/metadata, OAuth scopes, actions/triggers, backend handlers, option sources, Apps-page visibility, AI visibility, and the personal-vs-account credential classification. Researches the provider's real API when needed, ports proven V1 (chainreact-app-9e) behavior into V2's boundaries WITHOUT blindly copying (challenges wrong/obsolete V1 logic), follows the account-scoped model, never exposes co-member personal credentials, and reports actions/triggers shipped, scopes needed, owner setup tasks, blockers/decisions, security concerns, and tests run.
---

# ChainReactV2 Provider / App Integration Builder

For adding a new provider/app integration. The goal is a complete, real, V2-native
integration — not a V1 transplant.

## Guiding principles

- **Port, don't transplant.** Consult V1 (`chainreact-app-9e`) for proven provider
  behavior — OAuth flow, scopes, trigger payloads, action schemas, edge cases — then
  **adapt into V2's boundaries.** If V1's approach is wrong, obsolete, or messy,
  **challenge it and do it right in V2.** Note where you diverged from V1 and why.
- **Research the real API.** When behavior is unclear, verify against the provider's
  current API docs (scopes, endpoints, payload shapes, webhook support). Don't invent
  fields or responses. Document findings in code comments with links.
- **Account-scoped model.** Integrations are owned by `account_id`. Respect the
  Personal/Team/Business model.
- **No co-member personal-credential exposure** — see the security skill.

## V2 integration anatomy (follow this layout)

A provider lives under [`integrations/<provider>/`](../../../integrations/):

| Piece | Location | Purpose |
|---|---|---|
| **Manifest** | `integrations/<provider>/manifest.ts` | Metadata: display, `tokenScope`, `accountIdField`, required OAuth scopes, capability tags. |
| **OAuth** | `integrations/<provider>/oauth.ts` | Authorize/token/refresh flow. |
| **Actions** | `integrations/<provider>/actions/<name>.{ts,meta.ts,schema.ts}` | Handler + metadata + Zod schema. |
| **Triggers** | `integrations/<provider>/triggers/<name>/` | `activate`/`deactivate`/`renew`/`normalize`/`meta`/`configSchema`/`index`. Self-registers at module load. |
| **Option sources** | `integrations/<provider>/options/` | Dynamic field options (lists of channels, folders, etc.). |
| **Webhooks** | `integrations/<provider>/webhooks/` | Inbound receive, signature verify, dedup. |
| **Registry** | [`integrations/_registry.ts`](../../../integrations/_registry.ts) | Add manifest to `ALL_MANIFESTS` + import triggers for side-effect registration. |
| **Credential class** | [`core/integrations/credentialSharing.ts`](../../../core/integrations/credentialSharing.ts) | **MUST** add an entry — `personal` or `account`. Build fails without it (fail-safe = personal). |

## Credential classification (decide explicitly, first)

Before coding, classify the provider in `core/integrations/credentialSharing.ts`:

- **`account`** — shared workspace/store/portal resource (the connection represents the
  org, not a person). Today: slack, notion, stripe, shopify, hubspot, mailchimp.
- **`personal`** — acts as the connecting human (Gmail, Google*, Microsoft*, Dropbox,
  Discord, GitHub, Airtable, Trello, Monday, etc.). **Default if unsure.**

This is NOT the same as `manifest.tokenScope` (`user | workspace`). A `tokenScope: "user"`
provider can still be `account` if it represents a shared business resource (e.g. Stripe).
Get this right — it controls sharing, options access, AI redaction, and offboarding.

## Build order

1. **Research + classify.** Confirm scopes/endpoints/webhook support against current docs;
   audit V1 for the same provider; set the credential class.
2. **Manifest** + register in `_registry.ts` + `credentialSharing.ts` entry.
3. **OAuth** flow (authorize/token/refresh) with the minimum scopes needed.
4. **Actions** (handler + `.meta` + Zod `.schema`) — wrap the principal outbound write in
   the V2 refresh+retry path; no invented fields.
5. **Triggers** (prefer **webhooks over polling** when the API supports them; implement
   activate→create / deactivate→delete lifecycle + renewal; verify signatures + dedup).
6. **Option sources** for dynamic fields.
7. **Apps page visibility** — surface the provider in the Apps UI (real connect flow only;
   no fake controls).
8. **AI visibility** — the agent sees only boolean + redacted flags
   (`connected` / `ownerControlled` / `ownerMustConnect`); never the credential label,
   email, scope, or owner id.

## Tests (Jest, under `tests/`)

- **Manifest/registry:** provider registered; appears in `ALL_MANIFESTS`; has a
  `credentialSharing` entry (`tests/structure` style).
- **Actions/triggers:** handler success + failure shapes; schema validation.
- **Resolver behavior:** personal provider pins to the creator; account provider is
  account-shared; **no co-member fallback**.
- **Option sources:** correct data; non-owner of a personal provider gets
  `NOT_WORKFLOW_OWNER` (no fetch, no label leak).
- **OAuth scopes:** requested scopes match the manifest.
- **e2e / walkthrough** (Playwright under `tests/e2e`) if a user-facing flow warrants it.

Run `npm run typecheck`, `npm run lint`, and the focused `npm test` suites. If the slice
creates a migration, also run `npm run lint:migrations` and apply it to the V2 dev DB with
`npm run db:push` by default (unless Marcus explicitly says not to). `db:push` ≠ git push —
only git push stays forbidden. Local commit. No git push.

## Final report

```
**Provider:** <name>  ·  **Credential class:** personal | account
**Commit:** <hash> (local, not pushed)
**Actions shipped:** <list>
**Triggers shipped:** <list> (webhook | polling, + why)
**OAuth scopes needed:** <list>
**Owner setup tasks (Marcus):** <dev-app registration, redirect URIs, secrets, env vars>
**Blockers / decisions needed:** <list>
**Security concerns:** <credential class rationale, leak surfaces checked, flag state>
**Tests run:** <commands + results>
**V1 divergences:** <where V2 intentionally differs from chainreact-app-9e and why>
**Push status:** Nothing pushed.
```
