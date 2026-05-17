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

export function SchemaForm({
  fields,
  values,
  errors,
  onChange,
  disabled,
  className,
}: SchemaFormProps) {
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
        return (
          <Renderer
            key={field.name}
            field={field}
            value={value}
            error={error}
            disabled={disabled}
            onChange={(next) => onChange(field.name, next)}
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
