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
  } = input;
  const sections: string[] = [];

  sections.push(`Original request:\n${originalPrompt.trim()}`);

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
  // Slice 4.AI-35 — edit-aware closing. The prior "Create the workflow…"
  // wording biased the model toward ADDING nodes even when the original
  // request was an edit of an existing canvas node (e.g. "change the Slack DM
  // recipient"), which broke existing-node-edit follow-ups. This neutral
  // instruction tells the model to update existing nodes for edits and only
  // create when building from scratch.
  sections.push(
    "Produce the workflow patch for the original request using the follow-up details above. If the original request edits nodes already on the canvas, UPDATE those existing nodes (update their config) rather than adding new ones; only add nodes when building from scratch.",
  );

  return sections.join("\n\n");
}
