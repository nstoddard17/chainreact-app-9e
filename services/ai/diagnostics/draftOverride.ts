import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

/**
 * Shared parser for the OPTIONAL "current builder draft" snapshot the diagnose /
 * explain / repair-plan routes accept (Slice 4.AI-DIAG-FIX-1).
 *
 * Why: the builder keeps unsaved edits in memory (graphSlice `pendingNodes` /
 * `pendingEdges`); only "Save workflow" persists `draftDefinition`. Without this,
 * "Check workflow" diagnoses STALE saved state and can disagree with the canvas
 * the user is looking at. The client may POST `{ draftDefinition }` with its
 * current builder state so the DETERMINISTIC diagnosis evaluates what the user
 * sees.
 *
 * Security / boundaries:
 *   - STRICTLY validated against the same `WorkflowDefinitionSchema` the save path
 *     uses — a malformed snapshot is rejected (the route returns 400), never used.
 *   - Used for the deterministic diagnosis ONLY. NEVER persisted. The diagnosis
 *     reports field NAMES + provider names + node LABELS — never config values —
 *     so the snapshot's config can't be echoed back.
 *   - Authorization is unchanged: the route still resolves account membership from
 *     the SAVED workflow record (`loadWorkflowForMember`); the snapshot influences
 *     only WHICH graph is analyzed, never WHO may analyze it.
 *   - Absent / null `draftDefinition` → `{ ok: true }` with no override (the
 *     route diagnoses the saved state — full back-compat).
 */
export type DraftOverrideParse =
  | { ok: true; draftOverride?: WorkflowDefinition }
  | { ok: false };

export function parseDraftOverride(body: unknown): DraftOverrideParse {
  if (!body || typeof body !== "object") return { ok: true };
  const raw = (body as { draftDefinition?: unknown }).draftDefinition;
  if (raw === undefined || raw === null) return { ok: true };
  const parsed = WorkflowDefinitionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  return { ok: true, draftOverride: parsed.data };
}
