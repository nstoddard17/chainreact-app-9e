"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useComposerSeed, type ComposerSeed } from "./composerSeed";
import {
  useGuidanceConversation,
  type GuidanceChatMessage,
  type GuidanceConversation,
} from "./useGuidanceConversation";
import type {
  CheckWorkflowReviewContext,
  CheckWorkflowSetupTarget,
} from "@/core/workflows/checkWorkflowReview";
import {
  isPlanMeaningfulCanvasPreview,
  type CanvasPreviewGraphNode,
} from "@/core/workflows/canvasPreviewEligibility";
import type { PersistedPreviewVerdict } from "@/core/workflows/reactAgentPreviewReconciliation";
import {
  CHAT_PLACEHOLDER,
  MAX_GOAL_LENGTH,
  submitOnEnter,
} from "./guidancePanelShared";
import { SingleShotGuidancePanel } from "./SingleShotGuidancePanel";
import { GuidancePlanSection, GuidancePreviewSection } from "./GuidanceSuggestionSections";
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
 *     message list. A follow-up sends the prior turns as sanitized `recentTurns` so Hermes answers in
 *     context. In the BUILDER the transcript is durable (REACT-AGENT-CONVERSATION-PERSISTENCE-1): the
 *     builder supplies a persistence port and restored turns render as history, labelled with what
 *     actually happened to them. On the dashboard (no port) it stays in-memory only.
 *     Only the LATEST NON-RESTORED assistant turn's preview is actionable ("Show on canvas"); a newer
 *     preview supersedes the prior pending one. Apply / Discard live in the builder's canvas overlay
 *     (explicit, local-draft only) — this panel never applies/saves.
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
  readonly onPreviewToCanvas?: (payload: { plan: WorkflowPlan; preview: DraftPreview; proposedDefinition?: WorkflowDefinition; baseGraphVersion?: string; prompt?: string; agentChangeId?: string }) => void;
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
   * 5.DUAL-BUILDER-1 CS-7 — conversational-only: the ONE keyed/versioned seed for
   * the single composer (see features/workflows/composerSeed.ts). Replaces the
   * one-shot `initialComposerValue`. A `restore` seed (ANON-BUILDER-2) fills only
   * an empty composer; an explicit Document Ask React seed (document-*) replaces
   * it and a new version reliably supersedes an earlier unsent seed. Never
   * auto-sends. Absent → the composer starts empty.
   */
  readonly composerSeed?: ComposerSeed;
  /**
   * AI-TEMPLATE-APPLY-CURRENT — builder-only: apply a React-Agent-suggested official template to the
   * CURRENTLY-OPEN workflow (in place) instead of creating a new one. When provided (with a
   * `workflowId`), the template match's confirmation dialog offers "Apply to current workflow" as the
   * primary choice; the handler overwrites the current draft via the existing replace-from-template
   * path (pre-replace checkpoint + History), re-hydrates the canvas, and keeps the user on this URL. It
   * must THROW on failure so the dialog can stay open with a safe error. Absent (dashboard) → the
   * dialog only offers create-new, unchanged.
   */
  readonly onTemplateApplyToCurrent?: (input: { templateId: string; templateName: string }) => Promise<void>;
  /**
   * DOC-REACT-AGENT-1 — conversational-only: the SHARED conversation to render.
   * `WorkflowBuilder` owns ONE instance (`useGuidanceConversation`) and hands it
   * to whichever surface is mounted — the Visual left rail or the Document
   * bottom agent workspace — so switching modes remounts the presentation
   * WITHOUT losing the transcript, the in-flight request, or the pending
   * proposal. Absent → the panel creates its own (dashboard / existing tests
   * unchanged). There is never more than one conversation.
   */
  readonly conversation?: GuidanceConversation;
  /**
   * DOC-REACT-AGENT-1 — hide this panel's own composer footer (textarea + Send +
   * Check workflow). The Document workspace supplies those controls itself so
   * the bottom composer stays the single entry point; the transcript renders
   * here unchanged. Absent → the composer renders as before.
   */
  readonly hideComposer?: boolean;
  /**
   * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — builder-only: reconcile ONE restored
   * proposal against the workflow as it stands now.
   *
   * The panel deliberately cannot answer this itself. Whether a past proposal
   * was applied, saved, discarded, or has gone stale depends on the saved graph
   * revision and the canonical `agent_change_history` row — both of which live
   * in the builder. The panel renders the verdict and offers "Show on canvas
   * again" only when the verdict says reopening is safe. Absent (dashboard,
   * tests) → restored turns render as plain history with no badge.
   */
  readonly reconcileRestoredPreview?: (message: {
    readonly agentChangeId?: string;
    readonly baseGraphVersion?: string | null;
    readonly hasProposalPayload: boolean;
  }) => PersistedPreviewVerdict | null;
}

export function WorkflowGuidancePanel(props: WorkflowGuidancePanelProps) {
  return props.conversational ? (
    <ConversationalGuidancePanel {...props} />
  ) : (
    <SingleShotGuidancePanel {...props} />
  );
}

/**
 * DOC-REACT-AGENT-1 — the transcript shape now lives with the SHARED
 * conversation (see useGuidanceConversation) so every presentation renders the
 * same messages. Aliased here to keep this file’s reading order intact.
 */
type ChatMessage = GuidanceChatMessage;

/** Build the canvas-overlay payload from an assistant turn (carries the edit's proposedDefinition when present). */
function toCanvasPayload(m: Extract<ChatMessage, { role: "assistant" }>): { plan: WorkflowPlan; preview: DraftPreview; proposedDefinition?: WorkflowDefinition; baseGraphVersion?: string; prompt?: string; agentChangeId?: string } {
  return {
    plan: m.plan!,
    preview: m.preview!,
    ...(m.proposedDefinition ? { proposedDefinition: m.proposedDefinition } : {}),
    ...(m.baseGraphVersion ? { baseGraphVersion: m.baseGraphVersion } : {}),
    // CHECKPOINTS-1 — carry the user prompt so the builder can name the pre-apply checkpoint.
    ...(m.prompt ? { prompt: m.prompt } : {}),
    // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the lifecycle correlation id minted
    // with the proposal, so preview/apply/discard and the persisted transcript
    // all transition the SAME `agent_change_history` row.
    ...(m.agentChangeId ? { agentChangeId: m.agentChangeId } : {}),
  };
}

/** A restored turn carries a reopenable proposal only when its payload survived persistence. */
function hasProposalPayload(m: Extract<ChatMessage, { role: "assistant" }>): boolean {
  return m.plan != null && m.preview != null;
}

/** The conversational rail. Durable in the builder (persistence port), in-memory on the dashboard. */
function ConversationalGuidancePanel({ accountId, workflowId, onPreviewToCanvas, transcriptFooter, getCheckReviewContext, getCurrentGraphShape, getCurrentDraft, renderCheckSetup, composerSeed, onTemplateApplyToCurrent, conversation, hideComposer, reconcileRestoredPreview }: WorkflowGuidancePanelProps) {
  // DOC-REACT-AGENT-1 — ONE conversation. `WorkflowBuilder` owns it so the
  // Visual rail and the Document workspace are two presentations of the same
  // agent; without an injected one the panel owns its own (dashboard / tests).
  // Both hooks always run (no conditional hook); only one result is used.
  const ownConversation = useGuidanceConversation({
    accountId,
    ...(workflowId ? { workflowId } : {}),
    ...(getCurrentDraft ? { getCurrentDraft } : {}),
    ...(getCheckReviewContext ? { getCheckReviewContext } : {}),
  });
  const convo = conversation ?? ownConversation;
  const { messages, input, loading, setInput } = convo;
  const requestContext = {
    accountId,
    ...(workflowId ? { workflowId } : {}),
    ...(getCurrentDraft ? { getCurrentDraft } : {}),
    ...(getCheckReviewContext ? { getCheckReviewContext } : {}),
  };
  // AI-TEMPLATE-APPLY-CURRENT — inside the builder (a workflowId + an apply handler), the template
  // match dialog offers "Apply to current workflow" (in place) as the primary choice. On the dashboard
  // (neither present) the hook falls back to create-new only.
  const preview = useTemplatePreviewFlow(accountId, {
    ...(workflowId ? { currentWorkflowId: workflowId } : {}),
    ...(onTemplateApplyToCurrent ? { onApplyToCurrent: onTemplateApplyToCurrent } : {}),
  });

  // 5.DUAL-BUILDER-1 CS-7 — the ONE keyed/versioned composer seed. Each new
  // version is applied at most once: a restore seed fills only an empty composer;
  // an explicit Document Ask React seed replaces it, and a later version reliably
  // supersedes an earlier unsent one. Never auto-sends (only `setInput`).
  useComposerSeed(composerSeed, setInput);

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
  // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — a RESTORED turn is never auto-shown.
  // A proposal from a previous session describes a draft the user may well have
  // abandoned; putting it back on the canvas unasked would resurrect exactly the
  // unsaved work returning to the workflow is supposed to have discarded. The
  // conversation excludes restored turns from `latestAssistantId` for the same
  // reason, so reading it here is the single guard.
  const autoShownPreviewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onPreviewToCanvas) return;
    let latest: Extract<ChatMessage, { role: "assistant" }> | null = null;
    for (const m of messages) {
      if (m.role === "assistant" && !m.restored) latest = m;
    }
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
  // and never opens the validation drawer / mutates / saves / activates / runs / applies anything.
  // DOC-REACT-AGENT-1 — the logic itself now lives on the shared conversation, so the Document
  // workspace runs the very same review.
  function handleCheckWorkflow(): void {
    convo.checkWorkflow(requestContext);
  }

  // Only the most recent assistant turn’s preview/plan is actionable — a newer preview supersedes the
  // prior pending one (the older messages stay in the transcript as text).
  const latestAssistantId = convo.latestAssistantId;
  const latestReviewId = convo.latestReviewId;

  async function handleSend(): Promise<void> {
    await convo.send();
  }

  // BUILDER-AGENT-RAIL-CHECK-WORKFLOW-DETERMINISTIC — the EXPLICIT, opt-in AI follow-up. Distinct from
  // the default Check-workflow review: only THIS action calls the governed `requestWorkflowGuidance`
  // path (which may use AI credits). Never auto-runs — the user taps the button under a review.
  async function handleAskDeeper(): Promise<void> {
    await convo.askDeeper(requestContext);
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
          // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — a restored proposal is
          // labelled with what ACTUALLY happened to it, judged against the saved
          // workflow: "Not saved", "Applied", "Discarded", "Stale". Without this
          // the transcript would read as though every past suggestion is still
          // pending, which is precisely the lie that made an abandoned draft look
          // like unfinished setup.
          const restoredVerdict =
            m.restored && reconcileRestoredPreview && (m.plan || m.preview)
              ? reconcileRestoredPreview({
                  ...(m.agentChangeId ? { agentChangeId: m.agentChangeId } : {}),
                  baseGraphVersion: m.baseGraphVersion ?? null,
                  hasProposalPayload: hasProposalPayload(m),
                })
              : null;
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
              {/* HERMES-AGENT-RAIL-CALM — an EDIT proposal (proposedDefinition) auto-shows on the canvas
                  as a diff graph (Apply/Discard in the top bar; setup surfaces on the canvas node / config
                  panel / guided-setup card). The rail shows the conversational summary ONLY — no auto-show
                  error, no orphaned "Still needs", no "Show on canvas". So nothing extra is rendered here. */}
              {/* REACT-AGENT-RAIL-NO-DUPLICATE-PREVIEW-1 — the textual "Draft preview" card is rendered
                  ONLY when this panel has no canvas to show the sketch on (`onPreviewToCanvas` unwired).
                  Inside the builder the workspace already renders the very same thing — title, summary,
                  per-step list, and per-node "Needs setup" — as the holographic preview, so repeating it
                  as prose made the chat read as a wall of restated text. A same-shape restatement (which
                  deliberately does not auto-show, to avoid ghosting duplicates) is by definition already
                  on the canvas, so it loses nothing here either. There is still NO manual "Show on
                  canvas" button (HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH). */}
              {isLatest && m.preview && m.proposedDefinition == null && !onPreviewToCanvas && (
                <GuidancePreviewSection preview={m.preview} plan={m.plan} />
              )}
              {restoredVerdict && (
                <div
                  className="mt-2 rounded-md border border-neutral-200 px-2 py-1.5 dark:border-neutral-700"
                  data-testid="workflow-guidance-restored-preview"
                  data-state={restoredVerdict.state}
                >
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="workflow-guidance-restored-preview-label"
                      className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      {restoredVerdict.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-neutral-600 dark:text-neutral-400">
                    {restoredVerdict.detail}
                  </p>
                  {/* Reopening is offered ONLY when reconciliation says the proposal
                      still fits the saved workflow — never as a disabled tease, and
                      never for a proposal whose payload didn't survive persistence. */}
                  {restoredVerdict.canReopen && onPreviewToCanvas && m.plan && m.preview && (
                    <button
                      type="button"
                      data-testid="workflow-guidance-restored-preview-reopen"
                      onClick={() => onPreviewToCanvas(toCanvasPayload(m))}
                      className="mt-1.5 rounded-md border border-neutral-300 px-2 py-1 text-[11.5px] font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      Show on canvas again
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH — guided-setup card lives INSIDE the transcript, after the
            latest assistant turn it belongs to, so it reads as part of React's response and scrolls with
            chat. The composer below stays pinned. Opaque node — the panel owns no preview-config logic. */}
        {transcriptFooter}
      </div>

      {/* DOC-REACT-AGENT-1 — the Document workspace supplies its own composer +
          agent actions (the bottom bar is the single entry point there), so this
          footer is suppressed rather than duplicated. The transcript above is
          identical in both surfaces. */}
      <div
        className={
          hideComposer
            ? "hidden"
            : "mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800"
        }
        {...(hideComposer ? { hidden: true, "aria-hidden": true as const } : {})}
      >
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
        <GuidanceTemplatePreviewDialog
          match={preview.previewMatch}
          busy={preview.busy}
          error={preview.error}
          onConfirmUse={preview.confirmUse}
          canApplyToCurrent={preview.canApplyToCurrent}
          onApplyToCurrent={preview.confirmApplyToCurrent}
          onClose={preview.closePreview}
        />
      )}
    </section>
  );
}
