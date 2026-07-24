"use client";

import { useCallback, useRef, useState } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
  type GuidanceConversationTurn,
  type GuidanceOfficialTemplateMatch,
} from "@/contracts/aiGuidance";
import { requestWorkflowGuidance } from "@/lib/api/ai/guidance";
import {
  buildAgentReviewGoalText,
  composeCheckWorkflowReview,
  looksLikeRawJson,
  type CheckWorkflowReviewContext,
  type CheckWorkflowSetupTarget,
} from "@/core/workflows/checkWorkflowReview";
import { stripFencedJsonBlocks } from "@/core/workflows/stripFencedJsonBlocks";
import {
  CHECK_WORKFLOW_PROMPT,
  UNAVAILABLE_MESSAGE,
  asRenderablePlan,
  asRenderablePreview,
  safeErrorMessage,
} from "./guidancePanelShared";

/**
 * The ONE React Agent conversation (DOC-REACT-AGENT-1).
 *
 * Extracted VERBATIM from `ConversationalGuidancePanel` so the identical
 * conversation — same messages, same governed `requestWorkflowGuidance` call,
 * same deterministic Check-workflow review, same proposal payloads — can be
 * rendered by MORE THAN ONE presentation without becoming more than one agent:
 *
 *   - the Visual builder's left rail (`BuilderGuidanceRail`), and
 *   - the Document builder's bottom agent workspace.
 *
 * This is a code move, NOT a second store. `WorkflowBuilder` owns a single
 * instance and hands it to whichever surface is mounted, so switching
 * Visual ↔ Document keeps the transcript, the in-flight request, and the
 * pending proposal intact even though the presenting component remounts.
 * When no conversation is passed in, the panel creates its own (unchanged
 * behaviour for the dashboard and for existing tests).
 *
 * Network: still ONLY `POST /api/accounts/[id]/ai/workflow-guidance` via the
 * `requestWorkflowGuidance` helper. Nothing here applies, saves, activates or
 * runs anything — Apply stays an explicit action in the builder's overlay.
 */

export type GuidanceChatMessage =
  | { readonly id: string; readonly role: "user"; readonly text: string }
  | {
      readonly id: string;
      readonly role: "assistant";
      readonly text: string;
      readonly plan: WorkflowPlan | null;
      readonly preview: DraftPreview | null;
      /** CHECKPOINTS-1 — the goal that produced this turn, so an Apply can name the checkpoint. */
      readonly prompt?: string;
      /** HERMES-AGENT-WORKFLOW-EDITOR — for an EDIT proposal, the validated end-state graph. */
      readonly proposedDefinition?: WorkflowDefinition | null;
      /** HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the draft version the proposal is pinned to. */
      readonly baseGraphVersion?: string | null;
      readonly warnings?: readonly string[];
      readonly officialTemplateMatches?: readonly GuidanceOfficialTemplateMatch[];
    }
  | {
      readonly id: string;
      readonly role: "review";
      readonly text: string;
      readonly setupTargets: readonly CheckWorkflowSetupTarget[];
    }
  | { readonly id: string; readonly role: "error"; readonly text: string };

/** Request context the conversation needs at send time (read lazily, never subscribed). */
export interface GuidanceConversationContext {
  readonly accountId: string;
  readonly workflowId?: string | undefined;
  readonly getCurrentDraft?: (() => WorkflowDefinition) | undefined;
  readonly getCheckReviewContext?: (() => CheckWorkflowReviewContext) | undefined;
}

export interface GuidanceConversation {
  readonly messages: readonly GuidanceChatMessage[];
  readonly input: string;
  readonly loading: boolean;
  setInput(next: string | ((current: string) => string)): void;
  /** Send an explicit goal (defaults to the composer's trimmed input). */
  send(goalText?: string): Promise<void>;
  /** Instant, LOCAL, deterministic workflow review — no LLM, no credits. */
  checkWorkflow(context: GuidanceConversationContext): void;
  /** The explicit, opt-in AI follow-up to a deterministic review. */
  askDeeper(context: GuidanceConversationContext): Promise<void>;
  /** The id of the newest assistant turn (only that turn's proposal is actionable). */
  readonly latestAssistantId: string | null;
  /** The id of the newest deterministic review turn. */
  readonly latestReviewId: string | null;
}

/** Build the sanitized, bounded recent-conversation context from prior plain-text turns. */
export function toRecentTurns(
  messages: readonly GuidanceChatMessage[],
): GuidanceConversationTurn[] {
  return messages
    .filter(
      (m): m is Extract<GuidanceChatMessage, { role: "user" | "assistant" }> =>
        m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_GUIDANCE_CONVERSATION_TURN_TEXT) }))
    .filter((t) => t.text.trim().length > 0)
    .slice(-MAX_GUIDANCE_CONVERSATION_TURNS);
}

/**
 * Create the single conversation. `context` is read through a ref at call time,
 * so the returned callbacks stay referentially stable while always sending the
 * CURRENT draft / validation snapshot.
 */
export function useGuidanceConversation(
  context: GuidanceConversationContext,
): GuidanceConversation {
  const [messages, setMessages] = useState<readonly GuidanceChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const nextId = useRef(0);
  const makeId = () => String(nextId.current++);

  const ctxRef = useRef(context);
  ctxRef.current = context;
  // `send` reads the composer through a ref so callers can fire it with an
  // explicit goal (the Document composer) without a stale-closure race.
  const inputRef = useRef(input);
  inputRef.current = input;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  // Read the transcript at send time without making the callbacks change identity.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const send = useCallback(async (goalTextInput?: string): Promise<void> => {
    const goalText = (goalTextInput ?? inputRef.current).trim();
    if (goalText.length === 0 || loadingRef.current) return;
    const ctx = ctxRef.current;
    // Prior turns (before appending this one) become the recent-conversation context.
    const recentTurns = toRecentTurns(messagesRef.current);
    const currentDraft = ctx.getCurrentDraft?.();
    setMessages((prev) => [...prev, { id: makeId(), role: "user", text: goalText }]);
    setInput("");
    setLoading(true);
    try {
      const res = await requestWorkflowGuidance({
        accountId: ctx.accountId,
        goalText,
        ...(ctx.workflowId ? { workflowId: ctx.workflowId } : {}),
        ...(recentTurns.length ? { recentTurns } : {}),
        ...(currentDraft && currentDraft.nodes.length ? { currentDraft } : {}),
      });
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            // Defensive: strip any fenced JSON/operation block so raw model JSON never renders.
            text: stripFencedJsonBlocks(res.guidanceText) || res.guidanceText,
            plan: asRenderablePlan(res.workflowPlan),
            preview: asRenderablePreview(res.previewDraft),
            prompt: goalText,
            ...(res.proposedDefinition ? { proposedDefinition: res.proposedDefinition } : {}),
            ...(res.baseGraphVersion ? { baseGraphVersion: res.baseGraphVersion } : {}),
            ...(res.warnings && res.warnings.length ? { warnings: res.warnings } : {}),
            ...(res.officialTemplateMatches && res.officialTemplateMatches.length
              ? { officialTemplateMatches: res.officialTemplateMatches }
              : {}),
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
    // makeId is stable (ref-backed); messages are read through messagesRef.
  }, []);

  const checkWorkflow = useCallback((ctx: GuidanceConversationContext): void => {
    if (loadingRef.current || !ctx.getCheckReviewContext) return;
    const review = ctx.getCheckReviewContext();
    const text = composeCheckWorkflowReview({
      summary: review.summary,
      blockingIssueCount: review.blockingIssueCount,
      issueMessages: review.issueMessages,
      agentText: null, // deterministic — no model output is folded into the default review
    });
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "review", text, setupTargets: review.setupTargets },
    ]);
  }, []);

  const askDeeper = useCallback(async (ctx: GuidanceConversationContext): Promise<void> => {
    if (loadingRef.current || !ctx.getCheckReviewContext) return;
    const review = ctx.getCheckReviewContext();
    const requestGoalText = buildAgentReviewGoalText(CHECK_WORKFLOW_PROMPT, review);
    const recentTurns = toRecentTurns(messagesRef.current);
    const currentDraft = ctx.getCurrentDraft?.();
    setLoading(true);
    try {
      const res = await requestWorkflowGuidance({
        accountId: ctx.accountId,
        goalText: requestGoalText,
        ...(currentDraft && currentDraft.nodes.length ? { currentDraft } : {}),
        ...(ctx.workflowId ? { workflowId: ctx.workflowId } : {}),
        ...(recentTurns.length ? { recentTurns } : {}),
      });
      if (res.ok) {
        const cleaned = stripFencedJsonBlocks(res.guidanceText) || res.guidanceText;
        const text = looksLikeRawJson(cleaned)
          ? "Here are some suggestions based on your current workflow."
          : cleaned;
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            text,
            plan: asRenderablePlan(res.workflowPlan),
            preview: asRenderablePreview(res.previewDraft),
            ...(res.proposedDefinition ? { proposedDefinition: res.proposedDefinition } : {}),
            ...(res.baseGraphVersion ? { baseGraphVersion: res.baseGraphVersion } : {}),
            ...(res.warnings && res.warnings.length ? { warnings: res.warnings } : {}),
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
  }, []);

  let latestAssistantId: string | null = null;
  let latestReviewId: string | null = null;
  for (const m of messages) {
    if (m.role === "assistant") latestAssistantId = m.id;
    if (m.role === "review") latestReviewId = m.id;
  }

  return {
    messages,
    input,
    loading,
    setInput,
    send,
    checkWorkflow,
    askDeeper,
    latestAssistantId,
    latestReviewId,
  };
}
