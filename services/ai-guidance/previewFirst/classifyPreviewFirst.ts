/**
 * Server-side preview-first enforcement (REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1).
 *
 * The production failure this exists for: the user asked for a fully-specified four-app workflow
 * ("Typeform contact form → Mailchimp → HubSpot contact → Gmail summary") and the model returned a
 * conversational questionnaire with NO `workflowPlan`. The entire setup experience — the preview,
 * the dropdowns, the required-input fields — hangs off that structured plan
 * (`workflowPlan → previewDraft → requiredInputs → setup controls`), so a withheld plan silently
 * bypasses the whole guided UI, whatever the prompt instructions say. Prompt policy alone was
 * proven insufficient (commit 154fdaaff tightened it; production still regressed).
 *
 * This module is the DETERMINISTIC boundary check the route applies AFTER a guidance response:
 *
 *   1. `classifyPreviewFirst` — was withholding the plan legitimate for THIS request? Grounded in
 *      the request text + the live provider registry, never in the model's prose (classifying model
 *      prose is exactly the fragility this slice removes).
 *   2. `buildPreviewFirstRepairGoal` — the ONE structured repair instruction the route may send
 *      when the classification says a plan was expected.
 *
 * Classification is intentionally CONSERVATIVE — it only demands a plan when the user has already
 * named the apps. The rule:
 *
 *   PREVIEW EXPECTED  ⇐ the request explicitly names ≥ 2 registered providers (the user picked
 *                        their apps; topology follows from their own sentence), AND no
 *                        provider-alternation ("Gmail or Outlook") appears, AND no destructive
 *                        alternation ("delete or archive") appears.
 *   CLARIFICATION OK  ⇐ everything else: zero/one named provider (generic capability words like
 *                        "email"/"somewhere" are NOT provider names — providerVocabulary's rule),
 *                        an explicit either/or between providers, a destructive either/or, or an
 *                        editing turn (edits have their own proposal pipeline + fallbacks).
 *
 * A missed repair (classifier says clarification-ok when a human would say clear) degrades to the
 * OLD behavior — the questionnaire — never worse. A wrong repair costs one extra gateway call and
 * still cannot invent anything: the repaired plan passes the same validation, sanitization,
 * provider-ambiguity guard, and entitlement gates as any other plan.
 *
 * Server-only (imports the provider registry). Pure/deterministic: no fetch, no model, no clock.
 */

import { listProviders } from "@/integrations/_registry";
import { listProvidersWithMetadata } from "@/services/discovery/_registry";
import {
  buildWordSet,
  isProviderMentioned,
  providerMentionTokens,
} from "../providerVocabulary";

/** Why a clarification-only reply is (or is not) acceptable. Safe enums — logged, never user text. */
export type PreviewFirstClassification =
  | {
      readonly kind: "clarification_allowed";
      readonly reason:
        | "editing_turn"
        | "insufficient_named_providers"
        | "provider_alternation"
        | "destructive_alternation";
      /** Providers explicitly named (may be < 2). For observability only. */
      readonly namedProviders: readonly string[];
    }
  | {
      readonly kind: "preview_expected";
      readonly namedProviders: readonly string[];
    };

/**
 * Minimum route budget that must REMAIN for a repair attempt to be worth starting. Mirrors the
 * retry policy's `MIN_SECOND_ATTEMPT_MS` reasoning: a real Hermes turn takes seconds, and starting
 * one with less than this burns the remainder and converts a typed failure into a platform 504.
 */
export const MIN_REPAIR_BUDGET_MS = 15_000;

/**
 * Destructive verbs whose either/or genuinely changes what the workflow DOES (delete vs archive is
 * two different actions with different consequences, not a setup enum).
 */
const DESTRUCTIVE_VERBS = "(?:delete|deletes|remove|removes|erase|erases|wipe|wipes|purge|purges)";
const NON_DESTRUCTIVE_ALTERNATIVES =
  "(?:archive|archives|keep|keeps|hide|hides|skip|skips|flag|flags|deactivate|deactivates|unsubscribe|unsubscribes|move|moves)";

const DESTRUCTIVE_ALTERNATION = new RegExp(
  `\\b(?:${DESTRUCTIVE_VERBS}\\b[^.?!\\n]{0,40}\\bor\\b[^.?!\\n]{0,40}\\b${NON_DESTRUCTIVE_ALTERNATIVES}` +
    `|${NON_DESTRUCTIVE_ALTERNATIVES}\\b[^.?!\\n]{0,40}\\bor\\b[^.?!\\n]{0,40}\\b${DESTRUCTIVE_VERBS})\\b`,
  "i",
);

interface MentionedProvider {
  readonly id: string;
  readonly tokens: readonly string[];
}

/** Registered providers the goal text explicitly names (metadata-bearing only). */
function mentionedProviders(goalText: string): MentionedProvider[] {
  const words = buildWordSet([goalText]);
  const withMeta = new Set(listProvidersWithMetadata());
  const out: MentionedProvider[] = [];
  for (const manifest of listProviders()) {
    if (!withMeta.has(manifest.id)) continue;
    if (isProviderMentioned(manifest.id, manifest.displayName, words)) {
      out.push({ id: manifest.id, tokens: providerMentionTokens(manifest.id, manifest.displayName) });
    }
  }
  return out;
}

/**
 * True when the text contains "«A» or «B»" where A and B are mention tokens of two DIFFERENT named
 * providers — the user is explicitly asking us to choose ("Slack or Teams", "Drive or OneDrive").
 * That choice is the user's; a clarification is the correct reply.
 */
function hasProviderAlternation(goalText: string, providers: readonly MentionedProvider[]): boolean {
  const g = goalText.toLowerCase();
  for (const a of providers) {
    for (const b of providers) {
      if (a.id === b.id) continue;
      for (const ta of a.tokens) {
        for (const tb of b.tokens) {
          if (new RegExp(`\\b${ta}\\b\\s*(?:,\\s*)?or\\s+(?:\\w+\\s+){0,2}?${tb}\\b`).test(g)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export interface ClassifyPreviewFirstInput {
  /** The user's goal text for THIS turn (raw or tokenized — provider names survive tokenization). */
  readonly goalText: string;
  /** True when the turn edits an existing non-empty draft (the edit pipeline owns that path). */
  readonly editing: boolean;
}

/**
 * Decide whether a no-plan (clarification-only) guidance reply is acceptable for this request.
 * Deterministic; grounded ONLY in the request text and the provider registry.
 */
export function classifyPreviewFirst(input: ClassifyPreviewFirstInput): PreviewFirstClassification {
  if (input.editing) {
    return { kind: "clarification_allowed", reason: "editing_turn", namedProviders: [] };
  }
  const providers = mentionedProviders(input.goalText);
  const named = providers.map((p) => p.id).sort();
  if (providers.length < 2) {
    return { kind: "clarification_allowed", reason: "insufficient_named_providers", namedProviders: named };
  }
  if (hasProviderAlternation(input.goalText, providers)) {
    return { kind: "clarification_allowed", reason: "provider_alternation", namedProviders: named };
  }
  if (DESTRUCTIVE_ALTERNATION.test(input.goalText)) {
    return { kind: "clarification_allowed", reason: "destructive_alternation", namedProviders: named };
  }
  return { kind: "preview_expected", namedProviders: named };
}

/**
 * The single structured repair instruction. Sent as the repair call's goal text; the original
 * request and the first (plan-less) reply travel alongside as conversation turns, and the catalog /
 * field schemas / output schemas / json response contract ride in through the SAME prompt builder
 * every guidance call uses — so the repair sees everything the spec requires without new plumbing.
 *
 * The caller passes the TOKENIZED goal text (sensitive literals already replaced by [[..]]
 * placeholders) so the repair leaks nothing the first call didn't.
 */
export function buildPreviewFirstRepairGoal(input: {
  readonly safeGoalText: string;
  readonly namedProviders: readonly string[];
}): string {
  return [
    "Your previous answer withheld the workflow plan and asked configuration questions instead.",
    "Those questions (which form/board/audience/list, who to send to, which connected account, a required enum such as consent status or duplicate handling, or formatting) are SETUP VALUES — ChainReact collects them with its own setup form after the user reviews the shape. They must never block the plan.",
    "Return the structured workflowPlan json block NOW for the request below.",
    "Do not ask conversational questions.",
    `Use the trigger and actions for the apps the user already named (${input.namedProviders.join(", ")}), taken from the capability catalog, in the order the request describes.`,
    "Leave every unresolved configuration value out of config and list its field key in that step's requiredInputs.",
    "",
    `The user's request: ${input.safeGoalText}`,
  ].join("\n");
}
