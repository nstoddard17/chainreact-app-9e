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
 * Non-applied "Draft preview" block.
 *
 * HERMES-AGENT-PREVIEW-DIFF-GRAPH — for an EDIT proposal (`isEdit`), the rail EXPLAINS the change in
 * plain language only: a "Proposed change:" line (the human summary) + an aggregated "Still needs:"
 * line. It does NOT repeat the canvas (no per-step provider:type list, no "Flow:" line) and exposes NO
 * internal operation counts / refs. The CANVAS visualizes the diff; the top control bar is the single
 * primary Apply. "Show on canvas" here is a SECONDARY re-show control (it applies/creates nothing). For
 * a new-workflow skeleton (not an edit) the step list still reads as the proposed build.
 */
export function GuidancePreviewSection({
  preview,
  plan,
  onPreviewToCanvas,
  isEdit = false,
}: {
  preview: DraftPreview;
  plan: WorkflowPlan | null;
  onPreviewToCanvas?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
  /** HERMES-AGENT-PREVIEW-DIFF-GRAPH — render the human edit summary instead of the proposed-build step list. */
  isEdit?: boolean;
}) {
  // Aggregate the still-missing field keys across the proposed nodes (deduped, order-preserving).
  const stillNeeds = Array.from(
    new Set(preview.nodes.flatMap((n) => n.missingInputs ?? [])),
  );

  return (
    <div
      data-testid="workflow-guidance-preview"
      className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {isEdit ? "Proposed change" : "Draft preview"}
      </h3>
      <p
        data-testid="workflow-guidance-preview-notice"
        className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
      >
        {preview.notice}
      </p>

      {isEdit ? (
        <>
          {preview.summary.length > 0 && (
            <p data-testid="workflow-guidance-preview-summary" className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
              {preview.summary}
            </p>
          )}
          {stillNeeds.length > 0 && (
            <p data-testid="workflow-guidance-preview-needs" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Still needs: {stillNeeds.join(", ")}
            </p>
          )}
        </>
      ) : (
        <>
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
        </>
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
