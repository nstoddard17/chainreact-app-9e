"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getWorkflow } from "@/lib/api/workflows";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";
import {
  AssistantBubble,
  PlanResultBody,
  UserBubble,
  nextChatMessageId,
  type ChatMessage,
  type ChatMessageId,
  type UserChatMessage,
} from "./_BuilderAiPanelChat";

/**
 * Builder AI assistant panel — React Agent rail chat (Slice 4.AI-21B).
 *
 * Chat layout: messages scroll above a pinned composer footer; user prompts
 * + follow-up answers render as user bubbles, plan results / errors / apply
 * outcomes render as assistant bubbles. The latest assistant plan_result
 * hosts the existing AI-11B / AI-20 assumptions / needs-input / preview /
 * risk-ack / Apply UI verbatim (same testIds — full back-compat); older
 * plan_results collapse to `intentSummary`. Subcomponents + chat message
 * types live in the sibling [`_BuilderAiPanelChat.tsx`](./_BuilderAiPanelChat.tsx).
 *
 * Scope guardrail — workflow-builder React Agent only. NOT the general
 * app help assistant. NO DB persistence (session-local message state).
 * The follow-up prompt is still sent through `POST /api/workflows/[id]/ai/plan`
 * unchanged. All AI-11B / AI-20 / AI-21 no-leak / apply-readiness / no-auto-
 * apply / strict-schema invariants are preserved.
 */

const MAX_PROMPT_LENGTH = 8_000;
const COUNTER_THRESHOLD = Math.floor(MAX_PROMPT_LENGTH * 0.8);

export function BuilderAiPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const hydrate = useGraphSlice((s) => s.hydrate);
  const [prompt, setPrompt] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const listEndRef = useRef<HTMLDivElement>(null);

  const ai = useBuilderAi({
    workflowId,
    onApplied: async () => {
      if (!workflowId) return;
      try {
        const detail = await getWorkflow(workflowId);
        hydrate(workflowId, detail.draftDefinition);
      } catch {
        // Best-effort refresh — the apply already succeeded server-side.
      }
    },
  });

  // Auto-scroll to the bottom whenever the message list grows or the agent
  // status transitions (planning / applying / planned / applied). JSDOM
  // doesn't implement `scrollIntoView` — guard the call so unit tests don't
  // need to polyfill.
  useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, ai.status]);

  if (!workflowId) return null;

  const trimmed = prompt.trim();
  const planning = ai.status === "planning";
  const applying = ai.status === "applying";
  const busy = planning || applying;
  const tooLong = prompt.length > MAX_PROMPT_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !busy;
  const followUpMode = ai.followUpMode;
  const hasMessages = messages.length > 0;

  // The latest plan_result message owns the full breakdown (assumptions,
  // needs-input, preview, apply controls) AND the back-compat testIds.
  // Older plan_results collapse to their `intentSummary`.
  let latestPlanMessageId: ChatMessageId | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.kind === "plan_result") {
      latestPlanMessageId = m.id;
      break;
    }
  }

  function appendMessage(message: ChatMessage): void {
    setMessages((prev) => [...prev, message]);
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setRiskAcknowledged(false);
    const content = trimmed;
    const userKind: UserChatMessage["kind"] = followUpMode ? "followup" : "prompt";
    appendMessage({
      id: nextChatMessageId(),
      role: "user",
      kind: userKind,
      content,
    });
    // Clear the composer immediately so the user-message bubble is the
    // single live view of their input while the agent works — same UX as
    // any normal chat. Per AI-21B this replaces the AI-11B "keep prompt
    // after planning" behavior; Clear is now the way to reset state.
    setPrompt("");

    const result = followUpMode
      ? await ai.submitFollowUp(content)
      : await ai.plan(content);

    if (result === null) {
      // Transport-layer failure. The hook also surfaces `ai.error`; we
      // additionally append an assistant error bubble so the failure has
      // a stable place in the conversation.
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "error",
        // The hook owns the friendly message; we re-derive a generic
        // fallback here because the user-supplied `prompt` /
        // requiredInput labels never reach this branch.
        content: "The AI assistant is unavailable right now. Please try again in a moment.",
      });
      return;
    }
    appendMessage({
      id: nextChatMessageId(),
      role: "assistant",
      kind: "plan_result",
      result,
    });
  }

  async function handleApply(): Promise<void> {
    const result = await ai.apply();
    if (result === null) return; // transport error — `ai.error` flips, no message appended for this branch (avoids double-render with the standard error path)
    if (result.ok) {
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "applied",
        result,
      });
    } else {
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "apply_failure",
        result,
      });
    }
  }

  async function handleRerunPlan(): Promise<void> {
    // AI-21B STALE_PATCH recovery — re-plan from the most recent "prompt"
    // user message in the chat history (not whatever happens to be in the
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
    const result = await ai.plan(originalUserPrompt);
    if (result === null) {
      appendMessage({
        id: nextChatMessageId(),
        role: "assistant",
        kind: "error",
        content: "The AI assistant is unavailable right now. Please try again in a moment.",
      });
      return;
    }
    appendMessage({
      id: nextChatMessageId(),
      role: "assistant",
      kind: "plan_result",
      result,
    });
  }

  function handleClear(): void {
    // AI-21B — Clear resets the whole conversation: messages, composer
    // text, risk-ack, and hook chain state. "Plan another change" calls
    // this same handler post-apply for the same reason.
    setRiskAcknowledged(false);
    setMessages([]);
    setPrompt("");
    ai.reset();
  }

  return (
    <section
      aria-label="AI assistant"
      data-testid="builder-ai-panel"
      className="flex h-full min-h-0 flex-col gap-2"
      style={{ color: "var(--builder-text)" }}
    >
      {/* Message list — scrolls independently above the pinned composer. */}
      <div
        data-testid="builder-ai-message-list"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pt-1"
      >
        {!hasMessages && !busy && (
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
                  onRiskAcknowledgeChange={setRiskAcknowledged}
                  onApply={handleApply}
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
                      onClick={handleClear}
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
                        onClick={handleRerunPlan}
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

        {/* Top-level transport error (e.g. 401/404) — back-compat with
            the AI-11B inline error rendering. The assistant error bubble
            (above) covers the chat copy; this surfaces the friendly
            sign-in / not-found copy without duplicating into messages. */}
        {ai.error && (
          <p
            role="alert"
            className="px-1 text-xs text-destructive"
            data-testid="builder-ai-error"
          >
            {ai.error}
          </p>
        )}

        <div ref={listEndRef} aria-hidden />
      </div>

      {/* Composer — pinned bottom. */}
      <footer
        data-testid="builder-ai-composer"
        className="shrink-0 flex flex-col gap-1"
      >
        {hasMessages && !busy ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClear}
              data-testid="builder-ai-clear-button"
              className="h-6 px-2 text-[11px]"
            >
              Clear conversation
            </Button>
          </div>
        ) : null}

        <div
          className="flex flex-col gap-0 rounded-md"
          style={{
            background: "var(--builder-panel-2)",
            border: "1px solid var(--builder-border)",
          }}
        >
          <Textarea
            aria-label={
              followUpMode
                ? "Reply with the missing details"
                : "Describe the workflow change"
            }
            data-testid="builder-ai-prompt"
            placeholder={
              followUpMode
                ? "Reply with the missing details — e.g. ‘Use #general and say Test from ChainReact AI.’"
                : "Describe a change — e.g. ‘retry once on 5xx, then DM #oncall’"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            maxLength={MAX_PROMPT_LENGTH + 100}
            aria-invalid={tooLong || undefined}
            rows={3}
            className="resize-none border-0 bg-transparent text-[12.5px] leading-[1.45] shadow-none focus-visible:ring-0"
          />
          <div
            className="flex items-center justify-between gap-2 px-2 pb-2 pt-1"
            style={{ borderTop: "0" }}
          >
            <span
              className="builder-mono text-[10.5px]"
              style={{ color: "var(--builder-muted)" }}
            >
              <kbd
                className="rounded-[3px] px-1.5 py-px text-[9.5px]"
                style={{
                  background: "var(--builder-panel)",
                  border: "1px solid var(--builder-border)",
                  color: "var(--builder-muted)",
                }}
              >
                ⌘
              </kbd>
              <kbd
                className="ml-0.5 rounded-[3px] px-1.5 py-px text-[9.5px]"
                style={{
                  background: "var(--builder-panel)",
                  border: "1px solid var(--builder-border)",
                  color: "var(--builder-muted)",
                }}
              >
                ↵
              </kbd>
              <span className="ml-1.5">{followUpMode ? "send" : "plan"}</span>
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              data-testid="builder-ai-plan-button"
              className="h-7 px-2.5 text-[12px]"
              style={{
                background: "var(--builder-text)",
                color: "var(--builder-panel)",
                border: "1px solid var(--builder-text)",
              }}
            >
              {planning ? "Thinking…" : followUpMode ? "Send details" : "Plan with AI"}
            </Button>
          </div>
        </div>

        {(prompt.length >= COUNTER_THRESHOLD || tooLong) && (
          <p
            data-testid="builder-ai-char-count"
            className="builder-mono px-1 text-[11px]"
            style={{
              color: tooLong ? "var(--builder-danger)" : "var(--builder-muted)",
            }}
          >
            {prompt.length}/{MAX_PROMPT_LENGTH}
            {tooLong ? " — too long, please shorten your request." : ""}
          </p>
        )}
      </footer>
    </section>
  );
}
