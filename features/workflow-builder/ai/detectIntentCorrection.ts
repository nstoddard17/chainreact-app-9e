/**
 * Detect an explicit follow-up *intent correction* (Slice 4.AI-35I).
 *
 * The React Agent's follow-up loop infers a provider / action / trigger from the
 * original prompt, then asks for the missing required inputs. When the user's
 * NEXT message corrects that inferred shape ("this is to a channel", "no, use
 * Outlook", "actually send an email instead", "make it manual"), the re-plan
 * must treat the correction as authoritative and REPLACE the obsolete choice —
 * not keep completing the stale action's inputs (e.g. re-asking for a Slack DM
 * `userId` after the user said "channel").
 *
 * This is a pure, generic, provider-agnostic detector (no Slack/Gmail/etc.
 * hardcoding): it matches override / contrast markers in the user's latest
 * free-text message. It is intentionally tuned for RECALL over precision —
 * a free-text follow-up already forces a model re-plan
 * ({@link ./deterministicCompletion}'s `free_text_present`), so a false
 * positive only adds harmless "follow the latest message" emphasis to a re-plan
 * that was happening anyway, whereas a false negative re-introduces the
 * stale-intent bug. Plain field answers ("Hey", "#general", "say hello") carry
 * no marker and are NOT flagged.
 *
 * Used by `useBuilderAi.submitFollowUp` to (a) bypass deterministic completion
 * so a correction can never fill a stale patch, and (b) flag the re-plan prompt
 * so {@link ./composeFollowUpPrompt} makes the latest message authoritative.
 */

export interface IntentCorrectionResult {
  /** True when the latest message is an explicit shape-changing correction. */
  readonly isCorrection: boolean;
  /** Names of the markers that matched — diagnostic only, never user-facing. */
  readonly signals: readonly string[];
}

/**
 * Generic override / contrast markers. Each is a named regex tested against the
 * lowercased, whitespace-normalized latest message. Provider corrections
 * ("No, use Outlook", "Actually send an email, not Slack") are caught by the
 * generic contrast markers (`no-contrast` / `actually` / `instead` / `not-a-dm`)
 * without enumerating any provider — keeping this slice-generic.
 */
const CORRECTION_MARKERS: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> = [
  { name: "not-a-dm", re: /\bnot\s+(?:a\s+|an\s+)?(?:dm|direct\s+messages?)\b/ },
  { name: "to-a-channel", re: /\b(?:to|in|as)\s+(?:a\s+)?channel\b/ },
  { name: "i-said", re: /\bi\s+said\b/ },
  { name: "instead", re: /\binstead\b/ },
  { name: "actually", re: /\bactually\b/ },
  { name: "rather-than", re: /\brather\s+than\b/ },
  { name: "change-to", re: /\bchange\s+(?:that|it|this)\s+to\b/ },
  { name: "switch-to", re: /\bswitch\s+to\b/ },
  { name: "no-contrast", re: /^\s*no[,.\s]/ },
  { name: "make-it", re: /\bmake\s+it\s+(?:a\s+)?(?:channel|manual|dm|direct)\b/ },
];

export function detectIntentCorrection(text: string): IntentCorrectionResult {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return { isCorrection: false, signals: [] };

  const signals: string[] = [];
  for (const marker of CORRECTION_MARKERS) {
    if (marker.re.test(normalized)) signals.push(marker.name);
  }
  return { isCorrection: signals.length > 0, signals };
}
