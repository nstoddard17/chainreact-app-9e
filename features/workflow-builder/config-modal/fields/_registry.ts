import type { FieldType } from "@/contracts/actionMeta";
import { TextField } from "./TextField";
import { TextareaField } from "./TextareaField";
import { SelectField } from "./SelectField";
import { ComboboxField } from "./ComboboxField";
import { KeyValueField } from "./KeyValueField";
import { NumberField } from "./NumberField";
import { BooleanField } from "./BooleanField";
import { FileField } from "./FileField";
import { CronField } from "./CronField";
import type { FieldComponent } from "./types";

/**
 * Hand-maintained field-renderer registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.1: every
 * FieldMeta.type has exactly one renderer here. The `FIELD_RENDERERS`
 * map is exhaustive by TypeScript construction — a new FieldType
 * variant causes a `noImplicitAny`-style failure at any call site that
 * indexes the map.
 *
 * Underscore-prefixed file: this is a registry, not a renderer module.
 */

export const FIELD_RENDERERS: Readonly<Record<FieldType, FieldComponent>> =
  Object.freeze({
    text: TextField,
    textarea: TextareaField,
    select: SelectField,
    combobox: ComboboxField,
    keyvalue: KeyValueField,
    number: NumberField,
    boolean: BooleanField,
    file: FileField,
    cron: CronField,
  });

export function getFieldRenderer(type: FieldType): FieldComponent {
  return FIELD_RENDERERS[type];
}
