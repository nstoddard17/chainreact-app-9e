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
   * SchemaForm for fields whose `field.dependsOn` resolves to a non-
   * empty parent value. Async-options renderers (ComboboxField) forward
   * this to `useOptionsSource`. Non-async renderers ignore it.
   *
   * Slice 3.33 — single-parent only (matches the FieldMeta.dependsOn
   * contract).
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
   * Human-readable label of the `dependsOn` parent field. Async-options
   * renderers use it to render the "Select <parentLabel> first" hint
   * when `enabled === false`. SchemaForm looks up the parent field in
   * the same fields[] list it received and passes its `.label`.
   *
   * Slice 3.33.
   */
  parentLabel?: string;
}

export type FieldComponent = React.FC<FieldRendererProps>;

/**
 * Identifier the registry exposes; mirrors FieldMeta.type so callers
 * pass the meta's `type` field directly.
 */
export type FieldRendererKey = FieldType;
