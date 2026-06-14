import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

/**
 * Slice 4.AI-CONFIG-ASSIST CS-4/CS-8 — derive the diagnosed missing-required-field
 * node id(s) from a safe diagnosis DTO.
 *
 * Pure + dependency-light: reads only the structured diagnosis findings (never
 * `summaryText` string matching). Lets the builder offer a direct "Open <field>
 * field" affordance for known user-input-required fields WITHOUT first asking the AI
 * to suggest or preview a fix.
 *
 * The ids are opaque navigation TARGETS (used to select/reveal a node); they are
 * never rendered as user-facing text. An empty result means the issue isn't a
 * targetable missing field, so the caller keeps the Suggest/Preview path.
 */

/**
 * CS-8 — ALL distinct nodes that have a missing-required-field finding, in
 * finding order, de-duplicated. Used by the multi-issue "Needs your input" group
 * to render one set of open-field actions per affected node.
 */
export function missingFieldNodeIds(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const finding of diagnosis?.findings ?? []) {
    if (finding.code !== "MISSING_REQUIRED_FIELD" || !finding.nodeIds) continue;
    for (const id of finding.nodeIds) {
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * CS-4 — the FIRST diagnosed missing-required-field node id, or null. Retained for
 * the single-target repair-proposal affordance (CS-4); defined in terms of the
 * de-duplicated list so both share one definition.
 */
export function firstMissingFieldNodeId(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): string | null {
  return missingFieldNodeIds(diagnosis)[0] ?? null;
}
