"use client";

import * as React from "react";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
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
 * Slice 3.33 — `dependsOn` cascade wiring.
 *
 *   - For each field, if `field.dependsOn` resolves to a known parent
 *     field in the same `fields[]` list, SchemaForm computes:
 *       - `enabled = parentValue is a non-empty string`
 *       - `deps   = { [parent.name]: parentValue }` when present;
 *                  undefined otherwise.
 *       - `parentLabel = parent.label` (used by async-options renderers
 *                  to render "Select <parentLabel> first" hints).
 *   - On every `onChange(name, value)` dispatch, SchemaForm also clears
 *     direct dependents (fields whose `dependsOn === name`) by
 *     dispatching `onChange(child, undefined)` to the same handler.
 *     This prevents stale child selections from outliving a parent
 *     change. Single-hop only — multi-level traversal is out of scope.
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
}

/**
 * Build a `parent → [direct children]` map from the fields list. A
 * dependsOn pointing to a name not present in `fields` is silently
 * ignored — the child renders as enabled=false and its value (if any)
 * stays as-is.
 */
function buildChildrenByParent(
  fields: readonly FieldMeta[],
): ReadonlyMap<string, readonly string[]> {
  const knownNames = new Set(fields.map((f) => f.name));
  const map = new Map<string, string[]>();
  for (const f of fields) {
    if (!f.dependsOn) continue;
    if (!knownNames.has(f.dependsOn)) continue;
    const bucket = map.get(f.dependsOn);
    if (bucket) bucket.push(f.name);
    else map.set(f.dependsOn, [f.name]);
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
}: SchemaFormProps) {
  const childrenByParent = React.useMemo(
    () => buildChildrenByParent(fields),
    [fields],
  );
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
        const Renderer = getFieldRenderer(field.type);
        if (!Renderer) {
          // Defense-in-depth: registry covers every FieldType variant
          // by construction, but a meta-drift / stale build could
          // sneak an unknown type through. Render a visible error
          // rather than throwing so the rest of the form is still
          // usable.
          return (
            <div
              key={field.name}
              role="alert"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-xs text-destructive"
            >
              Unknown field type &lsquo;{field.type}&rsquo; for &lsquo;
              {field.name}&rsquo;. Update the field-renderer registry to add
              support.
            </div>
          );
        }
        const value = values[field.name];
        const error = errors?.[field.name];

        // dependsOn cascade — Slice 3.33.
        let deps: Readonly<Record<string, string>> | undefined;
        let enabled: boolean | undefined;
        let parentLabel: string | undefined;
        if (field.dependsOn) {
          const parentField = fieldsByName.get(field.dependsOn);
          // A dependsOn targeting an unknown field is treated as
          // permanently-missing-parent — child renders disabled. This
          // mirrors what would happen at runtime if the meta were
          // mis-authored; surfacing it as a visible "select parent
          // first" hint is more helpful than silently fetching.
          const parentValue = readParentString(values[field.dependsOn]);
          const hasParent = parentValue.length > 0;
          enabled = hasParent;
          if (hasParent) {
            deps = { [field.dependsOn]: parentValue };
          }
          if (parentField) {
            parentLabel = parentField.label;
          }
        }

        return (
          <Renderer
            key={field.name}
            field={field}
            value={value}
            error={error}
            disabled={disabled}
            deps={deps}
            enabled={enabled}
            parentLabel={parentLabel}
            onChange={(next) => handleChange(field.name, next)}
          />
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
