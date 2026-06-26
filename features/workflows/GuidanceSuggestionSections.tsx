"use client";

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";

/**
 * Presentational, review-only "suggested plan" / non-applied "draft preview" blocks for the Hermes
 * guidance surface (HERMES-AGENT-PLAN-EXTRACTION / -DRAFT-PREVIEW). Extracted from
 * `WorkflowGuidancePanel` so the panel container stays focused on state/flow. Pure render — no fetch,
 * no mutation, no save/activate/run.
 *
 * There is NO manual "Show on canvas" control (HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH): a valid
 * proposal auto-shows on the canvas and the top preview bar owns Apply/Discard. The rail is
 * conversation/help only.
 */

/** Review-only advisory plan block (text). Shared by both guidance modes. No apply/create/run control. */
export function GuidancePlanSection({ plan }: { plan: WorkflowPlan }) {
  return (
    <div
      data-testid="workflow-guidance-plan"
      className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Suggested plan</h3>
      <p
        data-testid="workflow-guidance-plan-disclaimer"
        className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
      >
        Review only — this has not changed your workflow.
      </p>
      {plan.title.length > 0 && (
        <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">{plan.title}</p>
      )}
      {plan.summary.length > 0 && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{plan.summary}</p>
      )}
      <ol className="mt-2 space-y-1.5">
        {plan.steps.map((step, i) => (
          <li key={step.ref} className="text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">{i + 1}.</span>{" "}
            <span className="rounded bg-neutral-200 px-1 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {step.role}
            </span>{" "}
            <code className="text-xs">
              {step.provider}:{step.type}
            </code>
            {step.purpose.length > 0 && (
              <span className="text-neutral-600 dark:text-neutral-400"> — {step.purpose}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Non-applied "Draft preview" block for a NEW-workflow skeleton (not an edit).
 *
 * Reads as the proposed build: a per-step provider:type list + a "Flow:" line. It is INFORMATIONAL
 * only — a valid skeleton auto-shows on the canvas, so there is NO manual "Show on canvas" button here
 * (HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH). A same-shape restatement intentionally does not auto-show
 * (it would ghost duplicate nodes over the existing graph); in that case this block simply describes the
 * suggestion in the rail with no canvas push. EDIT proposals are handled by {@link GuidanceEditPreviewHint}.
 */
export function GuidancePreviewSection({
  preview,
}: {
  preview: DraftPreview;
  /** Accepted for call-site symmetry; not rendered (no manual canvas-push control). */
  plan?: WorkflowPlan | null;
}) {
  return (
    <div
      data-testid="workflow-guidance-preview"
      className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Draft preview</h3>
      <p
        data-testid="workflow-guidance-preview-notice"
        className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
      >
        {preview.notice}
      </p>

      {preview.title.length > 0 && (
        <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">{preview.title}</p>
      )}
      {preview.summary.length > 0 && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{preview.summary}</p>
      )}
      <ol className="mt-2 space-y-1.5">
        {preview.nodes.map((node, i) => (
          <li key={node.previewId} className="text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">{i + 1}.</span>{" "}
            <span className="rounded bg-neutral-200 px-1 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {node.role}
            </span>{" "}
            <code className="text-xs">{node.label}</code>
            {node.purpose.length > 0 && (
              <span className="text-neutral-600 dark:text-neutral-400"> — {node.purpose}</span>
            )}
            {node.missingInputs && node.missingInputs.length > 0 && (
              <span className="block pl-5 text-xs text-amber-700 dark:text-amber-400">
                Still needs: {node.missingInputs.join(", ")}
              </span>
            )}
          </li>
        ))}
      </ol>
      {preview.edges.length > 0 && (
        <p
          data-testid="workflow-guidance-preview-flow"
          className="mt-2 text-xs text-neutral-500 dark:text-neutral-400"
        >
          Flow: {preview.nodes.map((n) => n.label).join(" → ")}
        </p>
      )}
    </div>
  );
}

/**
 * Turn a raw schema field key into a friendly label for a setup hint ("to" → "To",
 * "channel_id" → "Channel Id"). A lightweight humanization used when a metadata label isn't available
 * at this layer (the guided-setup card uses real metadata labels). Never surfaces a raw key as-is.
 */
function humanizeFieldName(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Safe, actionable copy shown when a valid edit preview could not be auto-shown on the canvas. */
export const PREVIEW_AUTOSHOW_FAILED_MESSAGE =
  "I couldn't show that preview on the canvas. Ask React to try again.";

/**
 * Lightweight rail treatment for an EDIT preview (HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH).
 *
 * The canvas auto-shows a valid edit as a diff graph and the top preview bar owns Apply/Discard, so the
 * rail is conversation/help only — there is NO manual "Show on canvas" control (auto-show replaced it).
 * The rail renders, at most:
 *   - a lightweight, humanized "Still needs:" setup hint when fields are missing (so the user knows what
 *     to fill before Apply), and
 *   - an actionable ERROR line (not a button) ONLY when auto-show was attempted and the canvas still
 *     isn't showing the preview — a real failure, "Ask React to try again."
 * When the preview is displayed and nothing is missing, it renders nothing (the canvas + top bar own it).
 */
export function GuidanceEditPreviewHint({
  preview,
  isDisplayedOnCanvas,
  autoShowFailed = false,
}: {
  preview: DraftPreview;
  /** True when a preview is currently on the canvas (the builder's `previewOverlay != null`). */
  isDisplayedOnCanvas: boolean;
  /** True when auto-show was attempted for this proposal but the canvas isn't showing it (a failure). */
  autoShowFailed?: boolean;
}) {
  // Humanized still-missing field keys ("to" → "To"), deduped + order-preserving. Never raw schema keys.
  const stillNeeds = Array.from(new Set(preview.nodes.flatMap((n) => n.missingInputs ?? []))).map(humanizeFieldName);
  const showError = !isDisplayedOnCanvas && autoShowFailed;
  if (stillNeeds.length === 0 && !showError) return null;

  return (
    <div data-testid="workflow-guidance-edit-hint" className="mt-2 space-y-2">
      {showError && (
        <p data-testid="workflow-guidance-preview-error" className="text-xs text-amber-700 dark:text-amber-400">
          {PREVIEW_AUTOSHOW_FAILED_MESSAGE}
        </p>
      )}
      {stillNeeds.length > 0 && (
        <p
          data-testid="workflow-guidance-preview-needs"
          className="text-xs text-amber-700 dark:text-amber-400"
        >
          Still needs: {stillNeeds.join(", ")}
        </p>
      )}
    </div>
  );
}
