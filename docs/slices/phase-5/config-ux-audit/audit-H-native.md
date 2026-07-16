# Config UX Audit — Group H: native (logic/control nodes)

Ground truth read: `integrations/native/actions/*.meta.ts` + `*.schema.ts`, `integrations/native/triggers/*.meta.ts`, `_conditionEvaluator.ts`, `features/workflow-builder/config-modal/fields/RouterRoutesField.tsx`, `CronField.tsx`, `_routesValidator.ts`, `SchemaForm.tsx` (dependsOn cascade), `ConfigModalShell.tsx` (router-only save gate), `tests/structure/router-routes-operator-parity.test.ts`.

## Systemic patterns

1. **Meta↔runtime-schema drift where no parity test exists (3 fields).** The router validator has a structural parity test against `IF_THEN_OPERATORS`; the if/then meta's `operator` options do NOT — and two option values (`greater_than_or_equal`, `less_than_or_equal`) are not in the runtime enum (`greater_equal`, `less_equal`). Separately, http_request's runtime `auth` (bearer/basic/apiKey) has no builder field at all. Meta options for select fields should get the same parity-test treatment as the router list.
2. **Builder/graph/implementation jargon in Setup descriptions (~7 fields + 3 node descriptions).** "unary/binary operators", "emit a false edge", "unlabeled cleanup edges", "the handler detects", "edge label downstream nodes wire to", "POST to the run-now endpoint", backticked `branchTaken: 'true'` JSON in a node description. Native nodes are the ones every user touches; this copy assumes engine knowledge.
3. **Runtime conditionality not mirrored by field visibility (2 fields).** if_then `value` stays visible+enabled for unary operators (runtime rejects a value) and passes readiness when missing for binary operators (runtime requires it) — no if_then save gate exists (ConfigModalShell gates only `native:router`). http_request `body` shows for GET (runtime ignores it). Both are exact fits for the new `visibleWhen` infra.
4. **Advanced tab entirely unused in this group (0 of 17 fields).** `timeoutSeconds` (safe default 15) and a future `auth` editor are natural Advanced residents on the one allowlisted developer node.
5. **Cron is the only authoring path for a mainstream trigger.** CronField has good live feedback (validity + next two UTC fires) but zero authoring help — a nontechnical user must write `0 9 * * 1-5` by hand, in UTC only.
6. **Inconsistent operator labels between sibling nodes.** if_then: "greater than or equal to"; router rows: "is ≥"; both expose "is truthy"/"is falsy" verbatim.

---

### native:http_request (action) — HTTP Request

Allowlisted wholesale developer action — raw URL/headers/body is the honest product here; the JSON body placeholder is acceptable on this node. But it currently has no Setup/Advanced structure at all, and one supported runtime capability is unreachable.

| Field | Current | Why fails/succeeds for normal user | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| method | select, req, 5 opts | OK. Description says "GET / HEAD" but HEAD is not an option (schema has 5 methods, no HEAD) | high | core-user-decision | Fix copy: "What kind of request to send. GET requests do not send a body." | — | — | values verbatim | none |
| url | text, req, recipient-sensitive | OK — clear label, placeholder, scheme note | high | core-user-decision | keep | — | — | — | none |
| headers | keyvalue ≤50 | OK structurally. No hint that pasted secrets live in workflow config | high | advanced-user-control (but common enough for Setup) | Add hint: "Sent with the request. Values are saved in this workflow's configuration — use caution with long-lived secrets." | keep in Setup | — | array-of-{key,value} materialization preserved | none |
| queryParams | keyvalue ≤50 | OK | high | core-user-decision | keep | — | — | — | none |
| body | textarea, optional, always visible | Shown for GET though runtime ignores it | high | conditional-option | `visibleWhen: {field:"method", valueIn:["POST","PUT","PATCH","DELETE"]}`; description: "Raw request body sent with the request. Up to 1 MiB. Set a Content-Type header to match." | — | — | key/shape unchanged; hidden-for-GET matches runtime ignore | GET configs w/ stale body: runtime already ignores |
| timeoutSeconds | number, default 15, in normal path | Normal users never need it; safe default exists | tuning slow APIs | safe-default → advanced-user-control | remove from normal path | `advanced: true` (default 15, min/max already in numeric) | default 15 | unchanged | none |
| *(missing)* auth | not in meta; runtime `HttpRequestAuthSchema` supports none/bearer/basic/apiKey (discriminated union) | Capability invisible; bearer/apiKey have a headers workaround, **basic auth does not** (user would have to hand-base64) | direct value | unsupported-raw-config (currently) → advanced-user-control | — | Add advanced field. Nested variant shape can't be flat fields (keys verbatim, no parse layer): either advanced `json` field `auth` with jsonShape mirroring the union, or a small dedicated renderer (like router-routes) later | optional; absent = none | must produce exact `{type,...}` union shape | new field, optional → none |

### native:format_transformer (action) — Format Transformer

Nearly clean.

| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| content, targetFormat | textarea req / select req | OK — plain labels, core decisions | — | core-user-decision | keep | — | — | — | none |
| sourceFormat | select, default auto | "`auto` lets the handler detect" — implementation voice + backticked token in non-advanced description | rare override | safe-default | Description: "What format the input text is in. Auto-detect usually gets this right; set it only if the result looks wrong." | — | default "auto" (good) | values verbatim | none |

### native:delay (action) — Delay

No findings — fields OK as-is: single required `Seconds` number with min/max 1–30 enforced by the numeric spec; seconds is the only sensible unit at a 30s cap (a unit selector would be over-engineering). LOW polish only: node description's "compose multiple scheduled triggers" is confusing advice (you can't chain triggers mid-workflow) — prefer "Pause the workflow for 1–30 seconds. Longer delays aren't supported yet."

### native:if_then_condition (action) — If/Then Condition

The comment in the meta claims an "IfThenConfig wrapper (Slice 3.6) owns the conditional rendering" — **that wrapper does not exist** (grep of `features/workflow-builder` finds no if_then-specific code). The field renders via generic SchemaForm: `dependsOn:"operator"` only disables `value` until an operator is chosen and clears it when the operator changes; it never hides it for unary operators, and there is no if_then save gate (ConfigModalShell gates `native:router` only).

| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| input | text "Input", req | Works (variable picker), but "Input" is vague | — | upstream-data-mapping | Label "Value to check"; description "The value to test — usually a variable from a previous step." | — | — | key unchanged | none |
| operator | select, req, 14 opts | **RUNTIME-BROKEN: option values `greater_than_or_equal` / `less_than_or_equal` are not in the runtime enum** (`IF_THEN_OPERATORS` has `greater_equal` / `less_equal`; `z.enum` rejects at dispatch → run fails). Also "Unary operators (e.g. is_empty) ignore the Value field" is jargon | — | core-user-decision | Fix option VALUES to `greater_equal` / `less_equal` (labels stay "greater than or equal to" etc.). Description: "How to compare. Some checks (like 'is empty') don't need a comparison value." Consider "is truthy/falsy" label softening + a meta↔evaluator parity test like the router's | — | — | corrected values ARE the runtime contract | configs already saved with bad values already fail at run; fix un-breaks new saves |
| value | text, optional, dependsOn operator | Visible+enabled for unary ops (typing anything → run-time reject "unary…does not take a value"); optional, so binary op with empty value passes readiness then fails at run. Description "Required for binary operators; forbidden for unary" is pure jargon | — | conditional-option | `visibleWhen: {field:"operator", valueIn:[the 10 binary ops]}` + `required: true` (required-when-visible readiness); keep `dependsOn` for cascade-clear. Description: "What to compare against." | — | hidden ⇒ key absent (matches unary contract) | omission-when-unary matches `.strict()`+superRefine exactly | none — existing valid configs unchanged |
| onFalse | select, default branch | "emit a false edge…unlabeled cleanup edges" — engine jargon; option label "Branch to false edge" too | — | safe-default | Option labels: "Follow the 'false' path" / "Stop this branch". Description: "What happens when the check is false: follow the 'false' path, or stop this branch here." | — | default "branch" (good) | values branch/skip verbatim | none |

Node description also embeds backticked `branchTaken: 'true'` JSON — rewrite plain: "Checks a value and sends the workflow down the 'true' or 'false' path."

### native:router (action) — Router

RouterRoutesField is genuinely good structured UX: per-row Label/Input/Operator/Value with variable pickers + latest-run previews, Value hidden for unary operators, per-row inline errors, duplicate-label detection, Save-button gating via the shared validator, clear empty state, 32-row cap. Remaining findings are copy + one field.

| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| routes | router-routes, req | Editor solid (above). Description jargon: "the edge label downstream nodes wire to". Row label placeholder is literally "label" | — | structured-composition | Description: "The paths this router can take, checked in order — the first matching route wins. Each route's name becomes a path you connect steps to." Row placeholder "e.g. High priority" | — | — | renderer already emits exact schema shape incl. unary value-omission | none |
| defaultRoute | free text; must match a route label (or deliberate fall-through) | Typing a label that must exactly match a sibling row is error-prone; typos silently produce a dead default (no cross-check anywhere) | fall-through labels | conditional-option | Convert to select whose options derive from the sibling `routes` labels, with manual entry allowed for fall-through (sibling-derived options = small renderer addition, no provider API — flag: new renderer behavior, not an optionsSource). Description: "Which path to take when no route matches. Leave empty to take no path." | — | — | still a plain string label | none |

### native:manual.run (trigger) — Manual Trigger

No fields — nothing to configure (correct; `ManualTriggerConfigSchema` is empty-strict). LOW: node description says "POST to the run-now endpoint" and shows `{{trigger.inputs.*}}` — developer copy in the default path. Prefer: "Runs the workflow when you click 'Run Now'. Any inputs you provide at run time are available to later steps." (API mention can live in docs.)

### native:schedule.fired (trigger) — Scheduled Trigger

| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| cronExpression | `cron` field: mono text input, placeholder `0 9 * * 1-5`, live preview ("Runs next at <UTC>, then <UTC>"), invalid-expression hint | Best-in-class feedback, zero authoring help: a nontechnical user must write cron syntax, in UTC, to use the platform's main non-manual trigger. Label "Cron Expression" + description "5-field UTC cron expression. Minute Hour Day-of-month Month Day-of-week" are provider-docs language. UTC-only forces mental timezone math | full cron power | core-user-decision (schedule) rendered as unsupported-raw-config for nonexperts | (a) CronField gains a preset builder — frequency select (hourly / daily / weekly / custom cron) + time/day pickers that WRITE the same 5-field string into the same key; custom mode keeps today's raw input. Renderer-only; no meta key change. (b) Label "Schedule"; description "When to run (times are UTC). Uses cron format: minute hour day month weekday — e.g. 0 9 * * 1-5 runs weekdays at 9:00 UTC." (c) Preview additionally shows the viewer's local-time equivalent ("= 2:00 AM your time") — display-only | raw cron input remains available (custom mode) | none possible (no honest default schedule) | value stays the verbatim 5-field string; presets are pure input sugar | none |

---

## Change list

### HIGH
1. `integrations/native/actions/ifThenCondition.meta.ts` — `operator` options: change values `greater_than_or_equal` → `greater_equal` and `less_than_or_equal` → `less_equal` (labels unchanged). Today both selections save a config the runtime `z.enum(IF_THEN_OPERATORS)` rejects → the run fails. Add a structural parity test (meta option values ⊆ `IF_THEN_OPERATORS`), mirroring `tests/structure/router-routes-operator-parity.test.ts`.
2. `integrations/native/actions/ifThenCondition.meta.ts` — `value`: add `visibleWhen: { field: "operator", valueIn: ["equals","not_equals","contains","not_contains","starts_with","ends_with","greater_than","less_than","greater_equal","less_equal"] }` and `required: true` (required-when-visible); keep `dependsOn: "operator"` for cascade-clear. New description: "What to compare against." Fixes both run-time traps (value typed on unary; value missing on binary passing readiness). Also fix the stale meta comment claiming an IfThenConfig wrapper exists.

### MEDIUM
3. `httpRequest.meta.ts` — `timeoutSeconds`: add `advanced: true` (safe default 15 already present).
4. `httpRequest.meta.ts` — `body`: add `visibleWhen: { field: "method", valueIn: ["POST","PUT","PATCH","DELETE"] }`; description: "Raw request body sent with the request. Up to 1 MiB. Set a Content-Type header to match."
5. `httpRequest.meta.ts` — expose runtime `auth` as an ADVANCED field: advanced `json` field validated against `HttpRequestAuthSchema` (jsonShape) now; dedicated structured auth renderer later. Unblocks basic auth (no headers workaround) without touching the normal path.
6. `ifThenCondition.meta.ts` — `onFalse`: option labels "Follow the 'false' path" / "Stop this branch"; description: "What happens when the check is false: follow the 'false' path, or stop this branch here." Node description: replace backticked-JSON copy with "Checks a value and sends the workflow down the 'true' or 'false' path."
7. `router.meta.ts` — `defaultRoute`: render as select with options derived from sibling `routes` labels + manual entry (new renderer behavior — sibling-derived options, no provider API). Description: "Which path to take when no route matches. Leave empty to take no path."
8. `scheduledTrigger.meta.ts` + `CronField.tsx` — schedule preset builder (frequency/time/day pickers emitting the same 5-field string; "custom cron" mode preserves raw input); label "Schedule"; description "When to run (times are UTC). Uses cron format: minute hour day month weekday — e.g. 0 9 * * 1-5 runs weekdays at 9:00 UTC."; preview adds viewer-local-time equivalent. Highest-leverage usability item in this group.
9. `ifThenCondition.meta.ts` — `operator` description: "How to compare. Some checks (like 'is empty') don't need a comparison value." `input`: label "Value to check", description "The value to test — usually a variable from a previous step."

### LOW
10. `httpRequest.meta.ts` — `method` description: drop the HEAD mention ("GET requests do not send a body." — HEAD isn't an offered method).
11. `httpRequest.meta.ts` — `headers` description: append caution that values are saved in workflow config (secrets hint).
12. `router.meta.ts` — `routes` description: "The paths this router can take, checked in order — the first matching route wins. Each route's name becomes a path you connect steps to."; `RouterRoutesField.tsx` row label placeholder "label" → "e.g. High priority".
13. `formatTransformer.meta.ts` — `sourceFormat` description: "What format the input text is in. Auto-detect usually gets this right; set it only if the result looks wrong."
14. Operator-label consistency: align if_then labels with router row labels (one wording set, both nodes); soften "is truthy"/"is falsy" or keep with parenthetical.
15. `delay.meta.ts` — node description: "Pause the workflow for 1–30 seconds. Longer delays aren't supported yet."
16. `manualTrigger.meta.ts` — node description: "Runs the workflow when you click 'Run Now'. Any inputs you provide at run time are available to later steps."

## Counts
- Nodes audited: 7 (5 actions, 2 triggers; manual trigger has zero fields by design)
- Fields audited: 17 (+1 runtime-only `auth` gap)
- Fields OK as-is: 7 (url, queryParams, content, targetFormat, seconds, input [wording aside], routes [structure])
- Findings: HIGH 2 · MEDIUM 7 · LOW 7
