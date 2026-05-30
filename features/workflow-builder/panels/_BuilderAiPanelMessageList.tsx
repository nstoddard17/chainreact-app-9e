"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { RequiredInputAnswer } from "../ai";
import {
  AssistantBubble,
  PlanResultBody,
  UserBubble,
  type ChatMessage,
  type ChatMessageId,
} from "./_BuilderAiPanelChat";

/**
 * Scrolling message list for the React Agent chat (Slice 4.AI-21C).
 *
 * Extracted from `BuilderAiPanel.tsx` to keep the panel under the project's
 * max-lines warning threshold. Pure presentational: no hook imports, no API
 * client imports, no state of its own beyond a `listEndRef` for auto-scroll.
 *
 * Owns: the `role="log"` / `aria-live="polite"` scroll container, the intro
 * hint (only when no messages and not busy), per-message rendering via the
 * `_BuilderAiPanelChat` subcomponents, the "Planning your change…"
 * indicator (rendered as an assistant bubble while `planning` is true), the
 * top-level `ai.error` inline copy (401 / 404 nuance — back-compat with
 * AI-11B), and a bottom anchor + auto-scroll effect.
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
  onSubmitDetails,
  canSubmitDetails,
  submittingDetails,
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

      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <UserBubble
              key={message.id}
              kind={message.kind}
              content={message.content}
            />
          );
        }
        if (message.kind === "plan_result") {
          const isLatest = message.id === latestPlanMessageId;
          return (
            <AssistantBubble key={message.id}>
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
            <AssistantBubble key={message.id}>
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
        if (message.kind === "apply_failure") {
          return (
            <AssistantBubble key={message.id}>
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
          <AssistantBubble key={message.id}>
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid="builder-ai-error-message"
            >
              {message.content}
            </p>
          </AssistantBubble>
        );
      })}

      {planning && (
        <AssistantBubble>
          <p
            role="status"
            className="text-xs text-muted-foreground"
            data-testid="builder-ai-planning"
          >
            Planning your change…
          </p>
        </AssistantBubble>
      )}

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
