import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

/**
 * Slice 4.CHECK-ACTIONS-2 — derive the "Needs attention" manual-guidance cards from a
 * safe diagnosis DTO.
 *
 * Pure + deterministic: reads ONLY the already-sanitized `source: "graph"` and
 * `source: "run"` findings — the non-targetable issues that aren't a missing user
 * field (→ "Needs your input") or a connection/auth problem (→ "Needs setup"). Maps
 * each to friendly, value-free guidance with NO button (there's no single safe in-app
 * action for "the workflow has no trigger" or "the last run failed" from this card).
 * No model call, no I/O, no AI credits.
 *
 * No-leak: renders only deterministic guidance strings keyed off the finding's stable
 * code — never the raw code, node id, field key, provider/type key, or any config
 * value. Run findings deliberately surface only generic guidance (not the stored run
 * classification prose, which the summary already carries) to avoid duplicate copy.
 */

export interface AttentionFindingCard {
  /** Stable React key (source + code + index). Not rendered. */
  readonly key: string;
  readonly severity: "error" | "warning";
  /** Deterministic, value-free guidance sentence. */
  readonly message: string;
}

/** Friendly manual-guidance line for a structural (graph) finding. */
function graphGuidance(code: string): string {
  switch (code) {
    case "no_trigger":
      return "Add a trigger so the workflow has a starting point.";
    case "unreachable_node":
      return "Connect every step back to the trigger so it can run.";
    case "empty_workflow":
      return "Add a trigger and at least one action to this workflow.";
    default:
      return "Fix the workflow's structure before it can run.";
  }
}

/**
 * AI-REPAIR-3G — friendly "Needs attention" line for a broken variable reference.
 * Names the affected field(s) and echoes the user-AUTHORED `{{...}}` token(s) — the
 * one place a token-embedded node id is allowed in user-facing text (the user typed
 * it; the design-time field validator shows it too). Falls back to generic guidance
 * when the safe display metadata is absent (e.g. a rehydrated historical diagnosis).
 */
function invalidReferenceGuidance(
  refs: readonly { readonly fieldLabel: string; readonly token: string }[] | undefined,
): string {
  if (!refs || refs.length === 0) {
    return "A step references a deleted or missing step. Re-point it to an available step, or remove the reference.";
  }
  const parts = refs.map((r) => `${r.fieldLabel} (${r.token})`).join(", ");
  const lead =
    refs.length === 1
      ? `The ${parts} field references a step that's no longer in this workflow.`
      : `These fields reference steps that are no longer in this workflow: ${parts}.`;
  return `${lead} Re-point it to an available step, or remove the reference.`;
}

/**
 * Map a diagnosis to its ordered "Needs attention" cards (graph + run findings, in
 * finding order). Returns an empty array when there are none, so the caller renders
 * nothing.
 */
export function attentionFindingCards(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): AttentionFindingCard[] {
  const out: AttentionFindingCard[] = [];
  let i = 0;
  for (const finding of diagnosis?.findings ?? []) {
    const severity: "error" | "warning" =
      finding.severity === "warning" ? "warning" : "error";
    if (finding.source === "graph") {
      const message =
        finding.code === "INVALID_VARIABLE_REFERENCE"
          ? invalidReferenceGuidance(finding.invalidReferences)
          : graphGuidance(finding.code);
      out.push({ key: `graph:${finding.code}:${i}`, severity, message });
    } else if (finding.source === "run") {
      out.push({
        key: `run:${finding.code}:${i}`,
        severity,
        message: "The most recent run failed. Open run history to see what happened.",
      });
    }
    i += 1;
  }
  return out;
}
