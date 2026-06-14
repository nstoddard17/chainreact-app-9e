import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

/**
 * Slice 4.AI-CONFIG-ASSIST CS-4 — the internal node id of the FIRST diagnosed
 * missing-required-field finding, or null.
 *
 * Pure + dependency-light: reads only the safe, structured diagnosis DTO (never
 * `summaryText` string matching). Mirrors the server-side `firstMissingFieldNodeId`
 * the repair-preview service uses to build its deterministic targeted block — so
 * the builder can offer a direct "Open <field> field" affordance for a known
 * user-input-required field WITHOUT first asking the AI to preview a fix.
 *
 * The id is an opaque navigation TARGET (used to select/reveal the node); it is
 * never rendered as user-facing text. Returns null when the diagnosis carries no
 * missing-field finding with a node id, in which case the caller keeps the
 * "Preview fix" path (the issue isn't a single targetable field).
 */
export function firstMissingFieldNodeId(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): string | null {
  for (const finding of diagnosis?.findings ?? []) {
    if (
      finding.code === "MISSING_REQUIRED_FIELD" &&
      finding.nodeIds &&
      finding.nodeIds.length > 0
    ) {
      return finding.nodeIds[0] ?? null;
    }
  }
  return null;
}
