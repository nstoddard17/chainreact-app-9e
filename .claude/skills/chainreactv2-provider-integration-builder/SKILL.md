---
name: chainreactv2-provider-integration-builder
description: Use to add or audit a NEW app/provider integration in ChainReactV2 end-to-end, or to run the post-owner-setup live certification (Phase 13) once credentials exist. This skill must research the real provider API, audit V1 behavior, install the provider completely into V2, expose it in Apps + Builder + AI surfaces (including the Apps catalog metadata gate), implement OAuth/API-key/token-ingest auth, actions, triggers, webhooks/polling, option sources, credential-sharing classification, tests, smoke fixtures, and owner setup documentation. "Done" at implementation time means code-complete owner setup required; a provider is live-complete only after Phase 13 verifies the real provider boundary (live OAuth, every action, every trigger lifecycle, event-shape review, cleanup accounting, deploy-gated retest when a live bug was fixed).
---

# ChainReactV2 Provider / App Integration Builder

Use this skill when adding a **new app/provider** to ChainReactV2 or auditing whether an attempted provider install is actually complete.

The goal is a **complete, real, V2-native provider integration** — not a partial runtime stub, not a V1 transplant, not a "coming soon" shell, not an untested manifest entry.

When this skill says the provider is done, Marcus should only need to:

1. Open the owner report.
2. Copy the listed redirect URLs, scopes, webhook URLs, app settings, and Vercel env vars into the provider developer portal / Vercel.
3. Run the documented smoke command or review the already-run smoke results.
4. See exactly what is shipped, blocked, deferred, or requires manual portal setup.

No hidden follow-up work. No fake completion.

---

## Context first

Before changing code:

1. Follow the [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill.
2. Read current project memory and rule docs through MCP.
3. Inspect actual V2 code before editing.
4. Inspect V1 `chainreact-app-9e` before deciding behavior.
5. Research the provider's current public docs when scopes, endpoints, auth, rate limits, webhook support, or payloads are unclear.

Use V1 as a reference for proven product behavior, but do **not** blindly copy V1. V2 architecture and current provider rules win.

---

## Non-negotiable definition of done

A provider is **not done** until all applicable items below are complete or explicitly listed as blocked with proof:

* Provider research completed and documented.
* V1 audit completed and documented.
* Credential class chosen and added to `core/integrations/credentialSharing.ts`.
* Auth flow implemented through the correct V2 dispatcher path.
* Manifest registered and capabilities are honest.
* Apps page can connect the provider through a real flow AND the Apps catalog metadata gate passes (category, description, icon, connectable status, regression + connect-flow tests — see Phase 2).
* Builder metadata exists for every shipped action/trigger.
* AI visibility is available only through safe booleans/redacted flags.
* Every shipped action has handler + schema + metadata + tests + smoke fixture.
* Every shipped trigger has lifecycle + config schema + metadata + tests + smoke path.
* Option sources exist for dynamic fields.
* Webhooks/polling are implemented when shipped and tested through dispatch.
* Owner setup report is committed in docs and includes provider portal + Vercel env instructions.
* Focused tests, typecheck, lint, structure lint, migration lint where applicable, and smoke tests were run.
* Local commit created.
* Nothing pushed unless Marcus explicitly said to push.

If live provider credentials, developer-portal setup, or Vercel env vars are missing, the implementation can still be code-complete, but the final status must say **"code-complete owner setup required"**, not simply "done." A provider only reaches **`live-complete`** after Phase 13 (post-owner-setup live certification) passes against the real provider boundary — see the Status definitions section.

---

## Required deliverables

For provider `<provider>`:

### 1. Research doc

Create or update:

`docs/providers/<provider>/research.md`

Include:

* Provider official docs reviewed.
* Auth type: OAuth code flow, OAuth PKCE, API key, token-ingest, webhook signing, or other.
* Required scopes with exact names.
* Optional scopes considered but rejected.
* Redirect URI format.
* Webhook callback URL format.
* Webhook signing / verification requirements.
* Rate limits and retry guidance.
* Pagination model.
* File/download behavior, if any.
* Known API limitations.
* Links to official docs.
* Date researched.

Do not invent unsupported API behavior. If docs are unclear, say so.

### 2. V1 audit doc

Create or update:

`docs/providers/<provider>/v1-audit.md`

Include:

* V1 files inspected.
* V1 OAuth/auth behavior.
* V1 actions found.
* V1 triggers/webhooks/polling found.
* V1 option/data fetchers found.
* V1 scopes found.
* V1 bugs, deprecated code, duplicate handlers, or orphan files.
* Decision per V1 action/trigger:

  * `port`
  * `rewrite`
  * `skip`
  * `defer`
* Reason for every skip/defer.
* V2 divergences and why they are safer/better.

Registry presence, not file presence, defines what V1 actually shipped. Do not port V1 orphans on file-presence alone.

### 3. Implementation plan doc

Create or update:

`docs/providers/<provider>/implementation-plan.md`

Include:

* Provider ID.
* Display name.
* Credential class: `personal` or `account`.
* Auth flow.
* Actions to ship in this slice.
* Triggers to ship in this slice.
* Option sources needed.
* Webhook/polling model.
* Builder fields needed.
* Smoke-test strategy.
* Owner setup requirements.
* Known blockers.

---

## Credential classification

Before coding, classify the provider in:

`core/integrations/credentialSharing.ts`

Choose explicitly:

* `account` — shared workspace/store/portal/business resource. Examples: Slack workspace, Stripe account, Shopify shop, HubSpot CRM, Mailchimp account.
* `personal` — acts as the connecting human. Examples: Gmail, Google Calendar, Microsoft Outlook, Dropbox, Discord, GitHub, Airtable, Trello, Monday.

Default to `personal` if unsure. Build fails without an entry (fail-safe = personal).

This is **not** the same thing as `manifest.tokenScope`. A `tokenScope: "user"` provider can still be account-controlled if the external resource is a shared business account.

This classification controls sharing, team visibility, option-source access, AI redaction, workflow run permissions, and offboarding behavior.

---

## V2 integration anatomy

Provider code lives under:

`integrations/<provider>/`

Expected pieces:

| Piece               | Location                                                                 | Required when                               |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Manifest            | `integrations/<provider>/manifest.ts`                                    | Always                                      |
| UI metadata         | `integrations/<provider>/ui.ts` or existing provider UI metadata pattern | Always, if Apps/Builder surface reads it    |
| OAuth               | `integrations/<provider>/oauth.ts`                                       | OAuth providers                             |
| Token-ingest auth   | `integrations/<provider>/auth.ts`                                        | Fragment/token-ingest providers             |
| Client/API wrappers | `integrations/<provider>/api/` or `client.ts`                            | Any provider API call                       |
| Actions             | `integrations/<provider>/actions/<name>.{ts,meta.ts,schema.ts}`          | Every shipped action                        |
| Triggers            | `integrations/<provider>/triggers/<name>/`                               | Every shipped trigger                       |
| Option sources      | `integrations/<provider>/options/`                                       | Dynamic fields                              |
| Webhooks            | `integrations/<provider>/webhooks/receive.ts`, `normalize.ts`            | Webhook triggers/system webhooks            |
| Registry            | `integrations/_registry.ts` and relevant action/trigger registries       | Always                                      |
| Credential class    | `core/integrations/credentialSharing.ts`                                 | Always                                      |
| Smoke fixtures      | `tests/smoke-actions/` and/or trigger smoke harness                      | Every shipped action/trigger where possible |

Do not add provider definitions outside the provider folder except for required registries/shared framework hooks.

---

## Build order

### Phase 0 — Preflight

* Confirm provider does not already exist under another ID.
* Confirm no duplicate/incomplete provider folder exists.
* Confirm stable provider ID naming.
* Check current branch and git status.
* Do not overwrite other sessions' work.
* Do not push.

### Phase 1 — Research + V1 audit

* Read official provider docs.
* Audit V1.
* Decide auth flow.
* Decide credential class.
* Decide action/trigger scope.
* Write research + V1 audit + plan docs before major coding.

### Phase 2 — Manifest + registry + UI visibility

Implement:

* `manifest.ts`
* provider UI metadata
* `_registry.ts` import (add manifest to `ALL_MANIFESTS` + import triggers for side-effect registration)
* action/trigger side-effect imports where needed
* `credentialSharing.ts` entry
* Apps-page listing
* Builder visibility metadata

Manifest capabilities must be honest:

* `actions: true` only after real action handlers are registered.
* `webhookTrigger: true` only after real webhook trigger lifecycle is registered.
* `pollingTrigger: true` only after real polling trigger lifecycle is registered.
* No "coming soon" fake availability.

**Apps catalog metadata gate.** Every net-new provider must be fully represented in the Apps catalog, not just technically connectable:

* explicit category,
* non-empty description,
* icon,
* connectable status derived from real manifest/auth capability,
* regression test proving every registered provider has category + description,
* client-flow test proving clicking Connect uses the generic OAuth/token-ingest connect path and surfaces errors visibly.

A provider card rendering under "Other" with blank copy is not acceptable for a finished provider. (Asana trial: this gap shipped in the first slice and needed a follow-up fix commit.)

### Phase 3 — Auth

Implement the correct auth path:

* OAuth providers use `services/oauth/dispatcher.ts` + `integrations/<provider>/oauth.ts`.
* Token-ingest providers use the token-ingest contract, generic ingest route/page, and provider `auth.ts`.
* API-key providers use the existing secure credential storage pattern or design a documented extension if none exists.

Required:

* Minimum scopes only.
* Refresh behavior implemented if provider supports refresh tokens.
* Non-refreshable providers must fail clearly on 401 and surface reconnect/action-required behavior.
* Tokens/secrets encrypted before storage.
* No plaintext token logging.
* Redirect URI uses the canonical app URL pattern.
* Owner report lists all dev-portal auth settings.
* Before testing OAuth against a real provider app, run the **environment alignment gate** (Phase 13) — a local app sending users to a provider whose registered callback points at production is the classic misdiagnosis trap.

### Phase 4 — API wrappers

Build typed, narrow API wrappers.

Rules:

* One provider endpoint per action/helper.
* No generic `make_api_call`.
* No raw method/path/body escape hatch.
* Bounded outputs.
* No raw provider response spreading.
* Pagination returns one page with `nextCursor` / `hasMore` unless there is a documented reason otherwise.
* Provider URLs, paging links, tokens, and secrets never become workflow variables.
* File outputs use `FileRef`, never bytes/base64/content.

### Phase 5 — Actions

For each shipped action:

* `action.ts` handler.
* `.schema.ts` with `.strict()`.
* `.meta.ts` for builder/AI metadata.
* Registry entry.
* Typed output schema if the repo uses one.
* `refreshAndRetry` (V2 refresh+retry path) around provider calls that can 401.
* Humanized, engine-classifiable errors.
* Unit tests:

  * success
  * schema rejection
  * missing dependency / disconnected integration
  * 401/403 where relevant
  * 429/rate limit where relevant
  * provider 5xx/timeout where relevant
  * no token/secret leakage
  * bounded output shape
* Smoke fixture.

High-risk or recipient-visible fields must be explicit. Do not add hidden defaults for behavior-switching fields.

### Phase 6 — Triggers

Prefer webhooks over polling when the provider supports reliable webhooks.

For each shipped trigger:

* `configSchema`.
* `meta`.
* `activate`.
* `deactivate`.
* `renew` if provider subscriptions expire.
* `normalize`.
* `index` registration.
* Builder metadata.
* Option sources for dynamic config.
* Tests:

  * activation success
  * activation rollback/failure
  * deactivation success/best effort
  * renewal where applicable
  * disabled/paused workflow drops event
  * duplicate delivery dedup
  * wrong signature rejected
  * event normalization shape
  * short-form `eventType` matches trigger registration
  * no token/PII leakage in event id/logs

Polling triggers must baseline on activation and fire zero events on the first post-activation poll. Do not swallow baseline seed failures.

Webhook triggers must verify signatures. Do not trust Cloudflare, Vercel, or route secrecy as a substitute.

### Phase 7 — Option sources

For every dynamic field:

* Implement option source.
* Use typed provider API wrapper.
* Respect credential class:

  * personal providers pin options to the creator / allowed actor.
  * account providers are account-shared.
  * no co-member personal credential fallback.
* Return redacted, user-safe labels.
* Test:

  * owner/allowed user can fetch
  * non-owner on personal provider gets safe denial (`NOT_WORKFLOW_OWNER` — no fetch, no label leak)
  * no credential label or owner ID leak
  * provider failure surfaces a usable error

### Phase 8 — Apps page + Builder + AI visibility

Install the provider in all real product surfaces:

* Apps page shows provider and real connect state.
* Connect button hits real auth route.
* Connected state is backed by integration data, not fake UI flags.
* Builder node library shows every shipped action/trigger.
* Builder config renders all required fields and option sources.
* AI/React Agent visibility uses safe redacted capability state:

  * `connected`
  * `ownerControlled`
  * `ownerMustConnect`
  * `availableActions`
  * `availableTriggers`
* AI never sees tokens, scopes, credential labels, owner IDs, provider account IDs, or external emails unless an existing safe display contract explicitly allows it.

### Phase 9 — Smoke tests

Every shipped action and trigger needs a smoke path.

Add/update:

* `tests/smoke-actions/fixtures.ts` (or the repo's current fixture pattern under `tests/smoke-actions/`)
* trigger smoke fixture/harness under `tests/integration/trigger-smoke/` if available
* docs/runbooks action-smoke references if the provider introduces a new pattern

Smoke must exercise the real V2 action/trigger handler path and mock only the external provider boundary unless Marcus has provided live credentials and asked for live-provider testing.

For every shipped action, smoke report must include:

* fixture name
* command run
* result
* mocked/live boundary
* any skipped fields and why

For every shipped trigger, smoke report must include:

* activation path tested
* event injection method
* dispatch/run enqueue verified
* dedup verified where applicable
* disabled/paused drop verified where applicable

If a trigger cannot be smoke-tested with the current harness, that is a blocker or explicit limitation in the final report — not silent completion.

### Phase 10 — Owner setup report

Create:

`docs/providers/<provider>/owner-setup-report.md`

This is the report Marcus should open after the work is done.

It must include:

```md
# <Provider> Owner Setup Report

## Status
- Code status:
- Commit:
- Push status:
- Smoke status:
- Remaining owner action:

## Provider developer portal setup

### App/basic settings
- App name:
- App type:
- Website URL:
- Privacy policy URL:
- Terms URL:
- Support email:
- Logo/icon requirements:
- Notes:

### Redirect URIs
- Local:
- Preview/Vercel:
- Production:
- Exact callback path:

### Webhook URLs
- Local:
- Preview/Vercel:
- Production:
- Events to subscribe to:
- Signature secret location:
- Verification/challenge notes:

### OAuth scopes
| Scope | Required? | Used by | Why |
|---|---:|---|---|

### Provider-specific settings
- Token rotation:
- PKCE:
- Webhook signing:
- Event subscriptions:
- Bot/user install choice:
- Marketplace/review steps:
- Test-user requirements:
- Rate-limit notes:

## Vercel environment variables

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|

## Supabase / database setup
- Migrations added:
- db:push run:
- RLS/policy notes:
- Storage bucket notes:
- Cron notes:

## Actions shipped
| Action | Handler | Schema | Metadata | Options | Unit tests | Smoke |
|---|---|---|---|---|---|---|

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Unit tests | Smoke |
|---|---|---|---|---|---|

## Manual verification checklist for Marcus
- [ ] Create/update provider developer app.
- [ ] Add redirect URIs.
- [ ] Add webhook URL(s).
- [ ] Add required scopes.
- [ ] Add env vars to Vercel.
- [ ] Redeploy after env changes.
- [ ] Connect provider from Apps page.
- [ ] Run listed smoke/manual workflow.
- [ ] Confirm provider-side event/action result.

## Known blockers / limitations
- None, or list with exact owner.
```

No secrets or actual env values belong in this doc. Use env var names only.

### Phase 11 — Tests and verification

Run the focused tests first, then full gates as appropriate.

Minimum commands unless clearly inapplicable:

```bash
npm run typecheck
npm run lint
npm run lint:structure
npm test
```

If migrations were added:

```bash
npm run lint:migrations
npm run db:push
```

`db:push` is allowed by default unless Marcus explicitly says not to. `db:push` is not git push.

Smoke (use the real scripts from `package.json`):

```bash
npm run smoke:actions          # smoke CLI (npm run chainreact -- smoke actions)
npm run smoke:actions:run      # jest smoke suites (tests/integration|unit/smoke-actions)
# trigger smoke, provider-dependent:
#   npm run smoke:triggers:webhook
#   npm run smoke:triggers:scheduled
#   provider-specific: smoke:triggers:excel / :onenote / etc.
```

For E2E/provider-mock specs:

```bash
npx playwright test <relevant-spec> --workers=1
```

Do not claim a test ran unless it actually ran. If a test was not run, say exactly why.

### Phase 12 — Documentation and local commit

Update docs in the same batch when the provider introduces or changes:

* provider pattern
* auth pattern
* action pattern
* trigger pattern
* smoke pattern
* env/deploy/ops setup
* shared helper
* file-output behavior
* token-ingest behavior
* webhook behavior

Then commit locally.

Do not push, open PRs, deploy, or change production posture unless Marcus explicitly says to.

### Phase 13 — Live provider completion (post-owner-setup)

If live credentials, developer app setup, Vercel env vars, marketplace approval, or callback URLs are missing at implementation time, the initial status is `code-complete owner setup required`. After Marcus completes owner setup, run this phase. It verifies the **real provider boundary**, not only mocked/synthetic tests. (Established by the Asana trial, 2026-07-04.)

#### Environment alignment gate

Before testing OAuth or live webhooks, confirm the environment under test is actually the environment receiving callbacks. Check and report:

* The provider commit is present in the environment being tested. For production/Vercel, verify the deployed commit contains the provider. Do not assume local code exists in production.
* `NEXT_PUBLIC_APP_URL` points to the environment being tested.
* The provider developer portal has the matching redirect URI registered.
* Vercel env vars are set in the same scope being tested: Local, Preview, or Production.
* If testing locally, restart the dev server after adding `.env.local` vars.
* If the provider requires HTTPS callbacks, use a tunnel and set `NEXT_PUBLIC_APP_URL` to the tunnel origin.
* The callback URL in the provider portal must match the environment: local/tunnel → local dev server; preview URL → preview deployment; production URL → deployed production commit.

Do not misdiagnose a callback failure until this is checked. The classic failure mode is `local app → provider OAuth → production callback`: if production does not contain the provider commit, the callback fails with errors like "No OAuth implementation registered for provider" even though local code is correct.

A pattern that works when local can't receive provider callbacks (proven on Asana): drive activation from the local repo with `NEXT_PUBLIC_APP_URL` pointing at the deployed app (shared Supabase), so handshakes and events land on the deployed route while orchestration stays local.

#### Live OAuth

* Connect from the deployed or intended test environment.
* Confirm the integration row is created.
* Confirm the token refresh path works if the provider issues short-lived access tokens.
* Confirm the credential class behavior still holds with the live integration.

#### Live actions

Run every shipped action through the real V2 execution path with `testMode=false`. For each action record: workflow/action name, input used, provider-side result, ChainReact run result, independent read-back when possible, cleanup result, and any artifact left behind when cleanup is impossible.

#### Live triggers

Run every shipped trigger against the real provider webhook/polling lifecycle. For webhook triggers, prove:

* activation creates the provider webhook/subscription,
* the provider handshake succeeds,
* webhook secret/signature verification works against real provider deliveries,
* a real provider event enqueues/runs the correct workflow,
* one provider event creates the intended number of runs,
* server-side filters prevent cross-resource fan-out where practical,
* dedup behavior is correct,
* disabled/paused drops are covered by unit/integration tests and live-tested where practical,
* deactivation deletes/unregisters the provider webhook,
* cleanup is verified — ideally a second delete/read returning provider-side not-found.

If live redelivery or wrong-resource testing is not practical, state why and cite the unit/synthetic coverage that protects it.

#### Live option sources

Verify live: the top-level list, cascades, labels are safe/redacted, no co-member personal credential fallback, and provider errors are sanitized.

#### Live-provider event-shape review

Real provider events may differ from docs or synthetic tests. During live trigger certification:

* Save sanitized examples of observed event shapes in `docs/providers/<provider>/research.md`.
* Look for duplicate deliveries, parent/resource fan-out, batched payloads, timestamp variance, and missing fields.
* Review dedup key design using live payloads. Dedup keys should use stable semantic identity: provider, trigger event type, resource scope, durable provider entity id.
* Do not include volatile timestamps in dedup keys unless the timestamp is part of the provider's true unique event identity. (Asana: one task creation emits `task+added` once per parent — project and section — milliseconds apart; a timestamp-bearing key double-fired the workflow.)
* If the provider emits multiple events for one user-visible action, decide whether the workflow should fire once or multiple times and test that decision.

#### Live cleanup accounting

Every live smoke report must include cleanup accounting: test tasks/items/records/messages/files created; test comments/events/webhooks created; what was cleaned; what remains; why anything remains; whether remaining artifacts are harmless; provider-side cleanup proof where available. If the provider has no delete action, prefer harmless cleanup (complete/archive the test item) and document the artifact.

#### Deploy-gated retest

If live testing finds a production bug and the fix is committed locally, the provider is **not fully complete** until the fix is deployed and retested. Use status `complete with follow-ups (deploy-gated retest)` and the report must include: the local fix commit, whether production still has the old behavior, the exact retest command, the exact expected result, and what remains unsafe or incomplete until deploy. Do not say production is fixed until the commit is pushed/deployed and the live retest passes.

---

## Security rules

* Never log tokens, refresh tokens, auth codes, signing secrets, API keys, provider secrets, or raw webhook bodies containing user data.
* Never expose co-member personal credentials.
* Never use service-role on a user-triggered path without explicit reason and existing service-role boundary.
* Never store plaintext OAuth/API tokens.
* Never put secrets in owner setup docs.
* Webhooks require provider signature verification.
* Option sources must not leak credential labels/owner IDs for personal providers.
* File outputs must use `FileRef`; no bytes/base64/content in workflow outputs.
* Provider event IDs used for dedup must be stable and not raw PII when avoidable.
* Capability flags must be honest.

---

## Blocker policy

Stop and report before coding if:

* Provider requires paid/API approval that blocks basic implementation.
* Provider docs do not expose required endpoints.
* Provider only supports unsafe auth without a V2 contract.
* Required scopes would be too broad for the action/trigger set.
* Webhooks require a public URL or manual verification that cannot be mocked/tested locally.
* Required V2 infrastructure does not exist.
* The provider would require a new cross-cutting pattern.

Continue coding with explicit limitation if:

* Developer portal setup is manual but code can be implemented.
* Live credentials are missing but mocked external-boundary tests can prove V2 behavior.
* Marketplace approval is needed only after implementation.
* A live provider smoke must be done by Marcus after env setup.

---

## Final report format

The final response must use this format:

```md
## Provider integration closeout — <Provider>

**Provider:** <provider>
**Credential class:** personal | account
**Auth flow:** OAuth | PKCE OAuth | token-ingest | API key | other
**Commit:** <hash> (local, not pushed)
**Status:** live-complete | code-complete owner setup required | complete with follow-ups (deploy-gated retest) | blocked | partial

### What shipped
- Actions:
- Triggers:
- Option sources:
- Apps page:
- Builder:
- AI visibility:
- Webhooks/polling:

### Owner setup tasks for Marcus
- Provider portal:
- Redirect URIs:
- Webhook URLs:
- Scopes:
- Vercel env vars:
- Other:

### Smoke results
| Surface | Name | Command | Result |
|---|---|---|---|

### Tests run
| Command | Result |
|---|---|

### Security notes
- Credential class rationale:
- Token/secrets handling:
- Co-member personal credential exposure checked:
- Webhook signature/dedup checked:
- File output checked:

### V1 audit / divergences
- V1 files inspected:
- Behavior preserved:
- Behavior changed:
- Behavior skipped/deferred:

### Blockers / limitations
- None, or list exact remaining owner/action.

### Docs created/updated
- Research:
- V1 audit:
- Implementation plan:
- Owner setup report:
- Other:

### Push status
Nothing pushed.
```

A provider is not "100% finished" unless the report has no hidden implementation work left. If only Marcus's provider-portal/Vercel setup remains, say **"code-complete; owner setup required"** and list every remaining external setup item exactly.

---

## Live completion report format (Phase 13)

After owner setup and the live certification phase, use this report:

```md
## <Provider> live completion closeout

**Provider:** <provider>
**Status:** complete | complete with follow-ups | blocked
**Environment tested:** local | preview | production
**Provider boundary:** mocked | live
**Commit:** <hash>
**Push status:** Nothing pushed | pushed by Marcus approval

### OAuth
-

### Live actions verified
| Action | Result | Evidence / notes |
|---|---|---|

### Live triggers verified
| Trigger | Result | Evidence / notes |
|---|---|---|

### Option sources verified
| Option source | Result | Notes |
|---|---|---|

### Live quirks discovered
-

### Bugs found/fixed
-

### Cleanup
-

### Docs updated
-

### Tests/commands run
| Command | Result |
|---|---|

### Deploy-gated retests
-

### Remaining owner actions
-
```

---

## Status definitions

Use these terms consistently:

* `code-complete owner setup required` — implementation is complete, but provider dashboard/env/live credentials are not ready.
* `live-complete` — owner setup is done and real provider actions/triggers passed.
* `complete with follow-ups (deploy-gated retest)` — live provider bug was found and fixed locally, but production needs deploy + retest.
* `blocked` — provider cannot be completed without external approval, missing API capability, unsafe auth, or missing V2 infrastructure.
