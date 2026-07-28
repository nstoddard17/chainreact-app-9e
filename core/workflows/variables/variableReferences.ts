/**
 * Pure helpers for `{{nodeId.path}}` template references.
 *
 * Slice 3.7 — the builder's variable picker emits these strings and
 * the future React Agent will parse them to reason about workflow
 * variable usage without re-implementing tokenization. The runtime
 * resolver in `workflow-engine/variables/resolveValue.ts` is the
 * authoritative substitution surface; these helpers are intentionally
 * narrower:
 *
 *   - `parseReferences(value)` — extracts a structured list of all
 *     `{{nodeId.path}}` tokens found in a string. AI_FIELD tokens
 *     (`{{AI_FIELD:fieldName}}`) are skipped — they are an agent
 *     construct, not author-pickable.
 *   - `formatReference({ nodeId, path })` — composes a token string
 *     suitable for insertion at a cursor position.
 *
 * Naming + path syntax mirrors the runtime resolver:
 *   - Dotted path segments (`a.b.c`).
 *   - Bracket indices (`a[0].b`).
 *   - First segment is the node id (or `trigger` alias).
 *
 * Lives in `core/workflows/` so both the builder UI (which can't
 * import from `workflow-engine/` per project-structure rule §4) and
 * any future agent surface can reuse the same pure helpers. Adding
 * dependencies on the engine for client code would couple client
 * bundles to engine internals.
 *
 * Failure handling is permissive by design: malformed tokens (e.g.
 * `{{}}`, unterminated, missing dot) are SKIPPED rather than throwing.
 * The runtime resolver's stricter tokenizer is the authoritative gate
 * at execute time; the picker / agent should not crash on
 * partially-typed author input.
 */

export interface VariableReference {
  /** The full token as written, including the `{{` and `}}` delimiters. */
  readonly token: string;
  /** Node id segment (or `"trigger"` alias). */
  readonly nodeId: string;
  /**
   * Dotted path inside the node's variables, e.g. `"payload.from.name"`.
   * Empty string when the token references the node itself (`{{nodeId}}`).
   */
  readonly path: string;
  /** Character offset of the opening `{{` within the source string. */
  readonly offset: number;
}

/**
 * Internal: strip AI_FIELD tokens up front and refuse to scan inside
 * them. They share the `{{...}}` delimiter but their contents are
 * agent-emitted and not author-pickable. Returning them in the picker
 * would imply they're rewritable, which they are not.
 */
function isAiFieldContent(content: string): boolean {
  return content.startsWith("AI_FIELD:");
}

/**
 * Extract all `{{nodeId.path}}` references from a string. Returns the
 * list in source order. AI_FIELD tokens are skipped.
 *
 * Permissive:
 *   - Non-string inputs return [].
 *   - Unterminated `{{...` opens are skipped silently.
 *   - Tokens whose content has no leading identifier are skipped.
 *
 * Nesting (`{{{{...}}}}`) is NOT supported by the picker — runtime
 * supports it for AI_FIELD parameter resolution but that's not an
 * author-pickable case.
 */
export function parseReferences(value: unknown): readonly VariableReference[] {
  if (typeof value !== "string") return [];
  const out: VariableReference[] = [];
  const len = value.length;
  let i = 0;
  while (i < len - 1) {
    if (value[i] === "{" && value[i + 1] === "{") {
      const tokenStart = i;
      const contentStart = i + 2;
      // Find the matching `}}`. Skip token entirely if unterminated.
      const closeIdx = value.indexOf("}}", contentStart);
      if (closeIdx === -1) {
        // Unterminated — stop scanning entirely so we don't false-match
        // later `{{` that happens to fall inside the runaway text.
        break;
      }
      const content = value.slice(contentStart, closeIdx).trim();
      const tokenEnd = closeIdx + 2;
      if (!isAiFieldContent(content)) {
        const parsed = parseContent(content);
        if (parsed) {
          out.push({
            token: value.slice(tokenStart, tokenEnd),
            nodeId: parsed.nodeId,
            path: parsed.path,
            offset: tokenStart,
          });
        }
      }
      i = tokenEnd;
      continue;
    }
    i += 1;
  }
  return out;
}

interface ContentParseResult {
  nodeId: string;
  path: string;
}

/**
 * Internal: parse the inner content of a single `{{...}}` token into
 * `{ nodeId, path }`. Returns null when the content is empty, has no
 * leading identifier, or starts with a syntactic separator.
 */
function parseContent(content: string): ContentParseResult | null {
  if (content.length === 0) return null;
  // Reject contents starting with `.` or `[` — those don't carry a node id.
  if (content[0] === "." || content[0] === "[") return null;
  // Find the first `.` or `[`. Everything before it is the nodeId.
  const dotIdx = content.indexOf(".");
  const bracketIdx = content.indexOf("[");
  const sepCandidates = [dotIdx, bracketIdx].filter((n) => n >= 0);
  if (sepCandidates.length === 0) {
    // Whole content is the nodeId, no path.
    return { nodeId: content, path: "" };
  }
  const sepIdx = Math.min(...sepCandidates);
  const nodeId = content.slice(0, sepIdx);
  if (nodeId.length === 0) return null;
  // Preserve the path EXACTLY as written so downstream consumers
  // (resolver, agent inspection) work against the same string the
  // author wrote.
  const path =
    content[sepIdx] === "." ? content.slice(sepIdx + 1) : content.slice(sepIdx);
  return { nodeId, path };
}

/**
 * Compose a canonical `{{nodeId.path}}` token suitable for insertion
 * into a text field. Empty path produces `{{nodeId}}`. Paths starting
 * with `[` (array index) are joined without a leading `.` — matches
 * the runtime resolver's tokenizer.
 */
export function formatReference(input: {
  nodeId: string;
  path: string;
}): string {
  const { nodeId, path } = input;
  if (path.length === 0) return `{{${nodeId}}}`;
  if (path[0] === "[") return `{{${nodeId}${path}}}`;
  return `{{${nodeId}.${path}}}`;
}
