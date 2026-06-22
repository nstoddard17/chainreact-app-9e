import type { OutputMeta, OutputType } from "@/contracts/actionMeta";
import { formatLatestValuePreview } from "@/core/workflows/formatLatestValuePreview";

/**
 * Pure helpers for the builder **Data Map** tab (Slice 4.BUILDER-DATA-MAP-2).
 *
 * Flattens a node's nested `OutputMeta` tree into a bounded, user-facing list of
 * produced fields with dotted paths (`message.text`), so the Data Map can show
 * "what each step produces" and offer a copyable `{{nodeId.field}}` token per
 * field. Lives in `core/workflows/` (pure, no React, no engine import) so the UI
 * and any future agent surface share the same flattening + safety rules.
 *
 * Safety / no-leak rules baked into the SHAPE:
 *   - A field flagged `sensitive` (or whose path looks secret-like) is surfaced
 *     as a single row and we do NOT descend into its subtree — mirroring the
 *     run-detail redactor, which redacts a sensitive object whole rather than
 *     exposing nested paths.
 *   - `fileRef` outputs are treated as leaves (never flattened into byte/content
 *     sub-paths).
 *   - Depth + field-count caps keep large outputs from overwhelming the UI; the
 *     caller surfaces a "more fields hidden" note when `truncated` is true.
 */

export interface FlatOutputField {
  /** Dotted path inside the source's data, e.g. `message.text`. */
  readonly path: string;
  readonly type: OutputType;
  /** True when this field is sensitive (own flag or secret-like key). */
  readonly sensitive: boolean;
  readonly description?: string;
}

export interface FlattenResult {
  readonly fields: readonly FlatOutputField[];
  /** True when some fields were omitted by the depth / field-count caps. */
  readonly truncated: boolean;
}

export interface FlattenOptions {
  /** Max nesting depth to flatten (top-level outputs are depth 1). Default 3. */
  readonly maxDepth?: number;
  /** Max number of field rows emitted. Default 50. */
  readonly maxFields?: number;
}

export const DEFAULT_MAX_DEPTH = 3;
export const DEFAULT_MAX_FIELDS = 50;

/**
 * Flatten a node's output metadata into a bounded list of field rows.
 *
 * A row is emitted for every LEAF and for every branch we choose not to descend
 * into (a sensitive subtree, a `fileRef`, or a depth-capped object). When we DO
 * descend into a (non-sensitive, non-fileRef) object/array within the depth cap,
 * the parent row itself is omitted and only its children surface — so the list
 * reads as `channel`, `message.text`, `message.user` rather than a bare
 * `message` row plus its children.
 */
export function flattenOutputFields(
  outputs: readonly OutputMeta[],
  options?: FlattenOptions,
): FlattenResult {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFields = options?.maxFields ?? DEFAULT_MAX_FIELDS;

  const fields: FlatOutputField[] = [];
  let truncated = false;

  const visit = (output: OutputMeta, prefix: string, depth: number): void => {
    if (fields.length >= maxFields) {
      truncated = true;
      return;
    }
    const path = prefix ? `${prefix}.${output.name}` : output.name;
    const sensitive = output.sensitive === true || looksSecretLike(path);
    const hasChildren = !!output.fields && output.fields.length > 0;
    const descendable =
      hasChildren &&
      !sensitive &&
      output.type !== "fileRef" &&
      depth < maxDepth;

    if (descendable) {
      for (const child of output.fields!) {
        if (fields.length >= maxFields) {
          truncated = true;
          break;
        }
        visit(child, path, depth + 1);
      }
      return;
    }

    fields.push({
      path,
      type: output.type,
      sensitive,
      ...(output.description ? { description: output.description } : {}),
    });
  };

  for (const output of outputs) {
    if (fields.length >= maxFields) {
      truncated = true;
      break;
    }
    visit(output, "", 1);
  }

  return { fields, truncated };
}

/** Default cap on object children discovered from a sample value. */
export const DEFAULT_MAX_OBJECT_CHILDREN = 12;

/** Display type label for a Data Map field (superset of OutputType incl. "null"). */
export type DataMapFieldType = OutputType | "null";

export interface SampleChild {
  /** Immediate child key (single segment, not the full path). */
  readonly key: string;
  readonly type: DataMapFieldType;
  /** Sanitized scalar preview (quoted/truncated), or null for object/array. */
  readonly scalarPreview: string | null;
}

/**
 * Discover the immediate child fields of an object SAMPLE value, so the Data Map
 * can flatten `message` → `message.text` / `message.user` even when the action's
 * output metadata doesn't declare nested `fields`. Sample-driven, ONE level deep.
 *
 * The input value comes from the already-sanitized run-detail output (sensitive
 * fields server-redacted), so this never sees raw secrets. Scalar children get a
 * truncated preview via `formatLatestValuePreview`; object/array children render
 * as a type label only (never expanded inline, never byte/content dumped).
 *
 * Returns `null` when the value is not a plain object (caller keeps the object as
 * a single row + a "run a test to inspect fields" hint).
 */
export function describeSampleChildren(
  value: unknown,
  options?: { maxKeys?: number },
): readonly SampleChild[] | null {
  if (!isPlainObject(value)) return null;
  const maxKeys = options?.maxKeys ?? DEFAULT_MAX_OBJECT_CHILDREN;
  const keys = Object.keys(value).slice(0, maxKeys);
  return keys.map((key) => {
    const v = value[key];
    const type = inferSampleType(v);
    const preview = formatLatestValuePreview({ found: true, value: v });
    return {
      key,
      type,
      scalarPreview: preview.kind === "scalar" ? preview.preview : null,
    };
  });
}

/** Map a sample value to its Data Map display type. */
export function inferSampleType(value: unknown): DataMapFieldType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

// High-signal secret-ish segments. Bare "key"/"auth" are intentionally excluded
// to avoid masking benign fields (idempotencyKey, author, monkey).
const SECRET_RE =
  /(^|[^a-z])(access[_]?token|refresh[_]?token|id[_]?token|api[_]?key|secret|password|passwd|pwd|credential|authorization|signature|bearer|private[_]?key|client[_]?secret|webhook[_]?secret|token)([^a-z]|$)/;

/**
 * Defensive secret-name heuristic. Belt-and-suspenders on top of the
 * `OutputMeta.sensitive` flag + server-side run-detail redaction: even an
 * unflagged field whose path reads like a secret is masked in the Data Map.
 * camelCase is normalized to snake so `accessToken` / `clientSecret` match.
 */
export function looksSecretLike(path: string): boolean {
  const normalized = path
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
  return SECRET_RE.test(normalized);
}
