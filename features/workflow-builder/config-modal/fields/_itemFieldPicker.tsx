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
 * ── dep resolution ────────────────────────────────────────────────────────
 * A sub-field's `dependsOn` resolves against the NODE'S TOP-LEVEL config
 * (`formValues` / `formFields`, i.e. the object-list field's siblings) — NOT
 * against other columns in the same row. That is what every shipped case
 * needs (Power BI `parameters[].name` depends on the top-level `workspaceId`
 * + `semanticModelId`), and the contract's meta-level superRefine rejects a
 * sub-field `dependsOn` naming anything else at module load.
 *
 * Row-local deps (a picker whose source/deps come from another column in the
 * SAME row — e.g. HubSpot `subscriptions[].propertyName`, keyed by that row's
 * own `eventType`) are NOT supported. Such fields stay text sub-fields.
 *
 * The semantics below mirror SchemaForm's top-level cascade exactly: `enabled`
 * only once EVERY parent has a non-empty string, `deps` never partial, and
 * `parentLabel` naming the still-missing parents.
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
 * Resolve a sub-field picker's `dependsOn` against the node's TOP-LEVEL
 * values. Exported for direct unit testing of the cascade semantics.
 */
export function resolveItemFieldDeps(input: {
  sub: ObjectListItemField;
  formValues: Readonly<Record<string, unknown>> | undefined;
  formFields: readonly FieldMeta[] | undefined;
}): ResolvedDeps {
  const parents = normalizeDependsOn(input.sub.dependsOn);
  if (parents.length === 0) {
    return { deps: undefined, enabled: undefined, parentLabel: undefined };
  }
  const values = input.formValues ?? {};
  const labelFor = (name: string): string =>
    input.formFields?.find((f) => f.name === name)?.label ?? name;

  const resolved = parents.map((name) => ({
    name,
    label: labelFor(name),
    value: readParentString(values[name]),
  }));
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
  onChange: (v: string | number | undefined) => void;
}> = ({
  sub,
  controlName,
  value,
  disabled,
  error,
  formValues,
  formFields,
  onChange,
}) => {
  // Synthesized top-level-shaped meta. Only fields ComboboxField reads are
  // set; `multiple` is never set (a row cell is single-valued), so the
  // MultiOptionsField branch is unreachable from here.
  const synthesized = React.useMemo<FieldMeta>(
    () => ({
      name: controlName,
      label: sub.label,
      type: "combobox",
      required: sub.required,
      ...(sub.description !== undefined && { description: sub.description }),
      ...(sub.placeholder !== undefined && { placeholder: sub.placeholder }),
      ...(sub.optionsSource !== undefined && {
        optionsSource: sub.optionsSource,
      }),
      ...(sub.dependsOn !== undefined && { dependsOn: sub.dependsOn }),
      ...(sub.allowManualEntry !== undefined && {
        allowManualEntry: sub.allowManualEntry,
      }),
    }),
    [controlName, sub],
  );

  const { deps, enabled, parentLabel } = resolveItemFieldDeps({
    sub,
    formValues,
    formFields,
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
