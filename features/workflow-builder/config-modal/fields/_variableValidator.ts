/**
 * Soft variable-reference validator.
 *
 * Slice 3.7 — runs at design time inside text-style field renderers
 * to surface "References a missing node" / "References an unknown
 * field" warnings inline. Pure helper; no React, no fetch.
 *
 * Important boundary: these are SOFT warnings, NOT save-blocking
 * errors. The runtime resolver in
 * `workflow-engine/variables/resolveValue.ts` is the authoritative
 * gate at execute time and will throw `MissingVariableError`. The
 * design-time validator deliberately stays permissive so an author
 * who is mid-edit (e.g. about to add a downstream-needed node) can
 * keep typing without the rail blocking Save.
 *
 * Skip cases (intentionally NOT warned):
 *   - `{{AI_FIELD:fieldName}}` — agent construct; not author-pickable.
 *   - Tokens that `parseReferences` skipped (malformed, unterminated).
 *
 * Lives next to the renderers (private file prefix) because the
 * warnings reference field UX terminology ("This field references…")
 * rather than runtime semantics. The pure-function shape is testable
 * in isolation; the renderers consume it through a tiny inline
 * `useMemo` per field.
 */

import { parseReferences } from "@/core/workflows/variables/variableReferences";
import type { OutputMeta } from "@/contracts/actionMeta";

export interface ValidatorSource {
  /** Source identifier — `"trigger"` alias or upstream node id. */
  readonly sourceId: string;
  readonly outputs: readonly OutputMeta[];
}

export type VariableWarningReason =
  | "missing_node"
  | "missing_field";

export interface VariableWarning {
  /** Original `{{...}}` token as written. */
  readonly token: string;
  /** Source-id segment of the token. */
  readonly sourceId: string;
  /** Dotted path segment of the token (empty if the token is just the node id). */
  readonly path: string;
  readonly reason: VariableWarningReason;
  /** Author-facing message; renderer surfaces this verbatim. */
  readonly message: string;
}

export interface ValidateReferencesInput {
  /** The field value to scan; non-string returns no warnings. */
  value: unknown;
  /** Known upstream sources from `useUpstreamVariables(currentNodeId)`. */
  sources: readonly ValidatorSource[];
}

/**
 * Scan `value` for `{{...}}` references and return one warning per
 * reference that can't be resolved against `sources`. Returns an
 * empty array when every reference resolves cleanly OR the value has
 * no references at all.
 */
export function validateReferences({
  value,
  sources,
}: ValidateReferencesInput): readonly VariableWarning[] {
  const references = parseReferences(value);
  if (references.length === 0) return [];

  const sourceMap = new Map(sources.map((s) => [s.sourceId, s]));
  const warnings: VariableWarning[] = [];

  for (const ref of references) {
    const source = sourceMap.get(ref.nodeId);
    if (!source) {
      warnings.push({
        token: ref.token,
        sourceId: ref.nodeId,
        path: ref.path,
        reason: "missing_node",
        message: `References '${ref.token}' — no upstream source named '${ref.nodeId}' is available here.`,
      });
      continue;
    }
    if (ref.path.length === 0) {
      // Whole-source reference (`{{nodeId}}`) — always resolvable as
      // long as the source exists. Runtime returns the entire node
      // output / trigger event.
      continue;
    }
    const pathOk = pathResolvesAgainstOutputs(ref.path, source.outputs);
    if (!pathOk.ok) {
      warnings.push({
        token: ref.token,
        sourceId: ref.nodeId,
        path: ref.path,
        reason: "missing_field",
        message: `References '${ref.token}' — '${pathOk.missingSegment}' is not a declared output of '${source.sourceId}'.`,
      });
    }
  }

  return warnings;
}

interface PathOkResult {
  ok: boolean;
  missingSegment?: string;
}

/**
 * Walk the dotted/bracketed path against the OutputMeta tree.
 *
 * Permissive at boundaries:
 *   - Bracket-index segments (`[0]`) match any `array`-typed output —
 *     the OutputMeta contract doesn't index arrays, so we can't
 *     verify element shape past this point.
 *   - `unknown` outputs short-circuit to OK — meta declares the
 *     output exists but disclaims schema knowledge.
 *   - `object` outputs without nested `fields` short-circuit to OK
 *     for the same reason.
 *
 * Author intent matters here: we want to catch the common "typo in
 * a field name" mistake without erroring on legit access into
 * opaque payloads.
 */
function pathResolvesAgainstOutputs(
  path: string,
  outputs: readonly OutputMeta[],
): PathOkResult {
  const segments = tokenizePath(path);
  let currentLevel: readonly OutputMeta[] | "opaque" = outputs;

  for (const seg of segments) {
    if (currentLevel === "opaque") return { ok: true };
    if (seg.kind === "index") {
      // We hit an array index. Without per-element schema in OutputMeta,
      // we can't validate further — accept and treat the rest as opaque.
      currentLevel = "opaque";
      continue;
    }
    const match: OutputMeta | undefined = currentLevel.find(
      (o) => o.name === seg.name,
    );
    if (!match) {
      return { ok: false, missingSegment: seg.name };
    }
    if (match.type === "unknown") {
      currentLevel = "opaque";
      continue;
    }
    if (match.fields && match.fields.length > 0) {
      currentLevel = match.fields;
      continue;
    }
    if (match.type === "object" || match.type === "array") {
      // Object/array without declared nested fields — opaque from here.
      currentLevel = "opaque";
      continue;
    }
    // Scalar leaf — any further segments are invalid traversal.
    // Treat the remainder as opaque rather than fabricate an error
    // (`{{node.status.length}}` is technically legal at runtime).
    currentLevel = "opaque";
  }

  return { ok: true };
}

type PathSegment =
  | { kind: "name"; name: string }
  | { kind: "index" };

/**
 * Internal: split a path like `"a.b[0].c"` into typed segments.
 * Tolerant — malformed segments (empty names) are skipped silently.
 */
function tokenizePath(path: string): readonly PathSegment[] {
  const out: PathSegment[] = [];
  let buf = "";
  let i = 0;
  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ kind: "name", name: buf });
      buf = "";
    }
  };
  while (i < path.length) {
    const c = path[i];
    if (c === ".") {
      flush();
      i += 1;
      continue;
    }
    if (c === "[") {
      flush();
      const close = path.indexOf("]", i + 1);
      if (close === -1) {
        // Unterminated — stop scanning; treat as opaque thereafter.
        break;
      }
      out.push({ kind: "index" });
      i = close + 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  flush();
  return out;
}
