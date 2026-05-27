"use client";

import { useState } from "react";
import { getWorkflow } from "@/lib/api/workflows";
import type { RequiredInputAnswer } from "../ai";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";
import {
  nextChatMessageId,
  type ChatMessage,
  type UserChatMessage,
} from "./_BuilderAiPanelChat";
import { BuilderAiPanelComposer } from "./_BuilderAiPanelComposer";
import { BuilderAiPanelMessageList } from "./_BuilderAiPanelMessageList";

/**
 * Builder AI assistant panel — React Agent rail chat (Slice 4.AI-21B,
 * component-split in 4.AI-21C).
 *
 * Chat layout: messages scroll above a pinned composer footer; user prompts
 * + follow-up answers render as user bubbles, plan results / errors / apply
 * outcomes render as assistant bubbles. The latest assistant plan_result
 * hosts the existing AI-11B / AI-20 assumptions / needs-input / preview /
 * risk-ack / Apply UI verbatim (same testIds — full back-compat); older
 * plan_results collapse to `intentSummary`.
 *
 * AI-21C split the rendering into three siblings to keep this orchestration
 * file under the project's max-lines warning threshold:
 *   - [`_BuilderAiPanelMessageList.tsx`](./_BuilderAiPanelMessageList.tsx) —
 *     scroll container + per-message rendering + auto-scroll.
 *   - [`_BuilderAiPanelComposer.tsx`](./_BuilderAiPanelComposer.tsx) — pinned
 *     composer footer + Clear button + char counter.
 *   - [`_BuilderAiPanelChat.tsx`](./_BuilderAiPanelChat.tsx) — chat-message
 *     types + bubble wrappers + `PlanResultBody`.
 *
 * Scope guardrail — workflow-builder React Agent only. NOT the general
 * app help assistant. NO DB persistence (session-local message state).
 * The follow-up prompt is still sent through `POST /api/workflows/[id]/ai/plan`
 * unchanged. All AI-11B / AI-20 / AI-21 / AI-21B no-leak / apply-readiness /
 * no-auto-apply / strict-schema invariants preserved.
 */

export function BuilderAiPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const hydrate = useGraphSlice((s) => s.hydrate);
  const [prompt, setPrompt] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  // AI-22 — staged required-input answers from the interactive controls.
  // Keyed by `requiredInputKey(input)` (i.e. `nodeId::field`). Drained
  // into the structured follow-up on submit; cleared on Clear / Plan-another.
  const [stagedAnswers, setStagedAnswers] = useState<
    ReadonlyMap<string, RequiredInputAnswer>
  >(() => new Map());

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

  if (!workflowId) return null;

  const trimmed = prompt.trim();
  const planning = ai.status === "planning";
  const applying = ai.status === "applying";
  const busy = planning || applying;
  const followUpMode = ai.followUpMode;
  const hasMessages = messages.length > 0;

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
    setRiskAcknowledged(false);
    // AI-22 — gather any staged required-input answers from the interactive
    // controls. They're cleared synchronously here so the user message bubble
    // (which renders them as part of its display text) doesn't render twice.
    const stagedSnapshot = Array.from(stagedAnswers.values());
    const hasStagedAnswers = stagedSnapshot.length > 0;
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
    setPrompt("");

    const result = followUpMode
      ? await ai.submitFollowUp({
          freeText: composerContent,
          structuredAnswers: stagedSnapshot,
        })
      : await ai.plan(composerContent);

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

  async function handleApply(): Promise<void> {
    const result = await ai.apply();
    if (result === null) return;
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
    // Clear resets the whole conversation: messages, composer text,
    // risk-ack, the hook chain state, AND the staged required-input
    // answers (AI-22). "Plan another change" calls this same handler
    // post-apply for the same reason.
    setRiskAcknowledged(false);
    setMessages([]);
    setPrompt("");
    setStagedAnswers(new Map());
    ai.reset();
  }

  /**
   * AI-22 — build the user-message bubble's display text from the
   * composer's free-text + any staged required-input answers. Renders
   * structured answers as a labeled list under the typed text (or alone
   * when no free text was provided). Pure presentation — the actual
   * planner-side prompt is constructed by `composeFollowUpPrompt`.
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

  return (
    <section
      aria-label="AI assistant"
      data-testid="builder-ai-panel"
      className="flex h-full min-h-0 flex-col gap-2"
      style={{ color: "var(--builder-text)" }}
    >
      <BuilderAiPanelMessageList
        messages={messages}
        aiError={ai.error}
        planning={planning}
        applying={applying}
        busy={busy}
        hasMessages={hasMessages}
        riskAcknowledged={riskAcknowledged}
        onRiskAcknowledgeChange={setRiskAcknowledged}
        onApply={handleApply}
        onRerunPlan={handleRerunPlan}
        onReset={handleClear}
        aiStatus={ai.status}
        stagedAnswers={stagedAnswers}
        onStagedAnswerChange={handleStagedAnswerChange}
      />
      <BuilderAiPanelComposer
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleSubmit}
        onClear={handleClear}
        followUpMode={followUpMode}
        planning={planning}
        busy={busy}
        hasMessages={hasMessages}
        hasStagedAnswers={stagedAnswers.size > 0}
      />
    </section>
  );
}
