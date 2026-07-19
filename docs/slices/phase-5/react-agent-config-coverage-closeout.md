# REACT-CONFIG-COVERAGE-1 — React Agent config coverage + optional-field intent

**Status:** implemented + verified locally (this doc is the closeout). Local commit on `v2-main`,
not pushed.

## What this batch fixes

React (the ChainReact workflow agent, served through the ChainReact → public AI gateway → private
Hermes path) previously chose the right node and filled required fields, but **silently ignored
optional fields the user explicitly supplied**. The canonical example:

> "When I receive an email from vendor@example.com, post it to Slack."

React selected `gmail:new_email` + `slack:send_channel_message`, but the supplied sender never
reached the trigger's optional `from` filter. After this batch the sender lands in `from`
(exact value, resolver-shaped `["vendor@example.com"]`) while the raw address never crosses to
Hermes (a typed placeholder does).

## Root cause (traced, not assumed)

Four compounding causes on the CREATE path, one on the EDIT path:

1. **The plan contract had no config channel.** `WorkflowPlanStep`
   (`contracts/guidanceSession.ts`) deliberately carried only
   `ref/role/provider/type/purpose/requiredInputs` — a user-supplied value had no field to travel
   in. The strict sibling-object plan path (`gatewayResponseContract.extractPlanCandidate`) even
   dropped `requiredInputs`.
2. **The prompt instructed the model to omit values.** `RESPONSE_FORMAT_INSTRUCTIONS` said
   "leave the values out — list unknown field keys in `requiredInputs`", with no distinction
   between *unknown* values and values the user already supplied.
3. **The model could not discover fields.** The live prompt's capability catalog
   (`capabilityCatalog.ts`) is keys-only (`provider:type`); nothing told the model that
   `gmail:new_email` even *has* a `from` field.
4. **Client seeding was card-only.** `planToBuilderPatch` seeded only guided-setup-card values
   (`previewConfig`), and the card renders only `missingInputs` (= plan `requiredInputs`) fields
   with supported controls, so an optional value had no path onto the applied node.
5. **EDIT path:** the pipeline could carry `updateNodeConfig` values end-to-end, but the edit
   instructions repeated "missing config values are fine — leave them out" without the
   supplied-value rule, and goal-text literals crossed to Hermes raw (secret-shape scrubbing only).

## End-to-end metadata path (current, after this batch)

- **Canonical source (unchanged, single):** `services/discovery/_registry.ts` →
  `ActionMeta`/`TriggerMeta` (`contracts/actionMeta.ts` `FieldMeta`) drives the builder config
  panel, readiness (`core/workflows/requiredFields.ts`), patch validation
  (`services/workflows/patch/checks.ts`), the AI tools (`services/ai/tools/providerCatalog.ts`),
  the editable graph (`services/ai-guidance/editableGraph/`), and now the prompt field schemas and
  the proposed-config sanitizer. **No second AI field list exists.**
- **Outbound:** route (`app/api/accounts/[id]/ai/workflow-guidance/route.ts`) tokenizes
  recipient-class literals → builds narrowed field-schema lines
  (`services/ai-guidance/promptFieldSchemas.ts`) → capability runner → gateway client → ONE prompt
  (`buildGatewayGuidancePrompt.ts`) containing: goal (tokenized), conversation (tokenized),
  keys-only catalog, **narrowed field schemas**, editable graph (edit), and the new
  `FIELD_VALUE_INSTRUCTIONS`.
- **Inbound:** normalizer extracts plan (now with per-step `config`) or mutation ops → route
  rebinds placeholders → `sanitizePlanStepConfigs` / `prepareProposedOperations`
  (`services/ai-guidance/planConfig/`) filter against real `FieldMeta` →
  `resolveProposedOptionValues` verifies/label-maps dynamic values through the canonical options
  resolvers (`services/ai/tools/options.ts`) → existing validation
  (`validateWorkflowPlan` / `runWorkflowEditFromModel` → `validateWorkflowPatch`) → preview →
  explicit user Apply (`planToBuilderPatch` additive seed / `replaceGraphLocal` atomic replace).

## Behavior contract (Part D)

- Required fields stay the validity gate; nothing is fabricated.
- Every declared field — optional, Advanced, conditionally visible — is considered; a
  user-supplied value is included in `config` (plan) or `updateNodeConfig`/`addNode` (edit).
- Unsupplied optional fields stay absent (no guessing, no default-padding).
- Explicit `false` / `0` are preserved end-to-end (`""` means "unset" platform-wide, matching
  `isRequiredValueMissing`).
- A supplied-but-unusable value (bad enum, unresolvable label, complex type) is **deferred**: it is
  removed and surfaced as a targeted input (`requiredInputs` / a safe warning naming the field
  key) — never silently discarded.
- Dynamic (`optionsSource`) values: exact stored-value match is kept; a unique case-insensitive
  label match maps to the stored value through the same account-scoped, credential-policy-governed
  resolver the builder uses; ambiguity/failed resolution defers. Bounded at 8 resolver calls per
  request; `dependsOn` parents are read from the same node's (merged) config.

## Sensitive-literal handling (Part E)

`core/security/sensitiveLiterals.ts`:

1. The route tokenizes goal text + recent turns (`[[EMAIL_n]]` / `[[PHONE_n]]`; same literal →
   same token). The raw literal lives ONLY in a request-local binding list.
2. The prompt instructs Hermes to copy placeholders **verbatim** into the matching config field.
3. The route rebinds the original values into guidance text, plan-step config, and patch
   operations before sanitize/validate/preview — the saved workflow gets the user's exact value.
4. Nothing outbound carries the raw literal (route test pins `JSON.stringify` of every capability
   call; gateway-client test pins the request body). Audit rows carry ids/enums only (unchanged);
   the route logs nothing.
5. Phone detection is conservative (international `+` and `(nnn) nnn-nnnn` forms) so ids/amounts
   are never mangled. Secrets are NOT tokenized — they remain hard-redacted
   (`redactSecretsFromText`) and secret/connection fields are stripped by the sanitizer, so a
   credential can never round-trip through a placeholder.

## Validation & merge integrity (Part F)

Unchanged and pinned by new tests: `WorkflowPatchSchema` stays strict; preview/apply stay
mandatory and explicit; `applyPatchToDefinition.updateNodeConfig` merges (replace only with
explicit `replace: true`); the edit pipeline's candidate is built FROM the current draft, so
untouched nodes/fields (including explicit `false`) survive edits and repairs. The sanitizer only
*narrows* what the model can write (undeclared keys are now dropped before validation rather than
riding to a runtime handler rejection).

## Field-coverage inventory (Part B — measured by `tests/structure/react-agent-field-coverage.test.ts`)

| Metric | Count |
| --- | --- |
| Registered nodes (triggers + actions) | 505 (98 + 407) |
| Total declared user-configurable fields | 1,845 |
| Required | 853 |
| Optional | 992 |
| Dynamic resolver-backed (`optionsSource`) | 726 |
| Advanced-section | 164 |
| `secret`/`connection` sensitivity (never model-writable, by design) | 11 |

**AI-discoverable before:** 0 fields in the create-path prompt packet (keys only); edit path
already exposed declared non-secret fields per on-canvas node. **After:** all 1,845 fields are
discoverable through the canonical path — narrowed field schemas in the prompt (relevance-selected,
bounded at 12 providers / 80 nodes per request), the editable graph (edit), and `getNodeSchema` —
and all 1,834 non-secret fields are patch-settable (kept or deferred-to-targeted-input; the
structure test proves nothing silently drops).

## Consistency tests (Part C)

`tests/structure/react-agent-field-coverage.test.ts` fails when: `getNodeSchema` or
`getProviderCatalog` miss/mismatch a declared field (name/type/required/multiple/optionsSource
deps); the prompt renderer omits a field or a provider overflows the schema-block bound (no silent
truncation); the editable graph diverges from "declared minus secret/connection"; or any declared
non-secret field stops being settable/deferrable. A future-field fixture test proves a brand-new
metadata field is picked up automatically with no AI-side list to update.

## Files changed

- `contracts/guidanceSession.ts` — `WorkflowPlanStep.config` (user-supplied values channel).
- `core/security/sensitiveLiterals.ts` (new) — tokenize/rebind.
- `services/ai-guidance/planConfig/` (new) — `sanitizeProposedConfig`,
  `resolveProposedOptionValues`, `prepareProposedOperations`.
- `services/ai-guidance/promptFieldSchemas.ts` (new) — narrowed provider selection + field-schema
  rendering.
- `services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts` — field-schema block,
  `FIELD_VALUE_INSTRUCTIONS`, plan-shape `config`, placeholder rules; create+edit.
- `services/ai-guidance/gateway/extractPlanFromText.ts` / `gatewayResponseContract.ts` — carry
  step `config` (+ fix dropped `requiredInputs` on the sibling path).
- `services/ai-guidance/gateway/hermesAgentGatewayClient.ts`,
  `services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts` — thread `fieldSchemaLines`.
- `app/api/accounts/[id]/ai/workflow-guidance/route.ts` — tokenize outbound; rebind + sanitize +
  resolve inbound (plan and mutation paths); targeted-input warnings.
- `core/workflows/planToBuilderPatch.ts` — seed plan-step config (card values override);
  secret-key defense-in-depth.
- `core/workflows/planPreviewConfig.ts` (new) + `features/workflow-builder/hooks/useBuilderPreview.ts`
  — pre-fill guided-setup state from plan config; expose prefilled map.
- `features/workflow-builder/panels/BuilderPreviewSetupCard.tsx` (+ rail/builder wiring) — render
  prefilled fields editable where a control exists, read-only "From your request" otherwise.

## Tests added

- `tests/unit/core/security/sensitiveLiterals.test.ts` — tokenize/rebind/no-mangle.
- `tests/unit/services/ai-guidance/sanitizeProposedConfig.test.ts` — scenarios 2/3/4/5/7/9/13 +
  secret stripping + label→value on static options.
- `tests/unit/services/ai-guidance/resolveProposedOptionValues.test.ts` — scenario 6 (resolver
  mocked at the provider boundary): label map, ambiguity, failure, deps, onlyFields, arrays.
- `tests/unit/services/ai-guidance/planConfigChannel.test.ts` — extractor/sibling config carry,
  prompt rules, gateway-body forwarding + no-leak.
- `tests/unit/app/api/accounts/ai-workflow-guidance-config-coverage.test.ts` — scenario 1 exact
  reported case end-to-end at the route (tokenized outbound / rebound inbound), scenario 4
  no-guessing, scenario 6 both ways, edit-path merge + create/edit parity (scenarios 8/10) and
  scenario 14 no-leak.
- `tests/unit/services/workflows/patch/configMergePreservation.test.ts` — Part F merge/replace/
  repair preservation (scenarios 8/11).
- `tests/unit/core/workflows/planToBuilderPatchConfigSeed.test.ts` — Apply seeding, card override,
  false/0, secret-key guard.
- `tests/unit/features/workflow-builder/panels/BuilderPreviewSetupCard.prefill.test.tsx` —
  prefilled visibility.
- `tests/structure/react-agent-field-coverage.test.ts` — Parts B/C (scenarios 12/13).

## Remaining field classes not model-authorable (deliberate, still user-configurable in builder)

- `file`, `file-array`, `router-routes`, `spreadsheet-rows`, `location` — complex/file-backed
  editors; a model-supplied value defers to targeted input; the builder collects them. (Router
  branches are structural workflow shape, not a text constraint.)
- `secret` / `connection` sensitivity (11 fields) — never model-writable; stripped before trust.
- `keyvalue-list`/`object-list` values are accepted only when shaped exactly per `itemFields`.
- The guided-setup CARD still renders primitive controls only (multi-select and non-async cascades
  render read-only when prefilled and seed on Apply; they remain editable in the node config panel
  after Apply).

## Verification (all run 2026-07-19)

- `npx tsc --noEmit` — clean.
- `npm run lint -- --max-warnings=0` — 0 errors; 18 warnings, ALL pre-existing `max-lines` on
  files this batch did not push over (this batch added no warnings; two it introduced were fixed).
- `npm run lint:structure` / `npm run lint:migrations` — OK (no migration added).
- Targeted suites (ai-guidance, ai tools, core workflows, patch, accounts routes, builder
  hooks/panels, structure): **181 suites / 2,063 tests passed**.
- Full `npm test`: 2,288 suites passed; 41 failed — every failure verified PRE-EXISTING on clean
  HEAD (live-DB RLS/migration/billing integration suites needing the dev DB, plus the known
  `variable-picker-file-array`, `notion-list-comments-config`, `WorkflowCanvas` History-tab,
  `client-server-boundary`, `no-literal-slack-token-fixtures`, and 7 unit drifts — re-run
  unchanged with this batch stashed).

Nothing pushed, no deploy, no migration, no `db:push`.
