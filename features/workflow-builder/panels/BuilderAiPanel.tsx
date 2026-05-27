"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearBuilderAgentThread,
  getBuilderAgentThread,
  type CurrentGraphSnapshot,
} from "@/lib/api/ai";
import { getWorkflow } from "@/lib/api/workflows";
import type { RequiredInputAnswer } from "../ai";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";
import {
  nextChatMessageId,
  persistedMessageToChat,
  type ChatMessage,
  type UserChatMessage,
} from "./_BuilderAiPanelChat";
import {
  buildApplyFailureSafePayload,
  buildApplySuccessSafePayload,
  buildPlanResultSafePayload,
  persistMessageBestEffort,
} from "./_builderAgentPersistence";
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
 * app help assistant.
 *
 * Slice 4.AI-23 — workflow-scoped persistent chat history. On `workflowId`
 * change the panel loads the prior thread from
 * `GET /api/workflows/[id]/ai/thread`, rehydrates each persisted message
 * via `persistedMessageToChat`, and renders them as read-only summaries
 * (historical plan_results never own Apply controls — see
 * `_BuilderAiPanelMessageList.tsx`). New session messages (prompt,
 * follow-up, plan_result, applied, apply_failure, error) are saved via
 * `appendBuilderAgentMessage`; Clear conversation also DELETEs the
 * persisted thread. Persistence is fail-open — an API failure logs at warn
 * but never blocks planning / applying. NO raw proposedPatch / config /
 * secrets are ever persisted (server sanitizer + client allowlist).
 *
 * The follow-up prompt is still sent through `POST /api/workflows/[id]/ai/plan`
 * unchanged. All AI-11B / AI-20 / AI-21 / AI-21B no-leak / apply-readiness /
 * no-auto-apply / strict-schema invariants preserved.
 */

export function BuilderAiPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const hydrate = useGraphSlice((s) => s.hydrate);
  // AI-24 — the planner needs the CURRENT canvas (pending / unsaved), not
  // the server-saved `draftDefinition` (which lags after a local delete).
  // Project the slice's pendingNodes/pendingEdges into a value-free snapshot
  // and pass it on every plan / follow-up call so the planner never reasons
  // against stale graph state.
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const [prompt, setPrompt] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  // AI-24 — value-free projection of the pending canvas for the planner.
  // provider:type pairs + edges only; NO config, NO position, NO secrets.
  const currentGraph = useMemo<CurrentGraphSnapshot>(
    () => ({
      nodes: pendingNodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        provider: n.provider,
        type: n.type,
      })),
      edges: pendingEdges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
    }),
    [pendingNodes, pendingEdges],
  );

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

  // AI-23 — load persisted thread on workflowId change. Fail-open: a network
  // / auth failure leaves `messages` empty so the user sees a fresh chat
  // (rather than a blocking error). The hasLoadedRef guard prevents a
  // double-fetch from React 18's strict-mode mount/unmount + Suspense.
  const loadedForWorkflowRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workflowId) return;
    if (loadedForWorkflowRef.current === workflowId) return;
    loadedForWorkflowRef.current = workflowId;
    let cancelled = false;
    (async () => {
      try {
        const res = await getBuilderAgentThread(workflowId);
        if (cancelled) return;
        const rehydrated = res.messages
          .map(persistedMessageToChat)
          .filter((m): m is ChatMessage => m !== null);
        if (rehydrated.length > 0) setMessages(rehydrated);
      } catch (err) {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn("Builder Agent thread load failed:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  if (!workflowId) return null;
  // After the guard `workflowId` is known non-null, but TS doesn't propagate
  // the narrowing into the handler closures below. Capture it into a typed
  // local so the AI-23 persistence helpers don't need a non-null assertion.
  const wfId: string = workflowId;

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

  function handleClear(): void {
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
    ai.reset();
    void clearBuilderAgentThread(wfId).catch((err) => {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("Builder Agent thread clear failed:", err);
      }
    });
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
