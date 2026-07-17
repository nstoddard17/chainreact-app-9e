"use client";

import * as React from "react";
import type { FieldMeta, ObjectListItemField } from "@/contracts/actionMeta";
import { normalizeDependsOn } from "@/contracts/actionMeta";
import { ComboboxField } from "./ComboboxField";

/**
 * RESOLVERS-3 — shared plumbing that lets an `itemFields` sub-field render a
 * REAL account-aware picker instead of a raw text box. Used by both
 * ObjectListField (repeating rows) and ObjectField (single flat object).
 *
 * Why this module exists: before RESOLVERS-3 a provider identifier sitting
 * INSIDE a structured row had to be hand-typed even when a registered
 * resolver for it already existed (Stripe made you type `price_xxx` while
 * `stripe:prices` sat registered and unreferenced). The contract now lets a
 * sub-field declare `optionsSource`; this is the render half.
 *
 * DELIBERATELY NOT A PARALLEL DISCOVERY PATH. It synthesizes a `FieldMeta`
 * and delegates to the existing `ComboboxField`, so a row picker inherits —
 * for free and identically to a top-level picker — `useOptionsSource`, the
 * options route + its credential policy, search, the resource-label cache,
 * loading / empty / error+retry / disconnected / needs-reconnect /
 * owner-gated states, manual entry, variable insertion, and (critically for
 * saved workflows) the `combobox-saved-value-missing` unavailable-selection
 * hint. No fetching happens in this module.
 *
 * ── dep resolution (RESOLVERS-4) ──────────────────────────────────────────
 * A sub-field declares its parents in one of two EXPLICIT scopes, and this
 * module resolves each in its own scope then MERGES them into ONE dep map:
 *
 *   - `dependsOn`    → the NODE'S TOP-LEVEL config (`formValues` /
 *                      `formFields`, i.e. the object-list field's siblings).
 *                      Power BI `parameters[].name` ← top-level `workspaceId`
 *                      + `semanticModelId`.
 *   - `dependsOnRow` → the SAME ROW'S other itemFields (`rowValues` /
 *                      `itemFields`). HubSpot `subscriptions[].propertyName`
 *                      ← that row's own `eventType`.
 *
 * Row-local resolution is not a new scope in this file's world view —
 * `visibleWhen.field` has always resolved against the row. `dependsOnRow` makes
 * deps consistent with visibility rather than inventing a third notion of
 * "where a name points". The contract's meta-level superRefine rejects a name
 * that doesn't exist in the scope it declares, at module load.
 *
 * The resolver receives a FLAT `ctx.deps` and never learns which scope a value
 * came from. The semantics below mirror SchemaForm's top-level cascade exactly,
 * now across BOTH scopes: `enabled` only once EVERY parent (top-level and
 * row-local alike) has a non-empty string, `deps` never partial, and
 * `parentLabel` naming the still-missing parents (a row-local parent is named
 * by its sibling itemField's `label`).
 */

/** True when this sub-field should render as a picker rather than an input. */
export function hasItemFieldPicker(sub: ObjectListItemField): boolean {
  return typeof sub.optionsSource === "string" && sub.optionsSource.length > 0;
}

/**
 * Mirrors SchemaForm's `readParentString`: only a non-empty string counts as
 * "parent present".
 */
function readParentString(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

interface ResolvedDeps {
  deps: Readonly<Record<string, string>> | undefined;
  enabled: boolean | undefined;
  parentLabel: string | undefined;
}

/**
 * Resolve a sub-field picker's parents — `dependsOn` against the node's
 * TOP-LEVEL values, `dependsOnRow` against the SAME ROW's values — and merge
 * both into one dep set. Exported for direct unit testing of the cascade
 * semantics.
 *
 * `rowValues` / `itemFields` describe the row this instance is rendering for
 * (for the single-object `ObjectField`, the "row" IS the object). Omitting them
 * degrades only `dependsOnRow`: its parents read as missing, so the picker stays
 * passive rather than firing a partial request.
 */
export function resolveItemFieldDeps(input: {
  sub: ObjectListItemField;
  formValues: Readonly<Record<string, unknown>> | undefined;
  formFields: readonly FieldMeta[] | undefined;
  rowValues?: Readonly<Record<string, unknown>> | undefined;
  itemFields?: readonly ObjectListItemField[] | undefined;
}): ResolvedDeps {
  const topParents = normalizeDependsOn(input.sub.dependsOn);
  const rowParents = normalizeDependsOn(input.sub.dependsOnRow);
  if (topParents.length === 0 && rowParents.length === 0) {
    return { deps: undefined, enabled: undefined, parentLabel: undefined };
  }
  const values = input.formValues ?? {};
  const rowValues = input.rowValues ?? {};
  const labelFor = (name: string): string =>
    input.formFields?.find((f) => f.name === name)?.label ?? name;
  const rowLabelFor = (name: string): string =>
    input.itemFields?.find((s) => s.name === name)?.label ?? name;

  // One list, two scopes. The contract forbids a name in both, so the merged
  // dep map can never collide.
  const resolved = [
    ...topParents.map((name) => ({
      name,
      label: labelFor(name),
      value: readParentString(values[name]),
    })),
    ...rowParents.map((name) => ({
      name,
      label: rowLabelFor(name),
      value: readParentString(rowValues[name]),
    })),
  ];
  const missing = resolved.filter((p) => p.value.length === 0);
  const enabled = missing.length === 0;
  return {
    // Never call the resolver with a partial dep set.
    deps: enabled
      ? Object.fromEntries(resolved.map((p) => [p.name, p.value]))
      : undefined,
    enabled,
    parentLabel: (missing.length > 0 ? missing : resolved)
      .map((p) => p.label)
      .join(", "),
  };
}

/**
 * Commit-value coercion — the reason `type` stays the VALUE type and
 * `optionsSource` only upgrades the WIDGET.
 *
 * The combobox always hands back a string, but the runtime `.strict()` Zod
 * schema is unchanged and still expects whatever it always expected (Shopify
 * `line_items[].variant_id` is `z.number().int().positive()`). So a `number`
 * sub-field commits a NUMBER, keeping the saved row byte-identical to what
 * the plain number input wrote.
 *
 * A non-numeric string on a `number` sub-field is passed through verbatim
 * rather than mangled to `NaN`/dropped: that is how an upstream
 * `{{node.field}}` token (the whole point of `allowManualEntry`) survives to
 * the engine, and it mirrors NumberField, which also passes raw strings
 * through for values it can't parse. The runtime schema stays authoritative.
 */
export function coerceItemFieldCommit(
  sub: ObjectListItemField,
  raw: string,
): string | number | undefined {
  if (raw.trim().length === 0) return undefined;
  if (sub.type !== "number") return raw;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : raw;
}

/**
 * Render a sub-field as a picker by delegating to ComboboxField.
 *
 * `controlName` is the synthesized `FieldMeta.name`. It must be UNIQUE per
 * rendered instance (ComboboxField derives its `controlId` / testids from
 * it), so callers pass a row-qualified name — otherwise every row would emit
 * duplicate DOM ids. It is a UI-only identifier: nothing about the saved
 * config, the request, or the resolver keys off it (the options request is
 * keyed by `optionsSource` + deps).
 */
export const ItemFieldPicker: React.FC<{
  sub: ObjectListItemField;
  controlName: string;
  value: string | number | boolean | undefined;
  disabled: boolean | undefined;
  error?: string | undefined;
  formValues: Readonly<Record<string, unknown>> | undefined;
  formFields: readonly FieldMeta[] | undefined;
  /** This row's own values — the scope `dependsOnRow` resolves in. */
  rowValues?: Readonly<Record<string, unknown>> | undefined;
  /** The row's sibling sub-fields — labels for row-local parent hints. */
  itemFields?: readonly ObjectListItemField[] | undefined;
  onChange: (v: string | number | undefined) => void;
}> = ({
  sub,
  controlName,
  value,
  disabled,
  error,
  formValues,
  formFields,
  rowValues,
  itemFields,
  onChange,
}) => {
  // Synthesized top-level-shaped meta. Only fields ComboboxField reads are
  // set; `multiple` is never set (a row cell is single-valued), so the
  // MultiOptionsField branch is unreachable from here.
  //
  // RESOLVERS-4 — `dependsOn` here carries the MERGED parent names (top-level +
  // row-local). ComboboxField reads it for exactly one purpose: deciding
  // whether `enabled === false` should render the passive "Select <parent>
  // first" trigger instead of mounting the options hook. It never re-resolves
  // the names against any scope (this module already did that), so merging is
  // what keeps a row-local-only picker passive while its parent is unset. This
  // meta is UI-only and never validated by the contract.
  const synthesized = React.useMemo<FieldMeta>(() => {
    const mergedParents = [
      ...normalizeDependsOn(sub.dependsOn),
      ...normalizeDependsOn(sub.dependsOnRow),
    ];
    return {
      name: controlName,
      label: sub.label,
      type: "combobox",
      required: sub.required,
      ...(sub.description !== undefined && { description: sub.description }),
      ...(sub.placeholder !== undefined && { placeholder: sub.placeholder }),
      ...(sub.optionsSource !== undefined && {
        optionsSource: sub.optionsSource,
      }),
      ...(mergedParents.length > 0 && { dependsOn: mergedParents }),
      ...(sub.allowManualEntry !== undefined && {
        allowManualEntry: sub.allowManualEntry,
      }),
    };
  }, [controlName, sub]);

  const { deps, enabled, parentLabel } = resolveItemFieldDeps({
    sub,
    formValues,
    formFields,
    rowValues,
    itemFields,
  });

  // A saved value is rendered as-is (stringified for display) — a number row
  // value round-trips through the trigger label and is coerced back on
  // commit. A resolver failure or a value absent from the current list never
  // reaches `onChange`, so existing row config is never erased.
  const stringValue = value === undefined ? "" : String(value);

  return (
    <ComboboxField
      field={synthesized}
      value={stringValue}
      error={error}
      disabled={disabled}
      deps={deps}
      enabled={enabled}
      parentLabel={parentLabel}
      onChange={(next) =>
        onChange(coerceItemFieldCommit(sub, typeof next === "string" ? next : ""))
      }
    />
  );
};
