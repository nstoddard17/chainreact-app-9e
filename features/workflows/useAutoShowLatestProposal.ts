"use client";

/**
 * Same-turn canvas delivery of the latest agent proposal
 * (REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1; extracted from ConversationalGuidancePanel's
 * REACT-LIVE-SKELETON auto-show effect).
 *
 * WHY THIS IS A BUILDER-LEVEL HOOK AND NOT A PANEL EFFECT: the effect used to live inside
 * `ConversationalGuidancePanel`, which is unmounted whenever the Document agent workspace is
 * collapsed (and while switching builder modes). A proposal that arrived during that window sat
 * invisibly in the conversation until the panel next mounted — which, in Document mode, is the
 * moment the user submits their NEXT message (`submit()` expands the workspace, mounting the
 * panel, whose fresh effect then flushed the OLD turn's proposal onto the canvas). That violated
 * the turn-integrity invariant: a proposal must render during the turn that produced it, never as
 * an apparent result of a later, unrelated message.
 *
 * Hosting the hook in `WorkflowBuilder` (mounted for the whole builder session, whatever surface
 * is showing) guarantees:
 *   - the proposal reaches the canvas in the same turn that produced it, panel mounted or not;
 *   - the once-per-message bookkeeping survives panel remounts (no duplicate auto-show, no
 *     `previewConfig`/provenance wipe, no duplicate `emitPreviewCreated`);
 *   - a message judged not-meaningful is marked HANDLED — it can never pop onto the canvas later
 *     when the graph shape drifts.
 *
 * Semantics preserved from the original effect: only the LATEST non-restored assistant turn is
 * considered; auto-show happens at most once per message; edit proposals (proposedDefinition)
 * always show; new-workflow skeletons show only when meaningfully different from the current
 * graph; a no-plan/clarifying turn never clears a standing preview; display-only (Apply stays an
 * explicit click). Restored turns are never auto-shown (REACT-AGENT-CONVERSATION-PERSISTENCE-1).
 */

import { useEffect, useRef } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import {
  isPlanMeaningfulCanvasPreview,
  type CanvasPreviewGraphNode,
} from "@/core/workflows/canvasPreviewEligibility";
import type { GuidanceChatMessage } from "./useGuidanceConversation";

export interface AgentProposalCanvasPayload {
  plan: WorkflowPlan;
  preview: DraftPreview;
  proposedDefinition?: WorkflowDefinition;
  baseGraphVersion?: string;
  prompt?: string;
  agentChangeId?: string;
}

type AssistantMessage = Extract<GuidanceChatMessage, { role: "assistant" }>;

/** Build the canvas-overlay payload from an assistant turn (shared with the panel's reopen path). */
export function toCanvasPayload(m: AssistantMessage): AgentProposalCanvasPayload {
  return {
    plan: m.plan!,
    preview: m.preview!,
    ...(m.proposedDefinition ? { proposedDefinition: m.proposedDefinition } : {}),
    ...(m.baseGraphVersion ? { baseGraphVersion: m.baseGraphVersion } : {}),
    // CHECKPOINTS-1 — carry the user prompt so the builder can name the pre-apply checkpoint.
    ...(m.prompt ? { prompt: m.prompt } : {}),
    // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the lifecycle correlation id minted with the
    // proposal, so preview/apply/discard and the persisted transcript transition the SAME row.
    ...(m.agentChangeId ? { agentChangeId: m.agentChangeId } : {}),
  };
}

export interface UseAutoShowLatestProposalInput {
  readonly messages: readonly GuidanceChatMessage[];
  /** The builder's show-preview handler. Absent (dashboard/local-only) → the hook is inert. */
  readonly onPreviewToCanvas?:
    | ((payload: AgentProposalCanvasPayload) => void)
    | undefined;
  /** Live draft graph shape for the same-shape meaningfulness guard. */
  readonly getCurrentGraphShape?: (() => readonly CanvasPreviewGraphNode[]) | undefined;
}

export function useAutoShowLatestProposal(input: UseAutoShowLatestProposalInput): void {
  const { messages, onPreviewToCanvas, getCurrentGraphShape } = input;
  /** The last assistant-message id this hook has HANDLED (shown or deliberately skipped). */
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onPreviewToCanvas) return;
    let latest: AssistantMessage | null = null;
    for (const m of messages) {
      if (m.role === "assistant" && !m.restored) latest = m;
    }
    if (!latest || !latest.preview || !latest.plan) return;
    if (handledRef.current === latest.id) return; // already handled this turn
    // HERMES-AGENT-WORKFLOW-EDITOR — an EDIT proposal (proposedDefinition) is a change by
    // construction (it may even SHRINK the graph), so the same-shape guard — which only fits
    // ADD-shaped previews — does not apply. New-workflow skeletons keep the guard so a same-shape
    // restatement doesn't ghost duplicates.
    const meaningful =
      latest.proposedDefinition != null ||
      getCurrentGraphShape == null ||
      isPlanMeaningfulCanvasPreview({ currentGraph: getCurrentGraphShape(), plan: latest.plan });
    // Mark handled BEFORE the meaningfulness branch resolves the show: a skipped message must stay
    // skipped (turn integrity — it may never surface later as if a newer turn produced it).
    handledRef.current = latest.id;
    if (!meaningful) return;
    onPreviewToCanvas(toCanvasPayload(latest));
  }, [messages, onPreviewToCanvas, getCurrentGraphShape]);
}
