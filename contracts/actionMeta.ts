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
     * Name of another field in the same action whose value gates this
     * field's options / visibility. When the parent changes, the
     * renderer clears this field's value and re-fetches its options.
     */
    dependsOn: z.string().min(1).max(128).optional(),
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
     * For `keyvalue` fields, hint the renderer about cap behavior. The
     * underlying handler schema enforces the authoritative cap.
     */
    keyValueMaxRows: z.number().int().positive().max(256).optional(),
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
    if ((field.options || field.optionsSource) && field.type !== "select" && field.type !== "combobox") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message:
          "`options` / `optionsSource` are only valid on `select` or `combobox` fields.",
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
    if (field.keyValueMaxRows && field.type !== "keyvalue") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["keyValueMaxRows"],
        message: "`keyValueMaxRows` is only valid on `keyvalue` fields.",
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
      const dep = meta.fields[i]!.dependsOn;
      if (dep && !fieldNames.has(dep)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "dependsOn"],
          message: `Field '${meta.fields[i]!.name}' depends on unknown field '${dep}'.`,
        });
      }
    }

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
