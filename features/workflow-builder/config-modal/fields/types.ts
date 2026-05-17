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
}

export type FieldComponent = React.FC<FieldRendererProps>;

/**
 * Identifier the registry exposes; mirrors FieldMeta.type so callers
 * pass the meta's `type` field directly.
 */
export type FieldRendererKey = FieldType;
