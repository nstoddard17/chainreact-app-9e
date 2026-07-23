---
name: chainreactv2-provider-integration-builder
description: Use to add or audit a NEW app/provider integration in ChainReactV2 end-to-end, or to run the post-owner-setup live certification (the "Phase 13" live pass) once credentials exist. This skill researches the provider's real repetitive-task use cases (not just its API), audits existing V2 patterns, and installs the provider completely into V2 — auth, typed actions, triggers/webhooks/polling, builder metadata, provider resource discovery + option resolvers, Setup/Advanced configuration UX, at-a-glance node summaries, credential-sharing classification, runtime + builder + resolver tests, smoke fixtures, and owner setup documentation. A provider is NOT complete when its actions merely execute: every shipped node must be configurable by an ordinary business user, with no provider docs, wire formats, or internal identifiers required on the normal Setup path. Builder usability, option resolvers, and configuration design are in-scope implementation work and must never be deferred to an unspecified follow-up. Implementation-time "done" means code-complete owner setup required; live-complete requires the live certification phase. Supports TWO provider paths: (1) native providers (hand-written API wrappers), and (2) MCP-backed catalog providers — a Marcus-selected, personally-reviewed official/trusted vendor MCP server whose certified tools are compiled into ordinary V2 artifacts (schemas, ActionMeta, handlers, resolvers) via scripts/mcp-import + core/mcpCompile, proven by the Linear arc; identical product/Rule-17/security bar, gated write-evidence, bounded structured outputs, drift/certification, and isExperimental-until-certified. Distinct from the future Customer Custom MCP feature (customer-supplied servers) — do not conflate.
---

# ChainReactV2 Provider / App Integration Builder

Use this skill when adding a **new app/provider** to ChainReactV2, or auditing whether an attempted provider install is actually complete.

The goal is a **complete, real, V2-native, user-configurable provider integration** — not a partial runtime stub, not a "coming soon" shell, not an untested manifest entry, and **not a set of working handlers wrapped in an API-shaped config form**.

When this skill says the provider is done, Marcus should only need to:

1. Open the owner report.
2. Copy the listed redirect URLs, scopes, webhook URLs, app settings, and Vercel env vars into the provider developer portal / Vercel.
3. Run the documented smoke command or review the already-run smoke results.
4. See exactly what is shipped, blocked, deferred, or requires manual portal setup.

No hidden follow-up work. No fake completion. **No "the builder UX comes later."**

---

## Product north star — read this before anything else

**ChainReact is an automation product, not an API request builder.**

A provider is not complete because its actions and triggers execute. Every shipped action and trigger must also be ready for an **ordinary business user** to configure as a **repeatable task**.

Each node is designed around the repetitive business task the user is automating. A normal user must be able to understand, at a glance:

* what causes the trigger to fire,
* what the action will do,
* which recognizable business resource it will use,
* which values stay fixed on every run,
* which values come from earlier workflow steps,
* what still needs to be configured,
* what will happen each time the workflow repeats.

The normal Setup path must **not** require knowledge of: provider APIs · provider documentation · internal provider identifiers · request wire formats · serialization formats · developer terminology · provider-specific query languages · raw payload structures · technical values ChainReact can safely derive.

Power-user controls remain available in **Advanced**. The goal is **progressive disclosure, not capability removal**.

### The deferral ban (the failure this skill exists to prevent)

Builder usability, option resolvers, and configuration redesign are **provider implementation work**. When they are required for the common path, they ship in the **same provider implementation**.

It is **not acceptable** to declare a provider finished with a note like "dynamic pickers to follow", "resolver deferred", or "config polish tracked separately" when a central field is a raw identifier text box. A missing resolver is **implementation work, not a deferral reason** — even when it requires new provider API wrappers, routes, services, search, pagination, or UI.

If such work is genuinely incomplete, the provider is reported **partially complete with the blocker named** — never re-labelled as a future enhancement.

---

## Two provider paths (decide up front)

A new app is added by ONE of two paths.

1. **Native provider** — ChainReact hand-writes an API wrapper per endpoint (auth, typed action handlers, triggers, option resolvers). This is the default; **Phases 0–19 below describe it.** Use it when there is no official/trusted vendor MCP server (or the app already has a native V2 provider).

2. **MCP-backed catalog provider** — a **Marcus-selected, personally reviewed** vendor with an **official / trusted remote MCP server**. Instead of hand-writing wrappers, ChainReact captures the vendor's `tools/list`, curates a ship/skip/defer allowlist, and **compiles** the approved tools into ORDINARY V2 provider artifacts (manifest, `.strict()` schemas, `ActionMeta`, thin handlers over the shared MCP executor, option resolvers). Users see a normal app; nodes say "Create Issue in Linear", never `tools/call`. See the dedicated **[MCP-backed catalog provider path](#mcp-backed-catalog-provider-path-proven-by-the-linear-arc)** section — proven end-to-end by the Linear arc (CS-1..CS-6E). Design of record: [`docs/slices/phase-5/mcp-integration-layer-architecture-plan.md`](../../../docs/slices/phase-5/mcp-integration-layer-architecture-plan.md).

**The product bar is IDENTICAL for both paths** — the north star, deferral ban, Rule-17 configuration quality, credential classification, security rules, and Owner Report apply unchanged. The MCP-backed path changes only HOW artifacts are produced (compiled from certified evidence, not hand-written); it removes nothing from the bar.

**Do NOT conflate with Customer Custom MCP** — a separate, FUTURE paid feature where a *customer* connects their OWN MCP server (technical validation only, clearly badged, never mixed into the reviewed catalog, its own security-reviewed plan). This skill covers ONLY the reviewed **catalog** path; do not anticipate customer-supplied server URLs.

---

## Context first

The flow is:

1. MCP / project context — follow the [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill; read current project memory and rule docs.
2. Current ChainReactV2 code inspection — existing provider implementations are the reference.
3. Official provider docs research — scopes, endpoints, auth, rate limits, webhook support, payloads, **list/search endpoints**.
4. **Repetitive-task research** — what business work this provider is actually used for.
5. Existing V2 pattern audit — pick the same-family provider patterns to reuse.
6. Action/trigger catalog gate → configuration design pass → implementation plan.
7. Build / test / smoke.
8. Owner setup report.
9. Live certification after owner setup.

Use current ChainReactV2 code, docs, tests, provider patterns, official provider API docs, and live provider evidence as the only implementation references.

---

## Hard definition of done

The provider is **not complete** until every applicable item is true:

1. The agreed action and trigger catalog is implemented.
2. Authentication and scopes are complete.
3. Every handler and trigger is registered.
4. Manifest capabilities are honest.
5. Every builder-visible node has builder metadata.
6. Every common path is understandable **without provider documentation**.
7. Discoverable resources have real selectors (registered resolvers, not raw text).
8. Dynamic values can be mapped from previous steps.
9. Power-user controls remain available in Advanced.
10. Every node has a useful at-a-glance summary.
11. Runtime and builder contracts match.
12. Required targeted tests pass.
13. Live certification is completed where credentials are available.
14. External owner setup is documented.
15. **No normal-path usability blocker is deferred** merely because it requires provider API, resolver, route, service, search, pagination, or UI infrastructure.

Plus the standing V2 requirements: credential class entry, Apps catalog metadata gate, AI visibility via safe redacted flags, smoke fixtures, docs, local commit, nothing pushed without Marcus.

If live credentials / portal setup / env vars are missing, the implementation can still be code-complete, but status is **`code-complete owner setup required`**, not "done". `live-complete` requires the live certification phase.

**When any item is incomplete, report the provider as `partial` and name the blocker.** Do not redefine a missing requirement as a future enhancement.

---

## Required deliverables

For provider `<provider>`:

### 1. Research doc — `docs/providers/<provider>/research.md`

**API research:**

* Provider official docs reviewed; date researched; links.
* Auth type: OAuth code flow, OAuth PKCE, API key, token-ingest, webhook signing, other.
* Required scopes with exact names; optional scopes considered and rejected.
* Redirect URI format; webhook callback URL format; webhook signing/verification.
* Rate limits and retry guidance; pagination model.
* File/download behavior, if any. Known API limitations.

**Repetitive-task research (required — this drives the catalog and the config design):**

For each proposed action and trigger, document:

* the business task it automates,
* who commonly performs that task,
* what causes it to repeat,
* which configuration stays fixed across runs,
* which values normally change per execution,
* which provider resources the user must select,
* **which provider endpoints list or search those resources** (exact endpoint + search + pagination + scope),
* required and optional scopes,
* pagination and search behavior,
* duplicate-name handling (how a user tells two same-named resources apart),
* provider limits and known failure modes,
* whether the task belongs on the normal Setup path or is primarily for Advanced users.

**Never design node configuration by copying provider API parameters directly into metadata.** If docs are unclear, say so — do not invent unsupported API behavior.

### 2. Existing V2 pattern audit — `docs/providers/<provider>/v2-pattern-audit.md`

* Current V2 providers inspected as implementation examples.
* Matching provider-family patterns, if any.
* Auth pattern selected and why.
* Action/trigger/schema patterns reused.
* Webhook/polling lifecycle patterns reused.
* **Option-resolver + picker patterns reused** (which existing provider's `options/` folder is the model).
* **Setup/Advanced classification + node-summary patterns reused.**
* Apps/Builder/AI visibility patterns reused.
* Smoke/live-certification pattern reused.
* Divergences from existing V2 patterns and why.

Registry presence, not file presence, defines what a V2 provider ships. Do not treat orphan files as shipped.

### 3. Implementation plan doc — `docs/providers/<provider>/implementation-plan.md`

* Provider ID; display name; credential class (`personal` | `account`); auth flow.
* **Action/trigger catalog decision table** (ship now / skip permanently / defer with named dependency / not appropriate) — see the catalog gate.
* **Per-node configuration design** (field classification table) — see the configuration design pass.
* **Resolvers + resource types to build**, with the backing provider list/search endpoint for each.
* Node summaries planned.
* Webhook/polling model; smoke strategy; owner setup requirements; known blockers.

---

## Credential classification

Before coding, classify the provider in `core/integrations/credentialSharing.ts`:

* `account` — shared workspace/store/portal/business resource (Slack workspace, Stripe account, Shopify shop, HubSpot CRM, Mailchimp account).
* `personal` — acts as the connecting human (Gmail, Google Calendar, Outlook, Dropbox, Discord, GitHub, Airtable, Trello, Monday).

Default to `personal` if unsure. Build fails without an entry (fail-safe = personal).

This is **not** the same as `manifest.tokenScope`. A `tokenScope: "user"` provider can still be account-controlled when the external resource is a shared business account.

It controls sharing, team visibility, **option-resolver credential access**, AI redaction, workflow run permissions, and offboarding.

---

## V2 integration anatomy

Provider code lives under `integrations/<provider>/`.

| Piece                | Location                                                                 | Required when                               |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Manifest             | `integrations/<provider>/manifest.ts`                                    | Always                                      |
| UI metadata          | `integrations/<provider>/ui.ts` or existing provider UI metadata pattern | Always, if Apps/Builder surface reads it    |
| OAuth                | `integrations/<provider>/oauth.ts`                                       | OAuth providers                             |
| Token-ingest auth    | `integrations/<provider>/auth.ts`                                        | Fragment/token-ingest providers             |
| Client/API wrappers  | `integrations/<provider>/api/` or `client.ts`                            | Any provider API call                       |
| Actions              | `integrations/<provider>/actions/<name>.{ts,meta.ts,schema.ts}`          | Every shipped action                        |
| Triggers             | `integrations/<provider>/triggers/<name>/`                               | Every shipped trigger                       |
| **Option resolvers** | `integrations/<provider>/options/<resource>.ts` (+ `_shared.ts`)         | **Every discoverable provider resource**    |
| **Resolver registry**| `services/options/_registry.ts`                                          | **Every resolver**                          |
| Webhooks             | `integrations/<provider>/webhooks/receive.ts`, `normalize.ts`            | Webhook triggers/system webhooks            |
| Registry             | `integrations/_registry.ts` + action/trigger registries                  | Always                                      |
| Credential class     | `core/integrations/credentialSharing.ts`                                 | Always                                      |
| Smoke fixtures       | `tests/smoke-actions/` and/or trigger smoke harness                      | Every shipped action/trigger where possible |

Do not add provider definitions outside the provider folder except for required registries / shared framework hooks. Respect the 50-file leaf-folder cap (split `actions/` into domain subfolders).

---

## Build order

### Phase 0 — Preflight

* Confirm the provider does not already exist under another ID; no duplicate/incomplete folder.
* Confirm stable provider ID naming.
* Check current branch and git status; confirm the working tree is ChainReactV2.
* Do not overwrite other sessions' work. Do not push.

### Phase 1 — Research + existing V2 pattern audit

MCP/project context → current V2 provider code inspection → official provider docs → **repetitive-task research** → V2 pattern audit → catalog gate → config design pass → plan. Write research + v2-pattern-audit docs before major coding.

### Phase 2 — Action and trigger catalog gate

Research the provider's **useful** action and trigger catalog **before implementation**. Classify each candidate:

* **Ship now**
* **Skip permanently** (with reason)
* **Defer with a specific named dependency** (a real, named dependency — not "later")
* **Not appropriate for workflow automation** (with reason)

Rules:

* Favor actions and triggers that support meaningful repetitive business work.
* **Do not ship only the easiest technical endpoints when central repetitive tasks are missing.** A provider whose main job is "create a task / update a record / notify on a new entry" is not complete because `list_x` and `get_x` were easy.
* Do not ship generic escape-hatch actions exposing arbitrary method, route, body, `operation`, `deleteBy`, `searchColumn`, or provider payload construction. One provider endpoint per action; typed and narrow.
* Prefer webhooks over polling when the provider supports reliable webhooks.

Record the decision table in the implementation plan. Get the catalog agreed before mass implementation.

### Phase 3 — Configuration design pass (before writing builder metadata)

For **every proposed node**, classify **every field** before any `.meta.ts` is written, and record the table in the implementation plan (this is the "configuration-design document" the CLAUDE.md provider-addition gate requires).

Every field is **exactly one** of these eight classes. These are the canonical classes from **CLAUDE.md rule 17** — use these names verbatim so the plan doc and the gate agree:

| Class                          | Resulting UI                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Core user decision             | Setup, plain-language label, required                                            |
| Static provider resource       | Setup, **searchable picker backed by a registered resolver**                     |
| Dynamic upstream value         | Setup, variable/data selector supported                                          |
| Fixed repeated value           | Setup, clearly labeled; configured once and reused every run                     |
| Derived/defaulted value        | A default the user should see → visible `defaultValue`; a value ChainReact can derive → **not a field at all** |
| Conditional option             | Setup with top-level `visibleWhen` (required-when-visible)                       |
| Advanced control               | `advanced: true` — a real power-user decision                                    |
| Internal implementation detail | **Hidden or derived — never surfaced**                                           |

Two cross-cutting notes (UI treatments and a stop condition — *not* extra classes):

* **Structured composition.** When a *core user decision* or *fixed repeated value* is an object/list, it gets a purpose-built structured editor (`object`/list), never raw JSON. Raw `json` entry is advanced-only.
* **Unsupported raw configuration = blocker.** If a field can only be expressed as raw payload/JSON/wire-format on the normal path, the node is **not ready to ship**: build the proper editor, move it to Advanced if it is genuinely a power-user grammar, or drop it from the catalog. Do not ship it as a normal Setup field with a note.

The resulting UI must follow this classification: a static provider resource is a registered selector, not a raw text box; an internal implementation detail is derived or hidden, not surfaced. Field metadata types (`advanced`, `visibleWhen`, `optionsSource`, `dependsOn`, `allowManualEntry`, `defaultValue`) are defined in [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts). Rationale + classification precedent: [`docs/slices/phase-5/builder-config-setup-advanced-tracker.md`](../../../docs/slices/phase-5/builder-config-setup-advanced-tracker.md).

### Phase 4 — Manifest + registry + Apps catalog gate

Implement `manifest.ts`, provider UI metadata, `_registry.ts` import (manifest in `ALL_MANIFESTS` + trigger side-effect imports), action/trigger registries, `credentialSharing.ts` entry, Apps listing, Builder visibility.

Manifest capabilities must be honest: `actions: true` only after real handlers are registered; `webhookTrigger: true` / `pollingTrigger: true` only after real lifecycles are registered. No "coming soon" fake availability.

**Apps catalog metadata gate** — every net-new provider needs: explicit category · non-empty description · icon · connectable status derived from real manifest/auth capability · regression test proving every registered provider has category + description · client-flow test proving Connect uses the generic OAuth/token-ingest connect path and surfaces errors visibly. A card rendering under "Other" with blank copy is not a finished provider. (Asana trial: this gap shipped in the first slice and needed a follow-up fix commit.)

### Phase 5 — Auth

* OAuth → `services/oauth/dispatcher.ts` + `integrations/<provider>/oauth.ts`.
* Token-ingest → token-ingest contract, generic ingest route/page, provider `auth.ts` ([`docs/rules/token-ingest-auth.md`](../../../docs/rules/token-ingest-auth.md)).
* API key → existing secure credential storage pattern, or a documented extension if none exists.

Required: minimum scopes only · refresh implemented where supported · non-refreshable providers fail clearly on 401 with reconnect/action-required behavior · tokens encrypted before storage · no plaintext token logging · canonical redirect URI · all dev-portal auth settings in the owner report · run the **environment alignment gate** before testing OAuth against a real provider app.

### Phase 6 — API wrappers

Typed, narrow wrappers. One provider endpoint per action/helper. No `make_api_call`, no raw method/path/body escape hatch. Bounded outputs from a fixed key set — never spread the raw provider response. Single-page lists with `nextCursor`/`hasMore`. Provider URLs, paging links, tokens, and secrets never become workflow variables. File outputs use `FileRef` ([`docs/rules/file-output-contract.md`](../../../docs/rules/file-output-contract.md)).

**Also build the list/search wrappers the resolvers need** (Phase 9). Discovery wrappers are part of this phase's scope, not a later chore.

### Phase 7 — Actions

For each shipped action: handler · `.strict()` schema · `.meta.ts` · registry entry · typed output schema · `refreshAndRetry` around 401-capable calls · humanized, engine-classifiable errors (throw; no `{success:false}` envelope).

Q11 — high-risk / recipient-visible / behavior-switching fields are explicit and required, with no hidden defaults. A default the user should see is a visible `defaultValue`.

Tests: success · schema rejection · missing/disconnected integration · 401/403 · 429 · provider 5xx/timeout · refresh behavior · runtime output contract · repeated execution and side-effect safety · user-facing error behavior · no token/secret leakage · bounded output shape. Plus a smoke fixture.

### Phase 8 — Triggers

For each shipped trigger: `configSchema` · `meta` · `activate` · `deactivate` · `renew` (if subscriptions expire) · `normalize` · `index` registration · builder metadata · **option resolvers for dynamic config**.

`TriggerEvent.eventType` MUST equal the short form passed to `registerActivation(provider, eventType, …)`. Namespaced subtypes go in `payload.classifiedType`.

Polling triggers baseline on activation and fire zero events on the first post-activation poll; throw on seed failure — never swallow it. Webhook triggers verify signatures (route secrecy / Cloudflare / Vercel is not a substitute). Trigger filters are pure — no enrichment I/O, no `FileRef` construction, no Promises. Dedup is DB-backed on stable provider IDs, fail-closed.

Tests: activation · activation rollback/failure · deactivation · renewal · event normalization shape · filtering · dedup / duplicate delivery · baseline-first behavior · repeated delivery · disabled/paused workflow drops event · wrong signature rejected · provider failure and recovery · short-form `eventType` matches registration · no token/PII leakage in event ids/logs.

### Phase 9 — Resource discovery and option resolvers

**This phase is mandatory whenever a node references a provider resource. It is never a follow-up.**

For every provider resource referenced by a node, determine which it is:

1. **A static resource selected while building the workflow** → searchable selector (resolver required).
2. **A dynamic resource supplied by an earlier step** → variable mapping supported.
3. **A business value naturally known by the user** → plain input is fine.
4. **A provider-internal identifier** → derive it, or Advanced manual entry only.
5. **A resource the provider cannot list through a supported API** → documented; manual entry allowed with an explanation in the field description.

**Static discoverable resources must normally have searchable selectors.** Do not expose a plain text field for a discoverable provider resource merely because no option resolver currently exists. When the provider exposes a supported list or search API, **the provider implementation builds the discovery infrastructure.**

#### The V2 resolver architecture (follow it exactly)

```
features/workflow-builder/config-modal/fields/ComboboxField.tsx   (or MultiOptionsField / StringArrayField)
  └─> features/workflow-builder/hooks/useOptionsSource.ts          (debounce, abort, status state machine)
       └─> lib/api/options.ts                                      (typed client API)
            └─> app/api/options/[source]/route.ts                  (auth, parse q + deps + workflowId)
                 └─> services/options/resolveOptionsSource.ts      (shared brain; also used by diagnostics)
                      ├─> services/options/credentialPolicy.ts     (which integration/account may be used)
                      └─> services/options/_registry.ts            (getOptionsResolver)
                           └─> integrations/<provider>/options/<resource>.ts
```

**No direct provider fetches from React components. No tokens exposed to the client. No client access to repositories. No use of an unrelated account or integration.**

Build, per resource:

* the provider list/search API wrapper,
* a resolver object implementing `OptionsResolver` from [`services/options/types.ts`](../../../services/options/types.ts): `source` (`<provider>:<resource>`), `provider`, `requiresIntegration`, `requiredDeps`, `resolve(ctx)`,
* registration in [`services/options/_registry.ts`](../../../services/options/_registry.ts) (validated at module load: key format, provider prefix, duplicate rejection),
* a provider `options/_shared.ts` with the integration guard + provider→`OptionsSourceErrorCode` mapping (model: `integrations/stripe/options/_shared.ts`),
* field wiring in `.meta.ts`: `optionsSource`, plus `dependsOn` for cascades (must cover the resolver's `requiredDeps`).

Resolver contract rules:

* **Search:** `ctx.q` is always defined, trimmed, clamped (256 chars). Filter locally (`filterAndSortByLabel`) or pass through to a search endpoint (model: `integrations/hubspot/options/records.ts`).
* **Pagination:** the result is `{items, hasMore}`. **`hasMore` is a UI hint** ("showing first N — refine with search"), **not a cursor** — return one bounded page. Never load an unbounded provider account into the browser.
* **Errors:** return the closed `OptionsSourceErrorCode` union — loading, empty, reconnect-required, missing-permission, rate-limit, missing-dependency, and provider-error states must all be reachable and sanitized. Adding a new code requires updating both `services/options/types.ts` **and** the client mirror in `lib/api/options.ts` (this mirror is not compile-guarded — a real drift seam).
* **Credentials:** account/integration-aware via `credentialPolicy`; refresh-and-retry on 401; personal providers pin to the creator/allowed actor with a safe denial (`NOT_WORKFLOW_OWNER`) for others; **no co-member personal credential fallback**.
* **Labels/values:** normalized, recognizable labels; **the picker saves the exact identifier the runtime handler requires**. Add duplicate-name context to the label (parent, email, id suffix) when names collide.
* **Never fabricate options, never auto-select the first result, never leak tokens/credential labels/owner ids.**

Every resource field should support the appropriate combination of: **select an existing resource** · **map a dynamic value from an earlier step** · **enter manually in Advanced** (`allowManualEntry`).

### Phase 10 — Setup / Advanced configuration UX

**Setup is the default experience.** It contains only the decisions most users genuinely need for the common repetitive task.

Prefer: plain-language labels · outcome-focused descriptions · searchable provider-resource pickers · clearly labeled fixed values · upstream variable/data selectors · purpose-built structured editors · toggles for real yes/no decisions · conditional fields (`visibleWhen`) · safe visible defaults · presets for common use cases · friendly loading, empty, reconnect, permission, and error states · clear readiness guidance.

**Advanced** preserves meaningful control: manual identifier entry · less-common behavior switches · provider-specific tuning · specialized filtering · validated technical grammars that cannot reasonably be represented structurally · overrides of Setup-derived behavior.

**Advanced must not become a dumping ground.** Move a field to Advanced only when it is a real power-user decision. Internal details are derived or hidden entirely.

Advanced requirements (verify each):

* shared pending draft with Setup; switching tabs never loses changes,
* existing values hydrate correctly,
* overrides are visibly indicated; reset-to-standard is available,
* optional Advanced fields do not count as incomplete setup (`advanced: true` non-required never counts toward setup-needed; a `required` field hidden by an unmet `visibleWhen` is not a readiness gap — see `core/workflows/requiredFields.ts` and `features/workflow-builder/config-modal/readiness/computeConfigReadiness.ts`),
* manual entry never silently overwrites picker or variable values,
* structured controls remain preferred over raw syntax,
* **arbitrary JSON editing is not accepted as normal configuration** — raw `json` entry is advanced-only; flat fixed-key objects use the `object` editor.

### Phase 11 — At-a-glance node summaries

Every node must produce a useful configured summary in the collapsed node and the config overview.

Summaries are **derived**, not authored: [`core/workflows/nodeConfigSummary.ts`](../../../core/workflows/nodeConfigSummary.ts) builds them from existing field metadata + config. **There is no `summary` meta field** — a good summary is a consequence of good metadata:

* fields with `optionsSource` classify as `resource` and render via the injected `labelFor` (client threads [`features/workflow-builder/state/resourceLabelCache.ts`](../../../features/workflow-builder/state/resourceLabelCache.ts)),
* `{{…}}` values classify as `dynamic`,
* select/boolean classify as `condition`; literals as `fixed`,
* a label-cache miss shows the stored value flagged `unresolved` — honest, not fabricated.

Intended style:

* "When a new response is submitted to Customer Intake"
* "Send a message to #support-alerts"
* "Create a task in Website Redesign"
* "Add a row to Monthly Revenue"
* "Update the matching customer in Active Accounts"

**Do not display stored provider identifiers in normal summaries.** When a value is dynamic, the summary explains its source: "Customer from New Order" · "Channel selected at runtime" · "File from Step 2".

Verify per node: the summary reads as a sentence about the repeated behavior, uses recognizable labels, and is not empty for a configured node. If a summary renders a raw id on the normal path, the cause is usually a missing resolver or a mis-classified field — fix the metadata, not the summary.

### Phase 12 — Apps page + Builder + AI visibility

* Apps page shows the provider and real connect state; Connect hits the real auth route; connected state is backed by integration data, not fake UI flags.
* Builder node library shows every shipped action/trigger; config renders all required fields and their pickers.
* AI/React Agent visibility uses safe redacted capability state only: `connected` · `ownerControlled` · `ownerMustConnect` · `availableActions` · `availableTriggers`. AI never sees tokens, scopes, credential labels, owner IDs, provider account IDs, or external emails unless an existing safe display contract allows it.

### Phase 13 — Repetitive-task readiness gate

For **every** shipped action and trigger, verify and record:

* fixed values can be configured once and reused,
* changing values can be mapped from previous steps,
* static and dynamic values are visually distinguishable,
* required decisions are obvious before activation,
* optional Advanced controls do not block readiness,
* no repeated manual intervention is required,
* the trigger/action behaves safely across repeated runs,
* pagination, cursor, dedup, and baseline behavior are correct where relevant,
* errors explain how to restore the automation,
* the node summary accurately describes each repeated execution.

Any node failing this gate is **not shippable** — fix it or drop it from the catalog. It does not ship with a follow-up note.

### Phase 14 — Builder and runtime contract

The friendly configuration layer must preserve the **exact** runtime contract:

* do not rename runtime keys unnecessarily,
* do not weaken `.strict()` schemas,
* do not duplicate schemas in UI code,
* do not introduce hidden behavior,
* do not silently apply consequential defaults,
* do not alter existing saved configuration during unrelated edits,
* preserve variable-backed values,
* preserve manual Advanced values,
* preserve missing/deleted saved resources as unavailable selections (the picker keeps the saved value and hints it is unavailable — `ComboboxField.tsx`; rendering a picker never writes a value),
* **store identifiers, not display labels**,
* hydrate existing values even when absent from the latest provider results.

### Phase 15 — Tests

Run focused tests first, then the gates.

**Per action:** good path · invalid configuration · missing integration · 401/403/429/5xx/timeout where applicable · refresh behavior · runtime output contract · repeated execution and side-effect safety · user-facing error behavior.

**Per trigger:** activation · deactivation · event normalization · filtering · dedup · baseline-first for polling · repeated delivery · disabled and paused workflow handling · provider failure and recovery.

**Per resolver family** (models: `tests/unit/integrations/stripe/options/resolvers.test.ts`, `tests/unit/integrations/microsoft-outlook/options/categories.test.ts`, route-level `tests/unit/app/api/options/options-route.test.ts`, cascade `tests/integration/features/workflow-builder/hubspot-options-cascade.test.tsx`):

* correct provider resources listed · search · pagination/bounded page · duplicate labels · empty account · missing permission · reconnect-required · rate limit · provider failure · selected integration and owning account used · tokens/sensitive data not leaked · saved missing resource preserved · exact runtime identifier saved.

**Builder configuration:** Setup is the default · Advanced appears when appropriate · Setup and Advanced share a draft · picker selection saves the expected value · variable mapping remains supported · manual entry remains in Advanced · conditional fields work · readiness counts only real user decisions · node summary uses recognizable labels · save and reload preserve behavior · the node never falls back to an unsupported raw developer-facing input.

**Provider-completion regression test.** Extend the repo's existing sweep pattern rather than inventing a parallel one — [`tests/structure/option-source-reference-integrity.test.ts`](../../../tests/structure/option-source-reference-integrity.test.ts) already walks all metas via `listAllActionMetas` / `listAllTriggerMetas` and asserts every `optionsSource` resolves and every `dependsOn` covers its resolver's `requiredDeps`. Add a provider sweep (model: `tests/unit/integrations/monday/actions/configUxSweepMeta.test.ts`, `tests/unit/integrations/microsoft-onenote/discoveryRegistry.test.ts`) that **fails** when:

* a builder-visible action or trigger has no metadata,
* a static discoverable resource is rendered as plain Setup text with no registered resolver,
* required paste-JSON appears in the normal path,
* a node lacks a useful configured summary,
* runtime schema and builder metadata disagree,
* a required field has no valid Setup, mapping, derivation, or explicitly enabled Advanced path.

Commands (unless clearly inapplicable):

```bash
npm run typecheck
npm run lint
npm run lint:structure
npm test
```

If migrations were added: `npm run lint:migrations` then `npm run db:push` (allowed by default unless Marcus says otherwise; `db:push` is not git push).

**Do not claim a test ran unless it actually ran.** If a test was not run, say exactly why.

### Phase 16 — Smoke tests

Every shipped action and trigger needs a smoke path. Add/update `tests/smoke-actions/fixtures.ts` (current fixture pattern), trigger smoke fixtures under `tests/integration/trigger-smoke/`, and runbook references if a new pattern is introduced.

```bash
npm run smoke:actions          # smoke CLI (npm run chainreact -- smoke actions)
npm run smoke:actions:run      # jest smoke suites
# trigger smoke, provider-dependent:
#   npm run smoke:triggers:webhook
#   npm run smoke:triggers:scheduled
```

For E2E/provider-mock specs: `npx playwright test <relevant-spec> --workers=1`.

Smoke exercises the real V2 handler path and mocks only the external provider boundary. Per action report: fixture name · command · result · mocked/live boundary · skipped fields and why. Per trigger: activation path · event injection method · dispatch/run enqueue verified · dedup verified · disabled/paused drop verified.

**Mock-only testing must never be described as live certification.** If a trigger cannot be smoke-tested with the current harness, that is a blocker or explicit limitation — not silent completion.

### Phase 17 — Owner setup report

Create `docs/providers/<provider>/owner-setup-report.md`. This is what Marcus opens when the work is done; it must be sufficient to complete external setup **without rereading implementation files**.

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
- App name / App type / Website URL / Privacy policy URL / Terms URL / Support email / Logo requirements / Notes:

### Redirect URIs
- Local / Preview / Production / Exact callback path:

### Webhook URLs
- Local / Preview / Production / Events to subscribe to / Signature secret location / Verification notes:

### OAuth scopes
| Scope | Required? | Used by | Why |
|---|---:|---|---|

### Provider-specific settings
- Token rotation / PKCE / Webhook signing / Event subscriptions / Bot vs user install / Marketplace or app-review steps / Test-user requirements / Rate-limit notes:

## Vercel environment variables
| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|

## Supabase / database setup
- Migrations added / db:push run / RLS notes / Storage notes / Cron requirements:

## Actions shipped
| Action | Handler | Schema | Metadata | Setup fields | Advanced fields | Resolvers | Summary | Unit tests | Builder tests | Smoke |
|---|---|---|---|---|---|---|---|---|---|---|

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Setup fields | Advanced fields | Resolvers | Summary | Unit tests | Builder tests | Smoke |
|---|---|---|---|---|---|---|---|---|---|---|

## Option resolvers shipped
| Source key | Resource | Provider endpoint | Search | Cascade deps | Tests |
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

No secrets or actual env values belong in this doc — env var names only.

### Phase 18 — Documentation and local commit

Update docs in the same batch when the provider introduces or changes: a provider/auth/action/trigger/resolver/summary/smoke pattern, env-deploy-ops setup, a shared helper, file-output behavior, token-ingest behavior, or webhook behavior. Then commit locally.

Do not push, open PRs, deploy, or change production posture unless Marcus explicitly says to.

### Phase 19 — Live provider completion (post-owner-setup live certification)

> **Also known as "Phase 13"** — the phases above were renumbered when the builder-usability phases were added. Existing provider docs (Asana, Calendly, `docs/PROJECT_MEMORY.md`) call this pass **Phase 13**, and that name remains valid: "run Phase 13" means this phase. Established by the Asana trial, 2026-07-04.

If live credentials, developer app setup, Vercel env vars, marketplace approval, or callback URLs are missing at implementation time, initial status is `code-complete owner setup required`. After Marcus completes owner setup, run this phase against the **real provider boundary**.

#### Environment alignment gate

Before testing OAuth or live webhooks, confirm the environment under test is the environment receiving callbacks. Check and report:

* the provider commit is present in the environment being tested (for production/Vercel, verify the **deployed** commit contains the provider — do not assume local code exists in production),
* `NEXT_PUBLIC_APP_URL` points at the environment being tested,
* the developer portal has the matching redirect URI registered,
* Vercel env vars are set in the scope being tested (Local / Preview / Production),
* restart the dev server after adding `.env.local` vars,
* use a tunnel (and set `NEXT_PUBLIC_APP_URL` to the tunnel origin) if the provider requires HTTPS callbacks.

Do not misdiagnose a callback failure until this is checked. The classic trap is `local app → provider OAuth → production callback`: if production lacks the provider commit, the callback fails ("No OAuth implementation registered for provider") even though local code is correct. A proven workaround (Asana): drive activation from the local repo with `NEXT_PUBLIC_APP_URL` pointing at the deployed app (shared Supabase), so handshakes and events land on the deployed route while orchestration stays local.

#### Live coverage required

Smoke-test **every shipped action, trigger, and resolver** against the real provider. Verify: authentication · required scopes · resource listing · search/pagination · builder selection · saved configuration · action execution · trigger registration and receipt · repeated execution behavior · error and reconnect behavior where practical.

* **Live OAuth** — connect from the intended test environment; integration row created; refresh path works for short-lived tokens; credential class behavior holds.
* **Live actions** — every action through the real V2 execution path with `testMode=false`. Record: workflow/action name, input used, provider-side result, ChainReact run result, independent read-back where possible, cleanup result, artifacts left behind.
* **Live triggers** — prove: activation creates the provider webhook/subscription · handshake succeeds · signature verification works against real deliveries · a real event enqueues/runs the correct workflow · one provider event creates the intended number of runs · server-side filters prevent cross-resource fan-out · dedup is correct · disabled/paused drops covered · deactivation unregisters the provider webhook · cleanup verified (ideally a second delete/read returning provider-side not-found). If live redelivery or wrong-resource testing is impractical, say why and cite the synthetic coverage protecting it.
* **Live resolvers** — top-level list, cascades, search, labels safe/redacted, **the picker's saved value is the identifier the live handler accepts**, no co-member personal credential fallback, provider errors sanitized.

#### Live event-shape review

Real provider events differ from docs. Save sanitized observed event shapes in `research.md`. Look for duplicate deliveries, parent/resource fan-out, batched payloads, timestamp variance, missing fields. Review dedup key design against live payloads: keys use stable semantic identity (provider, trigger event type, resource scope, durable provider entity id) and **must not include volatile timestamps** unless the timestamp is part of true unique event identity. (Asana: one task creation emits `task+added` once per parent — project and section — milliseconds apart; a timestamp-bearing key double-fired the workflow.) If the provider emits multiple events per user-visible action, decide whether the workflow fires once or many times and test that decision.

#### Live cleanup accounting

Every live smoke report includes: test items/records/messages/files created · test comments/events/webhooks created · what was cleaned · what remains · why · whether remaining artifacts are harmless · provider-side cleanup proof where available. If the provider has no delete action, prefer harmless cleanup (complete/archive the test item) and document the artifact.

#### Deploy-gated retest

If live testing finds a production bug and the fix is committed locally, the provider is **not fully complete** until the fix is deployed and retested. Use status `complete with follow-ups (deploy-gated retest)`; the report must include the local fix commit, whether production still has the old behavior, the exact retest command, the exact expected result, and what remains unsafe until deploy. Do not say production is fixed until the commit is deployed and the live retest passes.

---

## MCP-backed catalog provider path (proven by the Linear arc)

Only for an **official / trusted vendor MCP server**, Marcus-selected and personally reviewed. Public catalog visibility comes ONLY after live certification. This path compiles certified vendor tools into ordinary V2 artifacts and reuses every native gate above; the steps below are the MCP-specific *additions/differences* (they map to the CS-1..CS-6E Linear arc). Authoritative design: [`mcp-integration-layer-architecture-plan.md`](../../../docs/slices/phase-5/mcp-integration-layer-architecture-plan.md); live procedure: [`docs/providers/linear/live-certification-runbook.md`](../../../docs/providers/linear/live-certification-runbook.md).

### Front-load credentials + disposable test data BEFORE coding

The biggest time sink in the Linear arc was certification blocked on missing credentials/scope (a read-only token cost a full extra batch). Before writing provider code, secure and verify:

* the vendor OAuth app (client id/secret) or a dev PAT, in `.env.local`, loaded via the repo's Next env loader (`@next/env` `loadEnvConfig` — the `scripts/mcp-import` CLI reads these);
* **write scope** on the dev credential — a read-only token cannot certify write actions;
* a **disposable test workspace + project + records** the owner creates up front, so live read/write evidence has real targets on day one.

Verify **presence only** (never print secret values). If a required credential is missing, **STOP and report the missing variable name** — never fabricate.

### The pipeline

Use the dev tooling `scripts/mcp-import` + the pure compiler `core/mcpCompile`. **Never hand-edit generated files** — a jest byte-sync guard regenerates from snapshot+catalog and diffs.

1. **Auth (CS-1)** — reuse the shared MCP OAuth helper (`integrations/_shared/mcp/oauth.ts`: RS/AS-metadata discovery + PKCE + resource indicators, static-or-DCR), or `token_paste` for PAT servers (Eden). A thin per-app `ProviderOAuth` registers in the dispatcher like any provider; tokens land encrypted in `integrations`; 401 → `refreshAndRetry`.
2. **Live capture (CS-6)** — `mcp:import capture <app>` snapshots the live `tools/list` (`capturedBy: "live"`, per-tool schema hashes). Never ship from a docs-draft assumption.
3. **Curate the allowlist** — edit `mcp-catalog.ts`: `ship` / `skip` / `defer` EVERY tool with a reason (the catalog IS the decision record). Never expose every discovered tool; destructive/`delete_*`/publish tools stay `skip`/`defer` absent product signal. A vendor dispatcher tool (Linear `save_issue`) may be SPLIT into typed V2 actions (create/update) via field omission + required-pinning.
4. **Compile (CS-2)** — `mcp:import generate <app>` → `.strict()` Zod schemas + `ActionMeta` + thin handlers over the shared executor + `_pinned.ts` (certified hashes). No raw-JSON Setup field ever; the compiler emits `NEEDS_MANUAL` for unions/deep nesting the curator must resolve. Curator-only widget upgrades: closed-enum override → `select`; `format` override → date/date-time picker; numeric bounds override — all enforced in the generated schema.
5. **Read evidence** — `mcp:import capture --evidence` runs ONLY read-only, catalog-approved tools and records **TYPE-ONLY, scrubbed** result shapes. Evidence is INPUT to human curation, never authority.
6. **Option resolvers from REAL list-tool evidence (native Phase 9 bar)** — where the server has list tools, ship real resolvers mapping `{value:id, label:name}` with `dependsOn` cascades (Project→Team; State requires Team → route shows "choose a team first"). **NEVER guess a resolver shape** — if a list tool returns empty or its item shape is unconfirmed (Linear cycles), keep verified name-or-id text and document it; do not invent fields.
7. **Gated write evidence** — writes are NEVER auto-captured. Use the explicit, double-gated `mcp:import write-evidence` / `write-evidence-chain` (`--allow-write-evidence` + effective risk exactly `write` + not a forbidden verb + `--yes-run-write`) against DISPOSABLE records. Chaining reuses a created id **transiently** (create → update → comment) so no id is copied by hand; committed evidence stays TYPE-ONLY (raw values never persisted).
8. **Bounded structured outputs (from write evidence only)** — curate `outputs` to the **proven fields only**. The executor's `normalizeOutput` projects EXACTLY the declared top-level keys (bounded, type-checked, no provider-internal leak). Declare only what evidence proves — Linear's `save_issue` returns NO `identifier`, so it is not declared (use `url`); `save_comment` returns no `issueId`, so it is omitted. Never fabricate a field.
9. **Registration wiring** — `mcp:import generate --print-registration` prints the exact `_metaInventory.ts` / `_handlerInventory.ts` / discovery-provider / options-registry fragments to paste (mutates nothing; refuses if artifacts are stale). Registration is EXPLICIT + reviewed — **new server tools NEVER appear automatically** (allowlist = committed code).
10. **Drift + schema cache (CS-4)** — the runtime executor classifies drift against the pinned schema (breaking → fail closed with the `INTEGRATION_CHANGED` "being reviewed" UX, not `HANDLER_FAILED`); a short-TTL live-tools cache backs it; `mcp:import check` is the proactive sweep. Certification state lives in docs, not a new table.
11. **Icon + Rule-17 audit + `isExperimental`** — add `public/integrations/<id>.svg` (a MISSING asset renders a broken icon — regression-locked by `providerIconUrl.test.ts`, which asserts every enabled provider has its asset). Run the Rule-17 configuration-UX audit (closed enums → dropdowns e.g. priority; date fields → date picker; static resources → resolvers; **no MCP terminology anywhere** in labels/descriptions). Ship `isExperimental: true` — hidden from the production catalog but reachable in dev via `ENABLE_EXPERIMENTAL_MCP_APPS=true` for certification (the flag mechanism stays for the next MCP app after this one is published).
12. **Live certification + release flip (native Phase 13 / "Phase 19" / CS-6E)** — with real credentials: live OAuth connect, zero unresolved drift, live tool execution, certified read + write evidence, structured outputs, resolver-backed common paths, config-UX audit, tests green. THEN flip `isExperimental: false` (Marcus-approved). Leave any unverified action HIDDEN — unregister its meta + handler, keep the impl files as orphans (rule 14), and document it as deferred (Eden's 3 publish writes; see [`docs/providers/eden/deferred-actions.md`](../../../docs/providers/eden/deferred-actions.md)).

### The React Agent invariant (do NOT get this wrong)

The React Agent **plans against typed provider metadata** (registry `provider:type` keys + capabilities) and **never calls MCP tools directly**. MCP-backed workflow actions execute ONLY through the normal engine handler registry — exactly like native actions. The agent gets MCP-app parity for free the moment the metas register; there is **no agent-side MCP tool bus**. (This supersedes any earlier "the agent calls MCP" assumption.)

### Reuse from the native flow (unchanged)

Credential classification, the configuration-design doc classifying every field (Phase 3), the Apps/Builder/AI-visibility gate (Phase 12), the tests bar (Phase 15 — runtime + builder + resolver + determinism/byte-sync + drift + no-leak), the Owner Report (required every run), docs + local commit, nothing pushed without Marcus. The MCP-backed path ADDS the compiler/evidence/drift specifics above; it removes nothing from the product bar.

---

## Security rules

* Never log tokens, refresh tokens, auth codes, signing secrets, API keys, provider secrets, or raw webhook bodies containing user data.
* Never expose co-member personal credentials.
* Never use service-role on a user-triggered path without explicit reason and an existing service-role boundary.
* Never store plaintext OAuth/API tokens. Never put secrets in owner setup docs.
* Webhooks require provider signature verification.
* Option resolvers must not leak credential labels/owner IDs for personal providers, and must never return tokens or raw provider errors to the client.
* No provider fetches from React components; no tokens in the client; no client access to repositories.
* File outputs use `FileRef`; no bytes/base64/content in workflow outputs.
* Provider event IDs used for dedup must be stable and not raw PII when avoidable.
* Capability flags must be honest.

---

## Blocker policy

**Stop and report before coding** if: the provider requires paid/API approval blocking basic implementation · docs do not expose required endpoints · only unsafe auth exists with no V2 contract · required scopes would be too broad for the action/trigger set · webhooks require a public URL or manual verification that cannot be mocked/tested locally · required V2 infrastructure does not exist · the provider would require a new cross-cutting pattern.

**Continue coding with explicit limitation** if: developer portal setup is manual but code can be implemented · live credentials are missing but mocked-boundary tests prove V2 behavior · marketplace approval is only needed after implementation · a live smoke must wait on Marcus's env setup.

**Never a valid deferral:** missing option resolver · missing list/search API wrapper · missing route/service plumbing · missing search or pagination support · missing structured editor · missing node summary · "config UX polish". These are in-scope implementation work. If they are truly blocked (the provider has no supported list API), that is a documented limitation with the resource classified type 5 — not a silent raw-identifier field.

---

## Final report format (Owner Report — required every run)

```md
## Provider integration closeout — <Provider>

**Provider:** <provider>
**Credential class:** personal | account
**Auth flow:** OAuth | PKCE OAuth | token-ingest | API key | other
**Commit:** <hash> (local, not pushed)
**Status:** live-complete | code-complete owner setup required | complete with follow-ups (deploy-gated retest) | blocked | partial

### Provider researched
- Docs reviewed / date:

### Repetitive business tasks identified
- <task> — who does it, what makes it repeat, what stays fixed, what changes per run.

### Action catalog
| Action | Ship now / Skip / Defer (dependency) / Not appropriate | Business task | Why |
|---|---|---|---|

### Trigger catalog
| Trigger | Ship now / Skip / Defer (dependency) / Not appropriate | Business task | Why |
|---|---|---|---|

### Authentication and scopes
- Flow / scopes requested / why each / refresh behavior:

### Builder Setup design per node
| Node | Setup fields | Field class (CLAUDE.md rule 17: core decision / static provider resource / dynamic upstream value / fixed repeated value / derived-defaulted / conditional option) | Understandable without provider docs? |
|---|---|---|---|

### Advanced controls per node
| Node | Advanced fields | Why power-user, not internal |
|---|---|---|

### Option resolvers and resource types added
| Source key | Resource type (1–5) | Provider endpoint | Search | Pagination | Cascade deps | Manual entry in Advanced? |
|---|---|---|---|---|---|---|

### Node summaries added
| Node | Example configured summary |
|---|---|

### Runtime tests
| Command / file | Result |
|---|---|

### Builder tests
| Command / file | Result |
|---|---|

### Resolver tests
| Command / file | Result |
|---|---|

### E2E tests
| Spec | Result |
|---|---|

### Live certification matrix
| Surface | Name | Boundary (live/mocked) | Result | Evidence |
|---|---|---|---|---|

### Provider developer-portal checklist
- App settings / redirect URIs / webhook URLs / scopes / events / token settings / app review:

### Vercel environment checklist
| Env var | Scope(s) | Required? |
|---|---|---|

### Remaining blockers
- None, or each blocker with its exact owner and what it blocks.

### Exact commands and results
| Command | Result |
|---|---|

### Security notes
- Credential class rationale / token handling / co-member exposure checked / webhook signature + dedup checked / resolver leak checked / file output checked:

### V2 pattern audit / divergences
- Patterns inspected / reused / intentional divergences / new reusable pattern introduced:

### Docs created/updated
- Research / v2-pattern-audit / implementation-plan / owner-setup-report / other:

### Commit hashes
- <hash> — <subject>

### Push / deploy / migration status
- Nothing pushed. | Pushed to v2-main with Marcus's explicit approval (deploys to prod).
- Migrations: none | added + db:push run

### Ordinary-user verdict
> Can an ordinary user configure every common path for every shipped node without locating provider-internal values?
- **Yes** — or **No**, with the exact nodes/fields that fail and why.
```

The **Ordinary-user verdict** is mandatory and must be an explicit yes/no. A "no" means the provider is `partial`, not `done`.

A provider is not "100% finished" unless the report has no hidden implementation work left. If only Marcus's portal/Vercel setup remains, say **"code-complete; owner setup required"** and list every remaining external item exactly.

---

## Live completion report format (Phase 19, a.k.a. Phase 13)

```md
## <Provider> live completion closeout

**Provider:** <provider>
**Status:** complete | complete with follow-ups | blocked
**Environment tested:** local | preview | production
**Provider boundary:** mocked | live
**Commit:** <hash>
**Push status:** Nothing pushed | pushed by Marcus approval

### OAuth
### Live actions verified
| Action | Result | Evidence / notes |
|---|---|---|
### Live triggers verified
| Trigger | Result | Evidence / notes |
|---|---|---|
### Option resolvers verified (live)
| Source key | List | Search | Cascade | Saved id accepted by handler | Notes |
|---|---|---|---|---|---|
### Live quirks discovered
### Bugs found/fixed
### Cleanup
### Docs updated
### Tests/commands run
| Command | Result |
|---|---|
### Deploy-gated retests
### Remaining owner actions
```

---

## Status definitions

* `code-complete owner setup required` — implementation is complete (**including resolvers, Setup/Advanced UX, and summaries**), but provider dashboard/env/live credentials are not ready.
* `live-complete` — owner setup is done and real provider actions/triggers/resolvers passed.
* `complete with follow-ups (deploy-gated retest)` — a live provider bug was found and fixed locally; production needs deploy + retest.
* `blocked` — cannot be completed without external approval, missing API capability, unsafe auth, or missing V2 infrastructure.
* `partial` — one or more hard-definition-of-done items are incomplete. **Name the blocker.** Never relabel a missing requirement as a future enhancement.
