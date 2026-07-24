import {
  ROW_CONFIDENCE_KEY,
  type UserDefinedSchema,
  type UserSchemaFieldSpec,
  type UserSchemaFieldType,
} from "@/contracts/aiProcessing";

/**
 * Extraction validator (AI-PROVIDER-PLAN-1 §4.7, shipped in CS-5).
 *
 * The delivery contract (`responseSchemas.ts`) only proves the model
 * replied with the right STRUCTURE — every declared key present, values
 * left `unknown`. This module is the second, semantic pass: it coerces
 * each value to the type the AUTHOR declared, decides what "missing"
 * means, and reports confidence.
 *
 * Rules (all owner-locked in the plan):
 *   - **Every declared key is always present** in the result. A value the
 *     model could not find becomes explicit `null`, never an absent key —
 *     downstream `{{node.fields.x}}` references stay resolvable and the
 *     output surface is stable run to run.
 *   - **Undeclared keys are stripped, never surfaced.** A hallucinated
 *     column cannot leak into workflow variables.
 *   - **Required-missing is a failure** when `strict` is on (the default):
 *     a payroll extraction that silently dropped a required column is a
 *     correctness bug, not a partial success. With `strict` off it becomes
 *     `null` like any optional field.
 *   - **Coercion is deliberate and narrow.** Currency symbols/commas are
 *     stripped, yes/no reads as boolean, a small set of unambiguous date
 *     formats normalizes to `YYYY-MM-DD`. Anything else is a typed
 *     failure — we never guess.
 *
 * No-leak: issue strings name the FIELD and the problem class only
 * (`gross_pay: expected a number`). Field names are author-authored
 * metadata; document values never appear in an issue, an error, or a log.
 */

// ─── Value coercion ──────────────────────────────────────────────────────────

export type CoercionOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly expected: string };

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "t", "on"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "f", "off"]);

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** `1,234.56` · `$1,234.56` · `(1,234.56)` (accounting negative) · `-1 234,00`? — no. */
function coerceNumeric(raw: unknown): CoercionOutcome {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, expected: "a number" };
  }
  if (typeof raw !== "string") return { ok: false, expected: "a number" };

  let text = raw.trim();
  if (text === "") return { ok: true, value: null };

  // Accounting negatives: "(1,234.56)" === -1234.56.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  // Strip currency symbols, thousands separators, and spaces. Deliberately
  // NOT locale-aware: a comma is only ever a separator here, so "1,5" reads
  // as 15 — documented, and the alternative (guessing decimal commas) is
  // worse than a typed failure on genuinely ambiguous input.
  const cleaned = text.replace(/[^0-9.\-+eE]/g, "");
  if (cleaned === "" || !/\d/.test(cleaned)) {
    return { ok: false, expected: "a number" };
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { ok: false, expected: "a number" };
  return { ok: true, value: negative ? -parsed : parsed };
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function buildIsoDate(year: number, month: number, day: number): CoercionOutcome {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, expected: "a date" };
  }
  return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
}

/**
 * Normalize to `YYYY-MM-DD`. Explicit format list — never `Date.parse`,
 * whose behavior varies by runtime and silently accepts nonsense.
 * `M/D/YYYY` is read US-style (the documented default for this product's
 * launch market); an author who needs another convention asks for
 * `YYYY-MM-DD` in the field description.
 */
function coerceDate(raw: unknown): CoercionOutcome {
  if (typeof raw === "number") return { ok: false, expected: "a date" };
  if (typeof raw !== "string") return { ok: false, expected: "a date" };
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (iso) {
    return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const slashed = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (slashed) {
    return buildIsoDate(Number(slashed[3]), Number(slashed[1]), Number(slashed[2]));
  }
  const named = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS[named[1]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return { ok: false, expected: "a date" };
    return buildIsoDate(Number(named[3]), month, Number(named[2]));
  }
  const namedFirstDay = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(text);
  if (namedFirstDay) {
    const month = MONTHS[namedFirstDay[2]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return { ok: false, expected: "a date" };
    return buildIsoDate(Number(namedFirstDay[3]), month, Number(namedFirstDay[1]));
  }
  return { ok: false, expected: "a date" };
}

/**
 * Coerce one raw model value to the author's declared type.
 * `null` / `undefined` / empty string all mean "not found" → `null`.
 */
export function coerceSchemaValue(
  type: UserSchemaFieldType,
  raw: unknown,
): CoercionOutcome {
  if (raw === null || raw === undefined) return { ok: true, value: null };

  switch (type) {
    case "string": {
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        return { ok: true, value: trimmed === "" ? null : trimmed };
      }
      if (typeof raw === "number" || typeof raw === "boolean") {
        return { ok: true, value: String(raw) };
      }
      return { ok: false, expected: "text" };
    }
    case "number":
    case "currency":
      return coerceNumeric(raw);
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (typeof raw === "number") {
        if (raw === 1) return { ok: true, value: true };
        if (raw === 0) return { ok: true, value: false };
        return { ok: false, expected: "yes or no" };
      }
      if (typeof raw === "string") {
        const word = raw.trim().toLowerCase();
        if (word === "") return { ok: true, value: null };
        if (TRUE_WORDS.has(word)) return { ok: true, value: true };
        if (FALSE_WORDS.has(word)) return { ok: true, value: false };
        return { ok: false, expected: "yes or no" };
      }
      return { ok: false, expected: "yes or no" };
    }
    case "date":
      return coerceDate(raw);
  }
}

// ─── Result shapes ───────────────────────────────────────────────────────────

export type ExtractionValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly string[] };

export interface ValidatedFields {
  /** One entry per declared field, in declaration order. Never partial. */
  readonly values: Record<string, unknown>;
  /** Declared names whose per-field confidence fell below the threshold. */
  readonly lowConfidence: readonly string[];
  readonly overallConfidence: number;
}

export interface ValidatedRows {
  /** Declared columns + the reserved `_confidence` per row. */
  readonly rows: readonly Record<string, unknown>[];
  /** `rows[3]`-style labels for rows below the confidence threshold. */
  readonly lowConfidence: readonly string[];
  readonly overallConfidence: number;
}

export interface ExtractionValidatorOptions {
  readonly schema: UserDefinedSchema;
  /** Required-missing fails the step (default posture). */
  readonly strict: boolean;
  /** Values strictly below this are reported as low confidence. */
  readonly confidenceThreshold: number;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function coerceInto(
  target: Record<string, unknown>,
  field: UserSchemaFieldSpec,
  raw: unknown,
  strict: boolean,
  issues: string[],
  issuePrefix: string,
): void {
  const outcome = coerceSchemaValue(field.type, raw);
  if (!outcome.ok) {
    issues.push(`${issuePrefix}${field.name}: expected ${outcome.expected}`);
    target[field.name] = null;
    return;
  }
  if (outcome.value === null && field.required === true && strict) {
    issues.push(`${issuePrefix}${field.name}: required value not found`);
  }
  target[field.name] = outcome.value;
}

/**
 * Validate an `extract_fields` payload against the author's schema.
 * `payload` has already satisfied `ExtractFieldsResultSchema`, so
 * `fields[name] = { value, confidence }` is structurally guaranteed for
 * every declared name — this pass owns typing, nulling, and confidence.
 */
export function validateExtractedFields(
  payload: {
    fields: Record<string, { value?: unknown; confidence: number }>;
    overallConfidence: number;
  },
  options: ExtractionValidatorOptions,
): ExtractionValidation<ValidatedFields> {
  const issues: string[] = [];
  const values: Record<string, unknown> = {};
  const lowConfidence: string[] = [];

  for (const field of options.schema.fields) {
    const cell = Object.prototype.hasOwnProperty.call(payload.fields, field.name)
      ? payload.fields[field.name]
      : undefined;
    coerceInto(values, field, cell?.value, options.strict, issues, "");
    if (clampConfidence(cell?.confidence) < options.confidenceThreshold) {
      lowConfidence.push(field.name);
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      values,
      lowConfidence,
      overallConfidence: clampConfidence(payload.overallConfidence),
    },
  };
}

/**
 * Validate an `extract_rows` payload. Each row keeps the reserved
 * `_confidence` key (the author's name pattern cannot produce a leading
 * underscore, so it can never collide with a declared column) — that is
 * the per-row signal the loop node (CS-10) and the low-confidence policy
 * both read.
 */
export function validateExtractedRows(
  payload: { rows: readonly Record<string, unknown>[]; overallConfidence: number },
  options: ExtractionValidatorOptions & { maxRows: number },
): ExtractionValidation<ValidatedRows> {
  const issues: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const lowConfidence: string[] = [];

  if (payload.rows.length > options.maxRows) {
    return {
      ok: false,
      issues: [`rows: more rows returned than the configured maximum`],
    };
  }

  payload.rows.forEach((rawRow, index) => {
    const row: Record<string, unknown> = {};
    for (const field of options.schema.fields) {
      coerceInto(row, field, rawRow[field.name], options.strict, issues, `rows[${index}].`);
    }
    const confidence = clampConfidence(rawRow[ROW_CONFIDENCE_KEY]);
    row[ROW_CONFIDENCE_KEY] = confidence;
    if (confidence < options.confidenceThreshold) lowConfidence.push(`rows[${index}]`);
    rows.push(row);
  });

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      rows,
      lowConfidence,
      overallConfidence: clampConfidence(payload.overallConfidence),
    },
  };
}

/**
 * Blank the declared values of the rows/fields the low-confidence policy
 * flagged (`onLowConfidence: "blank"`). The reserved `_confidence` key is
 * preserved so the run still shows WHY the values are missing.
 */
export function blankLowConfidenceRows(
  rows: readonly Record<string, unknown>[],
  schema: UserDefinedSchema,
  threshold: number,
): Record<string, unknown>[] {
  return rows.map((row) => {
    if (clampConfidence(row[ROW_CONFIDENCE_KEY]) >= threshold) return { ...row };
    const blanked: Record<string, unknown> = { ...row };
    for (const field of schema.fields) blanked[field.name] = null;
    return blanked;
  });
}
