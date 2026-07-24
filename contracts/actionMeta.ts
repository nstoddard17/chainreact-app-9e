import { z } from "zod";

/**
 * Builder-facing metadata contract for action handlers.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.0:
 *   - Each registered action handler (services/execution/handlers/_registry.ts)
 *     gets a co-located `<action>.meta.ts` exporting an `ActionMeta` const.
 *   - The discovery registry (services/discovery/_registry.ts) imports every
 *     meta explicitly and validates against this schema at module load —
 *     same pattern as the integration manifest registry.
 *   - Runtime Zod handler schemas (e.g. `httpRequest.schema.ts`) remain the
 *     authoritative validation contract for resolved config. The metadata
 *     here is a UI / discovery facet: labels, field types, dependencies,
 *     option sources, output shape, FileRef awareness. It does NOT replace
 *     the handler schema and is NOT used to validate config at runtime.
 *
 * Key invariant: `key === "${provider}:${type}"`. The discovery registry
 * enforces this and rejects metas whose key drifts from their declared
 * (provider, type) tuple.
 *
 * Decoupled from Zod internals so a future schema-drift CI check
 * (zod-to-json-schema) can compare meta fields to handler-schema shape
 * without this contract depending on Zod's introspection API.
 */

// ─── Field metadata ──────────────────────────────────────────────────────────

/**
 * UI-renderable field types. Each maps to one renderer in
 * features/workflow-builder/config-modal/fields/<Type>Field.tsx (Slice 3.1).
 *
 * `cron` is its own type — not a `text` field with hidden validation —
 * because the renderer humanizes the expression inline ("Runs every weekday
 * at 9am") and a generic text input cannot provide that affordance.
 *
 * `router-routes` (Slice 3.6) is a dedicated type for the
 * `native:router` action's `routes` config. Shape:
 * `Array<{label, condition:{input, operator, value?}}>`. Lives as a
 * proper FieldType (not a special-case branch inside ConfigModalShell)
 * so the field-renderer registry stays the single source of "which
 * fields exist". Future actions that need conditional routes can
 * reuse the same renderer without adding more shell special cases.
 *
 * `string-array` (Slice 3.13) is a dedicated type for free-text
 * `string[]` config fields (e.g. Gmail `from[]`, Gmail `labelIds[]`,
 * future Outlook recipient filters). Distinct from `select`/`combobox`
 * + `multiple`, which represent multi-pick from a known options set —
 * `string-array` is "user-typed list of strings" rendered as chips.
 * The renderer writes `string[]` natively (never JSON-encoded, never
 * CSV). Async option sources are deliberately out of scope; that
 * concern belongs on a future `select`/`combobox` + `multiple` slice
 * paired with `optionsSource` loaders.
 *
 * `file-array` (Slice 3.21) is a dedicated type for `FileRef[]` config
 * fields whose canonical first consumer is
 * `microsoft-outlook:send_email.attachments`. Distinct from the
 * single-value `file` type. The renderer stores either canonical
 * `{{nodeId.path}}` variable tokens (resolved at runtime to upstream
 * FileRef producer outputs like `gmail:get_attachment`) or pasted
 * FileRef JSON literals. The renderer writes the array natively
 * — never JSON-encoded, never CSV, never base64. Variable-picker
 * chip-append integration lands in a follow-up slice; today the
 * renderer ships with a paste-text fallback only. Plan reference:
 * docs/slices/phase-3/file-ref-array-field-plan.md.
 */
export const FieldTypeSchema = z.enum([
  "text",
  "textarea",
  "select",
  "combobox",
  "keyvalue",
  "number",
  "boolean",
  "file",
  "cron",
  "router-routes",
  "string-array",
  "file-array",
  // CS-1 temporal family (config-field UX modernization). Native date/time
  // pickers + IANA timezone selector that store the SAME schema-expected
  // strings (no new date object shape, no silent timezone coercion):
  //   date "YYYY-MM-DD" · time "HH:MM[:SS]" · datetime "YYYY-MM-DDTHH:MM:SS"
  //   (offset-less local, paired with `timezone`) · timezone IANA name.
  // date/time/datetime share TemporalField; timezone uses TimezoneField.
  "date",
  "time",
  "datetime",
  "timezone",
  // Instant follow-up (config-field UX sweep). `datetime-utc` stores a TRUE
  // UTC instant "YYYY-MM-DDTHH:MM:SSZ" (trailing `Z`) for fields whose
  // handler/schema requires an offset/`Z` (list-event query windows, Trello
  // due/start, Mailchimp occurred_at, Slack postAt, HubSpot timestamps). It
  // shares TemporalField (picked wall-clock treated AS UTC — no zone shift).
  // Distinct from `datetime`, which is offset-LESS local wall-clock paired
  // with a separate `timezone` field.
  "datetime-utc",
  // `location` — server-proxied address autocomplete (Geoapify) with a
  // free-text fallback. Stores the formatted address STRING the provider
  // location field already accepts (no place_id / lat-lng required at
  // launch). Renderer: LocationField; proxy route: /api/geoapify/autocomplete.
  "location",
  // CONFIG-UX-AUDIT-1 — structured editors that replace paste-JSON textareas.
  //
  // `object-list` — repeating rows of a small fixed-shape object, declared
  // via `itemFields` (e.g. HubSpot webhook subscriptions
  // `[{eventType, propertyName?}]`, Stripe line items `[{priceId, quantity}]`).
  // The renderer writes a REAL `Array<Record<string, string|number|boolean>>`
  // — never a JSON-encoded string — matching what runtime Zod schemas and
  // activation hooks already expect.
  "object-list",
  // `keyvalue-list` — repeating rows where EACH row is a free-key
  // column→value map (e.g. Excel batch rows `[{Name: "Ada", Email: "…"}]`).
  // Distinct from `keyvalue` (a single `Array<{key, value}>` list) — this
  // writes `Array<Record<string, string>>` natively.
  "keyvalue-list",
  // CONFIG-UX-AUDIT-2 — `json`: the ONLY sanctioned advanced/developer
  // JSON escape hatch. Renders a textarea whose committed value is the
  // PARSED JS value (array/object per `jsonShape`), a pure `{{...}}`
  // variable string, or `undefined` — never a raw JSON string, which
  // runtime `z.array`/`z.object`/`z.record` schemas reject. Invalid or
  // shape-mismatched text stays in the draft as a string so nothing the
  // user typed is lost, and the config modal's Save gate blocks until
  // it is fixed (friendly copy only; no parser/renderer internals).
  "json",
  // CONFIG-UX-SETUP-ADVANCED-1 — `object`: a SINGLE small fixed-key object
  // edited as labeled sub-fields (one "row" of an object-list, declared by
  // the same `itemFields`). Replaces required/optional paste-JSON for flat
  // shapes (Mailchimp audience contact + campaign defaults, Shopify order
  // addresses, Stripe automaticTax). Commits a REAL
  // `Record<string, string | number | boolean>`; empty optional sub-fields
  // are omitted; an entirely-empty object commits `undefined`. Keys present
  // in a SAVED value that the meta doesn't declare are preserved verbatim
  // (never dropped by the UI). Nested / union grammars stay on `json`.
  "object",
  // SPREADSHEET-CONFIG-REDESIGN-1 — `spreadsheet-rows`: the column-aware
  // row editor for spreadsheet append/update actions (first consumer:
  // `microsoft-excel:add_row`). One composite editor owns BOTH save
  // shapes of the action's either-or contract:
  //   - "One row" mode commits THIS field's value as a positional
  //     `unknown[]` (cells in worksheet column order; in-between blanks
  //     preserved as "" so columns stay aligned),
  //   - "Several rows" mode commits the sibling field named by
  //     `batchRowsField` as `Array<Record<columnHeader, cellValue>>`
  //     and clears this field — exactly one shape is ever present.
  // Column names come from the field's `optionsSource` resolver (REAL
  // provider headers — never invented); when none can be detected the
  // renderer says so honestly and falls back to manual entry.
  "spreadsheet-rows",
  // AI-PROVIDER-4 (CS-4) — `schema-fields`: a user-defined extraction /
  // destination SCHEMA, edited as structured rows (name · type · required ·
  // description), never as JSON. Commits a real
  // `{ fields: Array<{name, type, required?, description?}> }` matching the
  // committed `UserDefinedSchemaSchema` (contracts/aiProcessing.ts), which
  // the AI processor compiles into the model's output contract.
  //
  // A dedicated FieldType rather than `object-list` + `itemFields` because a
  // schema editor needs behavior a generic row editor cannot express:
  // case-insensitive unique names, normalization into safe workflow-variable
  // identifiers (`Employee Name` → `employee_name`, so `{{node.fields.x}}`
  // stays a clean path segment), reserved-name rejection, and a Save gate.
  // Same precedent as `router-routes` (a bespoke editor for a bespoke
  // contract). Renderer: SchemaFieldsField; validator: _schemaFieldsValidator.
  "schema-fields",
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

/** Inline option for select / combobox fields whose values are static. */
export const FieldOptionSchema = z
  .object({
    value: z.string().min(1).max(256),
    label: z.string().min(1).max(256),
    description: z.string().max(512).optional(),
  })
  .strict();
export type FieldOption = z.infer<typeof FieldOptionSchema>;

/**
 * Numeric bounds for `number` fields. Captured here so the renderer can
 * surface min/max in the UI and run client-side validation before the
 * authoritative server-side Zod parse on save.
 */
export const FieldNumericBoundsSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().positive().finite().optional(),
    integer: z.boolean().optional(),
  })
  .strict();
export type FieldNumericBounds = z.infer<typeof FieldNumericBoundsSchema>;

/**
 * Apply-safety sensitivity class for a config INPUT field (AI-REPAIR-SAFETY-HARDENING
 * CS-1). Additive + optional, mirroring the `OutputMeta.sensitive` precedent (Slice
 * 3.SEC-7) and the additive `riskLevel` flags (Slice 3.SEC-2A) — existing metas parse
 * unchanged when it is omitted.
 *
 * It declares, in the schema, why a deterministic AI repair / Apply must treat a field
 * as dangerous to auto-write — so the apply-safety contract
 * (`services/workflows/patch/applySafety.ts`) can decide from METADATA instead of only
 * guessing from the field's KEY NAME. The three values map 1:1 to the apply-safety
 * block codes (no new categories, no new copy):
 *
 *   - `"secret"`     → `SECRET_WRITE` (token / password / API key / credential material)
 *   - `"connection"` → `CREDENTIAL_OR_ACCOUNT_MUTATION` (account / connection / provider
 *                      identity selector — re-points the step at a different credential)
 *   - `"recipient"`  → `RECIPIENT_CHANGE` (where a message / event / request is SENT;
 *                      still allowed only with explicit `recipientChangeConfirmed`)
 *
 * This is purely ADDITIVE protection: the existing key-name heuristics
 * (`isSecretLikeKey` / `isRecipientOrDestinationKey` / connection-identity keys) stay as
 * permanent defense-in-depth. The apply gate unions metadata WITH the heuristics and is
 * fail-closed — metadata can only ADD a block, it can NEVER clear a heuristic block.
 */
export const FieldSensitivitySchema = z.enum(["secret", "connection", "recipient"]);
export type FieldSensitivity = z.infer<typeof FieldSensitivitySchema>;

/**
 * CONFIG-UX-SETUP-ADVANCED-1 — top-level conditional visibility for a field.
 *
 * Shows the field only while a SIBLING field's value matches. Backs the
 * "specialized mode reveals its own settings" pattern (e.g. a boolean toggle
 * that reveals its detail fields, or a select whose choice enables extra
 * options) so uncommon settings stay out of the common path without being
 * demoted to Advanced.
 *
 * Semantics (see `isVisibleWhenMet`):
 *   - `valueTruthy: true`  → visible only while the sibling is boolean `true`.
 *   - `valueTruthy: false` → visible only while the sibling is NOT `true`.
 *   - `valueIn: [...]`     → visible only while the sibling is one of the
 *     listed string values.
 *   - Both set → both must hold.
 *
 * Interaction contracts:
 *   - Readiness: a `required` field hidden by an unmet `visibleWhen` is NOT a
 *     setup gap (`core/workflows/requiredFields.ts` evaluates the condition
 *     against the node config on both client and server). It becomes required
 *     the moment the mode that reveals it is enabled.
 *   - Cascade: when the CONTROLLER field changes to a value that hides a
 *     dependent, SchemaForm clears the hidden dependent's value (mirrors the
 *     `dependsOn` cascade and spreadsheet mode-toggle precedent) so a stale
 *     other-mode value can never trip an XOR/refinement at runtime. Values
 *     hydrated from a saved workflow are untouched until the user edits the
 *     controller.
 *   - Single hop: the controller must not itself declare `visibleWhen`
 *     (enforced by the meta-level superRefine) — no visibility chains.
 */
export const FieldVisibilityConditionSchema = z
  .object({
    /** Sibling field (same meta) whose value gates this field's visibility. */
    field: z.string().min(1).max(128),
    /** Visible while the sibling's value is one of these strings. */
    valueIn: z.array(z.string().min(1).max(256)).min(1).max(64).optional(),
    /** Visible while the sibling is boolean `true` (or NOT `true` when false). */
    valueTruthy: z.boolean().optional(),
  })
  .strict()
  .refine(
    (w) => w.valueIn !== undefined || w.valueTruthy !== undefined,
    "visibleWhen needs `valueIn` or `valueTruthy`.",
  );
export type FieldVisibilityCondition = z.infer<typeof FieldVisibilityConditionSchema>;

/**
 * Evaluate a top-level `visibleWhen` condition against the current config
 * values. Shared by SchemaForm (render + cascade), the readiness core
 * (`missingRequiredFields`), and the config readiness banner so "visible"
 * means exactly one thing everywhere. A field with no condition is always
 * visible.
 */
export function isVisibleWhenMet(
  condition: FieldVisibilityCondition | undefined,
  values: Readonly<Record<string, unknown>>,
): boolean {
  if (!condition) return true;
  const raw = values[condition.field];
  if (condition.valueTruthy !== undefined) {
    const isTrue = raw === true;
    if (condition.valueTruthy ? !isTrue : isTrue) return false;
  }
  if (condition.valueIn !== undefined) {
    if (typeof raw !== "string" || !condition.valueIn.includes(raw)) return false;
  }
  return true;
}

/**
 * Shared meta-level validation for top-level `visibleWhen` references —
 * used by BOTH ActionMetaSchema and TriggerMetaSchema superRefines:
 *   - the controller must be a known sibling field, and
 *   - the controller must not itself be conditionally visible (single hop).
 */
export function checkVisibleWhenReferences(
  fields: readonly FieldMeta[],
  ctx: z.RefinementCtx,
): void {
  const byName = new Map(fields.map((f) => [f.name, f]));
  for (let i = 0; i < fields.length; i++) {
    const w = fields[i]!.visibleWhen;
    if (!w) continue;
    const controller = byName.get(w.field);
    if (!controller) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fields", i, "visibleWhen"],
        message: `Field '${fields[i]!.name}' is gated by unknown field '${w.field}'.`,
      });
    } else if (controller.visibleWhen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fields", i, "visibleWhen"],
        message: `Field '${fields[i]!.name}' is gated by '${w.field}', which is itself conditionally visible (chains are not allowed).`,
      });
    }
  }
}

/**
 * RESOLVERS-3 / RESOLVERS-4 — shared meta-level validation for `itemFields`
 * option-source references. Used by BOTH ActionMetaSchema and TriggerMetaSchema
 * superRefines.
 *
 * A sub-field picker declares its parents in one of TWO explicitly-scoped ways:
 *   - `dependsOn`    → resolved against the NODE'S TOP-LEVEL config (the
 *                      object-list field's siblings).
 *   - `dependsOnRow` → resolved against the SAME ROW'S other itemFields
 *                      (RESOLVERS-4).
 *
 * Either one naming something that does not exist in ITS OWN scope can never be
 * satisfied: the options route would short-circuit MISSING_DEPENDENCY on every
 * keystroke and ship a permanently dead dropdown with no error to explain it.
 *
 * That fails LOUDLY at module load here — for every importer, not just one
 * test suite — exactly like the top-level "depends on unknown field" guard.
 * Naming the object-list field itself is rejected too: an object-list value is
 * an array of rows, never a dep string.
 */
export function checkItemFieldOptionSourceReferences(
  fields: readonly FieldMeta[],
  ctx: z.RefinementCtx,
): void {
  const topLevelNames = new Set(fields.map((f) => f.name));
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const itemFields = field.itemFields;
    if (!itemFields) continue;
    const siblingNames = new Set(itemFields.map((s) => s.name));
    for (let j = 0; j < itemFields.length; j++) {
      const sub = itemFields[j]!;
      for (const dep of normalizeDependsOn(sub.dependsOn)) {
        if (!topLevelNames.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "itemFields", j, "dependsOn"],
            message: `Sub-field '${field.name}[].${sub.name}' depends on unknown top-level field '${dep}'. Sub-field \`dependsOn\` resolves against the node's top-level fields; use \`dependsOnRow\` for another column in the same row.`,
          });
        } else if (dep === field.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "itemFields", j, "dependsOn"],
            message: `Sub-field '${field.name}[].${sub.name}' cannot depend on its own containing field '${field.name}'.`,
          });
        }
      }
      // RESOLVERS-4 — row-local scope. Same load-time loudness, resolved
      // against the sibling columns instead of the node's top level.
      for (const dep of normalizeDependsOn(sub.dependsOnRow)) {
        if (!siblingNames.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "itemFields", j, "dependsOnRow"],
            message: `Sub-field '${field.name}[].${sub.name}' depends on unknown sibling sub-field '${dep}'. \`dependsOnRow\` resolves against the other columns in the same row; use \`dependsOn\` for a top-level field.`,
          });
        }
      }
    }
  }
}

/**
 * CONFIG-UX-AUDIT-1 — sub-field of an `object-list` row (also used by the
 * single-object `object` editor).
 *
 * Still a REDUCED shape (no nesting), but as of RESOLVERS-3 a sub-field CAN
 * bind a registered `optionsSource`, so a provider identifier living inside a
 * structured row (Stripe `lineItems[].priceId`, QuickBooks
 * `lineItems[].itemId`, Shopify `line_items[].variant_id`) is PICKED from the
 * user's real account instead of hand-typed. Before RESOLVERS-3 the contract
 * could not express this and every such id was a raw text box next to a
 * registered-but-unreferenced resolver.
 *
 * `type` stays the sub-field's VALUE type — it is not a widget selector.
 * `optionsSource` upgrades the INPUT to a searchable picker while `type`
 * keeps deciding what gets committed, so a `number` sub-field bound to a
 * picker still writes a number and the runtime `.strict()` schema sees a
 * byte-identical row.
 *
 * `visibleWhen` gates a sub-field on a sibling sub-field's value in the SAME
 * row (e.g. HubSpot `propertyName` only when `eventType` ends with
 * `.propertyChange`). A sub-field hidden by `visibleWhen` is omitted from the
 * serialized row object entirely.
 *
 * ── DEP SCOPE, read before wiring a picker ────────────────────────────────
 * A sub-field picker names its parents in ONE of two EXPLICIT scopes:
 *
 *   - `dependsOn`    → the NODE'S TOP-LEVEL config (the object-list field's
 *                      siblings). Power BI `parameters[].name` depends on the
 *                      top-level `workspaceId` + `semanticModelId`.
 *   - `dependsOnRow` → the SAME ROW'S other itemFields (RESOLVERS-4). HubSpot
 *                      `subscriptions[].propertyName` depends on that row's own
 *                      `eventType`, and different rows watch different object
 *                      types — there is no honest top-level field to hoist it
 *                      to.
 *
 * Row-local dep resolution is NOT a new scope: `visibleWhen.field` above has
 * always resolved row-locally. `dependsOnRow` simply makes DEPS consistent with
 * VISIBILITY — the same row, the same sibling column — instead of forcing a
 * row-local relationship through a node-level channel that cannot express it.
 *
 * Both are enforced at module load by the meta-level superRefine: a name that
 * does not exist in the scope it declares throws, so a typo is a loud failure
 * rather than a permanently-dead dropdown.
 *
 * A picker whose option SOURCE varies per row is still not expressible (the
 * source is one static id). Dispatch on the dep value SERVER-SIDE inside one
 * resolver instead — `hubspot:subscription_properties` maps that row's
 * `eventType` prefix to the right HubSpot object type — rather than trying to
 * pick a different `optionsSource` per row.
 */
export const ObjectListItemFieldSchema = z
  .object({
    name: z.string().min(1).max(128),
    label: z.string().min(1).max(128),
    description: z.string().max(1024).optional(),
    type: z.enum(["text", "number", "select", "boolean"]),
    /**
     * Required WHEN VISIBLE. The renderer marks the input; the runtime
     * schema / activation hook stays authoritative.
     */
    required: z.boolean(),
    placeholder: z.string().max(256).optional(),
    /** Static options; only valid (and required) when `type: "select"`. */
    options: z.array(FieldOptionSchema).max(256).optional(),
    /**
     * RESOLVERS-3 — registered option-source id backing a per-row picker.
     * Only valid on `text` / `number` sub-fields (a `select` sub-field is the
     * static-options widget; `boolean` is a switch). Mutually exclusive with
     * `options`. The referenced source must be registered — enforced by
     * tests/structure/option-source-reference-integrity.test.ts, same as
     * top-level `optionsSource`.
     */
    optionsSource: z.string().min(1).max(128).optional(),
    /**
     * RESOLVERS-3 — parent field name(s) whose values the resolver needs as
     * `requiredDeps`. Resolved against the NODE'S TOP-LEVEL fields (the
     * object-list field's siblings). For a parent in the SAME ROW use
     * `dependsOnRow` — see the dep-scope note above. Only valid alongside
     * `optionsSource`.
     */
    dependsOn: z
      .union([
        z.string().min(1).max(128),
        z.array(z.string().min(1).max(128)).min(1).max(8),
      ])
      .optional(),
    /**
     * RESOLVERS-4 — parent SIBLING SUB-FIELD name(s) in the SAME ROW whose
     * values the resolver needs as `requiredDeps`. The row-local counterpart of
     * `dependsOn`, resolving in exactly the scope `visibleWhen.field` already
     * resolves in.
     *
     * Use it when the value that scopes the picker belongs to the row rather
     * than the node — HubSpot `subscriptions[].propertyName` is keyed by that
     * row's own `eventType`, and each row may watch a different object type, so
     * no top-level field could carry it honestly.
     *
     * The renderer MERGES `dependsOn` + `dependsOnRow` into one dep map for the
     * resolver, which sees a flat `ctx.deps` and neither knows nor cares which
     * scope each value came from. Both scopes share the "never call with a
     * partial dep set" rule. Only valid alongside `optionsSource`; a name may
     * not appear in both lists (its scope would be ambiguous).
     */
    dependsOnRow: z
      .union([
        z.string().min(1).max(128),
        z.array(z.string().min(1).max(128)).min(1).max(8),
      ])
      .optional(),
    /**
     * RESOLVERS-3 — let a power user commit exactly what they typed instead
     * of forcing a pick from the loaded list. Only valid alongside
     * `optionsSource`. Row identifiers are frequently mapped from an earlier
     * step via `{{...}}`, so a picker is added ALONGSIDE manual entry and
     * variable insertion, never instead of them.
     */
    allowManualEntry: z.boolean().optional(),
    /**
     * Row-local visibility condition. At least one of `valueEndsWith` /
     * `valueIn` must be set. The referenced field must be a sibling
     * sub-field in the same `itemFields` list.
     */
    visibleWhen: z
      .object({
        field: z.string().min(1).max(128),
        valueEndsWith: z.string().min(1).max(128).optional(),
        valueIn: z.array(z.string().min(1).max(256)).min(1).max(64).optional(),
      })
      .strict()
      .refine(
        (w) => w.valueEndsWith !== undefined || w.valueIn !== undefined,
        "visibleWhen needs `valueEndsWith` or `valueIn`.",
      )
      .optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "select" && (!f.options || f.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "object-list `select` sub-fields require static `options`.",
      });
    }
    if (f.type !== "select" && f.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "`options` is only valid on `select` sub-fields.",
      });
    }
    if (f.visibleWhen?.field === f.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibleWhen"],
        message: `Sub-field '${f.name}' cannot gate its own visibility.`,
      });
    }

    // RESOLVERS-3 — optionsSource invariants. Mirrors the top-level
    // FieldMetaSchema superRefine (options ⊕ optionsSource; allowManualEntry
    // only where free entry is meaningful) against the reduced sub-field
    // widget set.
    if (f.options && f.optionsSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["optionsSource"],
        message:
          "Sub-field cannot declare both `options` (static) and `optionsSource` (dynamic).",
      });
    }
    if (f.optionsSource && f.type !== "text" && f.type !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["optionsSource"],
        message:
          "`optionsSource` is only valid on `text` or `number` sub-fields.",
      });
    }
    if (f.allowManualEntry && !f.optionsSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowManualEntry"],
        message:
          "`allowManualEntry` is only valid on sub-fields with `optionsSource`.",
      });
    }
    const subDeps = normalizeDependsOn(f.dependsOn);
    if (subDeps.length > 0 && !f.optionsSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOn"],
        message: "`dependsOn` is only valid on sub-fields with `optionsSource`.",
      });
    }
    if (subDeps.includes(f.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOn"],
        message: `Sub-field '${f.name}' cannot depend on itself.`,
      });
    }
    if (new Set(subDeps).size !== subDeps.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOn"],
        message: "Duplicate entry in `dependsOn`.",
      });
    }

    // RESOLVERS-4 — the row-local dep scope. Same field-local invariants as
    // `dependsOn` (needs a source, no self-reference, no duplicates), plus the
    // cross-scope rule: one name, one scope. "Names a real sibling sub-field"
    // needs the parent field's itemFields list and is checked meta-level in
    // `checkItemFieldOptionSourceReferences`.
    const subRowDeps = normalizeDependsOn(f.dependsOnRow);
    if (subRowDeps.length > 0 && !f.optionsSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOnRow"],
        message:
          "`dependsOnRow` is only valid on sub-fields with `optionsSource`.",
      });
    }
    if (subRowDeps.includes(f.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOnRow"],
        message: `Sub-field '${f.name}' cannot depend on itself.`,
      });
    }
    if (new Set(subRowDeps).size !== subRowDeps.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOnRow"],
        message: "Duplicate entry in `dependsOnRow`.",
      });
    }
    for (const dep of subRowDeps) {
      if (subDeps.includes(dep)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dependsOnRow"],
          message: `'${dep}' appears in both \`dependsOn\` and \`dependsOnRow\` — a parent resolves in exactly one scope (top-level or row-local).`,
        });
      }
    }
  });
export type ObjectListItemField = z.infer<typeof ObjectListItemFieldSchema>;

/**
 * Normalize a `dependsOn` value into a stable `string[]`.
 *
 * `dependsOn` accepts either a single parent field name (`"baseId"`) for
 * the common single-parent cascade, or an array of parent field names
 * (`["baseId", "tableIdOrName"]`) for fields whose options resolver needs
 * more than one upstream value (Slice 4.BUILDER-OPTIONS-1). This helper is
 * the ONE place every consumer funnels through — the SchemaForm cascade,
 * the options-deps collection, the AI catalog, and contract validation —
 * so single- and multi-parent are handled identically:
 *   - `undefined`        → `[]`
 *   - `"x"`              → `["x"]`
 *   - `["a", "b"]`       → `["a", "b"]`
 */
export function normalizeDependsOn(
  dependsOn: string | readonly string[] | undefined,
): readonly string[] {
  if (dependsOn === undefined) return [];
  return typeof dependsOn === "string" ? [dependsOn] : dependsOn;
}

export const FieldMetaSchema = z
  .object({
    /** Stable field key matching the handler schema's property name. */
    name: z.string().min(1).max(128),
    /** Human-readable label rendered above the input. */
    label: z.string().min(1).max(128),
    /** Optional help text rendered below the input. */
    description: z.string().max(2048).optional(),
    type: FieldTypeSchema,
    /** When true, the renderer marks the field with an asterisk + validates non-empty. */
    required: z.boolean(),
    /**
     * Optional placeholder string. Renderer-specific:
     *   - text / textarea / number / cron: HTML placeholder.
     *   - select / combobox: shown when no value is selected.
     *   - keyvalue: not used.
     */
    placeholder: z.string().max(256).optional(),
    /**
     * Optional default value the renderer populates before user edits.
     * NOT a contract for the handler schema's `.default()` — duplicating
     * defaults across two systems courts drift. Default is purely
     * UI-side: it pre-fills the form so the user sees what will be
     * submitted if they take no action.
     */
    defaultValue: z.unknown().optional(),
    /**
     * Apply-safety sensitivity class (AI-REPAIR-SAFETY-HARDENING CS-1). Optional +
     * additive; absent = not sensitive. When set, the deterministic apply-safety
     * contract blocks an auto-write / variable-reference repair to this field via the
     * mapped block code (`secret` → SECRET_WRITE, `connection` →
     * CREDENTIAL_OR_ACCOUNT_MUTATION, `recipient` → RECIPIENT_CHANGE). Unioned WITH the
     * key-name heuristics (never replaces them); fail-closed — see
     * `FieldSensitivitySchema` and `services/workflows/patch/applySafety.ts`.
     */
    sensitivity: FieldSensitivitySchema.optional(),
    /**
     * Name(s) of other field(s) in the same action whose value(s) gate
     * this field's options / visibility. When any parent changes, the
     * renderer clears this field's value and re-fetches its options.
     *
     * - Single parent: `dependsOn: "baseId"` (the common cascade).
     * - Multiple parents: `dependsOn: ["baseId", "tableIdOrName"]`
     *   (Slice 4.BUILDER-OPTIONS-1) — for resolvers whose `requiredDeps`
     *   span more than one upstream field (e.g. `airtable:fields` needs
     *   both the base and the table). The field stays gated until EVERY
     *   parent has a value, and ALL parent values are passed to the
     *   resolver. Backward compatible: a string is still valid and
     *   behaves exactly as before.
     *
     * Use `normalizeDependsOn()` to read this uniformly as `string[]`.
     * The array form is capped at 8 parents and rejects empties /
     * duplicates / self-reference (see the superRefines below).
     */
    dependsOn: z
      .union([
        z.string().min(1).max(128),
        z.array(z.string().min(1).max(128)).min(1).max(8),
      ])
      .optional(),
    /**
     * For dynamic select / combobox fields whose options are loaded from
     * the server (e.g. Slack channel list). The string is an
     * implementation-defined token the builder UI maps to a fetch
     * (e.g. "slack:channels"). Static option lists use `options[]`
     * instead — never both.
     */
    optionsSource: z.string().min(1).max(128).optional(),
    /** Static options for select / combobox. Mutually exclusive with `optionsSource`. */
    options: z.array(FieldOptionSchema).max(256).optional(),
    /** Numeric bounds for `number` fields. */
    numeric: FieldNumericBoundsSchema.optional(),
    /**
     * Multi-select toggle for select / combobox. When true the field
     * value is `string[]` rather than `string`.
     */
    multiple: z.boolean().optional(),
    /**
     * CS-2 (config-field UX) — opt-in "name-or-ID" manual entry for an async
     * `combobox`. When true, the picker also lets a power user commit exactly
     * what they typed (e.g. paste a stable id the resolver can't list, like a
     * channel the bot can't enumerate) instead of forcing a pick from the
     * loaded options. The stored value is still the raw string the handler
     * schema expects. Default (absent/false) keeps the strict pick-from-list
     * behavior, so existing comboboxes are unchanged.
     */
    allowManualEntry: z.boolean().optional(),
    /**
     * For `keyvalue` fields, hint the renderer about cap behavior. The
     * underlying handler schema enforces the authoritative cap.
     */
    keyValueMaxRows: z.number().int().positive().max(256).optional(),
    /**
     * CONFIG-UX-AUDIT-1 — serialized shape of a `keyvalue` field.
     *
     *   - `"pairs"` (default): `Array<{key, value}>` — the native-handler
     *     shape (HTTP headers / query params; duplicates allowed).
     *   - `"record"`: `Record<string, string>` — the wire-format shape
     *     Stripe `metadata`, Mailchimp event `properties`, and Excel
     *     `update_row.values` schemas expect (`z.record`). Before this
     *     switch those fields silently saved the pairs shape, which the
     *     runtime schema rejected.
     *
     * UI is identical in both modes; only the committed value differs.
     */
    keyValueShape: z.enum(["pairs", "record"]).optional(),
    /**
     * For `string-array` fields, the maximum number of items the chip
     * renderer accepts. When reached, the Add affordance is disabled.
     * The underlying handler schema enforces the authoritative cap;
     * this is a UI hint only. Mirrors `keyValueMaxRows`'s 256 ceiling.
     */
    stringArrayMaxItems: z.number().int().positive().max(256).optional(),
    /**
     * For `file-array` fields, the maximum number of FileRef chips the
     * renderer accepts. When reached, the Add affordance is disabled.
     * The underlying handler schema enforces the authoritative cap
     * (Outlook Graph caps the combined attachment payload at 25 MB; per-
     * provider attachment-count limits vary). This is a UI hint only.
     *
     * Capped at 64 — file lists in real workflows are bounded by per-
     * provider size policies, so a tighter cap than `stringArrayMaxItems`'s
     * 256 keeps drift visible (a meta asking for 200 attachments is
     * almost certainly wrong).
     */
    fileArrayMaxItems: z.number().int().positive().max(64).optional(),
    /**
     * CONFIG-UX-AUDIT-1 — row shape for `object-list` fields. Required for
     * (and only valid on) `object-list`. Each entry declares one sub-field
     * of every row; the renderer serializes rows as plain objects keyed by
     * these names.
     */
    itemFields: z.array(ObjectListItemFieldSchema).min(1).max(16).optional(),
    /**
     * For `object-list` / `keyvalue-list`, the maximum number of rows the
     * renderer accepts. UI hint only — the runtime schema stays
     * authoritative (mirrors `keyValueMaxRows`).
     */
    listMaxItems: z.number().int().positive().max(1000).optional(),
    /**
     * CONFIG-UX-AUDIT-1 — marks a developer-grade escape hatch (e.g. a raw
     * Notion filter, Slack Block Kit JSON). SchemaForm renders advanced
     * fields inside a collapsed "Advanced" disclosure so they never sit in
     * the normal setup path. Product rule: JSON-flavored help text is
     * allowed ONLY on advanced fields, and never in a field's label —
     * enforced by tests/unit/features/workflow-builder/config-copy-guard.
     */
    advanced: z.boolean().optional(),
    /**
     * CONFIG-UX-SETUP-ADVANCED-1 — show this field only while a sibling
     * field's value matches (specialized-mode reveal). See
     * `FieldVisibilityConditionSchema` for semantics, readiness interaction,
     * and the controller-change clearing cascade. Cross-field reference
     * validity is enforced by the meta-level superRefines.
     */
    visibleWhen: FieldVisibilityConditionSchema.optional(),
    /**
     * SPREADSHEET-CONFIG-REDESIGN-1 — for `spreadsheet-rows` fields, the
     * NAME of the sibling field that stores the batch ("Several rows")
     * shape (`Array<Record<columnHeader, cellValue>>`). The composite
     * editor commits exactly one of {this field, the batch field} at a
     * time, matching either-or runtime refinements (Excel `values` XOR
     * `rows`). The referenced sibling declares `renderedBy` pointing back
     * at this field so it never renders a duplicate standalone editor.
     */
    batchRowsField: z.string().min(1).max(128).optional(),
    /**
     * SPREADSHEET-CONFIG-REDESIGN-1 — marks a field whose value is
     * committed by ANOTHER field's composite editor (named here). The
     * SchemaForm skips this field's standalone renderer; the field stays
     * a full citizen everywhere else (AI catalog, dependsOn clearing,
     * runtime schema). The referenced field must be a sibling in the same
     * meta and must not itself declare `renderedBy`.
     */
    renderedBy: z.string().min(1).max(128).optional(),
    /**
     * AI-PROVIDER-7 (CS-7) — for a `schema-fields` field, the NAME of the
     * sibling field whose value provides the SAMPLE that "Suggest fields"
     * reads (`ai:analyze_document.file`, `ai:transform_data.input`).
     *
     * Declarative rather than heuristic: without it the editor would have to
     * guess which of the node's inputs is "the document", and a guess that is
     * right for today's two AI actions would silently pick the wrong field for
     * the third. The referenced field must be a declared sibling, and only a
     * `schema-fields` field may declare it (enforced by the superRefines).
     *
     * Optional and additive — a `schema-fields` editor without it simply has
     * no Suggest-fields affordance.
     */
    sampleSourceField: z.string().min(1).max(128).optional(),
    /**
     * CONFIG-UX-AUDIT-2 — expected top-level shape for a `json` field,
     * mirroring the runtime schema's contract:
     *
     *   - `"array"`  → runtime expects `z.array(...)` (Slack blocks,
     *     Sheets batch updates, Airtable records, Notion children/sorts).
     *   - `"object"` → runtime expects `z.object`/`z.record`/a union of
     *     objects (Notion parent/properties/filter, addresses, Stripe
     *     automaticTax/afterCompletion, Monday column values).
     *   - `"any"`    → any JSON value accepted (no current consumer;
     *     escape valve for future forward-passed grammars).
     *
     * The JsonField renderer + the config modal's Save gate validate the
     * draft against this before commit. Defaults to `"any"` when absent.
     */
    jsonShape: z.enum(["array", "object", "any"]).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.options && field.optionsSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message:
          "Field cannot declare both `options` (static) and `optionsSource` (dynamic).",
      });
    }
    if (field.options && field.type !== "select" && field.type !== "combobox") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message: "Static `options` are only valid on `select` or `combobox` fields.",
      });
    }
    // `optionsSource` (dynamic) is valid on select / combobox AND on `string-array`
    // (CONFIG-FIELD-UX-SWEEP-2 Scope B — per-chip option picking that stores stable
    // ids while showing friendly labels) AND on `spreadsheet-rows`
    // (SPREADSHEET-CONFIG-REDESIGN-1 — the columns resolver that supplies REAL
    // worksheet/table column names to the row editor).
    if (
      field.optionsSource &&
      field.type !== "select" &&
      field.type !== "combobox" &&
      field.type !== "string-array" &&
      field.type !== "spreadsheet-rows"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message:
          "`optionsSource` is only valid on `select`, `combobox`, `string-array`, or `spreadsheet-rows` fields.",
      });
    }
    if (field.numeric && field.type !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["numeric"],
        message: "`numeric` is only valid on `number` fields.",
      });
    }
    if (field.multiple && field.type !== "select" && field.type !== "combobox") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["multiple"],
        message: "`multiple` is only valid on `select` or `combobox` fields.",
      });
    }
    if (
      field.allowManualEntry &&
      field.type !== "combobox" &&
      field.type !== "string-array"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowManualEntry"],
        message: "`allowManualEntry` is only valid on `combobox` or `string-array` fields.",
      });
    }
    if (field.keyValueMaxRows && field.type !== "keyvalue") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keyValueMaxRows"],
        message: "`keyValueMaxRows` is only valid on `keyvalue` fields.",
      });
    }
    if (field.keyValueShape && field.type !== "keyvalue") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keyValueShape"],
        message: "`keyValueShape` is only valid on `keyvalue` fields.",
      });
    }
    if (field.jsonShape && field.type !== "json") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jsonShape"],
        message: "`jsonShape` is only valid on `json` fields.",
      });
    }
    // SPREADSHEET-CONFIG-REDESIGN-1 — field-local invariants for the
    // composite spreadsheet row editor. Cross-field "must reference a
    // known sibling" checks live in the meta-level superRefine.
    if (field.batchRowsField && field.type !== "spreadsheet-rows") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["batchRowsField"],
        message: "`batchRowsField` is only valid on `spreadsheet-rows` fields.",
      });
    }
    if (field.batchRowsField === field.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["batchRowsField"],
        message: `Field '${field.name}' cannot name itself as its batch field.`,
      });
    }
    if (field.renderedBy === field.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["renderedBy"],
        message: `Field '${field.name}' cannot be rendered by itself.`,
      });
    }
    // AI-PROVIDER-7 — the Suggest-fields sample source. Field-local invariants
    // only; "names a real sibling" needs the full field list and lives in the
    // meta-level superRefine.
    if (field.sampleSourceField && field.type !== "schema-fields") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sampleSourceField"],
        message: "`sampleSourceField` is only valid on `schema-fields` fields.",
      });
    }
    if (field.sampleSourceField === field.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sampleSourceField"],
        message: `Field '${field.name}' cannot be its own sample source.`,
      });
    }
    if (field.type === "json" && field.advanced !== true) {
      // CONFIG-UX-AUDIT-2 product rule: raw-JSON entry exists ONLY as an
      // advanced/developer escape hatch — a json field in the normal
      // setup path would reintroduce the paste-JSON UX AUDIT-1 removed.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["advanced"],
        message: "`json` fields must be marked `advanced: true` (developer escape hatch only).",
      });
    }
    if (field.stringArrayMaxItems && field.type !== "string-array") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stringArrayMaxItems"],
        message: "`stringArrayMaxItems` is only valid on `string-array` fields.",
      });
    }
    if (field.fileArrayMaxItems && field.type !== "file-array") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileArrayMaxItems"],
        message: "`fileArrayMaxItems` is only valid on `file-array` fields.",
      });
    }
    if (
      (field.type === "object-list" || field.type === "object") &&
      !field.itemFields
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemFields"],
        message: `\`${field.type}\` fields must declare \`itemFields\`.`,
      });
    }
    if (
      field.itemFields &&
      field.type !== "object-list" &&
      field.type !== "object"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemFields"],
        message:
          "`itemFields` is only valid on `object-list` or `object` fields.",
      });
    }
    if (field.itemFields) {
      const subNames = new Set(field.itemFields.map((f) => f.name));
      if (subNames.size !== field.itemFields.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["itemFields"],
          message: "Duplicate sub-field name in `itemFields`.",
        });
      }
      for (let i = 0; i < field.itemFields.length; i++) {
        const w = field.itemFields[i]!.visibleWhen;
        if (w && !subNames.has(w.field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["itemFields", i, "visibleWhen"],
            message: `visibleWhen references unknown sub-field '${w.field}'.`,
          });
        }
      }
    }
    if (
      field.listMaxItems &&
      field.type !== "object-list" &&
      field.type !== "keyvalue-list"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["listMaxItems"],
        message:
          "`listMaxItems` is only valid on `object-list` or `keyvalue-list` fields.",
      });
    }

    // CONFIG-UX-SETUP-ADVANCED-1 — a field can't gate its own visibility.
    // Cross-field checks (known sibling, no chains) live in the meta-level
    // superRefine via `checkVisibleWhenReferences`.
    if (field.visibleWhen?.field === field.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibleWhen"],
        message: `Field '${field.name}' cannot gate its own visibility.`,
      });
    }

    // Slice 4.BUILDER-OPTIONS-1 — field-local dependsOn invariants
    // (self-reference + duplicates). The cross-field "parent must be a
    // known sibling" check lives in the meta-level superRefine, where
    // the full field list is in scope.
    const deps = normalizeDependsOn(field.dependsOn);
    if (deps.includes(field.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOn"],
        message: `Field '${field.name}' cannot depend on itself.`,
      });
    }
    if (new Set(deps).size !== deps.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependsOn"],
        message: "Duplicate entry in `dependsOn`.",
      });
    }
  });
export type FieldMeta = z.infer<typeof FieldMetaSchema>;

// ─── Output metadata ─────────────────────────────────────────────────────────

/**
 * Output types the variable picker (Slice 3.7) renders as type chips. The
 * `fileRef` type signals a downstream node may consume the value via a
 * `file` field; the picker shows a file icon.
 */
export const OutputTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "fileRef",
  "unknown",
]);
export type OutputType = z.infer<typeof OutputTypeSchema>;

export interface OutputMeta {
  /** Stable output path key, e.g. `messageId` or `attachments`. */
  name: string;
  type: OutputType;
  description?: string;
  /**
   * For `object` outputs whose nested fields are exposed in the variable
   * picker. Self-recursive — kept as a type alias rather than `z.lazy`
   * to keep the contract import surface flat.
   */
  fields?: readonly OutputMeta[];
  /**
   * Slice 3.SEC-7 — marks this output (or nested field) as containing
   * sensitive data: PII, secrets, signed URLs, message bodies, payment
   * data, customer emails, etc. Consumers:
   *
   *   - Run-details API (`app/api/workflows/_shared.ts:toWorkflowRunDetail`)
   *     replaces the value with the redaction sentinel before serializing
   *     to the client. The DB row stays unmodified — first-tier
   *     mitigation is read-side only.
   *   - Variable picker (`features/workflow-builder/config-modal/fields/
   *     VariablePickerPopover.tsx`) renders a "Sensitive" warning chip
   *     next to the output button and replaces the latest-run preview
   *     value with "[REDACTED]" / "Sensitive value hidden".
   *   - The variable token is still INSERTABLE — sensitive-flagged values
   *     can still flow into downstream nodes; this slice's goal is to
   *     stop accidental visual exposure in the builder + API, not to
   *     prevent legitimate data flow. Stricter policies (hide from
   *     picker entirely; refuse to wire into certain field types) ship
   *     in follow-up slices.
   *
   * Default behavior when omitted: NOT sensitive. Existing metas continue
   * parsing without modification; this is a purely additive flag.
   *
   * Nested handling: when an `object`-typed output declares `fields[]`,
   * each child can carry its own `sensitive` flag. The redaction helper
   * descends into the object and redacts only the marked children. When
   * a parent `object` itself is marked sensitive, the helper redacts the
   * whole subtree without descending — useful when nested shape varies
   * per row (e.g. Notion `properties` map).
   */
  sensitive?: boolean;
  /**
   * Marks that the runtime output for this field (or nested field) can be
   * `null` even though `type` names the value's shape WHEN PRESENT (e.g. a
   * `type: "string"` field a provider may omit -> `null`). Honest output
   * contract: a handler that returns `value ?? null` MUST set this so the
   * variable picker / downstream consumers know the value may be absent.
   *
   * Default when omitted: NOT nullable (the field is always present). Purely
   * additive — existing metas parse unchanged; consumers that don't read it are
   * unaffected (same posture as `sensitive`). `type` stays the value's shape;
   * this is the orthogonal presence signal (avoids a `"string|null"` type
   * explosion in `OutputType`).
   */
  nullable?: boolean;
}

// Zod schema mirrors the type. `z.lazy` makes the recursion explicit; the
// inferred type is reconciled via `z.ZodType<OutputMeta>` so consumers
// import the TS interface above (cleaner doc surface).
export const OutputMetaSchema: z.ZodType<OutputMeta> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1).max(128),
      type: OutputTypeSchema,
      description: z.string().max(2048).optional(),
      fields: z.array(OutputMetaSchema).max(64).optional(),
      sensitive: z.boolean().optional(),
      nullable: z.boolean().optional(),
    })
    .strict(),
);

// ─── Action metadata ─────────────────────────────────────────────────────────

/**
 * Top-level action metadata. The builder library panel renders one row per
 * `ActionMeta`; clicking opens the config modal hydrated from `fields`.
 *
 * `key` is the canonical lookup `${provider}:${type}` and matches the
 * handler-registry's primary key. The discovery registry enforces this
 * invariant at module load.
 *
 * `requiresIntegration` separates native actions (false — no OAuth) from
 * provider actions (true — disconnected provider blocks activation,
 * surfaces inline reconnect CTA).
 *
 * `producesFileRef` / `consumesFileRef` drive the variable picker's file
 * icon and the upcoming Slice 3.7 file-aware data passing.
 *
 * `displayOrder` lets a provider impose a non-alphabetical sort within
 * the library panel (e.g. Slack might surface `send_channel_message`
 * above `list_users` even though alphabetical sort would invert it).
 * Defaults to `null` — alphabetical sort by `displayName`.
 */
export const ActionCategorySchema = z.enum([
  "messaging",
  "email",
  "calendar",
  "files",
  "data",
  "commerce",
  "crm",
  "marketing",
  "developer",
  "logic",
  "http",
  "transform",
  "scheduling",
  // AI-PROVIDER-4 (CS-4) — the ChainReact AI provider's capabilities
  // (Analyze Document, Transform Data). A first-class category rather than
  // `transform`/`other`: these nodes are metered (AI credits), model-backed,
  // and grouped under their own picker section, so lumping them in with
  // deterministic transforms would misdescribe both cost and behavior.
  "ai",
  "other",
]);
export type ActionCategory = z.infer<typeof ActionCategorySchema>;

/**
 * Action risk classification — Slice 3.SEC-2A.
 *
 *   - `low`    — Pure reads, logic nodes, format/transform, idempotent
 *                state reads. Default when no risk fields are set.
 *   - `medium` — Mutates external provider state in a way that's
 *                recoverable (rename channel, move email, update
 *                record). Includes external-comm send-like actions
 *                whose effects can be deleted/recalled.
 *   - `high`   — Money-moving, externally-irreversible, or arbitrary
 *                egress (Stripe writes, deletes, archives, the native
 *                `http_request` action).
 *
 * Drives downstream consumers:
 *   - Builder UI: ranks library items, warns before drag-into-workflow
 *     for `high`, surfaces typed-confirmation modals for
 *     `requiresConfirmation: true`.
 *   - Engine (Slice SEC-2, future): test-mode short-circuits handlers
 *     marked `isDestructive: true` to prevent accidental real-world
 *     side effects during a builder Run-now.
 *
 * This file is the SINGLE source of truth for the enum string set.
 * Consumers MUST import `RiskLevel` rather than re-declaring.
 */
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Config-derived output declaration (AI-PROVIDER-4 CS-4).
 *
 * Outputs are otherwise STATIC per action type: `OutputMeta[]` is
 * hand-declared and the variable picker reads only that. Some actions,
 * though, produce a shape the AUTHOR defines — `ai:analyze_document` in
 * "extract fields" mode returns exactly the fields the user listed in its
 * `schema-fields` config. Without a declaration the picker cannot offer
 * `{{node.fields.employee_name}}` (the runtime resolver already walks
 * arbitrary paths, so hand-typed references work; only discovery is blind).
 *
 * This declaration is the CONTRACT half: it says "the child fields of the
 * output named `attachUnder` come from the config field named
 * `configField`". The synthesis half is `applyDynamicOutputs`
 * (core/workflows/dynamicOutputs.ts, CS-8), consumed by the builder's
 * variable-source resolution (`useUpstreamVariables`) and the AI planner's
 * variables tool. Keeping the halves separate leaves a forward path to
 * server-side evaluation without another contract change.
 *
 * Validation (meta-level superRefine):
 *   - `configField` must name a declared field, and that field MUST be
 *     `schema-fields` (the only shape whose rows describe an output schema);
 *   - `attachUnder` must name a declared output of type `object` or `array`
 *     (a scalar output has no children to attach);
 *   - `whenField` must name a declared field; `whenValueIn` requires
 *     `whenField` (a value list with nothing to test is a contradiction);
 *   - one declaration per `attachUnder` (two sources for the same output's
 *     children is ambiguous), and no duplicate (configField, attachUnder) pair.
 */
export const DynamicOutputsDeclarationSchema = z
  .object({
    /** Name of the `schema-fields` config field describing the shape. */
    configField: z.string().min(1).max(64),
    /** Name of the static output whose children are synthesized. */
    attachUnder: z.string().min(1).max(64),
    /** Optional gate: only applies when this sibling field matches. */
    whenField: z.string().min(1).max(64).optional(),
    /** Values of `whenField` that activate this declaration. */
    whenValueIn: z.array(z.string().min(1).max(128)).min(1).max(16).optional(),
  })
  .strict()
  .superRefine((decl, ctx) => {
    if (decl.whenValueIn !== undefined && decl.whenField === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whenValueIn"],
        message: "`whenValueIn` requires `whenField`.",
      });
    }
  });
export type DynamicOutputsDeclaration = z.infer<
  typeof DynamicOutputsDeclarationSchema
>;

/**
 * Shared meta-level validation for `dynamicOutputs` (used by ActionMetaSchema;
 * exported so a future TriggerMeta equivalent reuses one implementation).
 */
export function checkDynamicOutputsReferences(
  fields: readonly { name: string; type: FieldType }[],
  outputs: readonly { name: string; type: OutputType }[],
  declarations: readonly DynamicOutputsDeclaration[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (!declarations || declarations.length === 0) return;
  const fieldByName = new Map(fields.map((f) => [f.name, f]));
  const outputByName = new Map(outputs.map((o) => [o.name, o]));
  const seenAttachUnder = new Set<string>();
  const seenPairs = new Set<string>();

  for (let i = 0; i < declarations.length; i++) {
    const decl = declarations[i]!;
    const source = fieldByName.get(decl.configField);
    if (!source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i, "configField"],
        message: `dynamicOutputs references unknown config field '${decl.configField}'.`,
      });
    } else if (source.type !== "schema-fields") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i, "configField"],
        message: `dynamicOutputs source '${decl.configField}' must be a 'schema-fields' field (got '${source.type}').`,
      });
    }

    const target = outputByName.get(decl.attachUnder);
    if (!target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i, "attachUnder"],
        message: `dynamicOutputs references unknown output '${decl.attachUnder}'.`,
      });
    } else if (target.type !== "object" && target.type !== "array") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i, "attachUnder"],
        message: `dynamicOutputs target '${decl.attachUnder}' must be an 'object' or 'array' output (got '${target.type}').`,
      });
    }

    if (decl.whenField !== undefined && !fieldByName.has(decl.whenField)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i, "whenField"],
        message: `dynamicOutputs references unknown config field '${decl.whenField}'.`,
      });
    }

    if (seenAttachUnder.has(decl.attachUnder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i, "attachUnder"],
        message: `Output '${decl.attachUnder}' already has a dynamicOutputs declaration (one source per output).`,
      });
    }
    seenAttachUnder.add(decl.attachUnder);

    const pair = `${decl.configField}→${decl.attachUnder}`;
    if (seenPairs.has(pair)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dynamicOutputs", i],
        message: `Duplicate dynamicOutputs declaration '${pair}'.`,
      });
    }
    seenPairs.add(pair);
  }
}

export const ActionMetaSchema = z
  .object({
    /** Canonical `${provider}:${type}` lookup key. */
    key: z.string().regex(/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_]*$/),
    provider: z.string().min(1).max(64),
    type: z.string().min(1).max(64),
    displayName: z.string().min(1).max(128),
    description: z.string().min(1).max(2048),
    category: ActionCategorySchema,
    requiresIntegration: z.boolean(),
    fields: z.array(FieldMetaSchema).max(128),
    outputs: z.array(OutputMetaSchema).max(128).default([]),
    producesFileRef: z.boolean().default(false),
    consumesFileRef: z.boolean().default(false),
    /** Optional sort hint within a provider's action list. Lower = earlier. */
    displayOrder: z.number().int().nullable().default(null),
    /**
     * Slice 3.SEC-2A — Action risk metadata. All four fields are
     * additive + default-bearing so pre-existing metas continue parsing
     * without modification; only metas that ARE destructive / high-risk
     * need to set them explicitly. See `RiskLevelSchema` JSDoc for the
     * semantics.
     *
     * Defaults intentionally cluster on the safe side:
     *   - `isDestructive: false` — only set true for irreversible OR
     *     hard-to-reverse provider-side side effects (refund, delete,
     *     archive, cancel subscription, capture payment).
     *   - `requiresConfirmation: false` — only set true for actions
     *     that move money or trigger downstream legal / regulatory
     *     workflows (Stripe refund/capture/cancel; future delete-user
     *     style actions).
     *   - `riskLevel: "low"` — default. Set `medium` for recoverable
     *     external mutations (rename, update, move), `high` for
     *     irreversible / money-moving / arbitrary-egress.
     *   - `riskDescription`: optional one-liner shown next to the
     *     risk chip in the builder UI. Capped at 512 chars to stay
     *     tooltip-sized.
     *
     * IMPORTANT: setting `isDestructive: true` OR `requiresConfirmation:
     * true` MUST be paired with `riskLevel: "high"`. Enforced by the
     * superRefine below.
     */
    isDestructive: z.boolean().default(false),
    requiresConfirmation: z.boolean().default(false),
    riskLevel: RiskLevelSchema.default("low"),
    riskDescription: z.string().max(512).optional(),
    /**
     * AI-PROVIDER-4 (CS-4) — optional config-derived output declarations.
     * Additive and default-free: every existing meta parses unchanged.
     * Synthesized into the effective output tree by `applyDynamicOutputs`
     * (CS-8). See `DynamicOutputsDeclarationSchema`.
     */
    dynamicOutputs: z.array(DynamicOutputsDeclarationSchema).min(1).max(4).optional(),
  })
  .strict()
  .superRefine((meta, ctx) => {
    if (meta.key !== `${meta.provider}:${meta.type}`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["key"],
        message: `Action key '${meta.key}' must equal '${meta.provider}:${meta.type}'.`,
      });
    }
    const fieldNames = new Set<string>();
    for (let i = 0; i < meta.fields.length; i++) {
      const name = meta.fields[i]!.name;
      if (fieldNames.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "name"],
          message: `Duplicate field name '${name}'.`,
        });
      }
      fieldNames.add(name);
    }
    for (let i = 0; i < meta.fields.length; i++) {
      for (const dep of normalizeDependsOn(meta.fields[i]!.dependsOn)) {
        if (!fieldNames.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "dependsOn"],
            message: `Field '${meta.fields[i]!.name}' depends on unknown field '${dep}'.`,
          });
        }
      }
    }

    // CONFIG-UX-SETUP-ADVANCED-1 — visibleWhen must reference a known,
    // unconditionally-visible sibling.
    checkVisibleWhenReferences(meta.fields, ctx);

    // RESOLVERS-3 — an itemField picker's `dependsOn` must name a real
    // TOP-LEVEL sibling (row-local deps are not supported).
    checkItemFieldOptionSourceReferences(meta.fields, ctx);

    // SPREADSHEET-CONFIG-REDESIGN-1 — composite-editor references must
    // resolve to known siblings, and a `renderedBy` target must be a
    // real standalone editor (never itself rendered by someone else).
    const fieldByName = new Map(meta.fields.map((f) => [f.name, f]));
    for (let i = 0; i < meta.fields.length; i++) {
      const f = meta.fields[i]!;
      if (f.batchRowsField && !fieldNames.has(f.batchRowsField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "batchRowsField"],
          message: `Field '${f.name}' names unknown batch field '${f.batchRowsField}'.`,
        });
      }
      // AI-PROVIDER-7 — a Suggest-fields sample source must name a real
      // sibling, or the button would read a field that does not exist.
      if (f.sampleSourceField && !fieldNames.has(f.sampleSourceField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "sampleSourceField"],
          message: `Field '${f.name}' names unknown sample source '${f.sampleSourceField}'.`,
        });
      }
      if (f.renderedBy) {
        const target = fieldByName.get(f.renderedBy);
        if (!target) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "renderedBy"],
            message: `Field '${f.name}' is rendered by unknown field '${f.renderedBy}'.`,
          });
        } else if (target.renderedBy) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "renderedBy"],
            message: `Field '${f.name}' is rendered by '${f.renderedBy}', which is itself rendered by another field.`,
          });
        }
      }
    }

    // AI-PROVIDER-4 — config-derived output declarations must resolve to a
    // real `schema-fields` config field and a real object/array output.
    checkDynamicOutputsReferences(
      meta.fields,
      meta.outputs,
      meta.dynamicOutputs,
      ctx,
    );

    // Slice 3.SEC-2A — risk-flag consistency. `isDestructive` and
    // `requiresConfirmation` are both stronger claims than mere
    // `riskLevel: "medium"`; if either is true the meta MUST also
    // declare `riskLevel: "high"`. Catches drift where a destructive
    // action is left implicitly low because the author forgot the
    // matching risk level.
    if (meta.isDestructive && meta.riskLevel !== "high") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskLevel"],
        message:
          "`isDestructive: true` requires `riskLevel: \"high\"` (destructive actions are always high-risk).",
      });
    }
    if (meta.requiresConfirmation && meta.riskLevel !== "high") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskLevel"],
        message:
          "`requiresConfirmation: true` requires `riskLevel: \"high\"` (only high-risk actions warrant a confirmation step).",
      });
    }
  });
export type ActionMeta = z.infer<typeof ActionMetaSchema>;
