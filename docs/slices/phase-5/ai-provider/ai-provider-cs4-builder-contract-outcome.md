# AI-PROVIDER-4 — CS-4 Outcome: ChainReact AI Provider Identity & Builder Contract Surface

**Type:** Implementation outcome (CS-4 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); builds on
[CS-2](./ai-provider-cs2-processor-outcome.md) and
[CS-3](./ai-provider-cs3-billing-outcome.md)). Local commit only; nothing pushed,
no flags enabled, no database change.
**Date:** 2026-07-24 · **Branch:** `v2-main` (on top of CS-3 `1820e31f5`)

## AI provider registration — and why there is no manifest

The AI provider is registered as **`ai` / "ChainReact AI"** with **no
`ProviderManifest`**, mirroring how `native` has always worked. A manifest exists to
describe OAuth, scopes, health checks, and connection state; the AI provider has none
of those, and adding an empty manifest would make it appear on the integrations /
connection surfaces (`/api/providers`, the Apps page) as something a user could
"connect" — which would be a lie. Instead the id + display name live in
`core/integrations/connectionlessProviders.ts` alongside the connectionless list, and
the builder reaches its metadata through a dedicated catalog route.

Consequences (all verified by test): the AI provider never appears in the provider
list, never renders Connect / Reconnect UI, and never participates in connection
readiness (`connectionInput.ts` already short-circuits on `requiresIntegration: false`,
provider-agnostically). Key namespace is stable: `ai:analyze_document`,
`ai:transform_data`. **No executable action is registered in this slice** — CS-5/CS-6
own the handlers.

## Connectionless provider architecture

`core/integrations/connectionlessProviders.ts` is the single source of truth:
`CONNECTIONLESS_PROVIDERS = ["native", "ai"]`, `isConnectionlessProvider()`, plus the
`NATIVE_PROVIDER_ID` / `AI_PROVIDER_ID` / `AI_PROVIDER_DISPLAY_NAME` constants. Unknown,
empty, and nullish providers are **never** connectionless (fail-safe, matching the
unknown→personal default in `credentialSharing.ts`), and prototype names like
`"toString"` do not resolve.

Generalized touchpoints (bare `provider === "native"` removed):
`hooks/useNodeMeta.ts`, `hooks/useUpstreamVariables.ts`,
`config-modal/ConfigModalShell.tsx`. Each now asks "is this connectionless?" for
catalog/connection routing, and asks for the *specific* id only where the answer picks
between two different catalogs. `tests/structure/connectionless-provider-source-of-truth.test.ts`
prevents regression.

Deliberately **not** touched (not connectionless-routing decisions, so not in scope):
the `"native:router"` action key, the native icon fallbacks on node cards, the native
catalog route itself, and template/matcher helpers. AI node icons are a CS-5 concern
(no AI node can exist on a canvas yet).

## Catalog behavior

`GET /api/ai/actions` mirrors `/api/native/actions`: same response shape
(`{ provider, actions }`), same auth gate, no DB, no connection lookup, no AI
execution, no billing. It is the **only** place that reads `AI_PROCESSOR_ENABLED`.

Client-side the catalog is fetched by `useAiActions(enabled)` — gated exactly like
`useProviderActions(null)`: when the context has no AI node, **no fetch is made and no
cache entry is created**. `useNodeMeta` enables it for an AI node, `useUpstreamVariables`
for an AI ancestor, `AddNodePanel` while an action picker is on screen (never for the
trigger picker — there are no AI triggers).

## Action Picker behavior

The picker gained a first-class **"ChainReact AI"** section above Native actions, with
its own heading and searchable rows. It stays **presentational**: `aiActions` arrives as
a prop from `AddNodePanel`, exactly like `nativeActions` — the earlier draft called the
hook inside the picker, which broke that contract and would have forced ~90 test files
to stub a fetch they never exercise.

Honest visibility, in priority order: no actions (disabled processor **or** CS-4's
empty registry) → the section renders **nothing at all** — no heading, no empty state,
no "coming soon". A search that excludes every AI action hides the section too. No
Connect affordance is ever rendered. Native and provider sections are unchanged.

## `schema-fields` contract and UX

New `FieldType: "schema-fields"` — a user-defined schema edited as structured rows,
never JSON. It commits a real `{ fields: [{name, type, required?, description?}] }`
matching the committed `UserDefinedSchemaSchema`, so the AI processor compiles the
author's intent directly into the model's output contract.

Why a bespoke type rather than `object-list` + `itemFields`: a schema editor needs
case-insensitive unique names, normalization into safe workflow-variable identifiers
(`Employee Name` → `employee_name`, so `{{node.fields.x}}` stays a clean path segment),
reserved-shape rejection, and a Save gate — none of which a generic row editor
expresses. Same precedent as `router-routes`.

Editor (`SchemaFieldsField` + `SchemaFieldsRow`, split to stay under the 400-line lint
ceiling): add / remove / reorder rows, name, type selector (Text · Number · Yes-No ·
Date · Currency), required toggle, description, per-row inline errors, empty state,
row count, and a hard stop at 200 rows. Names normalize **on blur**, not per keystroke
(normalizing mid-word fights the user). Removing the last row commits `undefined` so an
optional schema drops out of the config.

**Suggest Fields (CS-7) needs no redesign**: row state is a plain array owned by the
component and every mutation funnels through one `commit()`, so a proposal merge is
just another `commit(...)` call from the header action row.

## Validation

The rules live in `_schemaFieldsValidator.ts` (pure, shared) — not inside the React
component — and are consumed by three surfaces: the editor (inline row errors), the
config rail's Save gate (via `_schemaFieldsBlocking.ts`), and the builder validation
drawer (new `schema_fields_invalid` issue code, categorized `needs_input` alongside
`router_routes_invalid`).

Rules and copy: "Add at least one field." (required-but-empty) · "Field names must be
unique — …" · "Use letters, numbers, and underscores, starting with a letter." ·
"Give this field a name." · "Choose a type for this field." · "Maximum 200 fields."
A **hidden** conditional schema field never blocks readiness or Save, matching
`missingRequiredFields` / `isVisibleWhenMet` behavior everywhere else. Empty arrays
already read as missing for required fields via the existing `isRequiredValueMissing`.

## `dynamicOutputs` contract

`ActionMeta.dynamicOutputs?: Array<{configField, attachUnder, whenField?, whenValueIn?}>`
— optional, max 4, fully backward compatible (every existing meta parses unchanged).
Meta-level `superRefine` enforces: `configField` names a declared field **and** that
field is `schema-fields`; `attachUnder` names a declared output of type `object` or
`array` (a scalar has no children); `whenField` names a declared field; `whenValueIn`
requires `whenField`; one declaration per `attachUnder`; no duplicate
(configField, attachUnder) pair.

**Inert in CS-4** — no runtime synthesis, not wired into `useUpstreamVariables`. Shipping
the declaration now means CS-5/CS-6 author their metas once, and CS-8 implements
synthesis against a contract that already exists.

## Deferred work

- **CS-5 / CS-6** — the actual `ai:analyze_document` / `ai:transform_data` metas and
  handlers; AI node icon/branding on the canvas card and preview overlay (today those
  fall back to the ChainReact brand only for `native`); at-a-glance node summaries.
- **CS-7** — Suggest Fields button + gated route (extension point documented above).
- **CS-8** — `dynamicOutputs` synthesis in `useUpstreamVariables` + variable-picker
  child paths.

## Risks

1. **The AI section is unreachable until CS-5.** With zero registered actions the
   catalog is always empty, so the picker section cannot be exercised end-to-end in a
   real browser yet. Mitigated by prop-driven component tests, but the first true
   integration proof lands with CS-5.
2. **`schemaFieldsByType` is not yet supplied by any caller** of
   `collectBuilderValidationIssues` (no AI action exists to supply metadata for), so
   the drawer rule is dormant — like the required-fields rule before its metadata
   landed. CS-5 wires it.
3. **Category `ai` is additive but display-only** — the picker groups by section, not
   category, so nothing consumes it yet beyond metadata honesty.

## Deviations

- **`useAiActions` is gated (`enabled` parameter)** rather than always-on. This matches
  `useProviderActions(null)` and avoids a needless fetch on every builder session.
- **`ActionPicker` takes `aiActions` as a prop** instead of calling the hook itself —
  restoring the component's existing presentational contract (see Picker section).
- **80 existing test files gained one line** (`listAiActions: () => Promise.resolve([])`)
  in their `@/lib/api/discovery` mock factory. Unavoidable: those tests mock the module
  wholesale and the module gained a function. Verified as a one-line diff each.
- **AI arc docs moved to `docs/slices/phase-5/ai-provider/`.** CS-3's outcome doc pushed
  `docs/slices/phase-5` past the 50-file leaf cap; the rule says split or add structure,
  so the four AI-provider docs now live in their own folder (all relative links
  re-pointed and verified).

## Verification

`npm run typecheck` — 0 CS-4 errors · `npm run lint` — 0 errors · `npm run
lint:structure` — OK · CS-4 focused suites **110 tests pass** (connectionless helper,
catalog route, contracts incl. all dynamicOutputs rejection paths, schema validator +
save gate, SchemaFieldsField editor, AI picker section, structure guard) · builder
regression **2751 pass / 282 suites**.

Four pre-existing failures remain, **proven** unrelated by stashing this slice's source
edits and re-running (they fail identically without CS-4):
`WorkflowCanvas`, `NodeInspectorPanel`, `notion-list-comments-config`,
`variable-picker-file-array` — all belonging to in-flight dual-builder / Notion WIP.
The known `DocumentView.tsx` / `DocumentInsertMenu.tsx` typecheck issue is likewise
untouched.
