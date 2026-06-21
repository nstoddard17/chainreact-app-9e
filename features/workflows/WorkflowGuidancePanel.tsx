"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
  type GuidanceConversationTurn,
} from "@/contracts/aiGuidance";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { requestWorkflowGuidance } from "@/lib/api/ai/guidance";
import { GuidancePlanSection, GuidancePreviewSection } from "./GuidanceSuggestionSections";

/**
 * "Build with me" — advisory Hermes Agent workflow guidance (HERMES-AGENT-GUIDANCE-UI).
 *
 * Two modes, ONE governed path. Both call ONLY the ChainReact route
 * `POST /api/accounts/[id]/ai/workflow-guidance` through the `requestWorkflowGuidance` helper — never
 * the Render gateway / a model vendor / Nous / the private Hermes Agent, and never a token. Neither
 * mode creates, changes, applies, saves, or runs a workflow.
 *
 *   - SINGLE-SHOT (default; the dashboard "Build with me"): one goal → one guidance result + optional
 *     review-only plan / non-applied preview (HERMES-AGENT-PLAN-EXTRACTION / -DRAFT-PREVIEW).
 *   - CONVERSATIONAL (`conversational`, the builder rail; HERMES-AGENT-BUILDER-RAIL-CHAT-MODE): a
 *     session-scoped message list. A follow-up sends the prior turns as sanitized `recentTurns` so
 *     Hermes answers in context. Conversation is in-memory only — NOT persisted, no durable memory.
 *     Only the LATEST assistant turn's preview is actionable ("Show on canvas"); a newer preview
 *     supersedes the prior pending one. Apply / Discard live in the builder's canvas overlay (explicit,
 *     local-draft only) — this panel never applies/saves.
 */

const GOAL_PLACEHOLDER =
  "Example: When a new lead comes in, remind me to follow up if I have not heard back in 3 days.";
const CHAT_PLACEHOLDER = "Describe what to add or change. For example: add a Slack message after the trigger.";
const UNAVAILABLE_MESSAGE = "AI workflow guidance is temporarily unavailable.";
const MAX_GOAL_LENGTH = 2_000;

type Status = "idle" | "loading" | "done" | "error";

/** Narrow the route's `workflowPlan` to a renderable plan with at least one step (else null). */
function asRenderablePlan(value: WorkflowPlan | null | undefined): WorkflowPlan | null {
  if (!value || typeof value !== "object") return null;
  return Array.isArray(value.steps) && value.steps.length > 0 ? value : null;
}

/** Narrow the route's `previewDraft` to a renderable preview with at least one node (else null). */
function asRenderablePreview(value: DraftPreview | null | undefined): DraftPreview | null {
  if (!value || typeof value !== "object") return null;
  return Array.isArray(value.nodes) && value.nodes.length > 0 ? value : null;
}

/** Map an unavailable/transport outcome to safe copy (credits denial keeps its specific message). */
function safeErrorMessage(res: { code: string; message: string } | null): string {
  if (res && res.code === "AI_CREDITS_EXHAUSTED") return res.message;
  return UNAVAILABLE_MESSAGE;
}

/** HERMES-AGENT-BUILDER-RAIL-ENTER-TO-SEND — Enter submits; Shift+Enter newlines; IME composition never submits. `submit` already guards empty/whitespace + loading. */
function submitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>, submit: () => void): void {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    submit();
  }
}

export interface WorkflowGuidancePanelProps {
  /** Account scope for the request (resolved server-side / from router context). */
  readonly accountId: string;
  /** Optional builder-context workflow id; only included when present. */
  readonly workflowId?: string;
  /**
   * Builder-only (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY / -APPLY-PREVIEW-PATCH): when provided, the
   * preview section gains a "Show on canvas" control that hands BOTH the capability-validated
   * `WorkflowPlan` (the apply source of truth) and the display `DraftPreview` to the builder's
   * non-applied canvas overlay. Absent on the dashboard (no canvas) → no such control. Showing the
   * overlay NEVER applies/creates/mutates a workflow; an explicit "Apply preview" in the overlay does
   * the additive local-draft edit.
   */
  readonly onPreviewToCanvas?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — render the session-scoped conversational rail (message list
   * + bottom input + recent-conversation context) instead of the single-shot form. Default false keeps
   * the dashboard "Build with me" behavior byte-identical.
   */
  readonly conversational?: boolean;
}

export function WorkflowGuidancePanel(props: WorkflowGuidancePanelProps) {
  return props.conversational ? (
    <ConversationalGuidancePanel {...props} />
  ) : (
    <SingleShotGuidancePanel {...props} />
  );
}

/** The original single-shot "Build with me" form (dashboard). Behavior unchanged. */
function SingleShotGuidancePanel({ accountId, workflowId, onPreviewToCanvas }: WorkflowGuidancePanelProps) {
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [guidanceText, setGuidanceText] = useState("");
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const trimmed = goal.trim();
  const canSubmit = trimmed.length > 0 && status !== "loading";

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setStatus("loading");
    setErrorMessage("");
    setGuidanceText("");
    setPlan(null);
    setPreview(null);
    try {
      const res = await requestWorkflowGuidance({
        accountId,
        goalText: trimmed,
        ...(workflowId ? { workflowId } : {}),
      });
      if (res.ok) {
        setGuidanceText(res.guidanceText);
        setPlan(asRenderablePlan(res.workflowPlan));
        setPreview(asRenderablePreview(res.previewDraft));
        setStatus("done");
      } else {
        setErrorMessage(safeErrorMessage(res));
        setStatus("error");
      }
    } catch {
      setErrorMessage(UNAVAILABLE_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <section
      data-testid="workflow-guidance-panel"
      aria-label="Build with me"
      className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Build with me</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Describe what you want to automate and I&apos;ll help you figure out the workflow.
      </p>

      <div className="mt-3">
        <Label htmlFor="workflow-guidance-goal" className="text-neutral-700 dark:text-neutral-300">
          Your automation goal
        </Label>
        <Textarea
          id="workflow-guidance-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => submitOnEnter(e, handleSubmit)}
          placeholder={GOAL_PLACEHOLDER}
          rows={3}
          maxLength={MAX_GOAL_LENGTH}
          disabled={status === "loading"}
          className="mt-1"
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="workflow-guidance-submit"
        >
          {status === "loading" ? "Thinking…" : "Get guidance"}
        </Button>
      </div>

      {status === "error" && (
        <p
          role="alert"
          data-testid="workflow-guidance-error"
          className="mt-3 text-sm text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </p>
      )}

      {status === "done" && guidanceText.length > 0 && (
        <div data-testid="workflow-guidance-result" className="mt-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Guidance</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {guidanceText}
          </p>
        </div>
      )}

      {status === "done" && plan && !preview && <GuidancePlanSection plan={plan} />}

      {status === "done" && preview && (
        <GuidancePreviewSection
          preview={preview}
          plan={plan}
          {...(onPreviewToCanvas ? { onPreviewToCanvas } : {})}
        />
      )}
    </section>
  );
}

type ChatMessage =
  | { readonly id: string; readonly role: "user"; readonly text: string }
  | {
      readonly id: string;
      readonly role: "assistant";
      readonly text: string;
      readonly plan: WorkflowPlan | null;
      readonly preview: DraftPreview | null;
    }
  | { readonly id: string; readonly role: "error"; readonly text: string };

/** Build the sanitized, bounded recent-conversation context from prior plain-text turns. */
function toRecentTurns(messages: readonly ChatMessage[]): GuidanceConversationTurn[] {
  return messages
    .filter((m): m is Extract<ChatMessage, { role: "user" | "assistant" }> => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_GUIDANCE_CONVERSATION_TURN_TEXT) }))
    .filter((t) => t.text.trim().length > 0)
    .slice(-MAX_GUIDANCE_CONVERSATION_TURNS);
}

/** Session-scoped conversational rail. In-memory only — never persisted (no durable memory). */
function ConversationalGuidancePanel({ accountId, workflowId, onPreviewToCanvas }: WorkflowGuidancePanelProps) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const nextId = useRef(0);
  const makeId = () => String(nextId.current++);

  const trimmed = input.trim();
  const canSend = trimmed.length > 0 && !loading;

  // Only the most recent assistant turn's preview/plan is actionable — a newer preview supersedes the
  // prior pending one (the older messages stay in the transcript as text).
  let latestAssistantId: string | null = null;
  for (const m of messages) if (m.role === "assistant") latestAssistantId = m.id;

  async function handleSend(): Promise<void> {
    if (!canSend) return;
    const goalText = trimmed;
    // Prior turns (before appending this one) become the sanitized recent-conversation context.
    const recentTurns = toRecentTurns(messages);
    setMessages((prev) => [...prev, { id: makeId(), role: "user", text: goalText }]);
    setInput("");
    setLoading(true);
    try {
      const res = await requestWorkflowGuidance({
        accountId,
        goalText,
        ...(workflowId ? { workflowId } : {}),
        ...(recentTurns.length ? { recentTurns } : {}),
      });
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            text: res.guidanceText,
            plan: asRenderablePlan(res.workflowPlan),
            preview: asRenderablePreview(res.previewDraft),
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { id: makeId(), role: "error", text: safeErrorMessage(res) }]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: makeId(), role: "error", text: UNAVAILABLE_MESSAGE }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      data-testid="workflow-guidance-panel"
      aria-label="Build with me"
      className="flex h-full min-h-0 flex-col rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div>
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Build with me</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Describe what you want to automate. I can suggest steps, show a preview on the canvas, and
          add them to your draft when you choose Apply. You stay in control before saving or
          activating.
        </p>
      </div>

      <div data-testid="workflow-guidance-messages" className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} data-testid="workflow-guidance-message-user" className="text-sm">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">You: </span>
                <span className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">{m.text}</span>
              </div>
            );
          }
          if (m.role === "error") {
            return (
              <p
                key={m.id}
                role="alert"
                data-testid="workflow-guidance-error"
                className="text-sm text-red-700 dark:text-red-300"
              >
                {m.text}
              </p>
            );
          }
          const isLatest = m.id === latestAssistantId;
          return (
            <div key={m.id} data-testid="workflow-guidance-message-assistant">
              {m.text.length > 0 && (
                <div data-testid="workflow-guidance-result">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">React: </span>
                  <span className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                    {m.text}
                  </span>
                </div>
              )}
              {/* Only the latest assistant turn's preview/plan is actionable (supersedes prior). */}
              {isLatest && m.plan && !m.preview && <GuidancePlanSection plan={m.plan} />}
              {isLatest && m.preview && (
                <GuidancePreviewSection
                  preview={m.preview}
                  plan={m.plan}
                  {...(onPreviewToCanvas ? { onPreviewToCanvas } : {})}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <Label htmlFor="workflow-guidance-goal" className="sr-only">
          Message React
        </Label>
        <Textarea
          id="workflow-guidance-goal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => submitOnEnter(e, handleSend)}
          placeholder={CHAT_PLACEHOLDER}
          rows={2}
          maxLength={MAX_GOAL_LENGTH}
          disabled={loading}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" onClick={handleSend} disabled={!canSend} data-testid="workflow-guidance-submit">
            {loading ? "Thinking…" : "Send"}
          </Button>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Enter to send · Shift+Enter for a new line</span>
        </div>
      </div>
    </section>
  );
}
