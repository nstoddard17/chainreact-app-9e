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
      out.push({ key: `graph:${finding.code}:${i}`, severity, message: graphGuidance(finding.code) });
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
