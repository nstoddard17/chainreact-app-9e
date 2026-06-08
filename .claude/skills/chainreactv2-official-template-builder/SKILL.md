---
name: chainreactv2-official-template-builder
description: Use whenever Marcus asks to add official ChainReact workflow templates, seed marketplace templates, build template definitions, or expand the official template catalog in ChainReactV2. Enforces inspecting the real provider/action/trigger metadata first, building ONLY on supported provider/action/trigger ids (never invented), reusing the export sanitizer so templates stay schema-only and credential-free, minting templates as platform-owned `source='official'` (ChainReact badge, marketplace-visible, usable via the use-template route), and proving via tests that no token/secret/email/provider-label/account-id/user-id/Stripe-id ever appears. Local-only commit, no push.
---

# ChainReactV2 Official Template Builder

For adding **official, ChainReact-made** workflow templates to the marketplace. The
deliverable is one or more `source='official'` template rows whose definition is a
real, supported, **credential-free** workflow graph — plus tests proving no secrets or
unsupported fields leak. This skill exists so the template rules don't have to be
re-explained every time the catalog grows.

This skill inherits all of [`chainreactv2-local-slice-executor`](../chainreactv2-local-slice-executor/SKILL.md)
(local-only, inspect-before-change, reuse-before-add, real-backend-only) and the no-leak
defaults of [`chainreactv2-security-review`](../chainreactv2-security-review/SKILL.md).
When `CLAUDE.md` or an explicit Marcus instruction conflicts with this skill, they win.

---

## Verified current state (read these before you write anything)

The templates marketplace + portability arc is **already shipped** (closeout:
[workflow-templates-marketplace-closeout.md](../../../docs/slices/phase-4/workflows/workflow-templates-marketplace-closeout.md)).
The table, repository, services, routes, and Templates UI exist; **only the official seed
catalog is missing** (closeout §13 / "Recommended next tracks" #1). So adding officials is
mostly *content* on top of a real spine — not new infrastructure.

| Concern | Source of truth | What it gives you |
|---|---|---|
| **Provider ids** | [integrations/_registry.ts](../../../integrations/_registry.ts) — `listProviders()` / `getProvider(id)` / `PROVIDERS` | The 26 real providers + `native`. An id not here does not exist. |
| **Action / trigger metadata** | [services/discovery/_registry.ts](../../../services/discovery/_registry.ts) — `listAllActionMetas()`, `listAllTriggerMetas()`, `listActionMetasForProvider(p)`, `listTriggerMetasForProvider(p)`, `getActionMeta(key)`, `getTriggerMeta(key)` | The real `provider:type` keys, their config `fields[]`, required-ness, and `optionsSource`. This is the catalog the AI/builder use — it never invents nodes. |
| **Runtime action handlers** | [services/execution/handlers/_registry.ts](../../../services/execution/handlers/_registry.ts) — `getActionHandler(provider, type)`, `listRegisteredHandlers()` | Confirms a `(provider, type)` action actually has an executable handler. |
| **Node / edge shape + graph invariants** | [contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) — `WorkflowDefinitionSchema` | Node = `{id, kind:'trigger'\|'action', provider, type, config, position, displayName?}`; edge = `{id, from, to, label?}`. **≤1 trigger; edge endpoints must exist; no self-loops; no duplicate (from,to,label) edges.** |
| **Template definition shape (strict whitelist)** | [contracts/workflowTemplate.ts](../../../contracts/workflowTemplate.ts) — `TemplateDefinitionSchema`, `TemplateNodeSchema`, `TemplateEdgeSchema` (all `.strict()`) | The stored `definition`. Strict → any extra field (a leaked owner id, etc.) is **rejected**, not silently kept. `TemplateSource = user\|official`; `TemplateVisibility = private\|public\|unlisted`. |
| **The sanitizer (no-leak engine)** | [services/workflows/exportWorkflow.ts](../../../services/workflows/exportWorkflow.ts) — `sanitizeWorkflowDefinitionForExport`, `EXPORT_SCHEMA_VERSION` (=1), `REDACTION_MARKER` (`"__REDACTED__"`), `SENSITIVE_KEY_RE`, `EMAIL_RE`, `TOKEN_RE` | Redacts secrets/emails/labels/owner-ids to `__REDACTED__`, whitelists node/edge fields. **Reuse it — never write new redaction.** |
| **Create-from-workflow (user templates)** | [services/workflows/createTemplateFromWorkflow.ts](../../../services/workflows/createTemplateFromWorkflow.ts) — `buildSanitizedTemplateDefinition`, `createTemplateFromWorkflow` | The only supported way to mint a `source='user'` template; always sanitizes. Reuse `buildSanitizedTemplateDefinition` if you are templating from a real workflow record. |
| **Repository (the only official-minting path)** | [repositories/workflowTemplates.ts](../../../repositories/workflowTemplates.ts) — `createTemplateServiceRole({ accountId: null, source: 'official', ... })` | Service-role only. **Official ⇒ `account_id` must be NULL** (DB CHECK invariant). `authenticated` has no write GRANT, so a client can never mint an official. |
| **Marketplace listing** | `listMarketplaceTemplatesServiceRole()` in the repo (`.or("source.eq.official,visibility.eq.public")`) + [app/api/workflow-templates/marketplace/route.ts](../../../app/api/workflow-templates/marketplace/route.ts) | Officials are **always** listed (regardless of `visibility`). DTO is `MarketplaceTemplateSummary` — **omits `accountId` + `createdByUserId`**, exposes `isOfficial = source==='official'`. |
| **Use-template route** | [app/api/workflow-templates/[templateId]/use/route.ts](../../../app/api/workflow-templates/[templateId]/use/route.ts) → `createWorkflowFromTemplate` in [services/workflows/templateManagement.ts](../../../services/workflows/templateManagement.ts) | Officials are usable by any authed user; the new workflow gets the sanitized definition (with `__REDACTED__` markers → user reconnects). Validates the graph against `WorkflowDefinitionSchema` — a bad official → `INVALID_TEMPLATE` 422. |
| **Feature flag** | [services/workflows/portabilityFlags.ts](../../../services/workflows/portabilityFlags.ts) — `isWorkflowTemplatesEnabled()` (`ENABLE_WORKFLOW_TEMPLATES`, default OFF) | Whole template surface is dark in prod until flipped. Routes 404 when off; the `/templates` page shows coming-soon. |
| **Official badge / attribution** | [features/templates/TemplateBadges.tsx](../../../features/templates/TemplateBadges.tsx), [features/templates/TemplateCard.tsx](../../../features/templates/TemplateCard.tsx) | `isOfficial` → the ChainReact `OfficialBadge`. Don't add UI unless asked — the badge already keys off `source`. |

> **There is no official-minting service or seed catalog today.** `createTemplateFromWorkflow`
> always sets `source='user'` and uses the workflow's `accountId`. The ONLY way to create an
> official is the service-role `createTemplateServiceRole({ accountId: null, source: 'official' })`.
> So seeding officials is a **server-side seed** (a migration `INSERT`, or a one-off script under
> `scripts/` that calls the repo) — never a client/route action.

---

## Official template rules

- Official templates are **app-made / ChainReact-made** → `source = 'official'`, `account_id = NULL`
  (DB CHECK enforces the pair).
- They show the **ChainReact official badge** (`isOfficial` drives `OfficialBadge` — already wired).
- They are **marketplace-visible** unconditionally (listed via `source.eq.official`), so their
  `visibility` is effectively informational; set it to `public` for clarity.
- They are **usable** through the existing `POST /api/workflow-templates/[templateId]/use` route.
- They are **schema-only** — the `definition` is a sanitized `TemplateDefinition`, nothing else.
- They carry **no credentials or connected-account details** of any kind.
- They **do not depend on a specific user / account / integration row** — no real `account_id`,
  `created_by_user_id` (provenance is fine to be `null`), integration id, or node-credential grant.
- They **preserve `__REDACTED__` markers** wherever a value must be reconnected/reselected at
  use-time (that is how the use flow prompts the user to wire their own credentials).
- A safe `creator_display_name_snapshot` (e.g. `"ChainReact"`) is fine; **never** an email or user id.

---

## Provider / action / trigger validation rules (non-negotiable)

1. **Inspect the real metadata FIRST.** Before writing a single node, enumerate the actual
   provider ids (`listProviders()`) and the real `provider:type` keys + their config fields
   (`listActionMetasForProvider` / `listTriggerMetasForProvider`, or `getActionMeta(key)` /
   `getTriggerMeta(key)`). The config keys you set must be the metadata's declared field
   `name`s — not a `displayName`, UI `label`, or guessed key.
2. **Never invent** provider ids, action/trigger `type`s, config field names, enum option
   values, or node shapes. If it isn't in the registry/metadata, it does not exist.
3. **If a requested template depends on unsupported metadata, STOP and report** the missing
   provider/action/trigger — do not fabricate it to make the template "work."
4. **Use the `native` provider** (`native:manual.run`, `native:schedule.fired`, plus native
   actions like `delay`, `http_request`, `if_then_condition`, `router`, `format_transformer`)
   when real provider metadata is insufficient to express the idea. A real native/manual/
   scheduled template beats a fake provider-rich one.
5. **Prefer a smaller real template over a fake impressive one.** Two real nodes that work >
   six nodes referencing actions that don't exist.
6. **If app/provider support is genuinely incomplete for the idea, recommend a provider
   metadata slice first** (point at the
   [chainreactv2-provider-integration-builder](../chainreactv2-provider-integration-builder/SKILL.md)
   skill) instead of forcing the template.

---

## Template creation workflow

1. **Identify the template idea + the intended user value.** One sentence of who it's for and
   what it does.
2. **Verify every provider / action / trigger id exists** against the registries above. List
   each `provider:type` you intend to use and confirm it via `getActionMeta` / `getTriggerMeta`.
   For actions, also confirm a handler exists (`getActionHandler`).
3. **Verify the graph shape is valid** against `WorkflowDefinitionSchema`: at most one trigger,
   every edge endpoint references a real node id, no self-loops, no duplicate edges. Set sane
   `position` coordinates so it lays out reasonably in the builder.
4. **Build the sanitized schema.** Construct the `TemplateDefinition` and run it through
   `sanitizeWorkflowDefinitionForExport` **and** `TemplateDefinitionSchema.parse(...)` (belt +
   braces). Put `__REDACTED__` wherever a credential/account/resource must be reselected. Never
   embed a real token, email, channel/account label, or id.
5. **Set official / source metadata correctly:** `source: 'official'`, `accountId: null`,
   `schemaVersion: EXPORT_SCHEMA_VERSION`, `visibility: 'public'`,
   `creatorDisplayNameSnapshot: 'ChainReact'` (or null). `createdByUserId` null.
6. **Add a marketplace-safe title + description** — descriptive, no PII, no internal ids.
7. **Add tests** (see below).
8. **Run the required verification** (`npm run typecheck`; the focused `npm test` suite; if you
   add a migration, `npm run lint:migrations` then `npm run db:push`; `npm run lint:structure` if
   you add/move files).
9. **Commit locally** with a clear `type(scope): summary (SLICE-MARKER)` message. **No push.**
10. **Report honestly** in the format below.

### Tests to add

- The official `definition` **validates** against `TemplateDefinitionSchema` (and against
  `WorkflowDefinitionSchema`, since the use route re-validates it — a definition that fails
  there yields `INVALID_TEMPLATE`).
- The use-template path can create a workflow from the official (if you wire/seed it reachably).
- The official **appears in the marketplace listing** (`listMarketplaceTemplatesServiceRole`
  returns it; `isOfficial === true`).
- The **official badge DTO behavior** holds: `MarketplaceTemplateSummary.isOfficial === true`
  and the DTO carries **no** `accountId` / `createdByUserId`.
- **No-leak assertion:** the serialized definition + every DTO contains **no** token / secret /
  email / provider account label / integration id / user id / `created_by_user_id` /
  `connected_by_user_id` / Stripe-or-customer-or-subscription id. See
  [checklist.md](./checklist.md).

---

## No-leak checklist (must all hold for every official template + every response)

Run the full list in [checklist.md](./checklist.md). Summary — the definition and any DTO must
contain **none** of:

- OAuth token · refresh token · API key · webhook signing secret
- provider account label · provider account email
- integration id · credential-owner user id · `connected_by_user_id` · `workflow_node_credentials` data
- Stripe / customer / subscription id
- private account / member data · real `account_id` · `created_by_user_id`

The mechanism that guarantees this is **reuse of `sanitizeWorkflowDefinitionForExport` + the
strict `TemplateDefinitionSchema` + the `MarketplaceTemplateSummary` projection that omits
`accountId`/`createdByUserId`** — do not re-implement any of it.

---

## Recommended report format

```
**Commit:** <hash> (local, not pushed)
**Files changed:** <list, grouped by area>
**Official templates added:** <names + provider:type keys used>
**Provider/action/trigger metadata verified:** <which registries inspected; each id confirmed real>
**Template schema behavior:** <validates against TemplateDefinition + WorkflowDefinition>
**Marketplace / official badge behavior:** <listed; isOfficial true; DTO omits account/user ids>
**Use-template behavior:** <can instantiate a workflow; __REDACTED__ → reconnect>
**No-leak verification:** <which checklist items asserted in tests>
**Tests / verification run:** <exact commands + results>
**Invented providers/actions:** <confirm NONE were invented>
**Push status:** Nothing pushed.
```

---

## Hard boundaries

- **Do not create fake provider / action / trigger ids**, config fields, enum values, or node shapes.
- **Do not add credentials** or any connected-account detail to a template.
- **Do not add UI** unless Marcus asks (the official badge is already wired off `source`).
- **Do not add rewards / moderation / import** unless asked (deferred per the closeout).
- **Do not `git push`.** Local commit only.
- **If you create a migration**, run `npm run lint:migrations` + the RLS/GRANT review, then
  `npm run db:push` by default (per the repo's standing rule — `db:push` ≠ git push).
- Officials are minted **service-role only** (`accountId: null, source: 'official'`) — never via a
  client route. A client minting an official is a bug.

See [checklist.md](./checklist.md) for the pre-commit gate.
