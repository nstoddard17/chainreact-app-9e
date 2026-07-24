import type { ActionMeta, FieldMeta, FieldOption } from "@/contracts/actionMeta";
import {
  USER_SCHEMA_FIELD_NAME_PATTERN,
  type UserDefinedSchema,
  type UserSchemaFieldSpec,
  type UserSchemaFieldType,
} from "@/contracts/aiProcessing";

/**
 * Destination derivation for `ai:transform_data` (AI-PROVIDER-PLAN-1 §4.9,
 * owner decisions 10 + 11; shipped in CS-6).
 *
 * ChainReact's structural advantage is that EVERY registered action already
 * declares a typed, labeled, documented input surface. Making a workflow
 * author re-type that surface to transform data into it would throw the
 * advantage away — so the author picks a destination action and this helper
 * derives, from the SAME metadata the config panel renders:
 *
 *   1. the **validation schema** — a `UserDefinedSchema` of the destination's
 *      scalar Setup fields, which becomes the model's enforced output contract
 *      (via `responseSchemas.outputJsonSchemaFor`), and
 *   2. the **destination context** — a richer, advisory DTO (labels, help
 *      text, static option values, defaults, numeric bounds, conditional
 *      visibility) that gives the model the mapping context a bare schema
 *      cannot: that `importance` must be one of low|normal|high, that
 *      `dueDate` wants a date, that `replyAll` is a yes/no.
 *
 * PURE + PRODUCT-METADATA-ONLY. It reads `ActionMeta` — static product
 * metadata compiled into the app — and never touches user config, workflow
 * values, account state, credentials, or provider resources. That property is
 * what makes it safe to ship to the model, and it is asserted by test.
 *
 * The SERVER always re-derives from the live registry at runtime; a
 * client-supplied copy is never trusted (see `runDataTransform`).
 *
 * ── What is deliberately EXCLUDED, and why ────────────────────────────────
 * Every exclusion is REPORTED (`excludedFields`), never silent — the CS-6
 * outcome doc and the action's runtime `warnings` both surface them, so an
 * author can see which destination fields they still have to fill in by hand.
 *
 *   - `secret` / `connection` sensitivity — credential and account-identity
 *     selectors. An AI transform must never invent one.
 *   - `optionsSource` fields — provider resources (a spreadsheet id, a
 *     channel, a Fleetio location). The model cannot know the user's real
 *     ids, and a plausible invented id is worse than an empty field the
 *     author picks in the destination step itself.
 *   - composite-managed fields (`renderedBy`) and `advanced` fields — not
 *     part of the destination's normal Setup path.
 *   - multi-value and structured fields (`multiple: true`, `object-list`,
 *     `keyvalue`, `json`, `file`, …). Phase 1 maps SCALARS; nested grammars
 *     need their own contract work and are a documented gap.
 *   - names the user-schema contract cannot express. `FieldMeta.name` is a
 *     loose 128-char string; a `UserDefinedSchema` name is an identifier
 *     (`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`, case-insensitively unique) because it
 *     doubles as a workflow-variable path segment. A destination field that
 *     cannot round-trip through that is dropped and reported rather than
 *     failing the whole transform at request-build time.
 */

/** Why a destination field is not part of the derived schema. */
export type DestinationExclusionReason =
  | "sensitive"
  | "provider_resource"
  | "composite"
  | "advanced"
  | "multi_value"
  | "unsupported_type"
  | "unsupported_name";

export interface DestinationContextField {
  readonly name: string;
  readonly label: string;
  readonly type: UserSchemaFieldType;
  readonly required: boolean;
  /** Author-facing help text from the destination's metadata. */
  readonly description?: string;
  /** Static enum the value MUST be one of (never a dynamic resource list). */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly defaultValue?: string | number | boolean;
  readonly numeric?: {
    readonly min?: number;
    readonly max?: number;
    readonly integer?: boolean;
  };
  /** Present when the destination only shows this field in a specific mode. */
  readonly onlyWhen?: {
    readonly field: string;
    readonly valueIn?: readonly string[];
    readonly valueTruthy?: boolean;
  };
}

export interface DestinationExcludedField {
  readonly name: string;
  readonly label: string;
  readonly reason: DestinationExclusionReason;
}

export interface DestinationContext {
  readonly action: {
    readonly key: string;
    readonly displayName: string;
    readonly description: string;
  };
  readonly fields: readonly DestinationContextField[];
  readonly excludedFields: readonly DestinationExcludedField[];
}

export interface DerivedDestination {
  /** `null` when the destination exposes no mappable scalar field. */
  readonly schema: UserDefinedSchema | null;
  readonly context: DestinationContext;
}

/** The metadata slice this helper needs. `ActionMeta` satisfies it. */
export type DestinationActionMeta = Pick<
  ActionMeta,
  "key" | "displayName" | "description" | "fields"
>;

/** Cap on help text crossing to the model. Product copy, but still bounded. */
const DESCRIPTION_MAX = 300;
/** Static option lists longer than this are truncated for the wire. */
const OPTIONS_MAX = 64;

/**
 * Map a builder FieldType to the user-schema value type, or `null` when the
 * shape has no scalar equivalent. Only `date` becomes `date`: `datetime` /
 * `datetime-utc` / `time` carry more than a calendar day, and normalizing
 * them to `YYYY-MM-DD` would silently destroy the time component.
 */
export function destinationFieldType(field: FieldMeta): UserSchemaFieldType | null {
  switch (field.type) {
    case "text":
    case "textarea":
    case "select":
    case "combobox":
    case "cron":
    case "location":
    case "time":
    case "datetime":
    case "datetime-utc":
    case "timezone":
      return "string";
    case "date":
      return "date";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return null;
  }
}

function classifyExclusion(field: FieldMeta): DestinationExclusionReason | null {
  if (field.sensitivity === "secret" || field.sensitivity === "connection") {
    return "sensitive";
  }
  if (field.renderedBy !== undefined) return "composite";
  if (field.advanced === true) return "advanced";
  if (field.optionsSource !== undefined) return "provider_resource";
  if (field.multiple === true) return "multi_value";
  if (destinationFieldType(field) === null) return "unsupported_type";
  if (!USER_SCHEMA_FIELD_NAME_PATTERN.test(field.name)) return "unsupported_name";
  return null;
}

function toContextField(field: FieldMeta): DestinationContextField {
  const type = destinationFieldType(field);
  // classifyExclusion already proved this is non-null for included fields.
  const resolvedType: UserSchemaFieldType = type ?? "string";

  const options = field.options
    ?.slice(0, OPTIONS_MAX)
    .map((o: FieldOption) => ({ value: o.value, label: o.label }));

  const defaultValue =
    typeof field.defaultValue === "string" ||
    typeof field.defaultValue === "number" ||
    typeof field.defaultValue === "boolean"
      ? field.defaultValue
      : undefined;

  const numeric =
    field.numeric !== undefined
      ? {
          ...(field.numeric.min !== undefined ? { min: field.numeric.min } : {}),
          ...(field.numeric.max !== undefined ? { max: field.numeric.max } : {}),
          ...(field.numeric.integer !== undefined
            ? { integer: field.numeric.integer }
            : {}),
        }
      : undefined;

  return {
    name: field.name,
    label: field.label,
    type: resolvedType,
    // A field the destination only reveals in a specific mode cannot be proven
    // required here (the mode is chosen on the destination node, not this one),
    // so it is derived OPTIONAL and the condition travels as context.
    required: field.required === true && field.visibleWhen === undefined,
    ...(field.description !== undefined
      ? { description: field.description.slice(0, DESCRIPTION_MAX) }
      : {}),
    ...(options && options.length > 0 ? { options } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(numeric && Object.keys(numeric).length > 0 ? { numeric } : {}),
    ...(field.visibleWhen !== undefined
      ? {
          onlyWhen: {
            field: field.visibleWhen.field,
            ...(field.visibleWhen.valueIn !== undefined
              ? { valueIn: [...field.visibleWhen.valueIn] }
              : {}),
            ...(field.visibleWhen.valueTruthy !== undefined
              ? { valueTruthy: field.visibleWhen.valueTruthy }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * Derive the validation schema + model context for one destination action.
 * Field order follows the destination's own metadata order, so the model sees
 * the fields in the same sequence a human would fill them in.
 */
export function deriveDestinationContext(
  meta: DestinationActionMeta,
): DerivedDestination {
  const included: DestinationContextField[] = [];
  const excludedFields: DestinationExcludedField[] = [];
  // `ActionMeta` enforces exact-duplicate field names; the user-schema
  // contract is stricter (case-insensitively unique), so a `Name`/`name`
  // pair — legal in a meta — would fail the whole request. First wins.
  const takenNames = new Set<string>();

  for (const field of meta.fields) {
    const reason = classifyExclusion(field);
    if (reason !== null) {
      excludedFields.push({ name: field.name, label: field.label, reason });
      continue;
    }
    const lowered = field.name.toLowerCase();
    if (takenNames.has(lowered)) {
      excludedFields.push({
        name: field.name,
        label: field.label,
        reason: "unsupported_name",
      });
      continue;
    }
    takenNames.add(lowered);
    included.push(toContextField(field));
  }

  const specs: UserSchemaFieldSpec[] = included.map((f) => ({
    name: f.name,
    type: f.type,
    ...(f.required ? { required: true } : {}),
    ...(f.description !== undefined ? { description: f.description } : {}),
  }));

  return {
    schema: specs.length > 0 ? { fields: specs } : null,
    context: {
      action: {
        key: meta.key,
        displayName: meta.displayName,
        description: meta.description.slice(0, 2048),
      },
      fields: included,
      excludedFields,
    },
  };
}

/**
 * Convenience for readiness/summary surfaces: does this destination expose
 * anything an AI transform can actually fill? Uses the same rules as the
 * derivation, so a destination can never look mappable in one place and be
 * refused in another.
 */
export function hasMappableDestinationFields(meta: DestinationActionMeta): boolean {
  return meta.fields.some((field) => classifyExclusion(field) === null);
}
