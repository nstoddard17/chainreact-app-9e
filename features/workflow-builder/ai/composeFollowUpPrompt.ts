/**
 * Compose a reconstructed planner prompt for a follow-up turn (Slice 4.AI-21,
 * extended in 4.AI-22 for structured required-input answers).
 *
 * Session-local — never persisted. Built from user-supplied text (the original
 * prompt + the user's typed follow-up answer + any structured answers from the
 * interactive `RequiredInputControl`s) and server-sanitized
 * `AiRequiredUserInput.label` strings only. No raw config / patch values /
 * secrets reach this function; the planner result's `requiredUserInput` labels
 * are already value-free by the AI-9A/AI-3/AI-5 contract.
 *
 * The shape is intentionally simple — the goal is to give the model enough
 * context to understand the prior request without persisting state server-side.
 * Multi-turn chains accumulate `priorFollowUpAnswers` so subsequent rounds can
 * see what the user has already answered. Labels are taken from the LATEST
 * planner round (i.e. the questions still unanswered when the user typed
 * `followUp`).
 *
 * AI-22 — structured answers (`{label, value?, display}`) render as
 * `- {label}: {display}{ (value: <value>) when distinct}`. The model sees
 * both the human-meaningful display (e.g. `#general`) AND the machine value
 * (e.g. `C123456`) when the user picked from a resolver-backed dropdown,
 * so it can produce a complete, valid patch without the user having to
 * type the id manually.
 */
export interface ComposeFollowUpStructuredAnswer {
  /** The field's human label (e.g. "Slack channel"). */
  readonly label: string;
  /** The display-friendly value (e.g. "#general"). */
  readonly display: string;
  /** Machine value when the user picked an option (e.g. "C123456"). Optional. */
  readonly value?: string;
  /**
   * Slice 4.AI-35 — set for a `provider_choice` answer (the ambiguous category
   * the user just resolved, e.g. "email"). Rendered as a clear statement —
   * "The email provider is Gmail." — so the planner uses exactly that provider
   * on the re-plan instead of re-deriving the ambiguity.
   */
  readonly category?: string;
}

export interface ComposeFollowUpPromptInput {
  readonly originalPrompt: string;
  /** Required-input labels from the most recent planner response. */
  readonly requiredInputLabels: readonly string[];
  /** Answers given in prior follow-up turns within this same session chain. */
  readonly priorFollowUpAnswers: readonly string[];
  /** The user's freshly-typed follow-up answer for this turn. May be empty when only structured answers were supplied. */
  readonly followUp: string;
  /**
   * Structured answers from the React Agent's interactive required-input
   * controls. Each entry carries a human label + display string + optional
   * machine value (when the user picked from a dropdown / picker rather
   * than typed free text). Optional — pre-AI-22 callers can omit it.
   */
  readonly structuredAnswers?: readonly ComposeFollowUpStructuredAnswer[];
  /**
   * Slice 4.AI-35I — true when the latest follow-up is an explicit
   * shape-changing correction (detected by `detectIntentCorrection`). Adds a
   * prominent directive telling the planner the latest message OVERRIDES the
   * previously inferred provider/action/trigger, so a "this is to a channel"
   * correction switches Slack DM → channel instead of re-asking for a user id.
   */
  readonly isCorrection?: boolean;
  /**
   * Slice 4.AI-35I — the prior plan's `intentSummary` (already value-free per
   * the AI-9A/AI-3 contract). Rendered as NON-BINDING context so the planner
   * knows what it inferred before, while the closing instruction keeps the
   * latest user message authoritative.
   */
  readonly priorPlanSummary?: string;
}

function formatStructuredAnswer(a: ComposeFollowUpStructuredAnswer): string {
  const label = a.label.trim();
  const display = a.display.trim();
  // Slice 4.AI-35 — provider-choice answers read as a clear directive so the
  // re-plan binds the named provider (e.g. "The email provider is Gmail.").
  if (a.category && a.category.trim().length > 0) {
    const value = a.value && a.value !== display ? ` (id: ${a.value})` : "";
    return `- The ${a.category.trim()} provider is ${display}${value}.`;
  }
  if (a.value && a.value !== display) {
    return `- ${label}: ${display} (value: ${a.value})`;
  }
  return `- ${label}: ${display}`;
}

export function composeFollowUpPrompt(input: ComposeFollowUpPromptInput): string {
  const {
    originalPrompt,
    requiredInputLabels,
    priorFollowUpAnswers,
    followUp,
    structuredAnswers,
    isCorrection,
    priorPlanSummary,
  } = input;
  const sections: string[] = [];

  sections.push(`Original request:\n${originalPrompt.trim()}`);

  // Slice 4.AI-35I — the prior plan summary is CONTEXT, never binding truth.
  const trimmedPriorPlanSummary = priorPlanSummary?.trim() ?? "";
  if (trimmedPriorPlanSummary.length > 0) {
    sections.push(
      `Current plan so far (context only — may be replaced by your latest message):\n${trimmedPriorPlanSummary}`,
    );
  }

  if (requiredInputLabels.length > 0) {
    sections.push(
      `The agent asked for:\n${requiredInputLabels.map((l) => `- ${l}`).join("\n")}`,
    );
  }

  if (priorFollowUpAnswers.length > 0) {
    sections.push(
      `Previous follow-up answers:\n${priorFollowUpAnswers.map((a) => `- ${a}`).join("\n")}`,
    );
  }

  if (structuredAnswers && structuredAnswers.length > 0) {
    sections.push(
      `User provided:\n${structuredAnswers.map(formatStructuredAnswer).join("\n")}`,
    );
  }

  const trimmedFollowUp = followUp.trim();
  if (trimmedFollowUp.length > 0) {
    sections.push(`User follow-up:\n${trimmedFollowUp}`);
  }

  // Slice 4.AI-35I — when the latest message is an explicit correction, lead
  // with a prominent override directive so the planner abandons the previously
  // inferred provider/action/trigger instead of re-completing its stale inputs
  // (the "keeps asking for a Slack DM userId after the user said channel" bug).
  if (isCorrection === true) {
    sections.push(
      "Correction: the user's latest message corrects the earlier plan. Treat it as an explicit override of the previously inferred provider, action, and trigger. Rebuild the affected node(s) to match the correction — do NOT keep the previous action/trigger type, and do NOT re-ask for inputs (e.g. a recipient or user id) that only applied to the choice the user just replaced.",
    );
  }

  // Slice 4.AI-35I — authoritative-latest closing (replaces the AI-35 "for the
  // original request" wording, which biased the planner toward the original
  // inferred intent and ignored explicit corrections — exposed once AI-36
  // switched the planner to OpenAI). The original request, the agent's
  // questions, the current plan, and any previous answers above are CONTEXT
  // ONLY. Keeps the AI-35 edit-vs-add guidance.
  sections.push(
    "The user's latest message is authoritative. The original request, the agent's questions, the current plan, and any previous answers above are CONTEXT ONLY — if the latest message conflicts with them, follow the latest message and REPLACE the obsolete provider/action/trigger choice (discarding any required inputs that only applied to the replaced choice). If the request edits nodes already on the canvas, UPDATE those existing nodes (update their config) rather than adding new ones; only add nodes when building from scratch.",
  );

  return sections.join("\n\n");
}
