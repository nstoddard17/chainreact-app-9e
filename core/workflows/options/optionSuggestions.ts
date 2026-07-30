/**
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 — deterministic "did you mean this one?"
 * matching for a large static option list.
 *
 * A provider like Stripe exposes dozens of events. Rendering them all as
 * checkboxes is unusable, and guessing one for the user is worse — picking the
 * wrong trigger event silently changes what the workflow responds to. So the
 * planner deliberately leaves the exact event unresolved when it cannot
 * identify it safely, and this module offers a SHORTLIST instead.
 *
 * Suggestions are display-only. Nothing here ever selects an option, and the
 * caller must not preselect one: a suggestion the user has to confirm is
 * honest, an assumption they have to notice is not.
 *
 * Pure and offline — token overlap against the user's own words. No model call,
 * no network, no AI credits. Same input always yields the same shortlist.
 */

/** Words that carry no signal for matching an option name. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "the", "to", "in", "on", "at", "of", "for", "from", "with",
  "when", "whenever", "if", "then", "send", "me", "my", "get", "gets", "got",
  "is", "are", "was", "were", "be", "please", "new", "workflow", "message",
  "notify", "notification", "channel", "email", "it", "that", "this",
]);

/** Minimum shared prefix length for two different words to count as the same stem. */
const MIN_STEM = 4;

/** How many distinct matched stems a candidate needs before it is worth suggesting. */
const MIN_SCORE = 2;

export interface SuggestibleOption {
  readonly value: string;
  readonly label: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Do two tokens plausibly share a stem? Exact match, or a common prefix long
 * enough to survive ordinary inflection ("succeeds" ↔ "succeeded",
 * "payments" ↔ "payment"). Deliberately crude: a false positive costs one extra
 * suggestion the user ignores, while stemming properly would need a dictionary.
 */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < MIN_STEM) return false;
  return longer.startsWith(shorter.slice(0, Math.max(MIN_STEM, shorter.length - 2)));
}

export interface SuggestOptionMatchesInput {
  /** The user's own request text. Empty / absent → no suggestions. */
  readonly query: string | null | undefined;
  readonly options: readonly SuggestibleOption[];
  /** Maximum shortlist length. */
  readonly limit?: number;
}

/**
 * The shortlist of option VALUES worth showing first, best match first. Returns
 * an empty list whenever nothing clears the confidence bar — a shortlist of
 * everything is the checkbox wall again, and a shortlist of noise is worse than
 * none.
 */
export function suggestOptionMatches(input: SuggestOptionMatchesInput): readonly string[] {
  const { query, options, limit = 3 } = input;
  if (!query || options.length === 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored: { value: string; score: number; index: number }[] = [];
  options.forEach((option, index) => {
    const optionTokens = new Set([...tokenize(option.value), ...tokenize(option.label)]);
    if (optionTokens.size === 0) return;
    let score = 0;
    for (const optionToken of optionTokens) {
      if (queryTokens.some((q) => sameStem(q, optionToken))) score += 1;
    }
    if (score >= MIN_SCORE) scored.push({ value: option.value, score, index });
  });

  return scored
    // Higher score first; ties keep the provider's own catalog order so the
    // shortlist is stable rather than alphabetised into a different meaning.
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, limit)
    .map((s) => s.value);
}

/**
 * Filter options by a user-typed search string. Matches on label OR value so
 * someone who knows the provider's identifier can type it directly.
 */
export function filterOptions<T extends SuggestibleOption>(
  options: readonly T[],
  search: string,
): readonly T[] {
  const needle = search.trim().toLowerCase();
  if (needle.length === 0) return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle),
  );
}
