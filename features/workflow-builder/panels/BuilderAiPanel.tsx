"use client";

import { useRef } from "react";
import { BuilderAiPanelComposer } from "./_BuilderAiPanelComposer";
import { BuilderAiPanelMessageList } from "./_BuilderAiPanelMessageList";
import { useBuilderAiActions } from "./useBuilderAiActions";
import { useChatFill } from "./useChatFill";
import { useChatFillTarget, type ChatFillTarget } from "../ai/useChatFillTarget";
import { shouldRouteChatFill } from "../ai/shouldRouteChatFill";
import { classifyComposerIntent } from "../ai/classifyComposerIntent";
import { useConfigSlice } from "../state/configSlice";

/**
 * Builder AI assistant panel — React Agent rail chat (Slice 4.AI-21B,
 * component-split in 4.AI-21C, orchestration extracted into
 * `useBuilderAiActions` in 4.AI-REPAIR-CLEANUP-1).
 *
 * This file is now a thin RENDER SHELL: all chat state + the diagnose / explain /
 * suggest-fix / submit / apply / rerun / clear handlers + the workflow-scoped
 * thread load effect live in [`useBuilderAiActions`](./useBuilderAiActions.ts).
 * The panel only wires the hook's returned values into the two presentational
 * siblings:
 *   - [`_BuilderAiPanelMessageList.tsx`](./_BuilderAiPanelMessageList.tsx) —
 *     scroll container + per-message rendering + auto-scroll.
 *   - [`_BuilderAiPanelComposer.tsx`](./_BuilderAiPanelComposer.tsx) — pinned
 *     composer footer + Clear button + char counter.
 *   - [`_BuilderAiPanelChat.tsx`](./_BuilderAiPanelChat.tsx) — chat-message
 *     types + bubble wrappers + `PlanResultBody`.
 *
 * Scope guardrail — workflow-builder React Agent only. NOT the general
 * app help assistant. All AI-11B / AI-20 / AI-21 / AI-22 / AI-23 / AI-24 /
 * AI-25 / AI-26 / AI-DIAG / AI-REPAIR no-leak / apply-readiness / no-auto-apply /
 * strict-schema invariants are preserved by the hook.
 */

export function BuilderAiPanel() {
  const a = useBuilderAiActions();

  // Slice 4.AI-CONFIG-ASSIST-3 / 3B — chat-fill (live, no flag). Hooks must run
  // before the early return. When no field is highlighted, `chatFillActive` is
  // false and the composer behaves exactly as before.
  const chatFillTarget = useChatFillTarget();
  // Keep the latest target in a ref so a Confirm click re-validates against the
  // CURRENTLY-highlighted field (a stale proposal can't fill the wrong field).
  const targetRef = useRef<ChatFillTarget | null>(chatFillTarget);
  targetRef.current = chatFillTarget;
  const chatFill = useChatFill({
    appendMessage: a.appendMessage,
    getCurrentTarget: () => targetRef.current,
  });
  // Route the composer to chat-fill when a field is highlighted and we're not mid
  // plan-follow-up. Live by default (no flag).
  const chatFillActive = shouldRouteChatFill(chatFillTarget, a.followUpMode);

  // Slice 4.AI-CONFIG-ASSIST CS-6 — chat-fill discoverability. Surface the helper
  // hint + field-specific placeholder ONLY when an ELIGIBLE field is highlighted
  // (a highlighted-but-ineligible field must not suggest chat-fill). Labels only.
  const chatFillHint =
    chatFillActive && chatFillTarget?.eligibility.ok
      ? { fieldLabel: chatFillTarget.fieldLabel, nodeLabel: chatFillTarget.nodeLabel }
      : null;

  // CS-7 — exit chat-fill targeting back to normal AI chat (inline action + Escape).
  // Clears the highlighted-field focus ONLY: keeps the config panel open, never
  // saves/runs/mutates the graph, and never erases the already-typed config value.
  function handleExitChatFill(): void {
    useConfigSlice.getState().clearFieldFocus();
  }

  function handleComposerSubmit(): void {
    // Precedence 1 — chat-fill (a config field is highlighted): unchanged behavior.
    if (chatFillActive && chatFillTarget) {
      const raw = a.prompt;
      if (raw.trim().length === 0) return;
      // CS-9 — DIRECT fill: the field is highlighted and we're in explicit field-fill
      // mode, so write the pending draft immediately + show an after-fill summary. No
      // Confirm/Cancel proposal bubble. (Ineligible/ambiguous → safe guidance, no write.)
      chatFill.fillNow(chatFillTarget, raw);
      a.setPrompt("");
      return;
    }
    // Precedence 2 — follow-up mode (a plan awaits required-input details): always the
    // planner. A follow-up reply is never re-classified as a question (AUTOROUTE CS-3).
    if (a.followUpMode) {
      a.handleSubmit();
      return;
    }
    // Precedence 3 — deterministic one-composer intent routing (AUTOROUTE CS-3).
    const text = a.prompt;
    if (text.trim().length === 0) return;
    const { route } = classifyComposerIntent(text);
    if (route === "qa") {
      // Read-only diagnosis Q&A on the composer text (existing handler: re-derives the
      // diagnosis server-side, forwards configSlice.activeNodeId as the safe hint).
      a.handleAskDiagnosisQuestion(text);
      a.setPrompt("");
      return;
    }
    if (route === "clarify") {
      // Ambiguous + mutation-capable → ask instead of guessing. Retain the prompt
      // (not rendered) so a quick action can route it; clear the composer.
      a.appendClarification(text);
      a.setPrompt("");
      return;
    }
    // route === "plan" — existing planner submit (reads + clears the composer text).
    a.handleSubmit();
  }

  if (!a.workflowId) return null;

  return (
    <section
      aria-label="AI assistant"
      data-testid="builder-ai-panel"
      className="flex h-full min-h-0 flex-col gap-2"
      style={{ color: "var(--builder-text)" }}
    >
      <BuilderAiPanelMessageList
        messages={a.messages}
        aiError={a.aiError}
        planning={a.planning}
        applying={a.applying}
        busy={a.busy}
        hasMessages={a.hasMessages}
        riskAcknowledged={a.riskAcknowledged}
        onRiskAcknowledgeChange={a.setRiskAcknowledged}
        onApply={a.handleApply}
        onRerunPlan={a.handleRerunPlan}
        onReset={a.handleClear}
        aiStatus={a.aiStatus}
        stagedAnswers={a.stagedAnswers}
        onStagedAnswerChange={a.handleStagedAnswerChange}
        historyLoadFailed={a.historyLoadFailed}
        checking={a.checking}
        onSubmitDetails={a.handleSubmit}
        canSubmitDetails={a.canSubmitDetails}
        submittingDetails={a.busy}
        onExplainDiagnosis={a.handleExplainDiagnosis}
        explaining={a.explaining}
        explainedDiagnosisIds={a.explainedDiagnosisIds}
        onSuggestFix={a.handleSuggestFix}
        suggesting={a.suggesting}
        suggestedDiagnosisIds={a.suggestedDiagnosisIds}
        onPreviewFix={a.handlePreviewFix}
        previewing={a.previewing}
        previewedProposalIds={a.previewedProposalIds}
        onPreviewSelectedFix={a.handlePreviewSelectedFix}
        onPreviewDanglingEdgeFix={a.handlePreviewDanglingEdgeFix}
        onPreviewSelfLoopEdgeFix={a.handlePreviewSelfLoopEdgeFix}
        onPreviewDuplicateEdgeFix={a.handlePreviewDuplicateEdgeFix}
        onApplyRepair={a.handleApplyRepair}
        applyingId={a.applyingId}
        appliedPreviewIds={a.appliedPreviewIds}
        applyErrorByPreviewId={a.applyErrorByPreviewId}
        onConfirmFill={chatFill.confirmFill}
        onCancelFill={chatFill.cancelFill}
        resolvedFillIds={chatFill.resolvedFillIds}
        onClarifyExplain={a.handleClarifyExplain}
        onClarifyPlan={a.handleClarifyPlan}
        resolvedClarificationIds={a.resolvedClarificationIds}
        // Example chips FILL the one composer (no submit, no API call); the user
        // then sends through the same handleComposerSubmit → AUTOROUTE path.
        onUseExamplePrompt={a.setPrompt}
      />
      <BuilderAiPanelComposer
        prompt={a.prompt}
        onPromptChange={a.setPrompt}
        onSubmit={handleComposerSubmit}
        onClear={a.handleClear}
        followUpMode={a.followUpMode}
        planning={a.planning}
        busy={a.busy}
        hasMessages={a.hasMessages}
        hasStagedAnswers={a.stagedAnswers.size > 0}
        onCheckWorkflow={a.handleCheckWorkflow}
        checking={a.checking}
        asking={a.asking}
        chatFillHint={chatFillHint}
        onExitChatFill={handleExitChatFill}
      />
    </section>
  );
}
