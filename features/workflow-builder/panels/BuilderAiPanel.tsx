"use client";

import { BuilderAiPanelComposer } from "./_BuilderAiPanelComposer";
import { BuilderAiPanelMessageList } from "./_BuilderAiPanelMessageList";
import { useBuilderAiActions } from "./useBuilderAiActions";

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
      />
      <BuilderAiPanelComposer
        prompt={a.prompt}
        onPromptChange={a.setPrompt}
        onSubmit={a.handleSubmit}
        onClear={a.handleClear}
        followUpMode={a.followUpMode}
        planning={a.planning}
        busy={a.busy}
        hasMessages={a.hasMessages}
        hasStagedAnswers={a.stagedAnswers.size > 0}
        onCheckWorkflow={a.handleCheckWorkflow}
        checking={a.checking}
      />
    </section>
  );
}
