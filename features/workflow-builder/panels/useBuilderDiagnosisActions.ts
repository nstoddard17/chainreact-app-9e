"use client";

import { useState } from "react";
import {
  AiApiError,
  AI_CREDITS_EXHAUSTED_MESSAGE,
  applyWorkflowRepair,
  askDiagnosisQuestion,
  diagnoseWorkflow,
  explainDiagnosis,
  planWorkflowRepair,
  previewWorkflowRepair,
  type RepairPreviewProposalContext,
  type RepairPreviewResult,
  type SelectedRepair,
  type WorkflowDraftSnapshot,
} from "@/lib/api/ai";
import {
  nextChatMessageId,
  type ChatMessage,
  type ChatMessageId,
} from "./_BuilderAiPanelChat";
import {
  aiAssistantTransportErrorMessage,
  diagnosisQaFailureMessage,
  REPAIR_PREVIEW_GENERIC_ERROR,
  repairPreviewFailureMessage,
  safeApplyFailureMessage,
} from "./_BuilderAiPanelDiagnosisMessages";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";

/**
 * Builder AI diagnosis-family actions — "Check workflow" (AI-DIAG-1b), "Explain
 * with AI" (AI-DIAG-2b), "Suggest a fix" (AI-REPAIR-1c), and "Preview fix"
 * (AI-REPAIR-2c — validated patch preview). Extracted from `useBuilderAiActions`
 * in Slice 4.AI-REPAIR-CLEANUP-1 so neither orchestration file exceeds the
 * max-lines budget.
 *
 * All are read-only / proposal- or preview-only: they NEVER mutate the graph,
 * save, or run. Each handler guards against concurrent ops and (for the metered
 * Explain / Suggest / Preview) repeat-charge. The parent hook owns the message
 * list + the plan/apply chain; this hook only owns its own in-flight +
 * already-actioned state and calls the parent's `appendMessage` to render results.
 */

export interface BuilderDiagnosisActionsInput {
  /** Null only in the (unreachable-from-UI) window before a workflow is loaded. */
  readonly workflowId: string | null;
  /** Plan/apply chain busy flag — diagnosis actions never start while it's true. */
  readonly busy: boolean;
  /** Current (possibly unsaved) builder draft — diagnoses what the user sees. */
  readonly currentDraft: WorkflowDraftSnapshot;
  /**
   * AI-DIAG-QA-3 — the currently-open config node id (`configSlice.activeNodeId`), if
   * any. Forwarded to the Q&A route as a SAFE selected-node hint so the answer can be
   * grounded in the node the user is looking at. Reuses the EXISTING selection state —
   * no new selection system. The server validates it against the graph, ignores bogus
   * ids, and NEVER echoes it back; the client never renders it. Null → omitted.
   */
  readonly selectedNodeId?: string | null;
  /** Parent message-list appender. */
  readonly appendMessage: (message: ChatMessage) => void;
  /**
   * AI-REPAIR-3E — refetch + re-hydrate the builder draft from the server after a
   * successful repair apply (the SAME getWorkflow → graphSlice.hydrate path the
   * planner apply uses). Best-effort: the apply already persisted server-side.
   */
  readonly refreshDraftAfterApply?: () => Promise<void>;
}

export function useBuilderDiagnosisActions({
  workflowId,
  busy,
  currentDraft,
  selectedNodeId,
  appendMessage,
  refreshDraftAfterApply,
}: BuilderDiagnosisActionsInput) {
  // AI-DIAG-1b — true while a read-only "Check this workflow" diagnosis is in
  // flight. Independent of the plan/apply state machine (the diagnosis never
  // mutates graph or hook state); it only gates against starting a SECOND
  // operation concurrently.
  const [checking, setChecking] = useState(false);
  // AI-DIAG-2b — "Explain with AI" state. `explaining` is the in-flight indicator;
  // `explainedDiagnosisIds` records which diagnosis messages already have an
  // explanation so a repeat click can't re-charge.
  const [explaining, setExplaining] = useState(false);
  const [explainedDiagnosisIds, setExplainedDiagnosisIds] = useState<
    ReadonlySet<ChatMessageId>
  >(() => new Set());
  // AI-REPAIR-1c — "Suggest a fix" state (mirrors Explain). `suggesting` is the
  // in-flight indicator; `suggestedDiagnosisIds` records which diagnosis messages
  // already have a repair proposal so a repeat click can't re-charge.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedDiagnosisIds, setSuggestedDiagnosisIds] = useState<
    ReadonlySet<ChatMessageId>
  >(() => new Set());
  // AI-REPAIR-2c — "Preview fix" state (mirrors Suggest). `previewing` is the
  // in-flight indicator; `previewedProposalIds` records which repair-PROPOSAL
  // messages already have a validated preview so a repeat click can't re-charge.
  const [previewing, setPreviewing] = useState(false);
  const [previewedProposalIds, setPreviewedProposalIds] = useState<
    ReadonlySet<ChatMessageId>
  >(() => new Set());
  // AI-DIAG-QA-3 — "Ask a question" state. `asking` is the single in-flight
  // indicator for the single-shot Q&A round-trip. There is NO per-message repeat
  // guard (each submit is a distinct question, billed on its own); the in-flight
  // flag alone prevents a concurrent second ask.
  const [asking, setAsking] = useState(false);
  // AI-REPAIR-3E — Apply state, keyed by the repair_preview message id. `applyingId`
  // is the in-flight preview (disables its button + blocks a second apply);
  // `appliedPreviewIds` records a successful apply (relabels to "Applied", no re-apply);
  // `applyErrorByPreviewId` holds the safe failure copy for a stale/blocked/network apply.
  const [applyingId, setApplyingId] = useState<ChatMessageId | null>(null);
  const [appliedPreviewIds, setAppliedPreviewIds] = useState<ReadonlySet<ChatMessageId>>(
    () => new Set(),
  );
  const [applyErrorByPreviewId, setApplyErrorByPreviewId] = useState<
    ReadonlyMap<ChatMessageId, string>
  >(() => new Map());

  async function handleCheckWorkflow(): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-DIAG-1b — read-only diagnosis. Never starts while a plan/apply, a
    // prior check, or a Q&A round-trip is running (the button is disabled too).
    if (busy || checking || asking) return;
    // Session-local user-gesture marker (kind "action" → NOT a planner prompt,
    // NOT persisted). The STALE_PATCH re-run scan only picks `prompt` markers.
    appendMessage({
      id: nextChatMessageId(),
      role: "user",
      kind: "action",
      content: "Check this workflow",
    });
    setChecking(true);
    try {
      const diagnosis = await diagnoseWorkflow(wfId, currentDraft);
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "diagnosis",
        diagnosis,
      });
    } catch (err) {
      // Safe, status-mapped copy — never surface internals. 401 is the only
      // status our read-only route returns besides 200 (access walls come back
      // as a 200 DTO the DiagnosisBody renders safely).
      const status = err instanceof AiApiError ? err.status : 0;
      const content =
        status === 401
          ? "Please sign in to check this workflow."
          : "Couldn’t check this workflow right now. Please try again.";
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "error",
        content,
      });
    } finally {
      setChecking(false);
    }
  }

  async function handleExplainDiagnosis(diagnosisMessageId: ChatMessageId): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-DIAG-2b — explanation-only, EXPLICIT click. Never auto-called. Guard
    // against concurrent ops and repeat-charge (already explained / in flight).
    if (busy || checking || explaining || asking) return;
    if (explainedDiagnosisIds.has(diagnosisMessageId)) return;
    setExplaining(true);
    try {
      const res = await explainDiagnosis(wfId, currentDraft);
      if (res.ok) {
        appendMessage({
          id: nextChatMessageId(),
          role: "assistant",
          kind: "diagnosis_explanation",
          explanation: res.explanation,
          ...(res.priorities ? { priorities: res.priorities } : {}),
          ...(res.missingInfo ? { missingInfo: res.missingInfo } : {}),
        });
        // Mark this diagnosis explained so a repeat click can't re-charge.
        setExplainedDiagnosisIds((prev) => {
          const next = new Set(prev);
          next.add(diagnosisMessageId);
          return next;
        });
      } else {
        // Handled ok:false (402 credits / 503 model|gate). Safe copy only — never
        // the raw code/message. Not marked explained, so the user may retry.
        const content =
          res.code === "AI_CREDITS_EXHAUSTED"
            ? AI_CREDITS_EXHAUSTED_MESSAGE
            : "Couldn’t generate an explanation right now. Please try again.";
        appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
      }
    } catch (err) {
      // Transport failure (401 / 404 / 500). Safe, status-mapped copy.
      const status = err instanceof AiApiError ? err.status : 0;
      const content = aiAssistantTransportErrorMessage(
        status,
        "Couldn’t generate an explanation right now. Please try again.",
      );
      appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
    } finally {
      setExplaining(false);
    }
  }

  async function handleSuggestFix(diagnosisMessageId: ChatMessageId): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-REPAIR-1c — proposal-only, EXPLICIT click. Never auto-called. Mirrors the
    // Explain guards: no concurrent op, no repeat-charge (already suggested / in
    // flight). Produces a repair-PROPOSAL message — it never applies/saves/runs.
    if (busy || checking || explaining || suggesting || asking) return;
    if (suggestedDiagnosisIds.has(diagnosisMessageId)) return;
    setSuggesting(true);
    try {
      const res = await planWorkflowRepair(wfId, currentDraft);
      if (res.ok) {
        appendMessage({
          id: nextChatMessageId(),
          role: "assistant",
          kind: "repair_proposal",
          proposal: res.proposal,
        });
        // Mark this diagnosis suggested so a repeat click can't re-charge.
        setSuggestedDiagnosisIds((prev) => {
          const next = new Set(prev);
          next.add(diagnosisMessageId);
          return next;
        });
      } else {
        // Handled ok:false (402 credits / 503 model|gate). The client already
        // normalized the copy to a safe, code-keyed message — surface it as-is.
        // Not marked suggested, so the user may retry.
        const content =
          res.code === "AI_CREDITS_EXHAUSTED"
            ? AI_CREDITS_EXHAUSTED_MESSAGE
            : "Couldn’t suggest a fix right now. Please try again.";
        appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
      }
    } catch (err) {
      // Transport failure (401 / 404 / 500). Safe, status-mapped copy.
      const status = err instanceof AiApiError ? err.status : 0;
      const content = aiAssistantTransportErrorMessage(
        status,
        "Couldn’t suggest a fix right now. Please try again.",
      );
      appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
    } finally {
      setSuggesting(false);
    }
  }

  async function handlePreviewFix(
    proposalMessageId: ChatMessageId,
    proposalContext?: RepairPreviewProposalContext,
  ): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-REPAIR-2c — preview-only, EXPLICIT click. Never auto-called. Mirrors the
    // Suggest guards: no concurrent op, no repeat-charge (already previewed / in
    // flight). Produces a repair-PREVIEW message — the server validates a proposed
    // patch against the current draft and returns what WOULD change. It never
    // applies/saves/runs, and there is no Apply control anywhere in this flow.
    if (busy || checking || explaining || suggesting || previewing || asking) return;
    if (previewedProposalIds.has(proposalMessageId)) return;
    setPreviewing(true);
    try {
      const res = await previewWorkflowRepair(wfId, currentDraft, proposalContext);
      if (res.ok) {
        appendMessage({
          id: nextChatMessageId(),
          role: "assistant",
          kind: "repair_preview",
          preview: res.preview,
        });
        // Mark this proposal previewed so a repeat click can't re-charge.
        setPreviewedProposalIds((prev) => {
          const next = new Set(prev);
          next.add(proposalMessageId);
          return next;
        });
      } else {
        // Handled ok:false. AI-REPAIR-2D — NOTHING_TO_PREVIEW / NO_SAFE_PATCH are
        // EXPECTED, non-503 states (stale/resolved proposal, or the model declined to
        // auto-patch); surface the client-normalized, UI-owned "run Check again" copy.
        // For genuine failures (MODEL_FAILED / PARSE_FAILED / unknown) force a generic
        // line — defense in depth so a raw model/server message can NEVER leak here.
        // Not marked previewed in any case, so the user can re-Check and retry.
        const content = repairPreviewFailureMessage(res);
        appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
      }
    } catch (err) {
      // Transport failure (401 / 404 / 500). Safe, status-mapped copy.
      const status = err instanceof AiApiError ? err.status : 0;
      const content = aiAssistantTransportErrorMessage(status, REPAIR_PREVIEW_GENERIC_ERROR);
      appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
    } finally {
      setPreviewing(false);
    }
  }

  async function handleAskDiagnosisQuestion(question: string): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-DIAG-QA-3 — single-shot, explanation-ONLY Q&A. EXPLICIT submit only; never
    // auto-called. Guard against any concurrent op + a second in-flight ask. The
    // composer also length-caps, but we re-guard against empty here defensively.
    if (busy || checking || explaining || suggesting || previewing || asking) return;
    const trimmed = question.trim();
    if (trimmed.length === 0) return;
    setAsking(true);
    try {
      const res = await askDiagnosisQuestion(
        wfId,
        trimmed,
        currentDraft,
        selectedNodeId ?? undefined,
      );
      if (res.ok) {
        // BUILDER-AI-SELECTED-NODE-QA-1 — SAFE client-side label for the open node via
        // `getNodeDisplayName` (reads only kind/provider/type/displayName; never the raw
        // id/config/tokens). Bogus/absent id → undefined → UI omits the focus line.
        const selectedNode =
          selectedNodeId != null
            ? currentDraft.nodes.find((n) => n.id === selectedNodeId)
            : undefined;
        const selectedNodeLabel = selectedNode ? getNodeDisplayName(selectedNode) : undefined;
        // Render ONLY the safe API response fields (+ the locally-kept question + the
        // safe selected-node label). No raw DTO / ids / config — and deliberately no
        // Apply / Preview control.
        appendMessage({
          id: nextChatMessageId(),
          role: "assistant",
          kind: "diagnosis_qa",
          question: trimmed,
          answer: res.answer,
          ...(res.pointers ? { pointers: res.pointers } : {}),
          ...(res.needsUserDecision !== undefined
            ? { needsUserDecision: res.needsUserDecision }
            : {}),
          ...(selectedNodeLabel ? { selectedNodeLabel } : {}),
        });
      } else {
        // Handled ok:false (402 credits / 403 frozen / 503 model|gate). Safe,
        // code-keyed copy only — never the raw code/message.
        appendMessage({
          id: nextChatMessageId(),
          role: "assistant",
          kind: "error",
          content: diagnosisQaFailureMessage(res.code),
        });
      }
    } catch (err) {
      // Transport failure (401 / 404 / 400 too-long-or-empty / 500). Safe, status-mapped.
      const status = err instanceof AiApiError ? err.status : 0;
      const content = aiAssistantTransportErrorMessage(
        status,
        "Couldn’t answer that right now. Please try again.",
      );
      appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
    } finally {
      setAsking(false);
    }
  }

  /**
   * Shared body for the FREE deterministic repair previews — selected-candidate
   * (AI-REPAIR-3L), dangling-edge (AI-REPAIR-4A), and self-loop edge
   * (AI-REPAIR-COVERAGE-1). Each route runs its deterministic `removeEdge`/selected-
   * replacement preview BEFORE the gate/model, so all are FREE — no model call, no
   * credits, no telemetry. Because they're free there is NO repeat-charge guard; only
   * the shared in-flight guard prevents concurrent ops. They differ ONLY in the
   * `previewWorkflowRepair` arguments, passed via `runPreview`. Produces a
   * repair_preview message — Apply stays a separate click; never applies/saves/runs.
   *
   * This is the seam for future deterministic repair categories: add a thin handler
   * that calls `runFreeRepairPreview` with the right preview args.
   */
  async function runFreeRepairPreview(
    runPreview: (wfId: string) => Promise<RepairPreviewResult>,
  ): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    if (busy || checking || explaining || suggesting || previewing || asking) return;
    setPreviewing(true);
    try {
      const res = await runPreview(wfId);
      if (res.ok) {
        appendMessage({
          id: nextChatMessageId(),
          role: "assistant",
          kind: "repair_preview",
          preview: res.preview,
        });
      } else {
        const content = repairPreviewFailureMessage(res);
        appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
      }
    } catch (err) {
      const status = err instanceof AiApiError ? err.status : 0;
      const content = aiAssistantTransportErrorMessage(status, REPAIR_PREVIEW_GENERIC_ERROR);
      appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
    } finally {
      setPreviewing(false);
    }
  }

  // AI-REPAIR-3L — deterministic preview of a USER-CHOSEN replacement (multiple-candidate
  // case). EXPLICIT click only; re-validated server-side. The user may preview a DIFFERENT
  // candidate afterward (no repeat-charge — it's free).
  async function handlePreviewSelectedFix(selection: SelectedRepair): Promise<void> {
    await runFreeRepairPreview((wfId) =>
      previewWorkflowRepair(wfId, currentDraft, undefined, selection),
    );
  }

  // AI-REPAIR-4A — deterministic preview of dangling/broken-edge cleanup (removeEdge).
  // EXPLICIT click only.
  async function handlePreviewDanglingEdgeFix(): Promise<void> {
    await runFreeRepairPreview((wfId) =>
      previewWorkflowRepair(wfId, currentDraft, undefined, undefined, true),
    );
  }

  // AI-REPAIR-COVERAGE-1 — deterministic preview of self-loop edge cleanup (removeEdge).
  // EXPLICIT click only.
  async function handlePreviewSelfLoopEdgeFix(): Promise<void> {
    await runFreeRepairPreview((wfId) =>
      previewWorkflowRepair(wfId, currentDraft, undefined, undefined, undefined, true),
    );
  }

  // AI-REPAIR-COVERAGE-2 — deterministic preview of redundant duplicate edge cleanup
  // (removeEdge, keep-first). EXPLICIT click only.
  async function handlePreviewDuplicateEdgeFix(): Promise<void> {
    await runFreeRepairPreview((wfId) =>
      previewWorkflowRepair(wfId, currentDraft, undefined, undefined, undefined, undefined, true),
    );
  }

  async function handleApplyRepair(
    previewMessageId: ChatMessageId,
    applyMeta: { operations: readonly unknown[]; baseRevision: string },
  ): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-REPAIR-3E — apply a VALIDATED, applyable repair preview. EXPLICIT click only.
    // Guard against any concurrent op + a second apply of any preview + re-applying an
    // already-applied one. The server re-authorizes + re-validates + re-runs the safety
    // contract/executor and persists the DRAFT ONLY — no LLM, no run, no activation.
    if (busy || checking || explaining || suggesting || previewing || asking || applyingId !== null)
      return;
    if (appliedPreviewIds.has(previewMessageId)) return;
    // Clear any prior error for this preview as we retry.
    setApplyErrorByPreviewId((prev) => {
      if (!prev.has(previewMessageId)) return prev;
      const next = new Map(prev);
      next.delete(previewMessageId);
      return next;
    });
    setApplyingId(previewMessageId);
    try {
      const res = await applyWorkflowRepair(wfId, {
        operations: applyMeta.operations,
        baseRevision: applyMeta.baseRevision,
      });
      if (res.ok) {
        setAppliedPreviewIds((prev) => new Set(prev).add(previewMessageId));
        // Refresh the builder draft from the server so the canvas reflects the saved
        // result (best-effort; the apply already persisted). No run, no activation.
        if (refreshDraftAfterApply) {
          try {
            await refreshDraftAfterApply();
          } catch {
            /* best-effort refresh; apply already succeeded */
          }
        }
      } else {
        setApplyErrorByPreviewId((prev) =>
          new Map(prev).set(previewMessageId, safeApplyFailureMessage(res.code)),
        );
      }
    } catch (err) {
      // Transport failure (401 / 403 / 404 / 400 / network) — retry-safe copy.
      const status = err instanceof AiApiError ? err.status : 0;
      const content =
        status === 401
          ? "Please sign in to apply this change."
          : status === 404
            ? "This workflow couldn’t be found."
            : "Couldn’t apply this change right now. Please try again.";
      setApplyErrorByPreviewId((prev) => new Map(prev).set(previewMessageId, content));
    } finally {
      setApplyingId(null);
    }
  }

  /**
   * Reset the metered-action state on a full conversation Clear. Resets
   * explain/suggest/preview + apply in-flight + already-actioned sets, and deliberately
   * does NOT touch `checking` (the read-only check has no charge / id-set to clear).
   */
  function resetDiagnosisActions(): void {
    setExplaining(false);
    setExplainedDiagnosisIds(new Set());
    setSuggesting(false);
    setSuggestedDiagnosisIds(new Set());
    setPreviewing(false);
    setPreviewedProposalIds(new Set());
    setAsking(false);
    setApplyingId(null);
    setAppliedPreviewIds(new Set());
    setApplyErrorByPreviewId(new Map());
  }

  return {
    checking,
    explaining,
    explainedDiagnosisIds,
    suggesting,
    suggestedDiagnosisIds,
    previewing,
    previewedProposalIds,
    asking,
    applyingId,
    appliedPreviewIds,
    applyErrorByPreviewId,
    handleCheckWorkflow,
    handleAskDiagnosisQuestion,
    handleExplainDiagnosis,
    handleSuggestFix,
    handlePreviewFix,
    handlePreviewSelectedFix,
    handlePreviewDanglingEdgeFix,
    handlePreviewSelfLoopEdgeFix,
    handlePreviewDuplicateEdgeFix,
    handleApplyRepair,
    resetDiagnosisActions,
  };
}
