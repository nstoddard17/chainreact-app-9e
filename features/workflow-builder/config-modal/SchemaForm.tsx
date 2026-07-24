"use client";

import * as React from "react";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import { isVisibleWhenMet, normalizeDependsOn } from "@/contracts/actionMeta";
import { getFieldRenderer } from "./fields/_registry";

/**
 * Schema-driven form. Renders one field per entry in `fields[]` using
 * the field-renderer registry. Generic over the metadata shape — works
 * for ActionMeta.fields, TriggerMeta.fields, and any other future
 * FieldMeta-keyed surface.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.1:
 *   - Pure presentational; no fetch / no service imports.
 *   - Controlled component — caller owns `values` + `errors` + applies
 *     `onChange` to its in-progress store (configSlice in v1).
 *   - Per-FieldType behavior lives entirely inside renderers.
 *   - Unknown FieldType is a developer error (registry covers every
 *     FieldType variant via TypeScript exhaustiveness) — but we render
 *     a visible error rather than throwing so the rest of the form is
 *     usable while authors triage.
 *
 * `dependsOn` cascade wiring (Slice 3.33; multi-parent in Slice
 * 4.BUILDER-OPTIONS-1).
 *
 *   - `field.dependsOn` may name a single parent (`"baseId"`) OR several
 *     (`["baseId", "tableIdOrName"]`). SchemaForm normalizes via
 *     `normalizeDependsOn` and, for the parents that resolve to known
 *     fields in the same `fields[]` list, computes:
 *       - `enabled = EVERY parent has a non-empty string value`
 *       - `deps   = { [p1]: v1, [p2]: v2, … }` once ALL parents are
 *                  present; undefined while any is still missing (so the
 *                  resolver is never called with a partial dep set).
 *       - `parentLabel = the label(s) of the still-missing parent(s)`
 *                  (used by async-options renderers for the
 *                  "Select <parentLabel> first" hint). For a single
 *                  parent this is exactly the parent's label as before.
 *   - On every `onChange(name, value)` dispatch, SchemaForm also clears
 *     direct dependents (fields that list `name` among their parents) by
 *     dispatching `onChange(child, undefined)`. A multi-parent child is
 *     registered under EACH of its parents, so changing any one parent
 *     clears it. Single-hop only — multi-level traversal is out of scope.
 *
 *   The wrapping handler is a stable per-render closure; it never
 *   re-enters itself because dependents are cleared via direct calls
 *   to the consumer's `onChange`, not the wrapped variant.
 */

export interface SchemaFormProps {
  /** Field definitions; usually `meta.fields`. */
  fields: readonly FieldMeta[];
  /** Current values keyed by FieldMeta.name. Missing keys render as empty. */
  values: Readonly<Record<string, unknown>>;
  /** Inline error messages keyed by FieldMeta.name. */
  errors?: Readonly<Record<string, string | undefined>>;
  onChange: (name: string, value: unknown) => void;
  /** When true, every renderer is disabled (workflow is in a state that can't be edited). */
  disabled?: boolean;
  className?: string;
  /**
   * Slice 4.AI-REPAIR-2F — the field KEY (FieldMeta.name) to visually call out
   * and scroll into view (e.g. when the user clicked "Open Message field" on a
   * blocked repair preview). Display/navigation only — it never changes a value.
   * No match → nothing is highlighted.
   */
  highlightFieldName?: string;
  /**
   * CONFIG-UX-SETUP-ADVANCED-1 — which slice of the field list to RENDER:
   *
   *   - `"setup"`    → only non-advanced fields (the default Setup tab).
   *   - `"advanced"` → only `advanced: true` fields, each wrapped in the
   *     override frame ("Custom value set" + Reset) so a power-user change
   *     is visibly distinct from standard behavior.
   *   - omitted      → legacy single-surface mode: normal fields plus the
   *     collapsed "Advanced" `<details>` disclosure (kept for callers that
   *     don't compose tabs).
   *
   * IMPORTANT: pass the FULL `fields` list regardless of section. The form
   * keeps every field in scope for `dependsOn`/`visibleWhen` cascades and
   * parent lookups; `section` only filters what is drawn. Both sections
   * share the same `values`/`errors`/`onChange`, so pending edits survive
   * tab switches by construction.
   */
  section?: "setup" | "advanced";
  /**
   * 5.DUAL-BUILDER-1 CS-2 — draw ONLY the named field (the Document Guided
   * Stop's single-question editor) while keeping the FULL `fields` list in
   * scope, exactly like `section`: dependsOn parents resolve from `values`,
   * changing the drawn field still clears its direct dependents and hidden
   * `visibleWhen` siblings, and composite/advanced semantics are unchanged.
   * A field hidden by `visibleWhen`, composite-managed, or unknown draws
   * nothing (the caller owns that state). Takes precedence over `section`.
   */
  only?: string;
}

/**
 * Build a `parent → [direct children]` map from the fields list. A
 * dependsOn entry pointing to a name not present in `fields` is silently
 * ignored — the child renders as enabled=false and its value (if any)
 * stays as-is. A multi-parent child is registered under EACH of its
 * known parents, so changing any one parent clears it.
 */
function buildChildrenByParent(
  fields: readonly FieldMeta[],
): ReadonlyMap<string, readonly string[]> {
  const knownNames = new Set(fields.map((f) => f.name));
  const map = new Map<string, string[]>();
  for (const f of fields) {
    for (const parent of normalizeDependsOn(f.dependsOn)) {
      if (!knownNames.has(parent)) continue;
      const bucket = map.get(parent);
      if (bucket) bucket.push(f.name);
      else map.set(parent, [f.name]);
    }
  }
  return map;
}

/**
 * Normalize a raw `values[name]` entry into a parent string for
 * dependsOn purposes. Treats only non-empty strings as "parent
 * present". Numbers / booleans / arrays / objects don't drive parent-
 * child option chains today (the resolvers we ship — Slack channels,
 * future Airtable bases, etc. — all key on string ids).
 */
function readParentString(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/** True when the user asked the OS to reduce motion (jsdom-safe). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function SchemaForm({
  fields,
  values,
  errors,
  onChange,
  disabled,
  className,
  highlightFieldName,
  section,
  only,
}: SchemaFormProps) {
  const childrenByParent = React.useMemo(
    () => buildChildrenByParent(fields),
    [fields],
  );

  // Slice 4.AI-REPAIR-2F — scroll the highlighted field into view when the
  // target changes (e.g. a "Go to field" click). jsdom lacks scrollIntoView, so
  // guard it; the visual ring (below) is the always-present affordance.
  //
  // DOC-CONFIG-SYNC-1 — the same reveal now also serves the Document Guided Stop
  // (the panel follows whichever field the inline editor is on), so it must
  // honour `prefers-reduced-motion`: animated auto-scroll is exactly the motion
  // that setting exists to suppress. Same rule the Document's own `scrollToNode`
  // already applies.
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!highlightFieldName) return;
    const el = highlightRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    }
  }, [highlightFieldName]);
  const fieldsByName = React.useMemo(() => {
    const map = new Map<string, FieldMeta>();
    for (const f of fields) map.set(f.name, f);
    return map;
  }, [fields]);

  // Stable handler reference per (fields, onChange) pair. Each
  // dispatch (a) calls the consumer's onChange with the original
  // change, then (b) clears any direct dependents by dispatching
  // onChange(child, undefined). Direct-only — no recursion into
  // grand-children.
  const handleChange = React.useCallback(
    (name: string, value: unknown) => {
      onChange(name, value);
      const children = childrenByParent.get(name);
      if (children) {
        for (const child of children) {
          onChange(child, undefined);
        }
      }
      // CONFIG-UX-SETUP-ADVANCED-1 — when a controller change HIDES a
      // `visibleWhen`-gated sibling, clear that sibling's value so a stale
      // other-mode value can never trip an XOR/refinement at runtime
      // (mirrors the dependsOn cascade and the spreadsheet mode toggle).
      // A sibling that stays visible under the new value keeps its value.
      const nextValues = { ...values, [name]: value };
      for (const f of fields) {
        if (f.visibleWhen?.field !== name) continue;
        if (values[f.name] === undefined) continue;
        if (!isVisibleWhenMet(f.visibleWhen, nextValues)) {
          onChange(f.name, undefined);
        }
      }
    },
    [childrenByParent, onChange, fields, values],
  );

  // SPREADSHEET-CONFIG-REDESIGN-1 — a field whose `renderedBy` names a
  // KNOWN sibling is committed by that sibling's composite editor (e.g.
  // Excel add_row `rows` is written by the `values` spreadsheet editor),
  // so it never renders a duplicate standalone editor. An unknown
  // `renderedBy` target falls back to standalone rendering (mis-authored
  // meta stays visible rather than silently hiding a field). The field
  // stays in `childrenByParent`, so parent changes still clear it.
  const knownFieldNames = React.useMemo(
    () => new Set(fields.map((f) => f.name)),
    [fields],
  );
  const isCompositeManaged = (f: FieldMeta): boolean =>
    f.renderedBy !== undefined && knownFieldNames.has(f.renderedBy);

  // CONFIG-UX-SETUP-ADVANCED-1 — a field hidden by an unmet top-level
  // `visibleWhen` is not drawn (it still participates in cascades above,
  // and its value — e.g. hydrated from a saved workflow — is preserved
  // until the user changes the controller).
  const isVisible = (f: FieldMeta): boolean => isVisibleWhenMet(f.visibleWhen, values);

  // CONFIG-UX-AUDIT-1 → CONFIG-UX-SETUP-ADVANCED-1 — `advanced: true`
  // fields live outside the normal setup path. In legacy single-surface
  // mode (no `section`) they render inside a collapsed "Advanced"
  // disclosure that defaults open when any advanced field is required or
  // already carries a value. In section mode the config shell composes a
  // dedicated Advanced tab instead.
  const normalFields = fields.filter(
    (f) => f.advanced !== true && !isCompositeManaged(f) && isVisible(f),
  );
  const advancedFields = fields.filter(
    (f) => f.advanced === true && !isCompositeManaged(f) && isVisible(f),
  );
  const advancedOpenByDefault = advancedFields.some(
    (f) =>
      f.required ||
      (values[f.name] !== undefined &&
        values[f.name] !== null &&
        values[f.name] !== ""),
  );

  // CONFIG-UX-SETUP-ADVANCED-1 — an advanced value "overrides" standard
  // behavior when it is set AND differs from the field's declared default
  // (deep-equal values are standard behavior, not an override). Reset
  // clears the key entirely — the runtime default / derived behavior takes
  // back over, and the chip disappears.
  const isOverrideActive = (field: FieldMeta): boolean => {
    const value = values[field.name];
    if (value === undefined || value === null || value === "") return false;
    if (field.defaultValue === undefined) return true;
    try {
      return JSON.stringify(value) !== JSON.stringify(field.defaultValue);
    } catch {
      return true;
    }
  };

  const renderField = (field: FieldMeta, inAdvanced = false): React.ReactNode => {
        const isHighlighted = highlightFieldName === field.name;
        // Wrap every field in a stable, queryable container so a "Go to field"
        // navigation can highlight + scroll to it. The visual ring is presentation
        // only — no value is touched.
        const wrap = (inner: React.ReactNode) => (
          <div
            key={field.name}
            data-field-name={field.name}
            {...(isHighlighted
              ? { "data-field-highlighted": "true", ref: highlightRef }
              : {})}
            className={
              isHighlighted
                ? // Guidance ring — the ACCENT colour, deliberately not the
                  // destructive/validation colour and not the Document's
                  // selection treatment, so "we brought you here" never reads as
                  // "this is wrong". Transition suppressed under reduced motion.
                  "rounded-md p-1 ring-2 ring-offset-2 ring-[var(--builder-accent)] transition-shadow motion-reduce:transition-none"
                : undefined
            }
          >
            {inner}
          </div>
        );

        const Renderer = getFieldRenderer(field.type);
        if (!Renderer) {
          // Defense-in-depth: registry covers every FieldType variant
          // by construction, but a meta-drift / stale build could
          // sneak an unknown type through. Render friendly copy so the
          // rest of the form is still usable — internal detail rides in
          // data attributes for developers, never in visible text
          // (CONFIG-UX-AUDIT-1).
          return wrap(
            <div
              role="alert"
              data-testid="schema-form-unrenderable-field"
              data-field-type={field.type}
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-xs text-destructive"
            >
              The &ldquo;{field.label}&rdquo; setting can&rsquo;t be edited
              here right now. Try reloading, or contact support if it keeps
              happening.
            </div>,
          );
        }
        const value = values[field.name];
        const error = errors?.[field.name];

        // dependsOn cascade — Slice 3.33; multi-parent in
        // Slice 4.BUILDER-OPTIONS-1.
        let deps: Readonly<Record<string, string>> | undefined;
        let enabled: boolean | undefined;
        let parentLabel: string | undefined;
        const parents = normalizeDependsOn(field.dependsOn);
        if (parents.length > 0) {
          // Resolve every declared parent to {name, label, value}. A
          // parent targeting an unknown field is treated as a
          // permanently-missing parent (can never have a value) — the
          // child stays disabled, mirroring a mis-authored meta and
          // surfacing a visible "select parent first" hint rather than
          // silently fetching with an incomplete dep set.
          const resolved = parents.map((name) => ({
            name,
            label: fieldsByName.get(name)?.label ?? name,
            value: readParentString(values[name]),
          }));
          const missing = resolved.filter((p) => p.value.length === 0);
          enabled = missing.length === 0;
          if (enabled) {
            // All parents present → pass the full dep set to the resolver.
            deps = Object.fromEntries(resolved.map((p) => [p.name, p.value]));
          }
          // Hint names the still-missing parent(s); for a single parent
          // this is exactly the parent's label as in Slice 3.33.
          parentLabel = (missing.length > 0 ? missing : resolved)
            .map((p) => p.label)
            .join(", ");
        }

    const rendered = (
      <Renderer
        field={field}
        value={value}
        error={error}
        disabled={disabled}
        deps={deps}
        enabled={enabled}
        parentLabel={parentLabel}
        onChange={(next) => handleChange(field.name, next)}
        // SPREADSHEET-CONFIG-REDESIGN-1 — composite editors (declared via
        // `batchRowsField` + the sibling's `renderedBy`) read sibling
        // values and write the sibling through the same cascade-clearing
        // handler a direct edit would use. Single-field renderers ignore
        // both props.
        formValues={values}
        onChangeField={handleChange}
        // RESOLVERS-3 — structured editors resolve an itemField picker's
        // `dependsOn` against the node's TOP-LEVEL fields and need their
        // labels for the "Select <parent> first" hint. Ignored elsewhere.
        formFields={fields}
      />
    );

    // CONFIG-UX-SETUP-ADVANCED-1 — in the Advanced section, a field whose
    // value departs from standard behavior gets an explicit override chip
    // and a one-click return to the standard/derived behavior. Reset
    // clears the stored key (never writes a guessed value). The row sits
    // AFTER the input inside an always-present frame so its appearance
    // never shifts the input's tree position (a remount would drop focus
    // mid-typing).
    if (inAdvanced) {
      const overrideActive = isOverrideActive(field) && !disabled;
      return wrap(
        <div className="flex flex-col gap-1">
          {rendered}
          {overrideActive ? (
            <div
              className="flex items-center justify-between gap-2"
              data-testid="advanced-override-row"
              data-override-field={field.name}
            >
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Custom value — overrides standard behavior
              </span>
              <button
                type="button"
                data-testid="advanced-override-reset"
                data-override-field={field.name}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
                onClick={() => handleChange(field.name, undefined)}
              >
                Reset to standard
              </button>
            </div>
          ) : null}
        </div>,
      );
    }

    return wrap(rendered);
  };

  // 5.DUAL-BUILDER-1 CS-2 — single-field mode (the Guided Stop). One drawn
  // field, full cascade scope. Renders nothing when the field is unknown,
  // composite-managed, or hidden by an unmet visibleWhen.
  if (only !== undefined) {
    const target = fieldsByName.get(only);
    const drawable =
      target !== undefined && !isCompositeManaged(target) && isVisible(target);
    return (
      <div
        className={className ?? "flex flex-col gap-4"}
        data-testid="schema-form-only-field"
        data-only-field={only}
      >
        {drawable ? renderField(target, target.advanced === true) : null}
      </div>
    );
  }

  // CONFIG-UX-SETUP-ADVANCED-1 — section mode: the config shell composes
  // Setup and Advanced as separate tabs over ONE field list + ONE pending
  // draft. `setup` draws only the normal fields; `advanced` draws only the
  // advanced fields (with override frames). Legacy mode (no `section`)
  // keeps the collapsed disclosure for callers that don't compose tabs.
  if (section === "setup") {
    return (
      <div className={className ?? "flex flex-col gap-4"} data-testid="schema-form">
        {normalFields.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            {fields.length === 0
              ? "This step has no settings to fill in."
              : "Nothing to set up here — this step is ready as-is. Optional settings live in the Advanced tab."}
          </p>
        ) : null}
        {normalFields.map((f) => renderField(f))}
      </div>
    );
  }
  if (section === "advanced") {
    return (
      <div
        className={className ?? "flex flex-col gap-4"}
        data-testid="schema-form-advanced-section"
      >
        {advancedFields.map((f) => renderField(f, true))}
      </div>
    );
  }

  return (
    <div
      className={
        className ?? "flex flex-col gap-4"
      }
      data-testid="schema-form"
    >
      {fields.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          This action has no configurable fields.
        </p>
      ) : null}
      {normalFields.map((f) => renderField(f))}
      {advancedFields.length > 0 ? (
        <details
          data-testid="schema-form-advanced"
          className="rounded-md border p-3"
          open={advancedOpenByDefault}
        >
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Advanced
          </summary>
          <div className="flex flex-col gap-4 pt-3">
            {advancedFields.map((f) => renderField(f, true))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Convenience adapter for ActionMeta — pulls `meta.fields` and forwards
 * the rest of the props. Provider-config wrappers (Slice 3.4) use this
 * to render the inner field list without re-implementing the field map.
 */
export interface SchemaFormForMetaProps extends Omit<SchemaFormProps, "fields"> {
  meta: Pick<ActionMeta, "fields">;
}

export function SchemaFormForMeta({ meta, ...rest }: SchemaFormForMetaProps) {
  return <SchemaForm fields={meta.fields} {...rest} />;
}
