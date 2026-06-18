"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearBuilderAgentThread,
  getBuilderAgentThread,
  type CurrentGraphSnapshot,
  type WorkflowDraftSnapshot,
} from "@/lib/api/ai";
import { getWorkflow } from "@/lib/api/workflows";
import type { RequiredInputAnswer } from "../ai";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import {
  nextChatMessageId,
  persistedMessageToChat,
  type ChatMessage,
  type ChatMessageId,
  type UserChatMessage,
} from "./_BuilderAiPanelChat";
import {
  buildApplyFailureSafePayload,
  buildApplySuccessSafePayload,
  buildPlanResultSafePayload,
  persistMessageBestEffort,
  warnPersistenceFailureForDev,
} from "./_builderAgentPersistence";
import { BUILDER_AI_MAX_PROMPT_LENGTH } from "./_BuilderAiPanelComposer";
import { useBuilderDiagnosisActions } from "./useBuilderDiagnosisActions";

/**
 * Builder AI assistant orchestration hook — extracted verbatim from
 * `BuilderAiPanel.tsx` in Slice 4.AI-REPAIR-CLEANUP-1 (refactor only, no behavior
 * change). Owns ALL chat state + the diagnose / explain / suggest-fix / submit /
 * apply / rerun / clear handlers + the workflow-scoped thread load effect; the
 * panel is now a thin render shell that wires the returned values into
 * `BuilderAiPanelMessageList` + `BuilderAiPanelComposer`.
 *
 * The original component early-returned `null` when `workflowId` was absent, so
 * its handlers could assume a non-null id. A hook cannot early-return, so each
 * handler that needs the id guards with `if (!workflowId) return` first; the
 * panel still renders nothing until `workflowId` exists, so the guards are only
 * exercised in the (unreachable-from-UI) null window. All AI-11B / AI-20 / AI-21 /
 * AI-22 / AI-23 / AI-24 / AI-25 / AI-26 / AI-DIAG / AI-REPAIR invariants are
 * preserved unchanged.
 */

/**
 * AI-22 — build the user-message bubble's display text from the composer's
 * free-text + any staged required-input answers. Renders structured answers as a
 * labeled list under the typed text (or alone when no free text was provided).
 * Pure presentation — the actual planner-side prompt is constructed by
 * `composeFollowUpPrompt`.
 */
function buildUserBubbleDisplay(
  freeText: string,
  answers: readonly RequiredInputAnswer[],
): string {
  if (answers.length === 0) return freeText;
  const lines = answers.map((a) => {
    const fieldLabel = a.descriptor.fieldLabel ?? a.descriptor.label;
    return `${fieldLabel}: ${a.display}`;
  });
  return freeText.length > 0
    ? `${freeText}\n\n${lines.join("\n")}`
    : lines.join("\n");
}

export function useBuilderAiActions() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const hydrate = useGraphSlice((s) => s.hydrate);
  // AI-24 — the planner needs the CURRENT canvas (pending / unsaved), not
  // the server-saved `draftDefinition` (which lags after a local delete).
  // Project the slice's pendingNodes/pendingEdges into a value-free snapshot
  // and pass it on every plan / follow-up call so the planner never reasons
  // against stale graph state.
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  // AI-DIAG-QA-3 — the currently-open config node (the EXISTING builder selection),
  // forwarded to the Q&A route as a safe selected-node hint. Read-only; never
  // rendered. Null when no node's config rail is open.
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const [prompt, setPrompt] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  // AI-26 — true when the most recent thread-load attempt for the
  // current workflowId failed. Drives a small non-blocking notice in
  // `_BuilderAiPanelMessageList` so a silent load failure is no longer
  // indistinguishable from "no history." Reset on workflowId transition
  // (the new workflow's load gets a clean slate) and on a successful
  // subsequent load. Planning / applying / clearing are unaffected.
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);
  // AI-24 — value-free projection of the pending canvas for the planner.
  // provider:type pairs + edges only; NO config, NO position, NO secrets.
  const currentGraph = useMemo<CurrentGraphSnapshot>(
    () => ({
      nodes: pendingNodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        provider: n.provider,
        type: n.type,
        // Slice 4.BUILDER-NODE-IDENTITY-1 — the user's custom node name as
        // read-only context so the planner can refer to nodes by their label.
        ...(n.displayName !== undefined ? { displayName: n.displayName } : {}),
      })),
      edges: pendingEdges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
    }),
    [pendingNodes, pendingEdges],
  );

  // AI-DIAG-FIX-1 — the FULL current builder draft (nodes WITH config + edges), so
  // "Check workflow" / Explain / Suggest diagnose what the user SEES on the canvas
  // (incl. unsaved node edits), not the stale server-saved draftDefinition. The
  // server strictly validates it and uses it for the deterministic diagnosis only —
  // it is never persisted, and Check stays 0-credit + no-model.
  const currentDraft = useMemo<WorkflowDraftSnapshot>(
    () => ({ nodes: [...pendingNodes], edges: [...pendingEdges] }),
    [pendingNodes, pendingEdges],
  );

  // AI-22 — staged required-input answers from the interactive controls.
  // Keyed by `requiredInputKey(input)` (i.e. `nodeId::field`). Drained
  // into the structured follow-up on submit; cleared on Clear / Plan-another.
  const [stagedAnswers, setStagedAnswers] = useState<
    ReadonlyMap<string, RequiredInputAnswer>
  >(() => new Map());

  // AI-DIAG-QA-AUTOROUTE CS-2 — intent-clarification bubbles that have been resolved
  // (a quick action chosen), so their buttons disable. Session-local; reset on Clear.
  // CS-2 only marks the choice resolved; CS-3 adds the actual Q&A / planner routing.
  const [resolvedClarificationIds, setResolvedClarificationIds] = useState<
    ReadonlySet<ChatMessageId>
  >(() => new Set());

  const ai = useBuilderAi({
    workflowId,
    onApplied: async () => {
      if (!workflowId) return;
      try {
        const detail = await getWorkflow(workflowId);
        // Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — pass the post-apply revision so
        // this fresh hydrate wins, and a later stale prop-driven hydrate (older
        // updatedAt) is ignored by the graphSlice guard.
        hydrate(workflowId, detail.draftDefinition, detail.updatedAt);
      } catch {
        // Best-effort refresh — the apply already succeeded server-side.
      }
    },
  });

  // AI-23 — load persisted thread on workflowId change. Fail-open: a network
  // / auth failure leaves `messages` empty so the user sees a fresh chat
  // (with a small non-blocking notice — AI-26).
  //
  // AI-26 (fixes AI-AUDIT-1 P0) — the `loadedForWorkflowRef` sentinel is
  // assigned ONLY after a successful load has committed messages. The
  // earlier pattern (set-ref-before-await) raced with React Strict Mode's
  // simulated unmount cleanup: the first effect started a fetch, set the
  // ref, and was then cancelled by the cleanup; the re-mount effect saw
  // `ref === workflowId` and early-returned without re-fetching; the
  // cancelled fetch eventually resolved but skipped `setMessages`. Net
  // effect in dev: persisted messages silently disappeared on every page
  // refresh. The fix flips the order so a cancelled or failed load leaves
  // the ref unchanged, letting the re-mount effect's own fetch be the one
  // that actually commits.
  const loadedForWorkflowRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workflowId) return;
    if (loadedForWorkflowRef.current === workflowId) return;
    // Reset stale failure indicator on workflow transition — the previous
    // workflow's failure shouldn't shadow the new workflow's load.
    setHistoryLoadFailed(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await getBuilderAgentThread(workflowId);
        if (cancelled) return;
        // Late dedup — if a concurrent effect already committed messages
        // for this workflowId during the await window, don't double-apply.
        if (loadedForWorkflowRef.current === workflowId) return;
        const rehydrated = res.messages
          .map(persistedMessageToChat)
          .filter((m): m is ChatMessage => m !== null);
        if (rehydrated.length > 0) setMessages(rehydrated);
        // Mark loaded only AFTER messages are committed (or confirmed
        // empty). A cancelled fetch never reaches this line, so the next
        // effect run is free to re-attempt.
        loadedForWorkflowRef.current = workflowId;
      } catch (err) {
        if (cancelled) return;
        // Surface a small notice; planning / applying still work. The ref
        // stays null so a future re-mount can retry without manual code.
        setHistoryLoadFailed(true);
        warnPersistenceFailureForDev("Builder Agent thread load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  const trimmed = prompt.trim();
  const planning = ai.status === "planning";
  const applying = ai.status === "applying";
  const busy = planning || applying;
  const followUpMode = ai.followUpMode;
  const hasMessages = messages.length > 0;

  // Slice 4.REACT-AGENT-CHAT-QOL-1 — enabled-state for the inline "Send
  // details" button rendered under the active required-input controls. Mirrors
  // the composer's own `canSubmit` derivation (staged answers OR composer text,
  // not too long, not busy) so the inline button and the bottom composer button
  // agree on when there's something to submit. Both call the SAME `handleSubmit`
  // path, so there is no second submit route to drift.
  const tooLong = prompt.length > BUILDER_AI_MAX_PROMPT_LENGTH;
  const canSubmitDetails =
    (trimmed.length > 0 || stagedAnswers.size > 0) && !tooLong && !busy;

  function appendMessage(message: ChatMessage): void {
    setMessages((prev) => [...prev, message]);
  }

  function handleStagedAnswerChange(
    key: string,
    answer: RequiredInputAnswer | undefined,
  ): void {
    setStagedAnswers((prev) => {
      const next = new Map(prev);
      if (answer === undefined) next.delete(key);
      else next.set(key, answer);
      return next;
    });
  }

  async function handleSubmit(): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    setRiskAcknowledged(false);
    // AI-22 — gather any staged required-input answers from the interactive
    // controls. They're cleared synchronously here so the user message bubble
    // (which renders them as part of its display text) doesn't render twice.
    // AI-25 — snapshot composer text + staged answers BEFORE clearing so we
    // can restore both on retryable failure (RATE_LIMITED, PARSE_FAILED,
    // transport throws — anything where `ai.plan` / `ai.submitFollowUp`
    // returns null). The user shouldn't lose the structured selections
    // they just made, or have to retype their answer, to retry.
    const stagedSnapshot = Array.from(stagedAnswers.values());
    const hasStagedAnswers = stagedSnapshot.length > 0;
    const stagedAnswersForRetry = new Map(stagedAnswers);
    setStagedAnswers(new Map());

    const composerContent = trimmed;
    // Composer can be empty when the user filled controls only — in that case
    // a follow-up submission is still valid. A brand-new plan (no chain in
    // progress) still requires composer text, because there are no controls
    // to fill yet.
    if (!composerContent && !(followUpMode && hasStagedAnswers)) return;

    // Build the user-bubble display text. When the user supplied both staged
    // answers + free-text, both are rendered for transparency. When only
    // staged answers were supplied, the bubble lists each {label: value}.
    const userDisplay = buildUserBubbleDisplay(composerContent, stagedSnapshot);
    const userKind: UserChatMessage["kind"] = followUpMode ? "followup" : "prompt";
    appendMessage({
      id: nextChatMessageId(),
      role: "user",
      kind: userKind,
      content: userDisplay,
    });
    // AI-25 — snapshot composer text BEFORE the input clears, so a retryable
    // failure can put it back.
    const composerForRetry = prompt;
    setPrompt("");
    // AI-23 — persist the user message (best effort; never blocks).
    void persistMessageBestEffort(wfId, {
      role: "user",
      kind: userKind,
      content: userDisplay,
    });

    const result = followUpMode
      ? await ai.submitFollowUp(
          {
            freeText: composerContent,
            structuredAnswers: stagedSnapshot,
          },
          undefined,
          { currentGraph },
        )
      : await ai.plan(composerContent, undefined, { currentGraph });

    if (result === null) {
      // AI-25 — retryable failure (RATE_LIMITED / PARSE_FAILED / network /
      // any ok:false during a follow-up). Restore composer text + staged
      // required-input answers so the user can click Send again without
      // re-entering anything. The prior plan_result (with the unanswered
      // question + controls) remains the latest in chat because the hook
      // intentionally did NOT overwrite `ai.planResult` with the failure.
      setPrompt(composerForRetry);
      if (stagedAnswersForRetry.size > 0) {
        setStagedAnswers(stagedAnswersForRetry);
      }
      const errorContent =
        "The AI assistant is unavailable right now. Please try again in a moment.";
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "error",
        content: errorContent,
      });
      void persistMessageBestEffort(wfId, {
        role: "assistant",
        kind: "error",
        content: errorContent,
      });
      return;
    }
    appendMessage({
      id: nextChatMessageId(),
      role: "assistant",
      kind: "plan_result",
      result,
    });
    void persistMessageBestEffort(wfId, {
      role: "assistant",
      kind: "plan_result",
      content: result.ok ? result.intentSummary : result.message,
      safePayload: buildPlanResultSafePayload(result),
    });
  }

  async function handleApply(): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    const result = await ai.apply();
    if (result === null) return;
    if (result.ok) {
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "applied",
        result,
      });
      void persistMessageBestEffort(wfId, {
        role: "assistant",
        kind: "applied",
        content: result.summaryText,
        safePayload: buildApplySuccessSafePayload(result),
      });
    } else {
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "apply_failure",
        result,
      });
      void persistMessageBestEffort(wfId, {
        role: "assistant",
        kind: "apply_failure",
        content: result.message,
        safePayload: buildApplyFailureSafePayload(result),
      });
    }
  }

  async function handleRerunPlan(): Promise<void> {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // STALE_PATCH recovery — re-plan from the most recent "prompt" user
    // message in the chat history (not whatever happens to be in the
    // composer textarea, which has been cleared after submit per the chat
    // pattern). STALE_PATCH only fires post-apply, after the chain
    // completed, so the prior user prompt is the right starting point.
    let originalUserPrompt: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role === "user" && m.kind === "prompt") {
        originalUserPrompt = m.content;
        break;
      }
    }
    if (originalUserPrompt === null) return;
    setRiskAcknowledged(false);
    appendMessage({
      id: nextChatMessageId(),
      role: "user",
      kind: "prompt",
      content: originalUserPrompt,
    });
    void persistMessageBestEffort(wfId, {
      role: "user",
      kind: "prompt",
      content: originalUserPrompt,
    });
    const result = await ai.plan(originalUserPrompt, undefined, { currentGraph });
    if (result === null) {
      const errorContent =
        "The AI assistant is unavailable right now. Please try again in a moment.";
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "error",
        content: errorContent,
      });
      void persistMessageBestEffort(wfId, {
        role: "assistant",
        kind: "error",
        content: errorContent,
      });
      return;
    }
    appendMessage({
      id: nextChatMessageId(),
      role: "assistant",
      kind: "plan_result",
      result,
    });
    void persistMessageBestEffort(wfId, {
      role: "assistant",
      kind: "plan_result",
      content: result.ok ? result.intentSummary : result.message,
      safePayload: buildPlanResultSafePayload(result),
    });
  }

  // AI-DIAG / AI-REPAIR — the read-only "Check workflow" + metered "Explain with
  // AI" / "Suggest a fix" actions live in their own hook (extracted in
  // 4.AI-REPAIR-CLEANUP-1). It owns its in-flight + already-actioned state and
  // renders results through this hook's `appendMessage`.
  // AI-REPAIR-3E — refetch + re-hydrate the draft after a successful repair apply,
  // reusing the SAME getWorkflow → graphSlice.hydrate path the planner apply uses
  // (Slice 4.BUILDER-APPLY-HYDRATE-RACE-1: pass the post-apply revision so a later
  // stale prop-driven hydrate is ignored). No run, no activation.
  async function refreshDraftAfterApply(): Promise<void> {
    if (!workflowId) return;
    const detail = await getWorkflow(workflowId);
    hydrate(workflowId, detail.draftDefinition, detail.updatedAt);
  }

  const diagnosis = useBuilderDiagnosisActions({
    workflowId,
    busy,
    currentDraft,
    selectedNodeId: activeNodeId,
    appendMessage,
    refreshDraftAfterApply,
  });

  // AI-DIAG-QA-AUTOROUTE CS-2 — mark an intent-clarification choice resolved (buttons
  // disable). CS-2 does NOT route anywhere — the actual Q&A / planner dispatch on the
  // retained prompt is wired in CS-3. Kept as two named handlers so CS-3 only has to
  // fill in the routing body, not re-thread the props.
  function markClarificationResolved(messageId: ChatMessageId): void {
    setResolvedClarificationIds((prev) => {
      if (prev.has(messageId)) return prev;
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }
  function handleClarifyExplain(messageId: ChatMessageId): void {
    markClarificationResolved(messageId);
  }
  function handleClarifyPlan(messageId: ChatMessageId): void {
    markClarificationResolved(messageId);
  }

  function handleClear(): void {
    if (!workflowId) return;
    const wfId: string = workflowId;
    // Clear resets the whole conversation: messages, composer text,
    // risk-ack, the hook chain state, AND the staged required-input
    // answers (AI-22). "Plan another change" calls this same handler
    // post-apply for the same reason.
    // AI-23 — also DELETE the persisted thread so reopening the
    // workflow starts fresh. Fail-open: a delete error doesn't block
    // the local reset.
    setRiskAcknowledged(false);
    setMessages([]);
    setPrompt("");
    setStagedAnswers(new Map());
    setResolvedClarificationIds(new Set());
    // AI-DIAG-2b / AI-REPAIR-1c — also reset the explanation + repair-proposal
    // state on a full clear (does not touch the read-only `checking` flag).
    diagnosis.resetDiagnosisActions();
    ai.reset();
    void clearBuilderAgentThread(wfId).catch((err) => {
      warnPersistenceFailureForDev("Builder Agent thread clear failed", err);
    });
  }

  return {
    workflowId,
    messages,
    // AI-CONFIG-ASSIST-3 — exposed so the panel can append chat-fill bubbles
    // (proposal / summary / blocked) via the same message list.
    appendMessage,
    aiError: ai.error,
    aiStatus: ai.status,
    planning,
    applying,
    busy,
    hasMessages,
    followUpMode,
    riskAcknowledged,
    setRiskAcknowledged,
    stagedAnswers,
    historyLoadFailed,
    checking: diagnosis.checking,
    explaining: diagnosis.explaining,
    explainedDiagnosisIds: diagnosis.explainedDiagnosisIds,
    suggesting: diagnosis.suggesting,
    suggestedDiagnosisIds: diagnosis.suggestedDiagnosisIds,
    previewing: diagnosis.previewing,
    previewedProposalIds: diagnosis.previewedProposalIds,
    asking: diagnosis.asking,
    applyingId: diagnosis.applyingId,
    appliedPreviewIds: diagnosis.appliedPreviewIds,
    applyErrorByPreviewId: diagnosis.applyErrorByPreviewId,
    prompt,
    setPrompt,
    canSubmitDetails,
    handleSubmit,
    handleApply,
    handleRerunPlan,
    handleClear,
    handleStagedAnswerChange,
    resolvedClarificationIds,
    handleClarifyExplain,
    handleClarifyPlan,
    handleCheckWorkflow: diagnosis.handleCheckWorkflow,
    handleAskDiagnosisQuestion: diagnosis.handleAskDiagnosisQuestion,
    handleExplainDiagnosis: diagnosis.handleExplainDiagnosis,
    handleSuggestFix: diagnosis.handleSuggestFix,
    handlePreviewFix: diagnosis.handlePreviewFix,
    handlePreviewSelectedFix: diagnosis.handlePreviewSelectedFix,
    handlePreviewDanglingEdgeFix: diagnosis.handlePreviewDanglingEdgeFix,
    handlePreviewSelfLoopEdgeFix: diagnosis.handlePreviewSelfLoopEdgeFix,
    handlePreviewDuplicateEdgeFix: diagnosis.handlePreviewDuplicateEdgeFix,
    handleApplyRepair: diagnosis.handleApplyRepair,
  };
}
