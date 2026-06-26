"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
  type GuidanceConversationTurn,
  type GuidanceOfficialTemplateMatch,
} from "@/contracts/aiGuidance";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { requestWorkflowGuidance } from "@/lib/api/ai/guidance";
import {
  buildAgentReviewGoalText,
  composeCheckWorkflowReview,
  looksLikeRawJson,
  type CheckWorkflowReviewContext,
  type CheckWorkflowSetupTarget,
} from "@/core/workflows/checkWorkflowReview";
import {
  isPlanMeaningfulCanvasPreview,
  draftPreviewSignature,
  type CanvasPreviewGraphNode,
} from "@/core/workflows/canvasPreviewEligibility";
import { stripFencedJsonBlocks } from "@/core/workflows/stripFencedJsonBlocks";
import {
  CHAT_PLACEHOLDER,
  CHECK_WORKFLOW_PROMPT,
  MAX_GOAL_LENGTH,
  UNAVAILABLE_MESSAGE,
  asRenderablePlan,
  asRenderablePreview,
  safeErrorMessage,
  submitOnEnter,
} from "./guidancePanelShared";
import { SingleShotGuidancePanel } from "./SingleShotGuidancePanel";
import { GuidancePlanSection, GuidancePreviewSection, GuidanceEditPreviewHint } from "./GuidanceSuggestionSections";
import { IntroAssistantMessage, UserMessageBubble, ReactSpeakerLabel } from "./GuidanceMessages";
import { GuidanceTemplateMatchSection } from "./GuidanceTemplateMatchSection";
import { GuidanceTemplatePreviewDialog } from "./GuidanceTemplatePreviewDialog";
import { useTemplatePreviewFlow } from "./useTemplatePreviewFlow";
import { SparkleIcon } from "./guidanceRailIcons";

/**
 * "Build with me" — advisory Hermes Agent workflow guidance (HERMES-AGENT-GUIDANCE-UI).
 *
 * Two modes, ONE governed path. Both call ONLY the ChainReact route
 * `POST /api/accounts/[id]/ai/workflow-guidance` through the `requestWorkflowGuidance` helper — never
 * the Render gateway / a model vendor / Nous / the private Hermes Agent, and never a token. Neither
 * mode creates, changes, applies, saves, or runs a workflow.
 *
 *   - SINGLE-SHOT (default; the dashboard "Build with me", {@link SingleShotGuidancePanel}): one goal →
 *     one guidance result + optional review-only plan / non-applied preview.
 *   - CONVERSATIONAL (`conversational`, the builder rail; HERMES-AGENT-BUILDER-RAIL-CHAT-MODE): a
 *     session-scoped message list. A follow-up sends the prior turns as sanitized `recentTurns` so
 *     Hermes answers in context. Conversation is in-memory only — NOT persisted, no durable memory.
 *     Only the LATEST assistant turn's preview is actionable ("Show on canvas"); a newer preview
 *     supersedes the prior pending one. Apply / Discard live in the builder's canvas overlay (explicit,
 *     local-draft only) — this panel never applies/saves.
 */

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
  readonly onPreviewToCanvas?: (payload: { plan: WorkflowPlan; preview: DraftPreview; proposedDefinition?: WorkflowDefinition; baseGraphVersion?: string }) => void;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — render the session-scoped conversational rail (message list
   * + bottom input + recent-conversation context) instead of the single-shot form. Default false keeps
   * the dashboard "Build with me" behavior byte-identical.
   */
  readonly conversational?: boolean;
  /**
   * HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH — optional node rendered at the END of the conversational
   * transcript (inside the scrollable message area, after the latest assistant turn), so a guided-setup
   * card reads as part of React's response and the composer stays pinned at the bottom. The builder rail
   * passes the {@link "../workflow-builder/panels/BuilderPreviewSetupCard"} here. Conversational mode
   * only; the panel renders it as an opaque node (it owns no preview-config logic). Absent → nothing.
   */
  readonly transcriptFooter?: ReactNode;
  /**
   * BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW — builder-only: a getter for the current DETERMINISTIC
   * validation snapshot (computed by the builder from the same validator that drives the header pill /
   * validation drawer). When present, clicking "Check workflow" arms a review send: the request carries
   * de-identified validation context (counts + issue codes) and the rendered reply is framed
   * deterministically (Status / Setup issues from validation; the agent text only contributes
   * Suggestions, JSON- and overclaim-guarded). Absent (dashboard / tests) → the pill is a plain prefill.
   */
  readonly getCheckReviewContext?: () => CheckWorkflowReviewContext;
  /**
   * BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD — builder-only: a getter for the CURRENT draft graph's
   * shape (kind/provider/type per node — never config/labels). When present, "Show on canvas" is
   * offered only for a plan that meaningfully adds/changes structure vs this shape; a same-shape
   * restatement keeps the suggestion in the rail (no duplicate ghost nodes over existing ones). Absent
   * → previous behavior (offer whenever a builder `onPreviewToCanvas` + validated plan exist).
   */
  readonly getCurrentGraphShape?: () => readonly CanvasPreviewGraphNode[];
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR — builder-only: a getter for the user's CURRENT local draft (full nodes
   * with stable ids + config + edges). Sent with each guidance request so React can propose a
   * catalog-validated EDIT against the live canvas (incl. unsaved edits). The server redacts secrets
   * before the model. Absent (dashboard single-shot) → no draft sent (request unchanged).
   */
  readonly getCurrentDraft?: () => WorkflowDefinition;
  /**
   * BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP — builder-only render slot. When the deterministic Check
   * workflow review finds existing draft nodes with missing required fields, the panel calls this with
   * those targets and renders the returned node UNDER the latest review. The builder returns its
   * existing-node setup card (controls + "Update step"); the panel stays agnostic (opaque node). Absent
   * → no inline setup card.
   */
  readonly renderCheckSetup?: (targets: readonly CheckWorkflowSetupTarget[]) => ReactNode;
  /**
   * ANON-BUILDER-2 — conversational-only: an initial value to seed the composer
   * ONCE when it first arrives (e.g. the prompt carried over from an anonymous
   * draft restored after sign-up). It only fills an empty, untouched composer —
   * it never overwrites what the user has typed and never auto-sends. Absent →
   * the composer starts empty as before.
   */
  readonly initialComposerValue?: string;
  /**
   * HERMES-AGENT-PREVIEW-SHOWN-DEDUP — the structural signature
   * ({@link draftPreviewSignature}) of the preview CURRENTLY displayed on the canvas overlay (owned by
   * `WorkflowBuilder`; `null` when none is shown). When the latest suggestion's preview matches it, the
   * rail hides its redundant "Show on canvas" button (the same preview is already on the canvas, with
   * Apply/Discard in the overlay). When they differ — nothing shown, the user discarded it, or a newer
   * preview superseded it — the button stays available as a manual re-show/recovery affordance. Absent →
   * the button always renders (e.g. dashboard with no canvas, or auto-show not wired/available).
   */
  readonly displayedPreviewSignature?: string | null;
}

export function WorkflowGuidancePanel(props: WorkflowGuidancePanelProps) {
  return props.conversational ? (
    <ConversationalGuidancePanel {...props} />
  ) : (
    <SingleShotGuidancePanel {...props} />
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
      /** HERMES-AGENT-WORKFLOW-EDITOR — for an EDIT proposal, the validated end-state graph Apply replaces with. */
      readonly proposedDefinition?: WorkflowDefinition | null;
      /** HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the draft version the proposal is pinned to (Apply stale guard). */
      readonly baseGraphVersion?: string | null;
      // REACT-LIVE-SKELETON — safe, no-secret notes (e.g. an exact catalog gap when no plan could be
      // built). Rendered as muted lines under the reply.
      readonly warnings?: readonly string[];
      readonly officialTemplateMatches?: readonly GuidanceOfficialTemplateMatch[];
    }
  // BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC — a LOCAL, deterministic workflow review produced
  // entirely from builder state (no LLM, no network, no AI credits). Rendered like a React turn but
  // carries no plan/preview and offers an explicit, opt-in "Ask React for deeper suggestions" follow-up.
  // `setupTargets` are existing draft nodes with missing required fields (for the inline setup card).
  | {
      readonly id: string;
      readonly role: "review";
      readonly text: string;
      readonly setupTargets: readonly CheckWorkflowSetupTarget[];
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

/** Build the canvas-overlay payload from an assistant turn (carries the edit's proposedDefinition when present). */
function toCanvasPayload(m: Extract<ChatMessage, { role: "assistant" }>): { plan: WorkflowPlan; preview: DraftPreview; proposedDefinition?: WorkflowDefinition; baseGraphVersion?: string } {
  return {
    plan: m.plan!,
    preview: m.preview!,
    ...(m.proposedDefinition ? { proposedDefinition: m.proposedDefinition } : {}),
    ...(m.baseGraphVersion ? { baseGraphVersion: m.baseGraphVersion } : {}),
  };
}

/** Session-scoped conversational rail. In-memory only — never persisted (no durable memory). */
function ConversationalGuidancePanel({ accountId, workflowId, onPreviewToCanvas, transcriptFooter, getCheckReviewContext, getCurrentGraphShape, getCurrentDraft, renderCheckSetup, initialComposerValue, displayedPreviewSignature }: WorkflowGuidancePanelProps) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const preview = useTemplatePreviewFlow(accountId);
  const nextId = useRef(0);
  const makeId = () => String(nextId.current++);

  // ANON-BUILDER-2 — seed the composer ONCE from a restored anonymous prompt when
  // it first arrives, only if the user hasn't typed anything yet. Never overwrites
  // user input, never auto-sends.
  const seededComposerRef = useRef(false);
  useEffect(() => {
    if (seededComposerRef.current) return;
    const seed = (initialComposerValue ?? "").trim();
    if (seed.length === 0) return;
    seededComposerRef.current = true;
    setInput((current) => (current.length === 0 ? seed : current));
  }, [initialComposerValue]);

  // HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH — keep the newest content in view. Scroll the transcript to the
  // bottom when a message is added OR the setup-card footer appears/disappears. Keyed on the message
  // COUNT + a boolean for the footer (not the footer node identity) so it never re-scrolls on every
  // render — no jank.
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const hasFooter = transcriptFooter != null && transcriptFooter !== false;
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, hasFooter]);

  // REACT-LIVE-SKELETON — live builder copilot: the canvas should update as the conversation
  // progresses, WITHOUT a hidden extra click. When the latest assistant turn carries a valid,
  // MEANINGFUL preview+plan and the builder wired `onPreviewToCanvas`, auto-show it on the canvas ONCE
  // per message. A newer preview supersedes the prior one (builder owns the overlay → latest wins).
  // Same-shape restatements are skipped (eligibility guard), and a no-plan/clarifying turn never
  // clears the standing preview. Auto-show is display-only — it NEVER applies/saves/activates/runs
  // (Apply stays an explicit click in the overlay). Dashboard (no builder callback) → no-op.
  const autoShownPreviewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onPreviewToCanvas) return;
    let latest: Extract<ChatMessage, { role: "assistant" }> | null = null;
    for (const m of messages) if (m.role === "assistant") latest = m;
    if (!latest || !latest.preview || !latest.plan) return;
    if (autoShownPreviewRef.current === latest.id) return; // already auto-shown this turn
    // HERMES-AGENT-WORKFLOW-EDITOR — an EDIT proposal (proposedDefinition) is a change by construction
    // (it may even SHRINK the graph, e.g. a removal), so the same-shape "meaningful" guard — which only
    // fits ADD-shaped previews — does not apply; always auto-show it. New-workflow skeletons still use
    // the guard so a same-shape restatement doesn't ghost duplicates.
    const meaningful =
      latest.proposedDefinition != null ||
      getCurrentGraphShape == null ||
      isPlanMeaningfulCanvasPreview({ currentGraph: getCurrentGraphShape(), plan: latest.plan });
    if (!meaningful) return;
    autoShownPreviewRef.current = latest.id;
    onPreviewToCanvas(toCanvasPayload(latest));
  }, [messages, onPreviewToCanvas, getCurrentGraphShape]);

  const trimmed = input.trim();
  const canSend = trimmed.length > 0 && !loading;

  // BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC — the "Check workflow" pill runs an INSTANT, LOCAL,
  // deterministic review and appends it to the transcript. It NEVER calls `requestWorkflowGuidance` /
  // the Hermes model gateway / any LLM, never consumes AI credits or tasks, never prefills the composer,
  // and never opens the validation drawer / mutates / saves / activates / runs / applies anything. The
  // verdict comes only from the builder's own validation snapshot (`getCheckReviewContext`), so it can't
  // contradict the header pill / drawer, and the rendered text is composed locally (no raw JSON ever).
  function handleCheckWorkflow(): void {
    if (loading || !getCheckReviewContext) return;
    const ctx = getCheckReviewContext();
    const text = composeCheckWorkflowReview({
      summary: ctx.summary,
      blockingIssueCount: ctx.blockingIssueCount,
      issueMessages: ctx.issueMessages,
      agentText: null, // deterministic — no model output is ever folded into the default review
    });
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "review", text, setupTargets: ctx.setupTargets },
    ]);
  }

  // Only the most recent assistant turn's preview/plan is actionable — a newer preview supersedes the
  // prior pending one (the older messages stay in the transcript as text).
  let latestAssistantId: string | null = null;
  let latestReviewId: string | null = null;
  for (const m of messages) {
    if (m.role === "assistant") latestAssistantId = m.id;
    if (m.role === "review") latestReviewId = m.id;
  }

  async function handleSend(): Promise<void> {
    if (!canSend) return;
    const goalText = trimmed;
    // Prior turns (before appending this one) become the sanitized recent-conversation context.
    const recentTurns = toRecentTurns(messages);
    // HERMES-AGENT-WORKFLOW-EDITOR — send the CURRENT local draft (stable ids + config + edges) so a
    // change request ("change it to email", "remove that step") is proposed against what's on the canvas
    // now, incl. applied unsaved edits. Omitted when there's nothing on the canvas yet.
    const currentDraft = getCurrentDraft?.();
    setMessages((prev) => [...prev, { id: makeId(), role: "user", text: goalText }]);
    setInput("");
    setLoading(true);
    try {
      const res = await requestWorkflowGuidance({
        accountId,
        goalText,
        ...(workflowId ? { workflowId } : {}),
        ...(recentTurns.length ? { recentTurns } : {}),
        ...(currentDraft && currentDraft.nodes.length ? { currentDraft } : {}),
      });
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            // Defensive: strip any fenced JSON/operation block so raw model JSON never renders in the rail.
            text: stripFencedJsonBlocks(res.guidanceText) || res.guidanceText,
            plan: asRenderablePlan(res.workflowPlan),
            preview: asRenderablePreview(res.previewDraft),
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
  }

  // BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC — the EXPLICIT, opt-in AI follow-up. Distinct from
  // the default Check-workflow review: only THIS action calls the governed `requestWorkflowGuidance`
  // path (which may use AI credits). It carries de-identified validation context (counts + issue codes)
  // so the model reasons against the real state, renders as a normal React turn, and guards against a
  // raw-JSON reply. Never auto-runs — the user taps "Ask React for deeper suggestions".
  async function handleAskDeeper(): Promise<void> {
    if (loading || !getCheckReviewContext) return;
    const ctx = getCheckReviewContext();
    const requestGoalText = buildAgentReviewGoalText(CHECK_WORKFLOW_PROMPT, ctx);
    const recentTurns = toRecentTurns(messages);
    const currentDraft = getCurrentDraft?.();
    setLoading(true);
    try {
      const res = await requestWorkflowGuidance({
        accountId,
        goalText: requestGoalText,
        ...(currentDraft && currentDraft.nodes.length ? { currentDraft } : {}),
        ...(workflowId ? { workflowId } : {}),
        ...(recentTurns.length ? { recentTurns } : {}),
      });
      if (res.ok) {
        // Never surface a raw-JSON dump as the response body, even on the AI path. Strip any fenced
        // operation/JSON block first, then fall back to neutral copy if a whole-text dump remains.
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
  }

  return (
    <section
      data-testid="workflow-guidance-panel"
      aria-label="Build with me"
      className="flex h-full min-h-0 flex-col rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div ref={messagesRef} data-testid="workflow-guidance-messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {/* HERMES-AGENT-RAIL-CHAT-POLISH — the intro/help copy is the first React message INSIDE the
            scroll container (not a sticky header), so it scrolls away with the conversation. It's
            display-only: never part of `messages`, so it never enters recentTurns or latest-turn logic. */}
        <IntroAssistantMessage />
        {messages.map((m) => {
          if (m.role === "user") {
            return <UserMessageBubble key={m.id} text={m.text} />;
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
          if (m.role === "review") {
            // Deterministic, local review (no LLM). Shares the `workflow-guidance-result` testid so
            // result-text assertions cover it, plus a `review`-specific testid. The opt-in AI follow-up
            // renders only under the LATEST review and only when guidance is wired (builder rail).
            const isLatestReview = m.id === latestReviewId;
            return (
              <div key={m.id} data-testid="workflow-guidance-message-review">
                <div data-testid="workflow-guidance-result">
                  <ReactSpeakerLabel />
                  <span className="whitespace-pre-wrap text-sm text-[var(--builder-text-2)]">
                    {m.text}
                  </span>
                </div>
                {/* BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP — inline "Fix setup issues" card for the
                    latest review's existing-node targets. The builder owns the card (controls + Update
                    step); the panel renders it opaquely. No targets / no slot → nothing. */}
                {isLatestReview && renderCheckSetup && m.setupTargets.length > 0 && (
                  <div className="mt-2">{renderCheckSetup(m.setupTargets)}</div>
                )}
                {isLatestReview && getCheckReviewContext != null && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleAskDeeper}
                      disabled={loading}
                      data-testid="agent-ask-deeper"
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-[11.5px] font-medium text-neutral-700 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
                      title="Optional: ask React for deeper AI suggestions (uses AI credits)"
                    >
                      Ask React for deeper suggestions
                      <span className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                        Uses AI
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          }
          const isLatest = m.id === latestAssistantId;
          // HERMES-AGENT-PREVIEW-SHOWN-DEDUP — is THIS turn's preview the one already displayed on the
          // canvas overlay? Drives both the edit-hint "conversation only" state and the skeleton card's
          // redundant-"Show on canvas" suppression, so it's computed once here.
          const previewOnCanvas =
            m.preview != null &&
            displayedPreviewSignature != null &&
            draftPreviewSignature(m.preview) === displayedPreviewSignature;
          return (
            <div key={m.id} data-testid="workflow-guidance-message-assistant">
              {m.text.length > 0 && (
                <div data-testid="workflow-guidance-result">
                  <ReactSpeakerLabel />
                  <span className="whitespace-pre-wrap text-sm text-[var(--builder-text-2)]">
                    {m.text}
                  </span>
                </div>
              )}
              {/* REACT-LIVE-SKELETON — safe, no-secret notes (e.g. an exact catalog gap when no plan
                  could be built) so the agent says what's missing instead of going silent. */}
              {m.warnings && m.warnings.length > 0 && (
                <ul
                  data-testid="workflow-guidance-warnings"
                  className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400"
                >
                  {m.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <GuidanceTemplateMatchSection matches={m.officialTemplateMatches ?? []} onPreview={preview.openPreview} />
              {/* Only the latest assistant turn's preview/plan is actionable (supersedes prior). */}
              {isLatest && m.plan && !m.preview && <GuidancePlanSection plan={m.plan} />}
              {/* HERMES-AGENT-RAIL-EDIT-PREVIEW-NO-CARD — an EDIT proposal (proposedDefinition) renders
                  on the canvas as a diff graph, with Apply/Discard in the top control bar. The rail does
                  NOT duplicate it with a "Proposed change" card or a primary "Show on canvas": while the
                  preview is displayed (signature matches) the rail is conversation-only; once it's gone
                  (discarded / superseded / auto-show failed) a lightweight setup-hint + a SECONDARY
                  re-show recovers it. */}
              {isLatest && m.preview && m.proposedDefinition != null && (
                <GuidanceEditPreviewHint
                  preview={m.preview}
                  plan={m.plan}
                  isDisplayedOnCanvas={previewOnCanvas}
                  {...(onPreviewToCanvas && m.plan
                    ? { onShowOnCanvas: () => onPreviewToCanvas(toCanvasPayload(m)) }
                    : {})}
                />
              )}
              {/* BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD — new-workflow skeleton (not an edit): the full
                  "Draft preview" card. Offer "Show on canvas" ONLY when the plan meaningfully
                  adds/changes structure vs the live graph (a same-shape restatement keeps the suggestion
                  in the rail instead of ghosting duplicate nodes), and hide it once the preview is the one
                  already displayed on the canvas. No graph-shape getter (dashboard/tests) → prior behavior. */}
              {isLatest && m.preview && m.proposedDefinition == null && (
                <GuidancePreviewSection
                  preview={m.preview}
                  plan={m.plan}
                  {...(onPreviewToCanvas &&
                  (getCurrentGraphShape == null ||
                    isPlanMeaningfulCanvasPreview({ currentGraph: getCurrentGraphShape(), plan: m.plan })) &&
                  // Hide the redundant rail "Show on canvas" when THIS preview is already on the canvas
                  // (Apply/Discard live in the overlay); it returns as a re-show once discarded/superseded.
                  !previewOnCanvas
                    ? { onPreviewToCanvas: () => onPreviewToCanvas(toCanvasPayload(m)) }
                    : {})}
                />
              )}
            </div>
          );
        })}
        {/* HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH — guided-setup card lives INSIDE the transcript, after the
            latest assistant turn it belongs to, so it reads as part of React's response and scrolls with
            chat. The composer below stays pinned. Opaque node — the panel owns no preview-config logic. */}
        {transcriptFooter}
      </div>

      <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        {/* BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC — a compact agent action directly ABOVE the
            chat input. Clicking runs an INSTANT, LOCAL, deterministic review (no LLM, no AI credits, no
            prefill) and appends it to the transcript. It never opens the validation drawer or blocks
            activation. The optional AI follow-up is a separate button under the review itself. */}
        <div className="mb-2">
          <button
            type="button"
            onClick={handleCheckWorkflow}
            disabled={loading}
            data-testid="agent-check-workflow"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium disabled:opacity-60"
            style={{
              background: "var(--builder-accent-soft)",
              color: "var(--builder-accent)",
              borderColor: "var(--builder-accent)",
            }}
            title="Run an instant, local review of your current workflow (no AI credits used)"
          >
            <SparkleIcon /> Check workflow
          </button>
        </div>
        <Label htmlFor="workflow-guidance-goal" className="sr-only">
          Message React
        </Label>
        <Textarea
          id="workflow-guidance-goal"
          ref={composerRef}
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
      {preview.previewMatch && (
        <GuidanceTemplatePreviewDialog match={preview.previewMatch} busy={preview.busy} error={preview.error} onConfirmUse={preview.confirmUse} onClose={preview.closePreview} />
      )}
    </section>
  );
}
