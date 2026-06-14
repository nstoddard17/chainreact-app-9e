"use client";

import { useState } from "react";
import {
  AiApiError,
  AI_CREDITS_EXHAUSTED_MESSAGE,
  diagnoseWorkflow,
  explainDiagnosis,
  planWorkflowRepair,
  type WorkflowDraftSnapshot,
} from "@/lib/api/ai";
import {
  nextChatMessageId,
  type ChatMessage,
  type ChatMessageId,
} from "./_BuilderAiPanelChat";

/**
 * Builder AI diagnosis-family actions — "Check workflow" (AI-DIAG-1b), "Explain
 * with AI" (AI-DIAG-2b), and "Suggest a fix" (AI-REPAIR-1c). Extracted from
 * `useBuilderAiActions` in Slice 4.AI-REPAIR-CLEANUP-1 (refactor only, no behavior
 * change) so neither orchestration file exceeds the max-lines budget.
 *
 * All three are read-only / proposal-only: they NEVER mutate the graph, save, or
 * run. Each handler guards against concurrent ops and (for the metered Explain /
 * Suggest) repeat-charge. The parent hook owns the message list + the plan/apply
 * chain; this hook only owns its own in-flight + already-actioned state and calls
 * the parent's `appendMessage` to render results.
 */

export interface BuilderDiagnosisActionsInput {
  /** Null only in the (unreachable-from-UI) window before a workflow is loaded. */
  readonly workflowId: string | null;
  /** Plan/apply chain busy flag — diagnosis actions never start while it's true. */
  readonly busy: boolean;
  /** Current (possibly unsaved) builder draft — diagnoses what the user sees. */
  readonly currentDraft: WorkflowDraftSnapshot;
  /** Parent message-list appender. */
  readonly appendMessage: (message: ChatMessage) => void;
}

export function useBuilderDiagnosisActions({
  workflowId,
  busy,
  currentDraft,
  appendMessage,
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

  async function handleCheckWorkflow(): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // AI-DIAG-1b — read-only diagnosis. Never starts while a plan/apply or a
    // prior check is running (the button is also disabled in those states).
    if (busy || checking) return;
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
    if (busy || checking || explaining) return;
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
      const content =
        status === 401
          ? "Please sign in to use the AI assistant."
          : status === 404
            ? "This workflow couldn’t be found."
            : "Couldn’t generate an explanation right now. Please try again.";
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
    if (busy || checking || explaining || suggesting) return;
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
      const content =
        status === 401
          ? "Please sign in to use the AI assistant."
          : status === 404
            ? "This workflow couldn’t be found."
            : "Couldn’t suggest a fix right now. Please try again.";
      appendMessage({ id: nextChatMessageId(), role: "assistant", kind: "error", content });
    } finally {
      setSuggesting(false);
    }
  }

  /**
   * Reset the metered-action state on a full conversation Clear. Mirrors the
   * original handler exactly — it resets explain/suggest in-flight + already-
   * actioned sets, and deliberately does NOT touch `checking` (the read-only
   * check has no charge / id-set to clear).
   */
  function resetDiagnosisActions(): void {
    setExplaining(false);
    setExplainedDiagnosisIds(new Set());
    setSuggesting(false);
    setSuggestedDiagnosisIds(new Set());
  }

  return {
    checking,
    explaining,
    explainedDiagnosisIds,
    suggesting,
    suggestedDiagnosisIds,
    handleCheckWorkflow,
    handleExplainDiagnosis,
    handleSuggestFix,
    resetDiagnosisActions,
  };
}
