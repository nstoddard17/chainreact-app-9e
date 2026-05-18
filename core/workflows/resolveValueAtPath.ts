/**
 * Pure path resolver for variable-picker latest-value previews.
 *
 * Slice 3.9 — given an opaque value (a node's persisted output blob)
 * and a dotted path such as `"payload.from.name"`, return the value
 * located at that path (or `{found: false}` when any intermediate is
 * missing).
 *
 * Lives in `core/workflows/` because both the builder UI and any
 * future agent surface need the same lookup semantics, and core/ is
 * the only place both can import from.
 *
 * Design rules (intentional differences from the runtime resolver):
 *   - **Permissive, never throws.** Missing intermediates → not found,
 *     never an exception. Mid-air type mismatches (e.g. `"a.b"` where
 *     `a` is a string) → not found.
 *   - **No template tokens, no `{{...}}` parsing.** Callers strip the
 *     delimiters; this helper only walks the path.
 *   - **No coercion.** A path that lands on `null` returns `null`. A
 *     path that lands on `undefined` (explicit key set to undefined)
 *     returns `not found` — there is no way to distinguish "missing
 *     key" from "key set to undefined" in JS, so the picker treats
 *     both as absent. A path that lands on `0`, `false`, or `""`
 *     returns the value verbatim — the picker still renders them.
 *   - **Empty path returns the root.** `resolveValueAtPath(x, "")`
 *     === `{found: true, value: x}`. The picker emits empty paths
 *     when the author picks the source node itself (`{{trigger}}`).
 *   - **Bracket array indices.** `"items[0].name"` walks `items`, then
 *     index `0`, then `name`. Negative indices are NOT supported.
 *   - **Dot-only path syntax otherwise.** Dot is the only separator.
 *     A literal `.` inside a key is NOT escapable here — the picker
 *     builds paths from `OutputMeta.name` segments that the platform
 *     doesn't allow dots in.
 *
 * The runtime resolver in `workflow-engine/variables/resolveValue.ts`
 * is the authoritative substitution surface at execute time. This
 * helper is intentionally narrower — it powers a UI hint, not a
 * substitution.
 */

export interface ResolveValueAtPathResult {
  readonly found: boolean;
  /** The resolved value when `found === true`; otherwise `undefined`. */
  readonly value: unknown;
}

const ABSENT: ResolveValueAtPathResult = Object.freeze({
  found: false,
  value: undefined,
});

/**
 * Walk `path` against `root` and return the leaf value.
 *
 * Returns `{found: false}` when any intermediate key is missing, when
 * the leaf key would be applied against a non-object/non-array, or
 * when the leaf key is `undefined`.
 */
export function resolveValueAtPath(
  root: unknown,
  path: string,
): ResolveValueAtPathResult {
  if (path.length === 0) {
    // Empty path → root. `undefined` is still treated as absent so
    // the picker doesn't render "undefined" badges next to source nodes.
    if (root === undefined) return ABSENT;
    return { found: true, value: root };
  }
  const segments = splitPath(path);
  if (segments === null) return ABSENT;

  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return ABSENT;
    if (segment.kind === "index") {
      if (!Array.isArray(current)) return ABSENT;
      if (segment.index < 0 || segment.index >= current.length) return ABSENT;
      current = current[segment.index];
      continue;
    }
    // Property segment: only walk into plain objects. Arrays + Maps
    // + Sets are intentionally NOT walked via property keys here —
    // the picker has no way to surface them and silently coercing
    // hides bugs.
    if (
      typeof current !== "object" ||
      Array.isArray(current) ||
      isExoticContainer(current)
    ) {
      return ABSENT;
    }
    const obj = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, segment.key)) return ABSENT;
    current = obj[segment.key];
  }
  if (current === undefined) return ABSENT;
  return { found: true, value: current };
}

type Segment =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number };

/**
 * Parse `"a.b[0].c"` into a sequence of key + index segments. Returns
 * null on malformed paths (empty segment, non-integer index, mismatched
 * brackets) so the resolver short-circuits to absent — the picker
 * never crashes on garbage input.
 */
function splitPath(path: string): readonly Segment[] | null {
  const out: Segment[] = [];
  let i = 0;
  const len = path.length;
  while (i < len) {
    if (path[i] === ".") {
      // Leading or doubled `.` is malformed.
      return null;
    }
    if (path[i] === "[") {
      const close = path.indexOf("]", i + 1);
      if (close === -1) return null;
      const inner = path.slice(i + 1, close);
      if (inner.length === 0) return null;
      const idx = Number(inner);
      if (!Number.isInteger(idx) || idx < 0) return null;
      out.push({ kind: "index", index: idx });
      i = close + 1;
      if (i < len && path[i] === ".") i += 1;
      continue;
    }
    // Read a key — up to the next `.` or `[` or end.
    let end = i;
    while (end < len && path[end] !== "." && path[end] !== "[") end += 1;
    const key = path.slice(i, end);
    if (key.length === 0) return null;
    out.push({ kind: "key", key });
    i = end;
    if (i < len && path[i] === ".") i += 1;
  }
  return out;
}

/**
 * Returns true for Map / Set / Date / RegExp / Promise / WeakRef etc.
 * — exotic containers the picker can't usefully descend into. The
 * heuristic is "not Object.prototype as the direct prototype". Plain
 * `{...}` literals + `Object.create(null)` walk normally.
 */
function isExoticContainer(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return false;
  if (proto === Object.prototype) return false;
  return true;
}
