import {
  USER_SCHEMA_FIELD_NAME_PATTERN,
  USER_SCHEMA_MAX_FIELDS,
  UserSchemaFieldTypeSchema,
  type UserSchemaFieldType,
} from "@/contracts/aiProcessing";

/**
 * Pure validator + normalizer for the `schema-fields` field value
 * (AI-PROVIDER-4 CS-4).
 *
 * Shared by THREE consumers so there is one ruleset, not a React-only one:
 *   - `SchemaFieldsField` (inline row errors + empty state),
 *   - `ConfigModalShell` (Save gate, same pattern as `_routesValidator`),
 *   - `collectBuilderValidationIssues` (the validation drawer).
 *
 * Mirrors the committed runtime contract `UserDefinedSchemaSchema`
 * (contracts/aiProcessing.ts): 1–200 rows, identifier-safe unique names,
 * a closed primitive type set. The AI processor re-parses with that Zod
 * schema at request build time — this client-side validator exists so an
 * author sees the problem inline instead of as a failed run.
 *
 * Co-located with the renderer (not `core/`) because the messages are
 * author-facing and reference row positions that only make sense visually.
 */

export const SCHEMA_FIELD_TYPES = UserSchemaFieldTypeSchema.options;
export const SCHEMA_FIELDS_MAX_ROWS = USER_SCHEMA_MAX_FIELDS;

/** One editor row. `name` may be mid-edit / invalid; validation reports it. */
export interface SchemaFieldRow {
  name: string;
  type: UserSchemaFieldType;
  required?: boolean;
  description?: string;
}

/** The committed field value: `{ fields: [...] }` (UserDefinedSchema shape). */
export interface SchemaFieldsValue {
  fields: SchemaFieldRow[];
}

export interface SchemaFieldsValidationResult {
  /** Blocking, author-facing message; `null` when the value is usable. */
  readonly error: string | null;
  /** Per-row messages, indexed by row position (absent = row is fine). */
  readonly rowErrors: Readonly<Record<number, string>>;
}

const OK: SchemaFieldsValidationResult = { error: null, rowErrors: {} };

/**
 * Normalize author text into a safe workflow-variable identifier:
 * `"Employee Name"` → `employee_name`, `"Gross Pay ($)"` → `gross_pay`,
 * `"2024 Total"` → `f_2024_total` (must start with a letter).
 *
 * Applied on blur/commit — never on every keystroke, which would fight
 * the user mid-word.
 */
export function normalizeSchemaFieldName(input: string): string {
  const collapsed = input
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
  if (collapsed === "") return "";
  const prefixed = /^[a-zA-Z]/.test(collapsed) ? collapsed : `f_${collapsed}`;
  return prefixed.slice(0, 64).replace(/_+$/g, "");
}

function isSchemaFieldRow(value: unknown): value is SchemaFieldRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && typeof row.type === "string";
}

/**
 * Read an unknown config value into editor rows. Tolerant by design: a
 * value authored elsewhere (AI planner, template, API) must render, not
 * crash — anything unrecognized becomes an empty list and validation
 * reports it.
 */
export function readSchemaFieldsValue(value: unknown): SchemaFieldRow[] {
  if (typeof value !== "object" || value === null) return [];
  const fields = (value as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(isSchemaFieldRow).map((row) => ({
    name: row.name,
    type: row.type,
    ...(row.required === true ? { required: true } : {}),
    ...(typeof row.description === "string" && row.description.trim() !== ""
      ? { description: row.description }
      : {}),
  }));
}

/**
 * Validate a `schema-fields` value.
 *
 * `required` distinguishes "this node needs a schema" (empty is an error)
 * from an optional schema field (empty is simply unset). A hidden
 * conditional field is never passed here — the caller checks
 * `isVisibleWhenMet` first, so hidden schemas never block readiness.
 */
export function validateSchemaFieldsValue(
  value: unknown,
  options: { required?: boolean } = {},
): SchemaFieldsValidationResult {
  const required = options.required === true;

  if (value === undefined || value === null) {
    return required
      ? { error: "Add at least one field.", rowErrors: {} }
      : OK;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: "This schema is not in a readable format.", rowErrors: {} };
  }
  const rawFields = (value as { fields?: unknown }).fields;
  if (rawFields === undefined) {
    return required ? { error: "Add at least one field.", rowErrors: {} } : OK;
  }
  if (!Array.isArray(rawFields)) {
    return { error: "This schema is not in a readable format.", rowErrors: {} };
  }

  if (rawFields.length === 0) {
    return required ? { error: "Add at least one field.", rowErrors: {} } : OK;
  }
  if (rawFields.length > SCHEMA_FIELDS_MAX_ROWS) {
    return {
      error: `Maximum ${SCHEMA_FIELDS_MAX_ROWS} fields.`,
      rowErrors: {},
    };
  }

  const rowErrors: Record<number, string> = {};
  const seen = new Map<string, number>();
  const typeSet = new Set<string>(SCHEMA_FIELD_TYPES);

  for (let i = 0; i < rawFields.length; i++) {
    const row = rawFields[i];
    if (!isSchemaFieldRow(row)) {
      rowErrors[i] = "This row is incomplete.";
      continue;
    }
    const name = row.name.trim();
    if (name === "") {
      rowErrors[i] = "Give this field a name.";
      continue;
    }
    if (!USER_SCHEMA_FIELD_NAME_PATTERN.test(name)) {
      rowErrors[i] =
        "Use letters, numbers, and underscores, starting with a letter.";
      continue;
    }
    if (!typeSet.has(row.type)) {
      rowErrors[i] = "Choose a type for this field.";
      continue;
    }
    const key = name.toLowerCase();
    const firstAt = seen.get(key);
    if (firstAt !== undefined) {
      rowErrors[i] = `Field names must be unique — "${name}" is already used.`;
      continue;
    }
    seen.set(key, i);
    if (
      typeof row.description === "string" &&
      row.description.length > 300
    ) {
      rowErrors[i] = "Description is too long (max 300 characters).";
    }
  }

  const errorRows = Object.keys(rowErrors);
  if (errorRows.length === 0) return OK;

  const firstIndex = Number(errorRows[0]);
  return {
    error:
      errorRows.length === 1
        ? `Field ${firstIndex + 1}: ${rowErrors[firstIndex]!}`
        : `${errorRows.length} fields need attention.`,
    rowErrors,
  };
}
