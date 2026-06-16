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
 * AI-REPAIR-3I — broken variable references are NO LONGER returned here; they are
 * actionable (carry an "Open <field> field" target), so they live in
 * `invalidReferenceCards` below and render with a button. `attentionFindingCards`
 * stays value-free / button-free.
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
 * Map a diagnosis to its ordered "Needs attention" cards (structural graph + run
 * findings, in finding order). Returns an empty array when there are none, so the
 * caller renders nothing. Excludes `INVALID_VARIABLE_REFERENCE` (→ `invalidReferenceCards`).
 */
export function attentionFindingCards(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): AttentionFindingCard[] {
  const out: AttentionFindingCard[] = [];
  let i = 0;
  for (const finding of diagnosis?.findings ?? []) {
    const severity: "error" | "warning" =
      finding.severity === "warning" ? "warning" : "error";
    if (
      finding.source === "graph" &&
      finding.code !== "INVALID_VARIABLE_REFERENCE" &&
      // AI-REPAIR-4A — STALE_EDGE is actionable (deterministic removeEdge repair); it
      // renders via `danglingEdgeCards`, not as a generic no-button structure card.
      finding.code !== "STALE_EDGE"
    ) {
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

/**
 * AI-REPAIR-3I — an actionable "Needs attention" card for ONE broken variable
 * reference. Unlike the structural cards above, it carries an "Open <field> field"
 * navigation target (`nodeId` + `fieldKey`) so the UI can render a button that
 * reveals + highlights the affected field. The user then fixes it manually (choose a
 * valid variable or remove the reference) — there's no safe automatic Apply for the
 * zero/multiple-candidate case.
 *
 * No-leak: `nodeId` / `fieldKey` are NAVIGATION TARGETS only (never rendered); the
 * `message` + button label use the field LABEL. The `replacementReason` selects the
 * "why Apply isn't available" copy.
 */
export interface InvalidReferenceCard {
  /** Stable React key. Not rendered. */
  readonly key: string;
  readonly severity: "error" | "warning";
  /** Navigation target — passed to `revealNode`; NEVER rendered. */
  readonly nodeId: string;
  /** Navigation target (config key) — passed to `revealNode`; NEVER rendered. */
  readonly fieldKey: string;
  /** Display label for the button + copy. */
  readonly fieldLabel: string;
  /**
   * Replacement-candidate count classification from the diagnosis (AI-REPAIR-3I).
   * `"one"` is the ONLY case that gets a direct "Preview fix" action (AI-REPAIR-3K) —
   * it maps 1:1 to an applyable deterministic preview (AI-REPAIR-3H/3J). `"none"` /
   * `"multiple"` / undefined stay manual-only (Open-field guidance, no Preview/Apply).
   */
  readonly replacementReason?: "none" | "one" | "multiple";
  /**
   * AI-REPAIR-3L — explicit replacement options for the multiple-candidate case (present
   * only when the target field is apply-safe). Each `reference` is a SELECTION VALUE
   * (carries a raw source node id) — NEVER rendered; the UI shows only `label` and sends
   * the chosen `reference` back for a server-revalidated deterministic preview.
   */
  readonly candidates?: readonly { readonly reference: string; readonly label: string }[];
  /** Deterministic guidance for why Apply isn't offered + what to do instead. */
  readonly message: string;
}

/** Reason-specific guidance copy. Field LABEL only — never the key, id, or raw token. */
function invalidReferenceMessage(
  fieldLabel: string,
  reason: "none" | "one" | "multiple" | undefined,
): string {
  switch (reason) {
    case "multiple":
      return `This ${fieldLabel} field references a missing step. More than one replacement may fit, so open the field and choose the correct variable manually.`;
    case "one":
      // AI-REPAIR-3K — exactly one safe replacement → offer a direct "Preview fix".
      return `This ${fieldLabel} field references a missing step, but ChainReact found one safe replacement.`;
    case "none":
    default:
      // Zero candidates (or unknown) — the safe, always-valid guidance.
      return `This ${fieldLabel} field references a step that's no longer in this workflow. Open the field and choose a valid variable or remove the reference.`;
  }
}

/**
 * Flatten a diagnosis into ordered, actionable invalid-variable-reference cards (one
 * per broken ref). Empty when there are none. Skips any ref missing its safe display
 * label or navigation key (e.g. a rehydrated historical diagnosis that predates 3I).
 */
/**
 * AI-REPAIR-4A — an actionable "Needs attention" card for dangling/broken edges (a
 * connection whose source or target step no longer exists). The safe deterministic
 * repair is to remove the edge(s) (`removeEdge`); the card offers a "Preview fix"
 * (Apply lives only on the resulting preview). Labels only — `fromLabel`/`toLabel` are
 * the server-built safe display strings (a missing endpoint reads "a step that no
 * longer exists"); raw edge / node ids are never present here.
 */
export interface DanglingEdgeCard {
  readonly key: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  /** Safe per-connection descriptors for the card body. */
  readonly connections: readonly { readonly fromLabel: string; readonly toLabel: string }[];
}

/** One actionable dangling-edge card per STALE_EDGE finding. Empty when there are none. */
export function danglingEdgeCards(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): DanglingEdgeCard[] {
  const out: DanglingEdgeCard[] = [];
  let i = 0;
  for (const finding of diagnosis?.findings ?? []) {
    if (finding.code !== "STALE_EDGE") continue;
    const edges = finding.danglingEdges ?? [];
    if (edges.length === 0) continue;
    out.push({
      key: `stale-edge:${i}`,
      severity: finding.severity === "warning" ? "warning" : "error",
      message: "This workflow has a connection to a step that no longer exists.",
      connections: edges.map((e) => ({ fromLabel: e.fromLabel, toLabel: e.toLabel })),
    });
    i += 1;
  }
  return out;
}

export function invalidReferenceCards(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): InvalidReferenceCard[] {
  const out: InvalidReferenceCard[] = [];
  let i = 0;
  for (const finding of diagnosis?.findings ?? []) {
    if (finding.code !== "INVALID_VARIABLE_REFERENCE") continue;
    const nodeId = finding.nodeIds?.[0];
    const severity: "error" | "warning" = finding.severity === "warning" ? "warning" : "error";
    for (const ref of finding.invalidReferences ?? []) {
      if (!nodeId || !ref.fieldKey || !ref.fieldLabel) continue;
      out.push({
        key: `invalid-ref:${i}`,
        severity,
        nodeId,
        fieldKey: ref.fieldKey,
        fieldLabel: ref.fieldLabel,
        ...(ref.replacementReason ? { replacementReason: ref.replacementReason } : {}),
        ...(ref.candidates && ref.candidates.length > 0 ? { candidates: ref.candidates } : {}),
        message: invalidReferenceMessage(ref.fieldLabel, ref.replacementReason),
      });
      i += 1;
    }
  }
  return out;
}
