import type * as React from "react";
import type { FieldMeta, FieldType } from "@/contracts/actionMeta";

/**
 * Shared types for the field-renderer registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.1: every
 * FieldMeta.type has exactly one renderer registered in `_registry.ts`.
 * Each renderer is a controlled React component receiving `value` /
 * `error` props and dispatching `onChange` back to the parent form.
 *
 * `value: unknown` rather than per-renderer generic because the registry
 * stores a single `Record<FieldType, FieldComponent>` map — heterogeneous
 * value types are narrowed inside each renderer at its boundary.
 */

export interface FieldRendererProps {
  field: FieldMeta;
  value: unknown;
  /** Inline validation error. When supplied, the renderer marks the input invalid + shows the message. */
  error?: string | undefined;
  onChange: (value: unknown) => void;
  /** When true, the renderer renders read-only (used when the workflow is disabled). */
  disabled?: boolean;
  /**
   * dependsOn parent values keyed by parent field name. Populated by
   * SchemaForm once EVERY declared parent has a non-empty value. Async-
   * options renderers (ComboboxField) forward this to `useOptionsSource`.
   * Non-async renderers ignore it.
   *
   * Slice 3.33 (single-parent) → Slice 4.BUILDER-OPTIONS-1 (multi-parent):
   * a field whose `field.dependsOn` is an array (`["baseId", "tableId"]`)
   * gets all parent values here once they're all present, matching the
   * resolver's `requiredDeps`.
   */
  deps?: Readonly<Record<string, string>>;
  /**
   * When `false`, async-options renderers should not load options.
   * SchemaForm sets this to `false` when a field's `dependsOn` parent
   * value is empty/missing, gating the picker until the parent has a
   * value. Defaults to `true` (or undefined → treated as true) for
   * fields without `dependsOn`.
   *
   * Slice 3.33.
   */
  enabled?: boolean;
  /**
   * Human-readable label(s) of the `dependsOn` parent field(s). Async-
   * options renderers use it to render the "Select <parentLabel> first"
   * hint when `enabled === false`. SchemaForm looks the parents up in the
   * same fields[] list it received; for multiple parents it joins the
   * still-missing parents' labels (e.g. "Base, Table"). For a single
   * parent it is exactly that parent's `.label` (unchanged from 3.33).
   *
   * Slice 3.33 → Slice 4.BUILDER-OPTIONS-1.
   */
  parentLabel?: string;
  /**
   * SPREADSHEET-CONFIG-REDESIGN-1 — the current values of ALL fields in
   * the same form, keyed by field name. Composite editors (e.g.
   * `spreadsheet-rows`, which owns its own field AND the sibling named by
   * `field.batchRowsField`) read a sibling's committed value from here.
   * Ordinary single-field renderers ignore it.
   */
  formValues?: Readonly<Record<string, unknown>>;
  /**
   * RESOLVERS-3 — the field definitions for the SAME form (usually
   * `meta.fields`). Structured editors (`object-list` / `object`) whose
   * `itemFields` declare an `optionsSource` + `dependsOn` resolve those deps
   * against the node's TOP-LEVEL config, and read the parent field's `label`
   * from here for the "Select <parent> first" hint. Ordinary single-field
   * renderers ignore it (SchemaForm already computes their cascade).
   */
  formFields?: readonly FieldMeta[];
  /**
   * SPREADSHEET-CONFIG-REDESIGN-1 — write ANOTHER field's value (same
   * cascade-clearing semantics as a direct edit of that field; wired to
   * SchemaForm's internal change handler). Only composite editors that
   * legitimately own a sibling field (declared via `batchRowsField` +
   * the sibling's `renderedBy`) may use this; everything else keeps the
   * single-field `onChange` contract.
   */
  onChangeField?: (name: string, value: unknown) => void;
}

export type FieldComponent = React.FC<FieldRendererProps>;

/**
 * Identifier the registry exposes; mirrors FieldMeta.type so callers
 * pass the meta's `type` field directly.
 */
export type FieldRendererKey = FieldType;
