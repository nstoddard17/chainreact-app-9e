/**
 * Compose a reconstructed planner prompt for a follow-up turn (Slice 4.AI-21).
 *
 * Session-local — never persisted. Built from user-supplied text (the original
 * prompt + the user's typed follow-up answer) and server-sanitized
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
 */
export interface ComposeFollowUpPromptInput {
  readonly originalPrompt: string;
  /** Required-input labels from the most recent planner response. */
  readonly requiredInputLabels: readonly string[];
  /** Answers given in prior follow-up turns within this same session chain. */
  readonly priorFollowUpAnswers: readonly string[];
  /** The user's freshly-typed follow-up answer for this turn. */
  readonly followUp: string;
}

export function composeFollowUpPrompt(input: ComposeFollowUpPromptInput): string {
  const { originalPrompt, requiredInputLabels, priorFollowUpAnswers, followUp } = input;
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

  sections.push(`User follow-up:\n${followUp.trim()}`);
  sections.push(
    "Create the workflow using the original request and the follow-up details.",
  );

  return sections.join("\n\n");
}
