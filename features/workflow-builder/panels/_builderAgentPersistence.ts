/**
 * Builder Agent persistence client helpers (Slice 4.AI-23).
 *
 * Extracted from `BuilderAiPanel.tsx` to keep the panel orchestration file
 * under the project's max-lines warning threshold. Owns:
 *
 *   - `buildPlanResultSafePayload(result)` — produces the allowlisted projection
 *     the server will accept. NEVER include `proposedPatch`, raw model output,
 *     raw configs, secrets, or tokens. The server sanitizer drops them again
 *     as defense in depth, but the client should avoid sending them in the
 *     first place.
 *   - `buildApplySuccessSafePayload(result)` / `buildApplyFailureSafePayload`
 *     — apply outcome projections.
 *   - `persistMessageBestEffort(workflowId, input)` — wraps the API call in a
 *     try/catch so a persistence failure NEVER blocks the live plan/apply
 *     flow. A console.warn surfaces the failure for dev visibility; user-facing
 *     surfaces show no warning (fail-open per the AI-23 plan).
 *
 * Underscore-prefixed module name = internal sibling, not part of the panels
 * barrel.
 */

import {
  appendBuilderAgentMessage,
  type AiApplyResult,
  type AiPlanResult,
  type AppendBuilderAgentMessageInput,
  type BuilderAgentPersistedMessage,
} from "@/lib/api/ai";

export function buildPlanResultSafePayload(
  result: AiPlanResult,
): Record<string, unknown> {
  if (!result.ok) {
    return { ok: false, code: result.code };
  }
  const payload: Record<string, unknown> = {
    ok: true,
    intentSummary: result.intentSummary,
    assumptions: [...result.assumptions],
    unsupportedRequests: [...result.unsupportedRequests],
    safetyNotes: [...result.safetyNotes],
    canApplyLater: result.canApplyLater,
  };
  if (result.blockedReason) payload.blockedReason = result.blockedReason;
  // Required-input items — display labels only. The server sanitizer
  // re-applies the same allowlist (label / kind / provider / nodeType /
  // nodeLabel / fieldLabel / fieldType / multiple / placeholder).
  if (result.requiredUserInput.length > 0) {
    payload.requiredUserInput = result.requiredUserInput.map((r) => {
      const item: Record<string, unknown> = {
        label: r.label,
        kind: r.kind,
      };
      if (r.provider) item.provider = r.provider;
      if (r.nodeType) item.nodeType = r.nodeType;
      if (r.nodeLabel) item.nodeLabel = r.nodeLabel;
      if (r.fieldLabel) item.fieldLabel = r.fieldLabel;
      if (r.fieldType) item.fieldType = r.fieldType;
      if (r.multiple !== undefined) item.multiple = r.multiple;
      if (r.placeholder) item.placeholder = r.placeholder;
      return item;
    });
  }
  // Preview counts + risk only — `changes` / `affectedNodeIds` /
  // `affectedEdgeIds` are summarized to counts because the historical render
  // shows them as collapsed `intentSummary` (per the AI-21B isLatest=false
  // branch) and never reaches `<PreviewSection>` after reload.
  if (result.preview) {
    const preview: Record<string, unknown> = {
      riskLevel: result.preview.riskLevel,
      requiresConfirmation: result.preview.requiresConfirmation,
    };
    if (result.preview.changes) preview.changeCount = result.preview.changes.length;
    if (result.preview.affectedNodeIds)
      preview.affectedNodeCount = result.preview.affectedNodeIds.length;
    if (result.preview.affectedEdgeIds)
      preview.affectedEdgeCount = result.preview.affectedEdgeIds.length;
    if (result.preview.userFacingSummaryText)
      preview.userFacingSummaryText = result.preview.userFacingSummaryText;
    if (result.preview.taskCostEstimate)
      preview.taskCostEstimate = {
        estimatedTasksPerRun: result.preview.taskCostEstimate.estimatedTasksPerRun,
      };
    if (result.preview.blockedReason)
      preview.blockedReason = result.preview.blockedReason;
    payload.preview = preview;
  }
  return payload;
}

export function buildApplySuccessSafePayload(
  result: AiApplyResult & { ok: true },
): Record<string, unknown> {
  return {
    summaryText: result.summaryText,
    appliedOperationCount: result.appliedOperationCount,
    riskLevel: result.riskLevel,
    requiresConfirmation: result.requiresConfirmation,
  };
}

export function buildApplyFailureSafePayload(
  result: AiApplyResult & { ok: false },
): Record<string, unknown> {
  // Code only — the user-facing message rendered in the chat (which already
  // gets the rewriter copy from `_BuilderAiPanelMessageList`) is stored as
  // `content` separately.
  return { code: result.code };
}

export async function persistMessageBestEffort(
  workflowId: string,
  input: AppendBuilderAgentMessageInput,
): Promise<BuilderAgentPersistedMessage | null> {
  try {
    return await appendBuilderAgentMessage(workflowId, input);
  } catch (err) {
    // Fail-open: persistence failure must NEVER block planning / applying.
    // Logged at warn for dev visibility — no user-facing toast.
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("Builder Agent message persistence failed:", err);
    }
    return null;
  }
}
