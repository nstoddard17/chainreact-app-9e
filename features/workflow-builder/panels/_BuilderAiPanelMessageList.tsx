"use client";

import { useEffect, useRef } from "react";
import type { AgentWorkflowDiagnosis, RepairPreviewProposalContext } from "@/lib/api/ai";
import { firstMissingFieldNodeId, type RequiredInputAnswer } from "../ai";
import type { ChatMessage, ChatMessageId } from "./_BuilderAiPanelChat";
import { MessageItem, TransientIndicators } from "./_BuilderAiPanelMessageItem";
import type { ChatFillProposal } from "../ai/chatFillAction";

/**
 * Scrolling message list for the React Agent chat (Slice 4.AI-21C).
 *
 * Extracted from `BuilderAiPanel.tsx` to keep the panel under the project's
 * max-lines warning threshold. Pure presentational: no hook imports, no API
 * client imports, no state of its own beyond a `listEndRef` for auto-scroll.
 *
 * Owns: the `role="log"` / `aria-live="polite"` scroll container, the intro
 * hint (only when no messages and not busy), the top-level `ai.error` inline
 * copy (401 / 404 nuance — back-compat with AI-11B), a bottom anchor +
 * auto-scroll effect, and the LATEST-message derivation that gates live/paid
 * affordances. Per-message rendering is delegated to `MessageItem` and the
 * in-flight indicators to `TransientIndicators` (Slice 4.AI-REPAIR-3F split).
 *
 * The `latestPlanMessageId` derivation lives here too — only the latest
 * plan_result message renders the full breakdown (full `builder-ai-…`
 * testIds + Apply controls); older plan_result messages collapse to their
 * `intentSummary` via `PlanResultBody`'s `isLatest=false` branch.
 *
 * All testIds preserved verbatim from AI-21B for back-compat with the
 * existing BuilderAiPanel test suite.
 */

interface Props {
  readonly messages: readonly ChatMessage[];
  readonly aiError: string | null;
  readonly planning: boolean;
  readonly applying: boolean;
  readonly busy: boolean;
  readonly hasMessages: boolean;
  readonly riskAcknowledged: boolean;
  readonly onRiskAcknowledgeChange: (next: boolean) => void;
  /** Apply the currently-latest plan_result. */
  readonly onApply: () => void;
  /** Re-plan after STALE_PATCH using the most recent user prompt. */
  readonly onRerunPlan: () => void;
  /** Full reset — used by the "Plan another change" button on an applied bubble. */
  readonly onReset: () => void;
  /**
   * Used to derive an auto-scroll trigger from `ai.status`. The component
   * doesn't otherwise read this; it just re-runs the scroll effect when
   * the status changes (e.g. planning → planned).
   */
  readonly aiStatus: string;
  /**
   * AI-22 — staged required-input answers keyed by `requiredInputKey(input)`.
   * Passed straight through to the latest plan_result message's body so the
   * interactive `RequiredInputControl`s can render their current values + see
   * sibling staged answers for `dependsOn` resolution.
   */
  readonly stagedAnswers: ReadonlyMap<string, RequiredInputAnswer>;
  readonly onStagedAnswerChange: (
    key: string,
    answer: RequiredInputAnswer | undefined,
  ) => void;
  /**
   * AI-26 — set when the most recent `getBuilderAgentThread` attempt
   * threw. Renders an inline, non-blocking notice in place of the intro
   * hint when the chat is otherwise empty, so a silent load failure is
   * distinguishable from "no history." Planning / applying are unaffected
   * regardless of this flag.
   */
  readonly historyLoadFailed: boolean;
  /**
   * Slice 4.AI-DIAG-1b — true while a read-only "Check this workflow" diagnosis
   * round-trip is in flight. Renders a transient assistant indicator (mirrors the
   * planning indicator); does not affect plan/apply state.
   */
  readonly checking: boolean;
  /**
   * Slice 4.REACT-AGENT-CHAT-QOL-1 — submit handler for the inline "Send
   * details" button rendered under the ACTIVE plan_result's required-input
   * controls. Identical to the composer's `onSubmit` (the panel passes the
   * same `handleSubmit`), so there is no second submit path. Only the latest
   * non-persisted plan_result renders controls (via `PlanResultBody`'s
   * `isLatest` guard), so historical blocks never get an active button.
   */
  readonly onSubmitDetails: () => void;
  /** Enabled-state for the inline Send details button (staged answers or text, not busy). */
  readonly canSubmitDetails: boolean;
  /** True while a plan / apply round-trip is in flight — disables the inline button. */
  readonly submittingDetails: boolean;
  /**
   * Slice 4.AI-DIAG-2b — "Explain with AI" wiring. `onExplainDiagnosis` is the
   * explicit-click handler (it receives the diagnosis message id so the panel can
   * mark it explained); `explaining` drives the transient indicator + disables the
   * button; `explainedDiagnosisIds` drives the per-diagnosis "Explained" state so a
   * repeat click can't re-charge.
   */
  readonly onExplainDiagnosis: (diagnosisMessageId: ChatMessageId) => void;
  readonly explaining: boolean;
  readonly explainedDiagnosisIds: ReadonlySet<ChatMessageId>;
  /**
   * Slice 4.AI-REPAIR-1c — "Suggest a fix" wiring (mirrors the Explain props).
   * `onSuggestFix` is the explicit-click handler (receives the diagnosis message
   * id); `suggesting` drives the transient indicator + disables the button;
   * `suggestedDiagnosisIds` drives the per-diagnosis "Suggested" state so a repeat
   * click can't re-charge.
   */
  readonly onSuggestFix: (diagnosisMessageId: ChatMessageId) => void;
  readonly suggesting: boolean;
  readonly suggestedDiagnosisIds: ReadonlySet<ChatMessageId>;
  /**
   * Slice 4.AI-REPAIR-2c — "Preview fix" wiring (mirrors the Suggest props, but the
   * button lives on the LATEST repair_proposal bubble). `onPreviewFix` is the
   * explicit-click handler (receives the proposal message id + the proposal's
   * summary/actions as non-authoritative steering); `previewing` drives the
   * transient indicator + disables the button; `previewedProposalIds` drives the
   * per-proposal "Previewed" state so a repeat click can't re-charge.
   */
  readonly onPreviewFix: (
    proposalMessageId: ChatMessageId,
    proposalContext?: RepairPreviewProposalContext,
  ) => void;
  readonly previewing: boolean;
  readonly previewedProposalIds: ReadonlySet<ChatMessageId>;
  /**
   * Slice 4.AI-REPAIR-3E — Apply wiring for the LATEST validated repair preview.
   * `onApplyRepair` forwards the preview's opaque operations + baseRevision to the
   * apply route; `applyingId` is the in-flight preview (disables its button);
   * `appliedPreviewIds` relabels an applied preview ("Applied"); `applyErrorByPreviewId`
   * carries the safe stale/blocked/network copy.
   */
  readonly onApplyRepair: (
    previewMessageId: ChatMessageId,
    applyMeta: { operations: readonly unknown[]; baseRevision: string },
  ) => void;
  readonly applyingId: ChatMessageId | null;
  readonly appliedPreviewIds: ReadonlySet<ChatMessageId>;
  readonly applyErrorByPreviewId: ReadonlyMap<ChatMessageId, string>;
  /**
   * Slice 4.AI-CONFIG-ASSIST-3 / 3B — chat-fill wiring. `onConfirmFill` writes the
   * pending config draft (CS-2) + appends a summary; `onCancelFill` dismisses
   * (no write); both mark the proposal resolved. `resolvedFillIds` disables a
   * consumed proposal's Confirm/Cancel buttons. Only invoked for `chat_fill`
   * bubbles, which exist only after the user submits a value with a field
   * highlighted.
   */
  readonly onConfirmFill: (messageId: ChatMessageId, proposal: ChatFillProposal) => void;
  readonly onCancelFill: (messageId: ChatMessageId) => void;
  readonly resolvedFillIds: ReadonlySet<ChatMessageId>;
}

export function BuilderAiPanelMessageList({
  messages,
  aiError,
  planning,
  applying,
  busy,
  hasMessages,
  riskAcknowledged,
  onRiskAcknowledgeChange,
  onApply,
  onRerunPlan,
  onReset,
  aiStatus,
  stagedAnswers,
  onStagedAnswerChange,
  historyLoadFailed,
  checking,
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
  onApplyRepair,
  applyingId,
  appliedPreviewIds,
  applyErrorByPreviewId,
  onConfirmFill,
  onCancelFill,
  resolvedFillIds,
}: Props) {
  const listEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom whenever the message list grows or the agent
  // status transitions. JSDOM doesn't implement `scrollIntoView` — guard the
  // call so unit tests don't need to polyfill.
  useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, aiStatus]);

  // The LATEST plan_result message owns the full breakdown + apply controls.
  // AI-23 — historical (persisted) plan_result messages are read-only summaries
  // by definition (their proposedPatch was never persisted), so they are
  // EXCLUDED from latest-plan derivation regardless of position. The user can
  // continue the conversation by typing a new prompt; the live session-local
  // plan that follows owns the Apply path.
  let latestPlanMessageId: ChatMessageId | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.kind === "plan_result" && !m.persisted) {
      latestPlanMessageId = m.id;
      break;
    }
  }

  // AI-DIAG-2b — only the LATEST diagnosis message shows "Explain with AI" (mirrors
  // latest-plan derivation), so a stale historical check never offers a paid button.
  // AI-DIAG-2c — AND only when the diagnosis isn't fully clean/ready
  // (`canExplainDiagnosis`), so a "ready, nothing to fix" check never offers a paid
  // explanation that would just restate "it's ready".
  let latestDiagnosisMessageId: ChatMessageId | null = null;
  let latestDiagnosis: AgentWorkflowDiagnosis | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.kind === "diagnosis") {
      latestDiagnosisMessageId = m.id;
      latestDiagnosis = m.diagnosis;
      break;
    }
  }

  // AI-CONFIG-ASSIST CS-4 — when the latest diagnosis pins a single missing
  // required field, the latest repair proposal offers a direct "Open <field> field"
  // action (no Preview step). Null when the issue isn't a single targetable field.
  const repairGoToNodeId = firstMissingFieldNodeId(latestDiagnosis);

  // AI-REPAIR-2c — only the LATEST repair_proposal message offers "Preview fix",
  // mirroring the latest-diagnosis gating, so a stale historical proposal never
  // offers a paid button.
  let latestRepairProposalMessageId: ChatMessageId | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.kind === "repair_proposal") {
      latestRepairProposalMessageId = m.id;
      break;
    }
  }

  // AI-REPAIR-3E — only the LATEST repair_preview may offer Apply (mirrors the
  // latest-proposal gating), so a stale historical preview never shows a live button.
  let latestRepairPreviewMessageId: ChatMessageId | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.kind === "repair_preview") {
      latestRepairPreviewMessageId = m.id;
      break;
    }
  }

  return (
    <div
      data-testid="builder-ai-message-list"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pt-1"
    >
      {!hasMessages && !busy && historyLoadFailed && (
        <p
          data-testid="builder-ai-history-load-failed"
          role="status"
          className="px-1 pt-1 text-[11.5px] leading-relaxed"
          style={{ color: "var(--builder-warn)" }}
        >
          Chat history couldn&rsquo;t be loaded. New messages will still
          work.
        </p>
      )}

      {!hasMessages && !busy && !historyLoadFailed && (
        <p
          data-testid="builder-ai-intro"
          className="px-1 pt-1 text-[11.5px] leading-relaxed"
          style={{ color: "var(--builder-muted)" }}
        >
          Describe a change in plain English — e.g. &ldquo;post a Slack
          message to #alerts when a new email arrives&rdquo;. The agent
          proposes a preview; nothing is applied until you review and
          confirm.
        </p>
      )}

      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          latestPlanMessageId={latestPlanMessageId}
          latestDiagnosisMessageId={latestDiagnosisMessageId}
          latestRepairProposalMessageId={latestRepairProposalMessageId}
          latestRepairPreviewMessageId={latestRepairPreviewMessageId}
          repairGoToNodeId={repairGoToNodeId}
          applying={applying}
          busy={busy}
          riskAcknowledged={riskAcknowledged}
          onRiskAcknowledgeChange={onRiskAcknowledgeChange}
          onApply={onApply}
          onRerunPlan={onRerunPlan}
          onReset={onReset}
          stagedAnswers={stagedAnswers}
          onStagedAnswerChange={onStagedAnswerChange}
          onSubmitDetails={onSubmitDetails}
          canSubmitDetails={canSubmitDetails}
          submittingDetails={submittingDetails}
          onExplainDiagnosis={onExplainDiagnosis}
          explaining={explaining}
          explainedDiagnosisIds={explainedDiagnosisIds}
          onSuggestFix={onSuggestFix}
          suggesting={suggesting}
          suggestedDiagnosisIds={suggestedDiagnosisIds}
          onPreviewFix={onPreviewFix}
          previewing={previewing}
          previewedProposalIds={previewedProposalIds}
          onApplyRepair={onApplyRepair}
          applyingId={applyingId}
          appliedPreviewIds={appliedPreviewIds}
          applyErrorByPreviewId={applyErrorByPreviewId}
          onConfirmFill={onConfirmFill}
          onCancelFill={onCancelFill}
          resolvedFillIds={resolvedFillIds}
        />
      ))}

      <TransientIndicators
        planning={planning}
        checking={checking}
        explaining={explaining}
        suggesting={suggesting}
        previewing={previewing}
      />

      {/* Top-level transport error (e.g. 401/404) — back-compat with the
          AI-11B inline error rendering. The assistant error bubble (above)
          covers the chat copy; this surfaces the friendly sign-in /
          not-found nuance without duplicating into messages. */}
      {aiError && (
        <p
          role="alert"
          className="px-1 text-xs text-destructive"
          data-testid="builder-ai-error"
        >
          {aiError}
        </p>
      )}

      <div ref={listEndRef} aria-hidden />
    </div>
  );
}
