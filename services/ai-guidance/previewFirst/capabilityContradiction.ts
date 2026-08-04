/**
 * Deterministic capability-contradiction guard (REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1).
 *
 * The production defect this exists for: on the clarification-answer turn "gmail", the model
 * replied "I can't watch Gmail automatically because ChainReact doesn't have a trigger for that
 * source" — while `gmail:new_email` (a registered polling trigger) has been in the discovery
 * registry the whole time. Nothing deterministic compared the model's prose against the registry,
 * so the false claim reached the user verbatim.
 *
 * This module is the LAST-LINE prose check, not the primary protection. The primary protection is
 * structural: a plan-expected turn never surfaces a plan-less reply at all (repair → deterministic
 * fallback → typed failure — see `enforcePreviewFirst`). This guard covers the remaining surface:
 * a turn where clarification is legitimately allowed but the model asserts that a provider the
 * USER named lacks trigger/support the registry actually has.
 *
 * Scope discipline (kept deliberately narrow so it can never rewrite a truthful answer):
 *   - Only providers the USER named in their own turns are considered (shared provider
 *     vocabulary — the same rule the selection guard uses).
 *   - Only sentences that BOTH match an unsupported-claim shape AND name that provider (or appear
 *     when exactly one user-named provider is in scope) count.
 *   - A "cannot watch / has no trigger" claim is a contradiction only when the registry holds at
 *     least one registered TRIGGER for that provider; a generic "not supported" claim only when
 *     the provider has any registered capability at all.
 *
 * Pure + model-free; reads only the frozen in-memory registries. Never throws.
 */

import { listProviders } from "@/integrations/_registry";
import {
  listActionMetasForProvider,
  listProvidersWithMetadata,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { buildWordSet, isProviderMentioned, providerMentionTokens } from "../providerVocabulary";

export interface CapabilityContradiction {
  readonly providerId: string;
  readonly displayName: string;
  /** Display names of the provider's registered triggers (may be empty for an action-only claim). */
  readonly registeredTriggerNames: readonly string[];
  /** Which claim class the sentence matched. */
  readonly claim: "no_trigger" | "not_supported";
}

/** "ChainReact cannot watch/detect/poll …" — a trigger-capability denial. */
const NO_TRIGGER_CLAIM_RES: readonly RegExp[] = [
  /\b(?:can(?:no|')t|cannot|unable to|not able to|no way to|isn'?t possible to|not possible to)\b[^.!?\n]{0,80}\b(?:watch|monitor|listen|detect|track|poll|trigger)/i,
  /\b(?:doesn'?t have|does not have|has no|there(?:'s| is) no|lacks?|without)\b[^.!?\n]{0,40}\btriggers?\b/i,
];

/** "X isn't supported / unsupported" — a blanket capability denial. */
const NOT_SUPPORTED_CLAIM_RE =
  /\b(?:isn'?t|is not|not|aren'?t|are not)\s+(?:currently\s+|yet\s+)?supported\b|\bunsupported\b/i;

/** Split prose into sentence-ish spans (newlines count as boundaries). */
function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface FindCapabilityContradictionInput {
  /** The model's user-facing reply for this turn. */
  readonly guidanceText: string;
  /** The USER's own texts (prior user turns + the current goal). */
  readonly conversationTexts: readonly string[];
}

/**
 * Find the first sentence that denies a capability the registry actually has, for a provider the
 * user named. Returns `null` when nothing contradicts (the common case).
 */
export function findCapabilityContradiction(
  input: FindCapabilityContradictionInput,
): CapabilityContradiction | null {
  const words = buildWordSet(input.conversationTexts);
  const withMeta = new Set(listProvidersWithMetadata());
  const mentioned = listProviders().filter(
    (m) => withMeta.has(m.id) && isProviderMentioned(m.id, m.displayName, words),
  );
  if (mentioned.length === 0) return null;

  const sentences = toSentences(input.guidanceText);
  for (const sentence of sentences) {
    const noTrigger = NO_TRIGGER_CLAIM_RES.some((re) => re.test(sentence));
    const notSupported = NOT_SUPPORTED_CLAIM_RE.test(sentence);
    if (!noTrigger && !notSupported) continue;

    const sentenceWords = buildWordSet([sentence]);
    // The provider the sentence is about must be NAMED in that sentence. A denial that names no
    // provider ("I can't watch that automatically") is routinely a TRUE statement about a source
    // ChainReact genuinely has no trigger for (usage metrics, churn, …) — attributing it to
    // whatever provider happens to be in scope repaired truthful answers, so it is not done.
    const subjects = mentioned.filter((m) =>
      providerMentionTokens(m.id, m.displayName).some((t) => sentenceWords.has(t)),
    );
    for (const provider of subjects) {
      const triggers = listTriggerMetasForProvider(provider.id);
      if (noTrigger && triggers.length > 0) {
        return {
          providerId: provider.id,
          displayName: provider.displayName,
          registeredTriggerNames: triggers.map((t) => t.displayName),
          claim: "no_trigger",
        };
      }
      if (
        notSupported &&
        (triggers.length > 0 || listActionMetasForProvider(provider.id).length > 0)
      ) {
        return {
          providerId: provider.id,
          displayName: provider.displayName,
          registeredTriggerNames: triggers.map((t) => t.displayName),
          claim: "not_supported",
        };
      }
    }
  }
  return null;
}

/**
 * Registry-derived honest replacement copy. Application-owned wording — never model text — so a
 * contradicted reply is REPAIRED into a true statement instead of surfaced. Lists at most three
 * trigger names to stay conversational.
 */
export function buildHonestCapabilityCopy(contradiction: CapabilityContradiction): string {
  const names = contradiction.registeredTriggerNames.slice(0, 3);
  if (names.length === 0) {
    return (
      `ChainReact does support ${contradiction.displayName}. ` +
      "Tell me what you'd like it to do and I'll sketch the workflow."
    );
  }
  const list = names.map((n) => `"${n}"`).join(", ");
  const plural = names.length > 1 ? "triggers" : "trigger";
  return (
    `ChainReact can watch ${contradiction.displayName} — the ${list} ${plural} can start a ` +
    "workflow automatically. Tell me what should happen when it fires and I'll sketch the workflow."
  );
}
