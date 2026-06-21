import type { KeyboardEvent } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";

/**
 * Shared constants + pure helpers for the "Build with me" guidance surface (HERMES-AGENT-GUIDANCE-UI).
 *
 * Extracted from `WorkflowGuidancePanel` so the single-shot (dashboard) and conversational (builder
 * rail) panels share ONE copy. Pure: no JSX, no state, no fetch, no model/Hermes call. Behavior is
 * byte-identical to the inline versions that lived in the panel.
 */

export const CHAT_PLACEHOLDER =
  "Describe what to add or change. For example: add a Slack message after the trigger.";

/**
 * BUILDER-AGENT-RAIL-CHECK-WORKFLOW — the review prompt the deterministic Check workflow path uses as
 * context for the optional, explicit "Ask React for deeper suggestions" follow-up. NOT auto-sent.
 */
export const CHECK_WORKFLOW_PROMPT = "Review my current workflow and suggest improvements or fixes.";
export const UNAVAILABLE_MESSAGE = "AI workflow guidance is temporarily unavailable.";
export const MAX_GOAL_LENGTH = 2_000;

/** Narrow the route's `workflowPlan` to a renderable plan with at least one step (else null). */
export function asRenderablePlan(value: WorkflowPlan | null | undefined): WorkflowPlan | null {
  if (!value || typeof value !== "object") return null;
  return Array.isArray(value.steps) && value.steps.length > 0 ? value : null;
}

/** Narrow the route's `previewDraft` to a renderable preview with at least one node (else null). */
export function asRenderablePreview(value: DraftPreview | null | undefined): DraftPreview | null {
  if (!value || typeof value !== "object") return null;
  return Array.isArray(value.nodes) && value.nodes.length > 0 ? value : null;
}

/** Map an unavailable/transport outcome to safe copy (credits denial keeps its specific message). */
export function safeErrorMessage(res: { code: string; message: string } | null): string {
  if (res && res.code === "AI_CREDITS_EXHAUSTED") return res.message;
  return UNAVAILABLE_MESSAGE;
}

/**
 * HERMES-AGENT-BUILDER-RAIL-ENTER-TO-SEND — Enter submits; Shift+Enter newlines; IME composition never
 * submits. `submit` already guards empty/whitespace + loading.
 */
export function submitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>, submit: () => void): void {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    submit();
  }
}
