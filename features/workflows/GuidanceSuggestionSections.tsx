"use client";

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { Button } from "@/components/ui/button";

/**
 * Presentational, review-only "suggested plan" / non-applied "draft preview" blocks for the Hermes
 * guidance surface (HERMES-AGENT-PLAN-EXTRACTION / -DRAFT-PREVIEW). Extracted from
 * `WorkflowGuidancePanel` so the panel container stays focused on state/flow. Pure render — no fetch,
 * no mutation, no save/activate/run. "Show on canvas" only toggles the builder's non-applied overlay.
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
 * Reads as the proposed build: a per-step provider:type list + a "Flow:" line, with an optional
 * SECONDARY "Show on canvas" control (it applies/creates nothing). EDIT proposals are handled
 * separately by {@link GuidanceEditPreviewHint} — for an edit the canvas diff graph is the visual home
 * and the rail never duplicates a "Proposed change" card here. So this block has no edit mode.
 */
export function GuidancePreviewSection({
  preview,
  plan,
  onPreviewToCanvas,
}: {
  preview: DraftPreview;
  plan: WorkflowPlan | null;
  onPreviewToCanvas?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
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

      {onPreviewToCanvas && plan && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPreviewToCanvas({ plan, preview })}
          data-testid="workflow-guidance-show-on-canvas"
          className="mt-3"
        >
          Show on canvas
        </Button>
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

/**
 * Lightweight rail treatment for an EDIT preview (HERMES-AGENT-RAIL-EDIT-PREVIEW-NO-CARD).
 *
 * The canvas diff graph is the visual home for an edit preview and the top control bar owns Apply /
 * Discard, so the rail must NOT duplicate the old bordered "Proposed change" card or its primary
 * "Show on canvas" control. Two states:
 *
 *   - Preview already displayed on the canvas (`isDisplayedOnCanvas`): render NOTHING. The rail shows
 *     the conversational summary above ONLY; setup details live in the canvas/top bar and (when wired)
 *     the guided-setup card footer.
 *   - Preview NOT currently shown (auto-show failed, discarded, or superseded): render a lightweight
 *     setup-hint line + a SECONDARY "Show on canvas" recovery affordance — no bordered card, no primary
 *     Apply. Re-show requires a re-show callback + a validated plan; absent (e.g. dashboard) → no button.
 */
export function GuidanceEditPreviewHint({
  preview,
  plan,
  onShowOnCanvas,
  isDisplayedOnCanvas,
}: {
  preview: DraftPreview;
  plan: WorkflowPlan | null;
  /** Secondary re-show callback; absent → no canvas (dashboard) or re-show not wired. */
  onShowOnCanvas?: () => void;
  /** True when THIS preview is the one currently displayed on the canvas overlay. */
  isDisplayedOnCanvas: boolean;
}) {
  // Active on canvas → conversation summary only. No card, no hint, no primary control in the rail.
  if (isDisplayedOnCanvas) return null;

  // Recovery: the edit preview isn't on the canvas right now. Aggregate the still-missing field keys
  // (deduped, order-preserving) for a lightweight hint, humanized so the user sees friendly names
  // ("to" → "To"), never raw schema keys. Offer a secondary re-show if still possible.
  const stillNeeds = Array.from(new Set(preview.nodes.flatMap((n) => n.missingInputs ?? []))).map(humanizeFieldName);
  const canReshow = onShowOnCanvas != null && plan != null;
  if (stillNeeds.length === 0 && !canReshow) return null;

  return (
    <div data-testid="workflow-guidance-edit-recovery" className="mt-2 space-y-2">
      {stillNeeds.length > 0 && (
        <p
          data-testid="workflow-guidance-preview-needs"
          className="text-xs text-amber-700 dark:text-amber-400"
        >
          Still needs: {stillNeeds.join(", ")}
        </p>
      )}
      {canReshow && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onShowOnCanvas}
          data-testid="workflow-guidance-show-on-canvas"
        >
          Show on canvas
        </Button>
      )}
    </div>
  );
}
