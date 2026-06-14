"use client";

import * as React from "react";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import { normalizeDependsOn } from "@/contracts/actionMeta";
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

export function SchemaForm({
  fields,
  values,
  errors,
  onChange,
  disabled,
  className,
  highlightFieldName,
}: SchemaFormProps) {
  const childrenByParent = React.useMemo(
    () => buildChildrenByParent(fields),
    [fields],
  );

  // Slice 4.AI-REPAIR-2F — scroll the highlighted field into view when the
  // target changes (e.g. a "Go to field" click). jsdom lacks scrollIntoView, so
  // guard it; the visual ring (below) is the always-present affordance.
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!highlightFieldName) return;
    const el = highlightRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
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
      if (!children || children.length === 0) return;
      for (const child of children) {
        onChange(child, undefined);
      }
    },
    [childrenByParent, onChange],
  );

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
      {fields.map((field) => {
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
                ? "rounded-md p-1 ring-2 ring-offset-2 ring-[var(--builder-accent)] transition-shadow"
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
          // sneak an unknown type through. Render a visible error
          // rather than throwing so the rest of the form is still
          // usable.
          return wrap(
            <div
              role="alert"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-xs text-destructive"
            >
              Unknown field type &lsquo;{field.type}&rsquo; for &lsquo;
              {field.name}&rsquo;. Update the field-renderer registry to add
              support.
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

        return wrap(
          <Renderer
            field={field}
            value={value}
            error={error}
            disabled={disabled}
            deps={deps}
            enabled={enabled}
            parentLabel={parentLabel}
            onChange={(next) => handleChange(field.name, next)}
          />,
        );
      })}
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
