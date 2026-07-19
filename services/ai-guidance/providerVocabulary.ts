/**
 * Shared provider-mention vocabulary (REACT-PROVIDER-AMBIGUITY-1).
 *
 * ONE deterministic definition of "the user named this provider", shared by the prompt field-schema
 * narrowing (`promptFieldSchemas`) and the provider-selection guard (`providerSelectionGuard`) so
 * the two can never disagree about what counts as an explicit provider mention.
 *
 * A provider is "mentioned" when any distinctive token (≥3 chars) of its id or display name appears
 * as a whole word in the user's text — e.g. "outlook" → `microsoft-outlook`, "gmail" → `gmail`,
 * "google sheets"/"sheets" → `google-sheets`. Generic capability words ("email", "spreadsheet",
 * "message") are deliberately NOT provider mentions — they name a CATEGORY, not an app.
 */

/** Lowercased whole-word token set of one or more texts (tokens ≥2 chars). */
export function buildWordSet(texts: readonly string[]): Set<string> {
  const words = new Set<string>();
  for (const t of texts) {
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 2) words.add(w);
    }
  }
  return words;
}

/** Distinctive (≥3 char) match tokens for a provider: id, id segments, display-name words. */
export function providerMentionTokens(providerId: string, displayName: string): string[] {
  const idTokens = providerId.toLowerCase().split("-");
  const nameTokens = displayName.toLowerCase().split(/[^a-z0-9]+/);
  return [...idTokens, ...nameTokens, providerId.toLowerCase()].filter((t) => t.length >= 3);
}

/** True when the user's words name this provider (any distinctive token appears as a whole word). */
export function isProviderMentioned(
  providerId: string,
  displayName: string,
  words: ReadonlySet<string>,
): boolean {
  return providerMentionTokens(providerId, displayName).some((t) => words.has(t));
}
