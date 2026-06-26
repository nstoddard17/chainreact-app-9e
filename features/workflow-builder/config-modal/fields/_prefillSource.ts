/**
 * Friendly plain-English source label for a PRE-FILLED config field
 * (Slice 4.TEMPLATE-SETUP-UX-1).
 *
 * Given a field value that is a single `{{nodeId.path}}` reference and the
 * upstream `sources` from `useUpstreamVariables`, produce a human sentence like
 * "Subject from the trigger" or "Email from the Create Contact step" — so the
 * builder can explain a prewired field WITHOUT exposing the raw `{{...}}` token,
 * the node id, or any provider-resource id.
 *
 * Pure (no React, no fetch). Lives next to the renderers (private `_` prefix)
 * because it speaks field-UX terminology, mirroring `_variableValidator.ts`.
 *
 * Safety: the ONLY strings emitted are (a) the source's friendly meta
 * `displayName` (e.g. "Create Contact", never an account/integration id) and
 * (b) the humanized output NAME (e.g. "subject" -> "Subject"). Never the token,
 * the node id, the literal value, or a provider-resource id. Returns `null`
 * (caller falls back to a generic "Pre-filled from earlier step" badge) when the
 * value is not a single resolvable reference or the source/output is unknown.
 */

import { parseReferences } from "@/core/workflows/variableReferences";
import type { VariableSource } from "../../hooks/useUpstreamVariables";
import type { OutputMeta } from "@/contracts/actionMeta";

export interface DescribePrefillSourceInput {
  readonly value: unknown;
  readonly sources: readonly VariableSource[];
}

/** First path segment of a dotted/bracketed reference path (`"a.b[0]"` -> `"a"`). */
function firstSegment(path: string): string {
  return path.split(/[.[]/)[0] ?? "";
}

/**
 * Turn an output key into a label: split camelCase, replace `_`/`-` with spaces,
 * Sentence-case. `"shopDomain"` -> `"Shop domain"`, `"stripeEventType"` ->
 * `"Stripe event type"`, `"email"` -> `"Email"`.
 */
function humanizeOutputName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (spaced.length === 0) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Whether `name` is a declared (possibly nested-root) output of the source. */
function isDeclaredOutput(name: string, outputs: readonly OutputMeta[]): boolean {
  return outputs.some((o) => o.name === name);
}

/**
 * Return a friendly label for a single-reference value, or `null` when no precise
 * label can be derived (mixed strings, multi-ref, unknown source / output).
 */
export function describePrefillSource(
  input: DescribePrefillSourceInput,
): string | null {
  const refs = parseReferences(input.value);
  if (refs.length !== 1) return null;
  const ref = refs[0]!;
  if (typeof input.value === "string" && input.value.trim() !== ref.token) {
    // Mixed string (literal text around the token) — no precise single label.
    return null;
  }

  const source = input.sources.find((s) => s.sourceId === ref.nodeId);
  if (!source) return null;

  const sourcePhrase =
    source.kind === "trigger" ? "the trigger" : `the ${source.displayName} step`;

  if (ref.path === "") return `Data from ${sourcePhrase}`;

  const outputName = firstSegment(ref.path);
  if (outputName.length === 0) return `Data from ${sourcePhrase}`;
  // Only claim a precise output label when it is a declared output of the source;
  // otherwise fall back to the source-level phrase (never fabricate a field name).
  if (!isDeclaredOutput(outputName, source.outputs)) {
    return `Data from ${sourcePhrase}`;
  }
  return `${humanizeOutputName(outputName)} from ${sourcePhrase}`;
}
