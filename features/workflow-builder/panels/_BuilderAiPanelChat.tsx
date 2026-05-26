"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AiPlanResult } from "@/lib/api/ai";
import { AiBulletList, AiRequiredInputList } from "../ai";
import { PlanFailure, PreviewSection } from "./_BuilderAiPanelPreview";

/**
 * Chat-bubble subcomponents for `BuilderAiPanel` (Slice 4.AI-21B).
 *
 * Extracted to keep `BuilderAiPanel.tsx` under the project's max-lines
 * warning threshold and to mirror the AI-11B pattern of pulling
 * preview-rendering into a sibling `_BuilderAiPanelPreview.tsx`. Only
 * presentational pieces live here — chat message types, the user / assistant
 * bubble wrappers, and the latest-plan body. State machine (useBuilderAi),
 * routing logic (handleSubmit / handleApply / handleRerunPlan /
 * handleClear), and the composer footer stay in the panel file so the
 * coupling between user gestures and hook state remains in one place.
 *
 * Underscore-prefixed file name = internal sibling, not part of the
 * panels barrel (no public export surface). All testIds preserved for
 * back-compat with the AI-11/11B/AI-20/AI-21 panel tests.
 */

// ─── Session-local chat message model ───────────────────────────────────────

export type ChatMessageId = string;

export interface UserChatMessage {
  readonly id: ChatMessageId;
  readonly role: "user";
  readonly kind: "prompt" | "followup";
  readonly content: string;
}

export interface AssistantPlanChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "plan_result";
  readonly result: AiPlanResult;
}

export interface AssistantAppliedChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "applied";
  readonly result: {
    readonly summaryText: string;
  };
}

export interface AssistantApplyFailureChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "apply_failure";
  readonly result: {
    readonly code: string;
    readonly message: string;
  };
}

export interface AssistantErrorChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "error";
  readonly content: string;
}

export type ChatMessage =
  | UserChatMessage
  | AssistantPlanChatMessage
  | AssistantAppliedChatMessage
  | AssistantApplyFailureChatMessage
  | AssistantErrorChatMessage;

let chatMessageIdCounter = 0;
export function nextChatMessageId(): ChatMessageId {
  chatMessageIdCounter += 1;
  return `m${chatMessageIdCounter}`;
}

// ─── Bubble wrappers ────────────────────────────────────────────────────────

export function UserBubble({
  kind,
  content,
}: {
  readonly kind: UserChatMessage["kind"];
  readonly content: string;
}) {
  return (
    <div
      data-testid="builder-ai-message-user"
      data-kind={kind}
      className="flex justify-end"
    >
      <div
        className="max-w-[88%] whitespace-pre-wrap rounded-md px-2.5 py-1.5 text-[12.5px] leading-[1.45]"
        style={{
          background: "var(--builder-text)",
          color: "var(--builder-panel)",
          border: "1px solid var(--builder-text)",
        }}
      >
        {content}
      </div>
    </div>
  );
}

export function AssistantBubble({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div
      data-testid="builder-ai-message-assistant"
      className="flex justify-start"
    >
      <div
        className="max-w-[92%] rounded-md px-2.5 py-2 text-[12.5px] leading-[1.45]"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-text)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Plan-result body (latest = full breakdown; older = summary) ───────────

/**
 * The plan-result body. The LATEST plan_result message renders the full
 * AI-11B / AI-20 breakdown (assumptions, needs-input list, unsupported,
 * safety notes, preview, AI-20 callout, not-applyable copy, apply controls)
 * with its full set of back-compat testIds. Older plan_result messages
 * collapse to a one-line summary so they don't fight historical messages
 * for testId space — `intentSummary` is the only field rendered there.
 */
export function PlanResultBody({
  result,
  isLatest,
  applying,
  riskAcknowledged,
  onRiskAcknowledgeChange,
  onApply,
}: {
  readonly result: AiPlanResult;
  readonly isLatest: boolean;
  readonly applying: boolean;
  readonly riskAcknowledged: boolean;
  readonly onRiskAcknowledgeChange: (next: boolean) => void;
  readonly onApply: () => void;
}) {
  if (!isLatest) {
    if (result.ok) {
      return (
        <p
          className="text-xs"
          style={{ color: "var(--builder-muted)" }}
          data-testid="builder-ai-plan-result-previous"
        >
          {result.intentSummary}
        </p>
      );
    }
    return (
      <p
        className="text-xs"
        style={{ color: "var(--builder-muted)" }}
        data-testid="builder-ai-plan-result-previous"
      >
        (previous turn — request didn&rsquo;t parse)
      </p>
    );
  }

  if (!result.ok) {
    return <PlanFailure failure={result} />;
  }

  const planOk = result;
  const preview = planOk.preview;
  const requiresConfirmation = preview?.requiresConfirmation === true;
  const requiredInputCount = planOk.requiredUserInput.length;
  const hasUnresolvedRequiredInput = requiredInputCount > 0;

  // AI-20 apply-readiness gate — service flagged canApplyLater AND no
  // outstanding required input. The (UI) `!appliedOk` check moved into
  // the chat layer: once apply succeeds, an "applied" assistant message
  // is appended, and the message that was the latest plan_result is no
  // longer the latest — so this body still renders Apply only for the
  // active plan turn.
  const showApplyControls =
    planOk.canApplyLater &&
    !!planOk.proposedPatch &&
    !hasUnresolvedRequiredInput;
  const canApply =
    showApplyControls && (!requiresConfirmation || riskAcknowledged) && !applying;
  const showRequiredInputBlock =
    !!planOk.proposedPatch && hasUnresolvedRequiredInput;

  return (
    <div className="flex flex-col gap-2" data-testid="builder-ai-plan-result">
      <p className="text-sm font-medium">{planOk.intentSummary}</p>

      <AiBulletList
        title="Assumptions"
        items={planOk.assumptions}
        testId="builder-ai-assumptions"
      />

      <AiRequiredInputList
        title="More information is needed before this can be built:"
        items={planOk.requiredUserInput}
        testId="builder-ai-needs-input"
        variant="card"
      />

      <AiBulletList
        title="Not supported yet"
        items={planOk.unsupportedRequests}
        testId="builder-ai-unsupported"
      />

      <AiBulletList
        title="Please review"
        items={planOk.safetyNotes}
        testId="builder-ai-safety"
      />

      {preview && <PreviewSection preview={preview} />}

      {showRequiredInputBlock && (
        <p
          className="text-xs"
          data-testid="builder-ai-required-input-block"
          role="status"
          style={{ color: "var(--builder-warn)" }}
        >
          The agent drafted a plan, but{" "}
          {requiredInputCount === 1 ? "one detail is" : "some details are"} still
          missing. Reply with the missing details below and hit{" "}
          <span className="font-medium">Send details</span> — the agent will
          re-plan and won&rsquo;t apply an incomplete patch.
        </p>
      )}

      {!planOk.canApplyLater &&
        !hasUnresolvedRequiredInput &&
        planOk.proposedPatch && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="builder-ai-not-applyable"
          >
            This plan can&rsquo;t be applied as-is — please adjust your request and
            try again.
            {planOk.blockedReason ? ` (${planOk.blockedReason})` : ""}
          </p>
        )}

      {showApplyControls && (
        <div className="flex flex-col gap-2">
          {requiresConfirmation && (
            <label
              className="flex items-start gap-2 text-xs"
              data-testid="builder-ai-risk-ack"
            >
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(e) => onRiskAcknowledgeChange(e.target.checked)}
                data-testid="builder-ai-risk-ack-checkbox"
              />
              <span>
                I understand this is a{" "}
                <span className="font-medium">{preview?.riskLevel}-risk</span>{" "}
                change and want to apply it to my workflow.
              </span>
            </label>
          )}
          <Button
            type="button"
            size="sm"
            variant={requiresConfirmation ? "destructive" : "default"}
            onClick={onApply}
            disabled={!canApply}
            data-testid="builder-ai-apply-button"
          >
            {applying
              ? "Applying…"
              : requiresConfirmation
                ? "Confirm & apply"
                : "Apply change"}
          </Button>
        </div>
      )}
    </div>
  );
}
