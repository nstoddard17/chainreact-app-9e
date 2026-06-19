"use client";

import { Button } from "@/components/ui/button";
import { canExplainDiagnosis, type RequiredInputAnswer } from "../ai";
import type { RepairPreviewProposalContext, SelectedRepair } from "@/lib/api/ai";
import type { ChatFillProposal } from "../ai/chatFillAction";
import {
  AssistantBubble,
  PlanResultBody,
  UserBubble,
  type ChatMessage,
  type ChatMessageId,
} from "./_BuilderAiPanelChat";
import {
  DiagnosisBody,
  DiagnosisExplanationBody,
  DiagnosisQaBody,
  RepairPreviewBody,
  RepairProposalBody,
} from "./_BuilderAiPanelDiagnosis";
import { ChatFillBody } from "./_BuilderAiPanelChatFill";
import { IntentClarificationBody } from "./_BuilderAiPanelClarification";

/**
 * Per-message renderer for the React Agent chat (extracted from
 * `_BuilderAiPanelMessageList.tsx` in Slice 4.AI-REPAIR-3F to keep each panel module
 * under the project's max-lines threshold).
 *
 * Pure presentational fan-out: maps one `ChatMessage` to its bubble. All gating
 * (which message is the LATEST plan / diagnosis / proposal / preview, and the
 * resolved `repairGoToNodeId`) is computed by the parent list and passed down, so a
 * stale historical message never shows a live/paid affordance. testIds, copy, and
 * the Apply visibility/hidden rules are unchanged from the pre-split list.
 */
interface MessageItemProps {
  readonly message: ChatMessage;
  /** LATEST-message ids derived by the parent list (null when none of that kind). */
  readonly latestPlanMessageId: ChatMessageId | null;
  readonly latestDiagnosisMessageId: ChatMessageId | null;
  readonly latestRepairProposalMessageId: ChatMessageId | null;
  readonly latestRepairPreviewMessageId: ChatMessageId | null;
  /** Resolved single missing-field target for the latest proposal, else null. */
  readonly repairGoToNodeId: string | null;
  // Plan-result wiring.
  readonly applying: boolean;
  readonly busy: boolean;
  readonly riskAcknowledged: boolean;
  readonly onRiskAcknowledgeChange: (next: boolean) => void;
  readonly onApply: () => void;
  readonly onRerunPlan: () => void;
  readonly onReset: () => void;
  readonly stagedAnswers: ReadonlyMap<string, RequiredInputAnswer>;
  readonly onStagedAnswerChange: (
    key: string,
    answer: RequiredInputAnswer | undefined,
  ) => void;
  readonly onSubmitDetails: () => void;
  readonly canSubmitDetails: boolean;
  readonly submittingDetails: boolean;
  // Diagnosis Explain / Suggest wiring.
  readonly onExplainDiagnosis: (diagnosisMessageId: ChatMessageId) => void;
  readonly explaining: boolean;
  readonly explainedDiagnosisIds: ReadonlySet<ChatMessageId>;
  readonly onSuggestFix: (diagnosisMessageId: ChatMessageId) => void;
  readonly suggesting: boolean;
  readonly suggestedDiagnosisIds: ReadonlySet<ChatMessageId>;
  // Repair-proposal Preview wiring.
  readonly onPreviewFix: (
    proposalMessageId: ChatMessageId,
    proposalContext?: RepairPreviewProposalContext,
  ) => void;
  readonly previewing: boolean;
  readonly previewedProposalIds: ReadonlySet<ChatMessageId>;
  // AI-REPAIR-3L — explicit user-selected replacement preview (multiple-candidate case).
  readonly onPreviewSelectedFix: (selection: SelectedRepair) => void;
  // AI-REPAIR-4A — deterministic dangling/broken-edge cleanup preview.
  readonly onPreviewDanglingEdgeFix: () => void;
  // AI-REPAIR-COVERAGE-1 — deterministic self-loop edge cleanup preview.
  readonly onPreviewSelfLoopEdgeFix: () => void;
  // AI-REPAIR-COVERAGE-2 — deterministic duplicate edge cleanup preview.
  readonly onPreviewDuplicateEdgeFix: () => void;
  // Repair-preview Apply wiring.
  readonly onApplyRepair: (
    previewMessageId: ChatMessageId,
    applyMeta: { operations: readonly unknown[]; baseRevision: string },
  ) => void;
  readonly applyingId: ChatMessageId | null;
  readonly appliedPreviewIds: ReadonlySet<ChatMessageId>;
  readonly applyErrorByPreviewId: ReadonlyMap<ChatMessageId, string>;
  // Chat-fill wiring.
  readonly onConfirmFill: (messageId: ChatMessageId, proposal: ChatFillProposal) => void;
  readonly onCancelFill: (messageId: ChatMessageId) => void;
  readonly resolvedFillIds: ReadonlySet<ChatMessageId>;
  // AI-DIAG-QA-AUTOROUTE CS-2 — intent-clarification quick actions. The handlers
  // receive the clarification message id; CS-3 wires them to the real Q&A / planner
  // routing. `resolvedClarificationIds` disables both buttons once a choice is made.
  readonly onClarifyExplain: (messageId: ChatMessageId) => void;
  readonly onClarifyPlan: (messageId: ChatMessageId) => void;
  readonly resolvedClarificationIds: ReadonlySet<ChatMessageId>;
}

export function MessageItem({
  message,
  latestPlanMessageId,
  latestDiagnosisMessageId,
  latestRepairProposalMessageId,
  latestRepairPreviewMessageId,
  repairGoToNodeId,
  applying,
  busy,
  riskAcknowledged,
  onRiskAcknowledgeChange,
  onApply,
  onRerunPlan,
  onReset,
  stagedAnswers,
  onStagedAnswerChange,
  onSubmitDetails,
  canSubmitDetails,
  submittingDetails,
  onExplainDiagnosis,
  explaining,
  explainedDiagnosisIds,
  onSuggestFix,
  suggesting,
  suggestedDiagnosisIds,
  onPreviewFix,
  previewing,
  previewedProposalIds,
  onPreviewSelectedFix,
  onPreviewDanglingEdgeFix,
  onPreviewSelfLoopEdgeFix,
  onPreviewDuplicateEdgeFix,
  onApplyRepair,
  applyingId,
  appliedPreviewIds,
  applyErrorByPreviewId,
  onConfirmFill,
  onCancelFill,
  resolvedFillIds,
  onClarifyExplain,
  onClarifyPlan,
  resolvedClarificationIds,
}: MessageItemProps) {
  if (message.role === "user") {
    return <UserBubble kind={message.kind} content={message.content} />;
  }
  if (message.kind === "plan_result") {
    const isLatest = message.id === latestPlanMessageId;
    return (
      <AssistantBubble>
        <PlanResultBody
          result={message.result}
          isLatest={isLatest}
          applying={applying}
          riskAcknowledged={riskAcknowledged}
          onRiskAcknowledgeChange={onRiskAcknowledgeChange}
          onApply={onApply}
          stagedAnswers={stagedAnswers}
          onStagedAnswerChange={onStagedAnswerChange}
          onSubmitDetails={onSubmitDetails}
          canSubmitDetails={canSubmitDetails}
          submittingDetails={submittingDetails}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "applied") {
    return (
      <AssistantBubble>
        <div
          className="flex flex-col gap-2"
          data-testid="builder-ai-apply-success"
        >
          <p
            role="status"
            className="text-xs text-emerald-700 dark:text-emerald-400"
          >
            ✓ {message.result.summaryText}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReset}
              data-testid="builder-ai-plan-another-button"
            >
              Plan another change
            </Button>
          </div>
        </div>
      </AssistantBubble>
    );
  }
  if (message.kind === "diagnosis") {
    // AI-DIAG-2c / AI-REPAIR-1c — Explain and Suggest-a-fix share ONE gate:
    // the latest diagnosis message that still has real issues. Clean/ready
    // and access walls hide both paid affordances.
    const isLatestDiagnosis = message.id === latestDiagnosisMessageId;
    const showAffordances =
      isLatestDiagnosis && canExplainDiagnosis(message.diagnosis);
    return (
      <AssistantBubble>
        <DiagnosisBody
          diagnosis={message.diagnosis}
          canExplain={showAffordances}
          explaining={explaining}
          alreadyExplained={explainedDiagnosisIds.has(message.id)}
          onExplain={() => onExplainDiagnosis(message.id)}
          canSuggestFix={showAffordances}
          suggesting={suggesting}
          alreadySuggested={suggestedDiagnosisIds.has(message.id)}
          onSuggestFix={() => onSuggestFix(message.id)}
          // CS-5/CS-8 — surface the direct "Open <field> field" actions on the
          // LATEST check result so missing-input issues need neither Suggest nor
          // Preview. The group renders one action per missing field across nodes.
          showFieldActions={isLatestDiagnosis}
          // AI-REPAIR-3K — a one-candidate invalid reference gets a direct "Preview
          // fix" action in "Needs attention". It reuses the SAME deterministic
          // repair-preview round-trip (no proposalContext → server re-derives the
          // diagnosis and runs the model-free preview first, AI-REPAIR-3H). Keyed on
          // the diagnosis message id for in-flight + repeat-guard, mirroring Suggest.
          onPreviewInvalidRef={() => onPreviewFix(message.id)}
          // AI-REPAIR-3L — a multiple-candidate invalid reference gets an explicit
          // replacement picker; the chosen candidate is previewed deterministically
          // (re-validated server-side). The app never auto-picks.
          onPreviewSelectedInvalidRef={onPreviewSelectedFix}
          // AI-REPAIR-4A — a dangling/broken edge gets a "Preview fix" that runs the
          // deterministic removeEdge cleanup preview (no LLM/credits/telemetry).
          onPreviewDanglingEdge={onPreviewDanglingEdgeFix}
          // AI-REPAIR-COVERAGE-1 — a self-loop edge gets a "Preview fix" that runs the
          // deterministic removeEdge cleanup preview (no LLM/credits/telemetry).
          onPreviewSelfLoopEdge={onPreviewSelfLoopEdgeFix}
          // AI-REPAIR-COVERAGE-2 — a duplicate edge gets a "Preview fix" that runs the
          // deterministic removeEdge cleanup preview (no LLM/credits/telemetry).
          onPreviewDuplicateEdge={onPreviewDuplicateEdgeFix}
          previewing={previewing}
          alreadyPreviewedInvalidRef={previewedProposalIds.has(message.id)}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "repair_proposal") {
    const canPreview = message.id === latestRepairProposalMessageId;
    return (
      <AssistantBubble>
        <RepairProposalBody
          proposal={message.proposal}
          canPreview={canPreview}
          goToNodeId={canPreview ? repairGoToNodeId : null}
          previewing={previewing}
          alreadyPreviewed={previewedProposalIds.has(message.id)}
          onPreviewFix={() =>
            onPreviewFix(message.id, {
              summary: message.proposal.summary,
              recommendedActions: message.proposal.recommendedActions,
            })
          }
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "repair_preview") {
    // AI-REPAIR-3E — the Apply button shows ONLY when this is the latest preview
    // AND the server marked it applyable with the opaque operations + baseRevision
    // to forward. A blocked / metadata-less / historical preview → no button.
    const apply = message.preview.apply;
    const canApply =
      message.id === latestRepairPreviewMessageId &&
      apply?.applyable === true &&
      Array.isArray(apply.operations) &&
      typeof apply.baseRevision === "string";
    return (
      <AssistantBubble>
        <RepairPreviewBody
          preview={message.preview}
          canApply={canApply}
          applying={applyingId === message.id}
          applied={appliedPreviewIds.has(message.id)}
          applyError={applyErrorByPreviewId.get(message.id) ?? null}
          {...(canApply && apply?.operations && apply.baseRevision
            ? {
                onApply: () =>
                  onApplyRepair(message.id, {
                    operations: apply.operations as readonly unknown[],
                    baseRevision: apply.baseRevision as string,
                  }),
              }
            : {})}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "intent_clarification") {
    // AI-DIAG-QA-AUTOROUTE CS-2 — ambiguous prompt → ask "explain vs plan a fix".
    // No model call / patch / Apply / Preview; the two actions only choose a route.
    return (
      <AssistantBubble>
        <IntentClarificationBody
          resolved={resolvedClarificationIds.has(message.id)}
          onExplain={() => onClarifyExplain(message.id)}
          onPlan={() => onClarifyPlan(message.id)}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "chat_fill") {
    const fill = message.fill;
    return (
      <AssistantBubble>
        <ChatFillBody
          fill={fill}
          resolved={resolvedFillIds.has(message.id)}
          onConfirm={() => {
            if (fill.phase === "proposal") onConfirmFill(message.id, fill.proposal);
          }}
          onCancel={() => onCancelFill(message.id)}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "diagnosis_explanation") {
    return (
      <AssistantBubble>
        <DiagnosisExplanationBody
          explanation={message.explanation}
          priorities={message.priorities}
          missingInfo={message.missingInfo}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "diagnosis_qa") {
    // AI-DIAG-QA-3 — read-only single-shot answer bubble. No Apply / Preview control.
    return (
      <AssistantBubble>
        <DiagnosisQaBody
          question={message.question}
          answer={message.answer}
          pointers={message.pointers}
          needsUserDecision={message.needsUserDecision}
        />
      </AssistantBubble>
    );
  }
  if (message.kind === "apply_failure") {
    return (
      <AssistantBubble>
        <div
          data-testid="builder-ai-apply-failure"
          className="flex flex-col gap-2"
        >
          <p role="alert" className="text-xs text-destructive">
            {message.result.code === "STALE_PATCH"
              ? "This workflow changed after the plan was created, so it wasn’t applied. Re-run the plan to work from the latest version."
              : message.result.code === "CONFIRMATION_REQUIRED"
                ? "This change needs your explicit confirmation before it can be applied."
                : message.result.message}
          </p>
          {message.result.code === "STALE_PATCH" && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRerunPlan}
                disabled={busy}
                data-testid="builder-ai-rerun-button"
              >
                Re-run plan
              </Button>
            </div>
          )}
        </div>
      </AssistantBubble>
    );
  }
  // error
  return (
    <AssistantBubble>
      <p
        role="alert"
        className="text-xs text-destructive"
        data-testid="builder-ai-error-message"
      >
        {message.content}
      </p>
    </AssistantBubble>
  );
}

/**
 * The transient in-flight indicators for the chat (extracted alongside
 * `MessageItem`). Each renders an assistant bubble while its round-trip is active —
 * planning / checking / asking (Q&A) / explaining / suggesting / previewing. Data-
 * driven (BUILDER-AI-QA-PRESENTATION-POLISH-1) so adding an indicator stays one row;
 * testIds + copy are unchanged from the pre-split list.
 */
export function TransientIndicators({
  planning,
  checking,
  asking,
  explaining,
  suggesting,
  previewing,
}: {
  readonly planning: boolean;
  readonly checking: boolean;
  readonly asking: boolean;
  readonly explaining: boolean;
  readonly suggesting: boolean;
  readonly previewing: boolean;
}) {
  const indicators: ReadonlyArray<{ active: boolean; testId: string; label: string }> = [
    { active: planning, testId: "builder-ai-planning", label: "Planning your change…" },
    { active: checking, testId: "builder-ai-checking", label: "Checking workflow…" },
    { active: asking, testId: "builder-ai-asking", label: "Answering…" },
    { active: explaining, testId: "builder-ai-explaining", label: "Explaining this check…" },
    { active: suggesting, testId: "builder-ai-suggesting", label: "Suggesting a fix…" },
    { active: previewing, testId: "builder-ai-previewing", label: "Previewing fix…" },
  ];
  return (
    <>
      {indicators
        .filter((indicator) => indicator.active)
        .map((indicator) => (
          <AssistantBubble key={indicator.testId}>
            <p
              role="status"
              className="text-xs text-muted-foreground"
              data-testid={indicator.testId}
            >
              {indicator.label}
            </p>
          </AssistantBubble>
        ))}
    </>
  );
}
