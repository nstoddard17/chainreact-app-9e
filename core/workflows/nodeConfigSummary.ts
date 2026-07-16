import {
  isVisibleWhenMet,
  normalizeDependsOn,
  type FieldMeta,
} from "@/contracts/actionMeta";

/**
 * At-a-glance node configuration summary (CONFIG-UX-NODE-SUMMARY-1).
 *
 * The product north star: an author (or a reviewer) should understand what a
 * configured node will do on every run WITHOUT opening every field — from a
 * plain-language line on the collapsed card and a structured overview in the
 * config panel. This module is the single, pure source of that summary; the
 * card and the panel both render from it so they never drift.
 *
 * It is deliberately provider-agnostic and derives everything from the
 * action/trigger metadata already in the discovery registry:
 *   - which fields are RESOURCE pickers (`optionsSource`) → show a recognizable
 *     name, not the stored id,
 *   - which values are DYNAMIC (`{{…}}` variable tokens) → "from an earlier
 *     step", so fixed-vs-per-run is visually distinguishable,
 *   - which are CONDITIONS/modes (select/boolean) → show the chosen option's
 *     human label,
 *   - which are plain FIXED values reused on every run.
 *
 * Label resolution for resource fields is injected via `labelFor` (the client
 * threads a cache the pickers populate). When a label isn't known yet — a
 * freshly-loaded workflow before its pickers have run, or a deleted resource —
 * the summary honestly shows the stored value rather than inventing a name,
 * matching the picker's own "unavailable saved selection" posture.
 */

export type ConfigSummaryKind =
  | "resource" // a provider resource selected from a picker (recognizable name)
  | "dynamic" // a value mapped from the trigger or an earlier step ({{…}})
  | "condition" // a mode / choice that changes behavior (select / boolean)
  | "fixed"; // a plain literal reused on every run

export interface ConfigSummarySegment {
  /** The field's human label (never its config key). */
  readonly label: string;
  /** The value to display — a resolved resource name, a variable hint, an option label, or the literal. */
  readonly display: string;
  readonly kind: ConfigSummaryKind;
  /** True when `display` fell back to a raw id because no friendly label was available yet. */
  readonly unresolved?: boolean;
}

export interface NodeConfigSummary {
  /** One plain-language line for the collapsed card, e.g. "Send Channel Message · #support-alerts". */
  readonly headline: string;
  /** The structured segments, in field order, for the config-panel overview. */
  readonly segments: readonly ConfigSummarySegment[];
  /** True when the node has a type but no user-set values yet (card shows "Not configured"). */
  readonly empty: boolean;
}

export interface BuildNodeConfigSummaryInput {
  readonly displayName: string;
  readonly fields: readonly FieldMeta[];
  readonly config: Readonly<Record<string, unknown>>;
  /**
   * Resolve a resource field's stored value to a recognizable label.
   * `(optionsSource, value) => label | undefined`. Undefined → not known yet;
   * the summary shows the raw value and flags the segment `unresolved`.
   */
  readonly labelFor?: (optionsSource: string, value: string) => string | undefined;
}

const VARIABLE_RE = /\{\{\s*([^}]+?)\s*\}\}/;

function isDynamic(value: unknown): boolean {
  return typeof value === "string" && VARIABLE_RE.test(value);
}

/** Humanize a whole-value `{{node.field}}` token into "from <field>" when possible. */
function describeDynamic(value: string): string {
  const m = value.match(VARIABLE_RE);
  if (!m) return "from an earlier step";
  const ref = m[1]!.trim();
  // Trigger references read best as "from the trigger"; step refs name the field.
  if (ref.startsWith("trigger.")) return "from the trigger";
  const leaf = ref.split(".").pop();
  return leaf ? `from an earlier step (${leaf})` : "from an earlier step";
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** Match a select/boolean value to its option label; fall back to a readable literal. */
function describeChoice(field: FieldMeta, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const opt = field.options?.find((o) => o.value === value);
  if (opt) return opt.label;
  return String(value);
}

function shortList(values: readonly unknown[]): string {
  const strs = values.map((v) => String(v));
  if (strs.length <= 2) return strs.join(", ");
  return `${strs.slice(0, 2).join(", ")} +${strs.length - 2} more`;
}

/**
 * Build the summary. Pure — no I/O, no async. A field is summarized only when
 * it holds a user-meaningful value AND is currently visible (an unmet
 * `visibleWhen` mode is not part of what runs). `advanced` fields are included
 * only when set, and marked as conditions/fixed like any other; the card
 * headline prefers the first RESOURCE so the collapsed line reads task-first.
 */
export function buildNodeConfigSummary(
  input: BuildNodeConfigSummaryInput,
): NodeConfigSummary {
  const { displayName, fields, config, labelFor } = input;
  const segments: ConfigSummarySegment[] = [];

  for (const field of fields) {
    // Composite-managed siblings render through their owner; skip to avoid dupes.
    if (field.renderedBy) continue;
    if (!isVisibleWhenMet(field.visibleWhen, config)) continue;
    const value = config[field.name];
    if (isEmptyValue(value)) continue;

    // Resource picker → recognizable name (or raw value if not yet resolved).
    if (field.optionsSource && typeof value === "string") {
      if (isDynamic(value)) {
        segments.push({ label: field.label, display: describeDynamic(value), kind: "dynamic" });
        continue;
      }
      const resolved = labelFor?.(field.optionsSource, value);
      segments.push({
        label: field.label,
        display: resolved ?? value,
        kind: "resource",
        ...(resolved ? {} : { unresolved: true }),
      });
      continue;
    }

    // Per-chip resource arrays (string-array + optionsSource).
    if (field.optionsSource && Array.isArray(value)) {
      const shown = value.map((v) => {
        if (typeof v === "string" && !isDynamic(v)) {
          return labelFor?.(field.optionsSource!, v) ?? v;
        }
        return String(v);
      });
      segments.push({ label: field.label, display: shortList(shown), kind: "resource" });
      continue;
    }

    if (isDynamic(value)) {
      segments.push({ label: field.label, display: describeDynamic(value as string), kind: "dynamic" });
      continue;
    }

    if (field.type === "select" || field.type === "boolean") {
      segments.push({ label: field.label, display: describeChoice(field, value), kind: "condition" });
      continue;
    }

    if (Array.isArray(value)) {
      // Rows of objects (object-list / keyvalue-list / spreadsheet rows) —
      // summarize by count, never dump the shape. A plain scalar array
      // (chips) reads fine inline.
      const hasObjectRows = value.some(
        (v) => v !== null && typeof v === "object",
      );
      if (hasObjectRows) {
        segments.push({ label: field.label, display: `${value.length} set`, kind: "fixed" });
      } else {
        segments.push({ label: field.label, display: shortList(value), kind: "fixed" });
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      // A single structured object — summarize by field count.
      segments.push({
        label: field.label,
        display: `${Object.keys(value).length} set`,
        kind: "fixed",
      });
      continue;
    }

    segments.push({ label: field.label, display: String(value), kind: "fixed" });
  }

  const empty = segments.length === 0;
  const primaryResource = segments.find((s) => s.kind === "resource");
  const headline = empty
    ? displayName
    : primaryResource
      ? `${displayName} · ${primaryResource.display}`
      : displayName;

  return { headline, segments, empty };
}

/**
 * Which field names a node's summary depends on for RESOURCE labels — the
 * (optionsSource, value) pairs a label cache must know to render friendly
 * names. Lets the client prefetch/warm the cache for on-canvas summaries.
 */
export function resourceRefsForSummary(
  fields: readonly FieldMeta[],
  config: Readonly<Record<string, unknown>>,
): ReadonlyArray<{ source: string; value: string }> {
  const refs: Array<{ source: string; value: string }> = [];
  for (const field of fields) {
    if (!field.optionsSource) continue;
    if (!isVisibleWhenMet(field.visibleWhen, config)) continue;
    const value = config[field.name];
    if (typeof value === "string" && value.length > 0 && !isDynamic(value)) {
      refs.push({ source: field.optionsSource, value });
    } else if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === "string" && v.length > 0 && !isDynamic(v)) {
          refs.push({ source: field.optionsSource, value: v });
        }
      }
    }
  }
  return refs;
}

/** Parents (`dependsOn`) whose values a resource ref needs — for cache keying. Reserved for cascade-aware caches. */
export function summaryDependsOn(field: FieldMeta): readonly string[] {
  return normalizeDependsOn(field.dependsOn);
}
