import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

/**
 * Builder-UI gate for the paid "Explain with AI" affordance on a workflow
 * diagnosis (Slice 4.AI-DIAG-2c).
 *
 * Product rule: don't offer a paid explanation when there is nothing useful to
 * explain. A fully-clean / ready diagnosis (no findings, no actionable next
 * steps) already tells the user everything via the deterministic "Check
 * workflow" result — an LLM explanation would just restate "it's ready" and
 * could waste an AI credit once enforcement is enabled.
 *
 * Decided ONLY from the safe, structured DTO fields (never `summaryText` string
 * matching):
 *   - `access` must be "OK" — an access wall (NOT_FOUND / NO_ACCESS) renders a
 *     single safe line with nothing to explain.
 *   - then show Explain when the diagnosis is NOT clean: the workflow isn't
 *     overall-ready, OR it carries any finding (blocking error OR warning, incl.
 *     a failed-run finding), OR it surfaced any actionable next step.
 *
 * `nextSteps` is itself derived purely from findings + a failed-run hint (the
 * renderer never emits a generic "you're ready" step), so a non-empty
 * `nextSteps` always means real, actionable guidance — no "generic ready/success
 * message" filtering is needed.
 *
 * The backend explain route stays available; this only governs whether the UI
 * OFFERS the action.
 */
export function canExplainDiagnosis(
  diagnosis: AgentWorkflowDiagnosis,
): boolean {
  if (diagnosis.access !== "OK") return false;
  if (diagnosis.overallReady === false) return true;
  if ((diagnosis.findings?.length ?? 0) > 0) return true;
  if ((diagnosis.nextSteps?.length ?? 0) > 0) return true;
  return false;
}
