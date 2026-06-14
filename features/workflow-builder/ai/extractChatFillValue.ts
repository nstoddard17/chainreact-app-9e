/**
 * AI-CONFIG-ASSIST CS-3 — deterministic chat-fill value extraction.
 *
 * Plan: docs/slices/phase-4/ai/ai-config-assist-chat-fill-plan.md.
 *
 * v1 has NO model / NL parser. Given the user's chat message (and the fact a
 * field is actively highlighted), decide the literal value to place:
 *   - A QUOTED span wins: `put "hello from ChainReact" in message` → `hello from
 *     ChainReact` (exact text inside the quotes — straight or curly quotes).
 *   - Otherwise a plain message is taken whole: `hello from ChainReact` →
 *     `hello from ChainReact` (trimmed).
 *   - An imperative-looking message with no quoted value is AMBIGUOUS (we can't
 *     isolate the value) → ask the user to quote it. This errs toward asking
 *     rather than writing an instruction as the value.
 *
 * Pure + deterministic; no I/O, no model, no state. The caller always shows the
 * returned value in a confirmation bubble before anything is written.
 */

export type ChatFillExtraction =
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "ambiguous" };

/** First quoted span (straight or curly, single or double). Inner text only, or null. */
function firstQuotedSpan(message: string): string | null {
  const patterns = [/"([^"]*)"/, /'([^']*)'/, /“([^”]*)”/, /‘([^’]*)’/];
  for (const re of patterns) {
    const m = re.exec(message);
    if (m) return m[1] ?? null;
  }
  return null;
}

/**
 * Imperative phrasings that, WITHOUT a quoted value, mean we can't tell which
 * words are the value vs the instruction (e.g. "put hello in the message field").
 * Matched only when there is no quoted span.
 */
const INSTRUCTION_PREFIX = /^\s*(put|set|fill|insert|place|use|add|enter|type|change|update)\b/i;

export function extractChatFillValue(message: string): ChatFillExtraction {
  const quoted = firstQuotedSpan(message);
  if (quoted !== null) {
    // Empty quotes carry no value.
    return quoted.trim().length > 0 ? { kind: "value", value: quoted } : { kind: "ambiguous" };
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) return { kind: "ambiguous" };
  // Imperative + no quotes → can't isolate the value; ask the user to quote it.
  if (INSTRUCTION_PREFIX.test(trimmed)) return { kind: "ambiguous" };
  return { kind: "value", value: trimmed };
}
