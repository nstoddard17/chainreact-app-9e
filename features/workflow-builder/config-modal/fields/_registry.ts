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
import { RouterRoutesField } from "./RouterRoutesField";
import { StringArrayField } from "./StringArrayField";
import { FileRefArrayField } from "./FileRefArrayField";
import { TemporalField } from "./TemporalField";
import { TimezoneField } from "./TimezoneField";
import { LocationField } from "./LocationField";
import { ObjectListField } from "./ObjectListField";
import { KeyValueListField } from "./KeyValueListField";
import { JsonField } from "./JsonField";
import { SpreadsheetRowsField } from "./spreadsheet/SpreadsheetRowsField";
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
    "router-routes": RouterRoutesField,
    "string-array": StringArrayField,
    "file-array": FileRefArrayField,
    // CS-1 temporal family — date/time/datetime/datetime-utc share one renderer
    // (keyed off `field.type`); timezone is a dedicated IANA selector.
    date: TemporalField,
    time: TemporalField,
    datetime: TemporalField,
    "datetime-utc": TemporalField,
    timezone: TimezoneField,
    // Geoapify-backed address autocomplete with free-text fallback.
    location: LocationField,
    // CONFIG-UX-AUDIT-1 structured editors (replace paste-JSON textareas).
    "object-list": ObjectListField,
    "keyvalue-list": KeyValueListField,
    // CONFIG-UX-AUDIT-2 — the advanced JSON escape hatch (commits parsed
    // values / whole-value variables; never raw JSON strings as final).
    json: JsonField,
    // SPREADSHEET-CONFIG-REDESIGN-1 — column-aware composite row editor
    // (one-row positional XOR batch header-keyed via `batchRowsField`).
    "spreadsheet-rows": SpreadsheetRowsField,
  });

export function getFieldRenderer(type: FieldType): FieldComponent {
  return FIELD_RENDERERS[type];
}
