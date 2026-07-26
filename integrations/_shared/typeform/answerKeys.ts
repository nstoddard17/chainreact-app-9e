/**
 * Stable, dot-path-safe answer KEYS for Typeform questions (REACT-AGENT-TYPEFORM-DYNAMIC-OUTPUTS-1).
 *
 * The problem this solves. A Typeform submission's answers are only addressable today as
 * `answers[0]`, `answers[1]`, … and `normalize.ts` is explicit that the array contains ONLY answered
 * questions — so position 0 is a different question on every submission. Any workflow mapping built on
 * an index is silently wrong the first time a respondent skips a question. There is no stable path for
 * "the email answer", which is why the React Agent could not map Typeform data into downstream steps.
 *
 * The key constraint that shapes the design. The AUTHORITATIVE runtime path tokenizer
 * (`workflow-engine/variables/resolveValue.ts`) accepts `[…]` for NUMERIC indices only — a bracketed
 * string key throws `Invalid array index` — and `.` always splits a segment, so a key containing a dot
 * is unreachable. A Typeform `ref` is author-defined and may contain anything. Therefore the map key
 * cannot be the raw ref; it must be an ENCODED, dot-path-safe derivative. That is the existing
 * convention this follows rather than inventing bracketed-string syntax the resolver cannot parse.
 *
 * The stability rule that makes design-time and runtime agree. `toAnswerKey` is a pure function of ONE
 * field — its `ref` and `id` — and never of the surrounding set. This matters: at design time the
 * resolver sees ALL questions, while at runtime the webhook carries only the ANSWERED ones. A key
 * derived from set-relative information (position, or "disambiguate against siblings") would differ
 * between the two. A per-field function cannot.
 *
 * Collision safety without set knowledge: a ref that is ALREADY dot-path-safe is used verbatim (so
 * `email` stays `email` — readable in the picker and in `{{trigger.answersByRef.email}}`). A ref that
 * had to be encoded gets a short deterministic hash of the ORIGINAL ref appended, so two different
 * refs that sanitize to the same slug still produce different keys.
 *
 * Pure + deterministic — no clock, no RNG, no I/O (the webhook normalizer's purity test depends on it).
 */

import { extractAnswerValue, type TypeformAnswer } from "./answers";

/** Characters the runtime path tokenizer can carry inside one segment without ambiguity. */
const SAFE_KEY_RE = /^[A-Za-z0-9_]+$/;

/** FNV-1a (32-bit). Deterministic, dependency-free, and stable across processes and releases. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // >>> 0 keeps it an unsigned 32-bit value through the multiply.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Derive the stable map key for ONE question.
 *
 * Prefers the Typeform `ref` (the author-set, immutable reference — the durable identity Typeform
 * itself guarantees across edits) and falls back to the field `id` when a form has no refs. Returns
 * `null` when neither exists, in which case the question simply has no stable path and is skipped
 * rather than given a positional one.
 */
export function toAnswerKey(field: { ref?: string | null; id?: string | null }): string | null {
  const ref = typeof field.ref === "string" && field.ref.length > 0 ? field.ref : null;
  const id = typeof field.id === "string" && field.id.length > 0 ? field.id : null;
  const source = ref ?? id;
  if (source === null) return null;

  // Already addressable as-is → use it verbatim, so the common case reads naturally.
  if (SAFE_KEY_RE.test(source)) return source;

  // Encode: unsafe runs collapse to `_`, then a hash of the ORIGINAL keeps distinct refs distinct.
  const slug = source.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const base = slug.length > 0 ? slug : "q";
  return `${base}__${fnv1a(source)}`;
}

/** One question's stable identity, shared by the resolver (design time) and normalizer (runtime). */
export interface TypeformAnswerKeyInfo {
  /** The dot-path-safe map key — the workflow-facing path segment. */
  readonly key: string;
  /** The provider's own immutable reference (or field id), preserved for display and audit. */
  readonly providerFieldRef: string;
}

/** Resolve a field's stable key + provider ref together, or null when it has no durable identity. */
export function toAnswerKeyInfo(field: {
  ref?: string | null;
  id?: string | null;
}): TypeformAnswerKeyInfo | null {
  const key = toAnswerKey(field);
  if (key === null) return null;
  const providerFieldRef =
    typeof field.ref === "string" && field.ref.length > 0 ? field.ref : (field.id as string);
  return { key, providerFieldRef };
}

/**
 * Build the stable keyed answer map for one submission.
 *
 * Absent (unanswered) questions stay ABSENT — the platform's existing missing-value convention, which
 * `resolveValue` already reports as a typed missing-variable failure rather than a silent empty
 * string. Values are the same normalized primitives `answers[]` carries, via the same
 * `extractAnswerValue`, so the two representations can never disagree. A later duplicate key wins
 * only if the earlier one produced `null`, so a real answer is never overwritten by an empty one.
 */
export function buildAnswersByRef(
  answers: readonly TypeformAnswer[],
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const answer of answers) {
    const key = toAnswerKey(answer.field ?? {});
    if (key === null) continue;
    const value = extractAnswerValue(answer);
    if (value === null && Object.prototype.hasOwnProperty.call(out, key)) continue;
    out[key] = value;
  }
  return out;
}
