/**
 * Check-workflow review formatting (BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW).
 *
 * Pure, presentation-neutral helpers that turn the builder's DETERMINISTIC
 * validation verdict plus an advisory agent reply into a human-readable workflow
 * review. ChainReact's own validation is the source of truth here: the review's
 * "Status" and "Setup issues" sections are derived only from
 * `CheckWorkflowReviewContext` (which the builder computes from the same
 * `collectBuilderValidationIssues` that drives the header pill / validation
 * drawer), so the review can NEVER claim a workflow is valid / ready while the
 * pill reports blocking issues — regardless of what the model says.
 *
 * The agent's free-text reply only contributes the "Suggestions" section, and
 * even there it is guarded:
 *   - raw JSON (the model dumping a workflow object) is never shown, and
 *   - when blockers exist, a model reply that affirms readiness/validity is
 *     suppressed so it can't contradict the deterministic Status.
 *
 * `core/` rule: this file imports only from `contracts/` (here: nothing) and is
 * framework-free so the builder UI and tests can both use it.
 */

/** Deterministic validation snapshot for the current builder draft (local only). */
export interface CheckWorkflowReviewContext {
  /** Plain-English description of the current workflow (built from node labels — local only). */
  readonly summary: string;
  /** Count of blocking setup issues from the shared validator (== the header pill count). */
  readonly blockingIssueCount: number;
  /**
   * Author-facing issue messages (may reference user node labels). LOCAL ONLY —
   * rendered in the user's browser, never sent to the agent.
   */
  readonly issueMessages: readonly string[];
  /**
   * De-identified validation issue CODES (registry enums, e.g. "missing_required_field").
   * Safe to send to the agent as review context — carries no user labels / values / ids.
   */
  readonly issueCodes: readonly string[];
}

const STATUS_LABEL = "Status";
const WORKFLOW_LABEL = "Current workflow";
const ISSUES_LABEL = "Setup issues";
const SUGGESTIONS_LABEL = "Suggestions";
const NEXT_STEP_LABEL = "Next step";

/**
 * Does this text look like a raw JSON object/array dump (the failure mode where the agent
 * returns a workflow definition instead of prose)? Tolerant of a leading ```json code fence.
 */
export function looksLikeRawJson(text: string): boolean {
  let t = text.trim();
  if (t.length === 0) return false;
  // Strip a single leading/trailing markdown code fence (```json … ```).
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence && fence[1] !== undefined) t = fence[1].trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    const parsed = JSON.parse(t) as unknown;
    return typeof parsed === "object" && parsed !== null;
  } catch {
    // Not strictly valid JSON, but a bracketed blob with several "key": pairs still reads as a dump.
    const keyish = t.match(/"[^"]+"\s*:/g);
    return (keyish?.length ?? 0) >= 2;
  }
}

/** Affirmative readiness/validity claim that must NOT survive when blockers exist. */
function affirmsReadiness(text: string): boolean {
  return /\b(valid|ready|good to go|looks good|all set|no (?:issues|problems|errors))\b/i.test(text);
}

/**
 * Reduce an agent reply to a safe "Suggestions" body, or null when nothing safe remains.
 * Drops raw-JSON dumps always, and readiness-affirming replies when blockers exist (they would
 * contradict the deterministic Status).
 */
export function sanitizeAgentSuggestions(
  text: string | null | undefined,
  hasBlockers: boolean,
): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (looksLikeRawJson(trimmed)) return null;
  if (hasBlockers && affirmsReadiness(trimmed)) return null;
  return trimmed;
}

/**
 * Append SAFE, de-identified review context to the user's review prompt before it is sent to the
 * agent. Only counts + issue CODES cross the boundary (never user labels / field values / ids), and
 * the agent is explicitly told not to claim readiness when blockers exist.
 */
export function buildAgentReviewGoalText(
  basePrompt: string,
  ctx: CheckWorkflowReviewContext,
): string {
  const base = basePrompt.trim();
  if (ctx.blockingIssueCount > 0) {
    const codes = ctx.issueCodes.length > 0 ? ` (codes: ${ctx.issueCodes.join(", ")})` : "";
    const plural = ctx.blockingIssueCount === 1 ? "issue" : "issues";
    return (
      `${base}\n\nContext for your review: ChainReact's validation currently reports ` +
      `${ctx.blockingIssueCount} blocking setup ${plural}${codes}. Treat this workflow as NOT ready ` +
      `to activate — do not say it is valid or ready. Briefly describe what the workflow does, then ` +
      `suggest concrete fixes for these blockers, followed by any optional improvements.`
    );
  }
  return (
    `${base}\n\nContext for your review: ChainReact's validation reports no blocking setup issues. ` +
    `Briefly describe what the workflow does, then suggest optional improvements. Remind the user to ` +
    `test it before activating.`
  );
}

export interface ComposeCheckWorkflowReviewInput {
  readonly summary: string;
  readonly blockingIssueCount: number;
  readonly issueMessages: readonly string[];
  /** The agent's raw advisory reply (may be JSON / may overclaim — guarded here). */
  readonly agentText: string | null | undefined;
}

/**
 * Compose the human-readable "Check workflow" review. Sections: Status, Current workflow,
 * Setup issues, Suggestions, Next step. Status + Setup issues are 100% deterministic from the
 * validation verdict, so the review never contradicts the pill / header.
 */
export function composeCheckWorkflowReview(input: ComposeCheckWorkflowReviewInput): string {
  const hasBlockers = input.blockingIssueCount > 0;

  const status = hasBlockers
    ? "This workflow is not ready to activate yet — fix the setup issues below first."
    : "ChainReact found no blocking setup issues. Review the suggestions below, then test before activating.";

  const issuesBody = hasBlockers
    ? input.issueMessages.map((m) => `• ${m}`).join("\n")
    : "None — ChainReact found no blocking setup issues.";

  const suggestions = sanitizeAgentSuggestions(input.agentText, hasBlockers);
  const suggestionsBody =
    suggestions ??
    (hasBlockers
      ? "Focus on the setup issues above first."
      : "No additional suggestions right now.");

  const nextStep = hasBlockers
    ? "Open the validation panel to fix the setup issues, then run a test."
    : "Run a test to confirm it behaves the way you expect, then activate.";

  return [
    `${STATUS_LABEL}\n${status}`,
    `${WORKFLOW_LABEL}\n${input.summary}`,
    `${ISSUES_LABEL}\n${issuesBody}`,
    `${SUGGESTIONS_LABEL}\n${suggestionsBody}`,
    `${NEXT_STEP_LABEL}\n${nextStep}`,
  ].join("\n\n");
}
