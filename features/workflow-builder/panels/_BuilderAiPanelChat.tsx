"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  AgentWorkflowDiagnosis,
  AiPlanResult,
  BuilderAgentPersistedMessage,
} from "@/lib/api/ai";
import { AiBulletList, type RequiredInputAnswer } from "../ai";
import { PlanFailure, PreviewSection } from "./_BuilderAiPanelPreview";
import { RequiredInputControlsBlock } from "./_BuilderAiPanelRequiredInputs";

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

/**
 * AI-23 — `persisted: true` flags a message rehydrated from
 * `builder_agent_messages` (workflow-scoped chat history). Persisted
 * plan_result messages render as read-only summaries (no Apply controls)
 * regardless of position in the chat; the latest-plan derivation in
 * `_BuilderAiPanelMessageList.tsx` skips them. The flag is optional /
 * defaults to false so session-local messages keep the legacy shape.
 */
export interface UserChatMessage {
  readonly id: ChatMessageId;
  readonly role: "user";
  /**
   * `action` (Slice 4.AI-DIAG-1b) is a session-local user-gesture marker (e.g.
   * "Check this workflow") that renders as a user bubble but is NOT a planner
   * prompt — the STALE_PATCH re-run scan only picks `prompt`, so `action`
   * markers never become a re-plan source, and they are never persisted.
   */
  readonly kind: "prompt" | "followup" | "action";
  readonly content: string;
  readonly persisted?: boolean;
}

export interface AssistantPlanChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "plan_result";
  readonly result: AiPlanResult;
  readonly persisted?: boolean;
}

export interface AssistantAppliedChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "applied";
  readonly result: {
    readonly summaryText: string;
  };
  readonly persisted?: boolean;
}

export interface AssistantApplyFailureChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "apply_failure";
  readonly result: {
    readonly code: string;
    readonly message: string;
  };
  readonly persisted?: boolean;
}

export interface AssistantErrorChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "error";
  readonly content: string;
  readonly persisted?: boolean;
}

/**
 * Slice 4.AI-DIAG-1b — read-only "Check this workflow" result. Carries the
 * already-sanitized `AgentWorkflowDiagnosis` DTO verbatim (codes / node ids /
 * provider ids+public names / missing-field names / public scope-gap names /
 * stored humanized run classification / safe deterministic text). Session-local
 * only — never persisted (the persistence kind enum has no `diagnosis`).
 */
export interface AssistantDiagnosisChatMessage {
  readonly id: ChatMessageId;
  readonly role: "assistant";
  readonly kind: "diagnosis";
  readonly diagnosis: AgentWorkflowDiagnosis;
  readonly persisted?: boolean;
}

export type ChatMessage =
  | UserChatMessage
  | AssistantPlanChatMessage
  | AssistantAppliedChatMessage
  | AssistantApplyFailureChatMessage
  | AssistantErrorChatMessage
  | AssistantDiagnosisChatMessage;

let chatMessageIdCounter = 0;
export function nextChatMessageId(): ChatMessageId {
  chatMessageIdCounter += 1;
  return `m${chatMessageIdCounter}`;
}

/**
 * AI-23 — convert a persisted message (from `GET /api/workflows/[id]/ai/thread`)
 * into a `ChatMessage` shape the existing list renderer can consume. Persisted
 * plan_results synthesize a minimal `AiPlanSuccess` from `safePayload` —
 * proposedPatch + canApplyLater are intentionally absent, so the Apply path
 * never engages for historical messages even before the latest-plan derivation
 * in the list filter kicks in.
 *
 * Persisted apply_failure / applied / error messages reuse the safePayload
 * fields directly. Anything the persisted record doesn't carry (e.g. the
 * detailed `apply_failure.message`) falls back to a friendly default.
 */
export function persistedMessageToChat(
  p: BuilderAgentPersistedMessage,
): ChatMessage | null {
  const id: ChatMessageId = p.id;
  if (p.role === "user" && (p.kind === "prompt" || p.kind === "followup")) {
    return { id, role: "user", kind: p.kind, content: p.content ?? "", persisted: true };
  }
  if (p.role !== "assistant") return null;
  switch (p.kind) {
    case "plan_result": {
      const payload = p.safePayload ?? {};
      const ok = (payload as { ok?: unknown }).ok === true;
      if (ok) {
        const intentSummary =
          typeof (payload as { intentSummary?: unknown }).intentSummary === "string"
            ? ((payload as { intentSummary: string }).intentSummary)
            : (p.content ?? "");
        const synth: AiPlanResult = {
          ok: true,
          intentSummary,
          assumptions: [],
          requiredUserInput: [],
          unsupportedRequests: [],
          safetyNotes: [],
          canApplyLater: false,
          model: { modelId: "history", tier: "history", feature: "history" },
        };
        return { id, role: "assistant", kind: "plan_result", result: synth, persisted: true };
      }
      const synthFail: AiPlanResult = {
        ok: false,
        code:
          typeof (payload as { code?: unknown }).code === "string"
            ? (payload as { code: string }).code
            : "PARSE_FAILED",
        message: p.content ?? "",
        errors: [],
      };
      return { id, role: "assistant", kind: "plan_result", result: synthFail, persisted: true };
    }
    case "applied": {
      const summaryText =
        typeof (p.safePayload as { summaryText?: unknown }).summaryText === "string"
          ? (p.safePayload as { summaryText: string }).summaryText
          : (p.content ?? "Change applied.");
      return { id, role: "assistant", kind: "applied", result: { summaryText }, persisted: true };
    }
    case "apply_failure": {
      const code =
        typeof (p.safePayload as { code?: unknown }).code === "string"
          ? (p.safePayload as { code: string }).code
          : "UPDATE_FAILED";
      const message = p.content ?? "Couldn’t apply the change.";
      return { id, role: "assistant", kind: "apply_failure", result: { code, message }, persisted: true };
    }
    case "error":
    case "needs_input":
    case "system_notice": {
      return { id, role: "assistant", kind: "error", content: p.content ?? "", persisted: true };
    }
    default:
      return null;
  }
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
  stagedAnswers,
  onStagedAnswerChange,
  onSubmitDetails,
  canSubmitDetails,
  submittingDetails,
}: {
  readonly result: AiPlanResult;
  readonly isLatest: boolean;
  readonly applying: boolean;
  readonly riskAcknowledged: boolean;
  readonly onRiskAcknowledgeChange: (next: boolean) => void;
  readonly onApply: () => void;
  /**
   * AI-22 — staged required-input answers keyed by `requiredInputKey(input)`.
   * Only the LATEST plan_result message renders interactive controls; older
   * collapsed messages don't read this. Passed read-only so the
   * `RequiredInputControl` can read sibling staged answers for dependsOn.
   */
  readonly stagedAnswers: ReadonlyMap<string, RequiredInputAnswer>;
  readonly onStagedAnswerChange: (
    key: string,
    answer: RequiredInputAnswer | undefined,
  ) => void;
  /**
   * Slice 4.REACT-AGENT-CHAT-QOL-1 — submit + enabled/busy state for the
   * inline "Send details" button rendered under the required-input controls.
   * This body only renders controls when `isLatest` is true, so the inline
   * button is exclusive to the active plan turn — historical / persisted
   * plan_results collapse to a summary and never receive it.
   */
  readonly onSubmitDetails: () => void;
  readonly canSubmitDetails: boolean;
  readonly submittingDetails: boolean;
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
  // Slice 4.AI-35 — Apply is gated only by DRAFT-forming requirements.
  // `select_integration` (connect a disconnected provider) is an ACTIVATION
  // concern and must NOT block applying the draft (mirrors the server's
  // `isApplyBlockingRequiredInputKind`). Apply = create/update the draft
  // graph; the builder's activation/readiness validation gates running it.
  const blockingInputs = planOk.requiredUserInput.filter(
    (i) => i.kind !== "select_integration",
  );
  const requiredInputCount = blockingInputs.length;
  const hasUnresolvedRequiredInput = requiredInputCount > 0;

  // AI-20 apply-readiness gate — service flagged canApplyLater AND no
  // outstanding draft-blocking input. The (UI) `!appliedOk` check moved into
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

      {/*
        AI-22 — interactive required-input controls. The latest plan_result
        renders a dropdown (static options) / async picker (optionsSource) /
        text input (free-text fallback) per missing field, plus retains the
        AiRequiredInputList header bullet list for the entries that have
        no field reference (`select_integration`, `clarification`) — the
        controls block only renders for entries with `nodeId+field`.
      */}
      {planOk.requiredUserInput.length > 0 && (
        <RequiredInputControlsBlock
          inputs={planOk.requiredUserInput}
          stagedAnswers={stagedAnswers}
          onStagedAnswerChange={onStagedAnswerChange}
          onSubmitDetails={onSubmitDetails}
          canSubmitDetails={canSubmitDetails}
          submittingDetails={submittingDetails}
        />
      )}

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
