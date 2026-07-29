"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  | {
      readonly id: string;
      readonly role: "user";
      readonly text: string;
      /** REACT-AGENT-CONVERSATION-PERSISTENCE-1 — loaded from the server, not sent this session. */
      readonly restored?: boolean;
    }
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
      /**
       * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the correlation id for this
       * proposal's lifecycle row in `agent_change_history`. Minted here (not at
       * apply time) so the persisted transcript can reference the SAME record the
       * preview/apply/discard transitions write, and a restored turn can be told
       * honestly whether it was applied, saved, discarded, or never used.
       */
      readonly agentChangeId?: string;
      /** REACT-AGENT-CONVERSATION-PERSISTENCE-1 — loaded from the server, not produced this session. */
      readonly restored?: boolean;
    }
  | {
      readonly id: string;
      readonly role: "review";
      readonly text: string;
      readonly setupTargets: readonly CheckWorkflowSetupTarget[];
      readonly restored?: boolean;
    }
  | {
      readonly id: string;
      readonly role: "error";
      readonly text: string;
      readonly restored?: boolean;
    };

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the server-side transcript port.
 *
 * The conversation itself stays presentation-agnostic and storage-agnostic: it
 * calls `load` once for the workflow it belongs to and hands every new turn to
 * `append`. Both are fire-and-forget from the conversation's point of view — a
 * persistence outage degrades to a session-only chat and never blocks, throws
 * into, or changes a single AI request.
 *
 * Absent (the dashboard's single-shot panel, tests) → in-memory only, exactly
 * the previous behaviour.
 */
export interface GuidanceConversationPersistence {
  /** Restore prior turns, oldest first. Resolves to an empty list when nothing is stored. */
  load(): Promise<readonly GuidanceChatMessage[]>;
  /** Persist one turn. Never awaited by the conversation. */
  append(message: GuidanceChatMessage, meta: { readonly requestId: string | null }): void;
}

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
  /**
   * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — true while the stored transcript is
   * still being fetched, so a surface can avoid flashing an empty conversation.
   */
  readonly restoring: boolean;
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
  options: { readonly persistence?: GuidanceConversationPersistence } = {},
): GuidanceConversation {
  const [messages, setMessages] = useState<readonly GuidanceChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const nextId = useRef(0);
  const makeId = () => String(nextId.current++);

  const ctxRef = useRef(context);
  ctxRef.current = context;
  const persistence = options.persistence;
  const persistenceRef = useRef(persistence);
  persistenceRef.current = persistence;

  /**
   * Persist one turn. Deliberately swallowing: the transcript is a record of the
   * conversation, not a precondition for it. A failed write must never turn into
   * a failed or duplicated AI request — and it never re-sends anything, so it
   * cannot cost a credit.
   */
  const persist = (
    message: GuidanceChatMessage,
    requestId: string | null,
  ): void => {
    try {
      persistenceRef.current?.append(message, { requestId });
    } catch {
      /* persistence is best-effort by contract */
    }
  };

  /**
   * Restore the stored transcript exactly once per persistence port.
   *
   * The restored turns are ADDITIVE-SAFE: if the user has already spoken this
   * session (a fast typist, or a Document-mode send during the fetch), the
   * restore is dropped rather than clobbering live state. Restored turns are
   * marked `restored` so nothing downstream mistakes history for a live
   * proposal — they never auto-show on the canvas and never start a guided
   * stage.
   */
  const restoredRef = useRef<GuidanceConversationPersistence | null>(null);
  useEffect(() => {
    if (!persistence) return;
    if (restoredRef.current === persistence) return;
    restoredRef.current = persistence;
    let cancelled = false;
    setRestoring(true);
    void persistence
      .load()
      .then((restored) => {
        if (cancelled || restored.length === 0) return;
        setMessages((prev) => (prev.length > 0 ? prev : restored));
      })
      .catch(() => {
        // Degrade to a session-only conversation; the user keeps working.
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [persistence]);
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
    // Prior turns (before appending this one) become the recent-conversation
    // context. Restored turns count: a resumed thread reads in context, still
    // bounded by the SAME MAX_GUIDANCE_CONVERSATION_TURNS / per-turn text caps.
    const recentTurns = toRecentTurns(messagesRef.current);
    const currentDraft = ctx.getCurrentDraft?.();
    // One id per REQUEST, shared by the user turn and the reply it produces, so
    // a restored transcript can pair them. It is a correlation id only — billing
    // idempotency stays where it already lives, on the server route.
    const requestId = mintCorrelationId();
    const userMessage: GuidanceChatMessage = {
      id: makeId(),
      role: "user",
      text: goalText,
    };
    setMessages((prev) => [...prev, userMessage]);
    persist(userMessage, requestId);
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
        const carriesProposal = res.workflowPlan != null || res.proposedDefinition != null;
        const assistantMessage: GuidanceChatMessage = {
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
          // Minted HERE, at proposal birth, so the preview/apply/discard
          // transitions and the persisted transcript all point at ONE lifecycle
          // row instead of each inventing their own.
          ...(carriesProposal ? { agentChangeId: mintCorrelationId() } : {}),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        persist(assistantMessage, requestId);
      } else {
        const errorMessage: GuidanceChatMessage = {
          id: makeId(),
          role: "error",
          text: safeErrorMessage(res),
        };
        setMessages((prev) => [...prev, errorMessage]);
        persist(errorMessage, requestId);
      }
    } catch {
      const errorMessage: GuidanceChatMessage = {
        id: makeId(),
        role: "error",
        text: UNAVAILABLE_MESSAGE,
      };
      setMessages((prev) => [...prev, errorMessage]);
      persist(errorMessage, requestId);
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
    const reviewMessage: GuidanceChatMessage = {
      id: makeId(),
      role: "review",
      text,
      setupTargets: review.setupTargets,
    };
    setMessages((prev) => [...prev, reviewMessage]);
    persist(reviewMessage, null);
  }, []);

  const askDeeper = useCallback(async (ctx: GuidanceConversationContext): Promise<void> => {
    if (loadingRef.current || !ctx.getCheckReviewContext) return;
    const review = ctx.getCheckReviewContext();
    const requestGoalText = buildAgentReviewGoalText(CHECK_WORKFLOW_PROMPT, review);
    const recentTurns = toRecentTurns(messagesRef.current);
    const currentDraft = ctx.getCurrentDraft?.();
    const requestId = mintCorrelationId();
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
        const carriesProposal = res.workflowPlan != null || res.proposedDefinition != null;
        const assistantMessage: GuidanceChatMessage = {
          id: makeId(),
          role: "assistant",
          text,
          plan: asRenderablePlan(res.workflowPlan),
          preview: asRenderablePreview(res.previewDraft),
          ...(res.proposedDefinition ? { proposedDefinition: res.proposedDefinition } : {}),
          ...(res.baseGraphVersion ? { baseGraphVersion: res.baseGraphVersion } : {}),
          ...(res.warnings && res.warnings.length ? { warnings: res.warnings } : {}),
          ...(carriesProposal ? { agentChangeId: mintCorrelationId() } : {}),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        persist(assistantMessage, requestId);
      } else {
        const errorMessage: GuidanceChatMessage = {
          id: makeId(),
          role: "error",
          text: safeErrorMessage(res),
        };
        setMessages((prev) => [...prev, errorMessage]);
        persist(errorMessage, requestId);
      }
    } catch {
      const errorMessage: GuidanceChatMessage = {
        id: makeId(),
        role: "error",
        text: UNAVAILABLE_MESSAGE,
      };
      setMessages((prev) => [...prev, errorMessage]);
      persist(errorMessage, requestId);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * The ACTIONABLE latest turn — restored turns are deliberately excluded.
   *
   * A proposal from a previous session is history: it must never auto-show on
   * the canvas, never become the live pending proposal, and never start a guided
   * stage. Reopening one is an explicit user action on that specific turn, which
   * the panel offers only when reconciliation says it is still compatible.
   */
  let latestAssistantId: string | null = null;
  let latestReviewId: string | null = null;
  for (const m of messages) {
    if (m.restored) continue;
    if (m.role === "assistant") latestAssistantId = m.id;
    if (m.role === "review") latestReviewId = m.id;
  }

  return {
    messages,
    input,
    loading,
    restoring,
    setInput,
    send,
    checkWorkflow,
    askDeeper,
    latestAssistantId,
    latestReviewId,
  };
}

/** UUID v4 — prefers crypto.randomUUID, with a UUID-shaped fallback (mirrors graphSlice). */
function mintCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
