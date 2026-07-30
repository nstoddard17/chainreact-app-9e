"use client";

import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { AgentConnectionSignal } from "@/core/workflows/agentReadiness";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";
import {
  buildPreviewApplySummary,
  type PreviewSetupRequirement,
} from "@/core/workflows/mapping/previewApplySummary";

/**
 * The pre-apply preview card — React chat rail (REACT-AGENT-PREAPPLY-SETUP-UX-1).
 *
 * This card answers ONE question: "here is what I'll create — shall I add it to
 * your draft?" It is a summary, not a form.
 *
 * It used to be a form, and that was the bug. Every collectable field rendered
 * as a live control before a single node existed: Stripe's entire event catalog
 * as a checkbox wall, a Slack channel picker that called the option resolver,
 * found the workspace disconnected, and offered "Reconnect in Apps" / "Enter ID
 * manually" / "Add to draft & open step" — with Apply pushed below all of it.
 * The user had to configure and connect before they could accept the sketch,
 * which is the exact inverse of the intended journey.
 *
 * The journey is now: **Preview explains → Apply creates → Connect resolves
 * integrations → Configure resolves fields → Test → Activate.** Applying is
 * never gated on setup; nodes may land with unresolved fields, and the guided
 * stages that follow are where those get resolved, one thing at a time, against
 * a real draft with real readiness.
 *
 * GUARANTEES: presentational only. No store access, no network/fetch, no option
 * resolver, no model/gateway/Hermes call, no secret. It renders names, labels
 * and fixed copy — never option lists, provider resources, connection recovery,
 * or manual-ID controls. The only action is Apply.
 */

export interface BuilderPreviewSetupCardProps {
  /** The latest preview shown on the canvas (owned by `WorkflowBuilder`). */
  readonly preview: DraftPreview;
  /** Metadata-derived fields per `provider:type` — used only to LABEL what's outstanding. */
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  /** Registry display name per `provider:type`; absent → the shared title-cased fallback. */
  readonly nodeDisplayNames?: Readonly<Record<string, string>>;
  /** Provider display names per slug, for the "<Provider> connection" rows. */
  readonly providerLabels?: Readonly<Record<string, string>>;
  /**
   * Server-resolved connection state for the providers this preview uses, so the
   * summary can say a connection will be needed. Unresolved → no connection rows
   * (the Connect stage after Apply establishes that truth; the preview never
   * guesses it).
   */
  readonly connection?: AgentConnectionSignal;
  /** Values the user's own request already supplied — shown as settled, not outstanding. */
  readonly prefilledConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** The explicit "Apply preview" action (additive local-draft edit). */
  readonly onApply: () => void;
}

function RequirementRow({ requirement }: { requirement: PreviewSetupRequirement }) {
  return (
    <li
      data-testid={`preview-requirement-${requirement.key}`}
      data-requirement-kind={requirement.kind}
      className="text-[11.5px]"
      style={{ color: "var(--builder-text)" }}
    >
      {requirement.label}
      {requirement.kind === "field" && requirement.stepName ? (
        <span style={{ color: "var(--builder-muted)" }}>{` — ${requirement.stepName}`}</span>
      ) : null}
    </li>
  );
}

export function BuilderPreviewSetupCard({
  preview,
  setupFieldsByType,
  nodeDisplayNames,
  providerLabels,
  connection,
  prefilledConfig,
  onApply,
}: BuilderPreviewSetupCardProps) {
  const { steps, requirements } = buildPreviewApplySummary({
    preview,
    ...(setupFieldsByType ? { setupFieldsByType } : {}),
    ...(nodeDisplayNames ? { nodeDisplayNames } : {}),
    ...(providerLabels ? { providerLabels } : {}),
    ...(connection ? { connection } : {}),
    ...(prefilledConfig ? { prefilledConfig } : {}),
  });

  return (
    <section
      data-testid="builder-preview-setup-rail"
      aria-label="Preview this workflow"
      className="mt-1 rounded-md border p-3"
      style={{ background: "var(--builder-panel-2)", borderColor: "var(--builder-border)" }}
    >
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--builder-text)" }}>
        Add this workflow to your draft
      </h3>

      <ol className="mt-1.5 space-y-0.5" data-testid="preview-summary-steps">
        {steps.map((step, i) => (
          <li
            key={step.previewId}
            data-testid={`preview-summary-step-${step.previewId}`}
            className="text-[11.5px]"
            style={{ color: "var(--builder-text)" }}
          >
            <span style={{ color: "var(--builder-muted)" }}>{i + 1}. </span>
            {step.name}
          </li>
        ))}
      </ol>

      {/*
        Apply sits directly under the step list and ABOVE the outstanding-setup
        list. The primary action must be reachable without reading, let alone
        scrolling past, everything that is still to do — that ordering is the
        whole point of this card.
      */}
      <button
        type="button"
        onClick={onApply}
        data-testid="builder-preview-setup-apply"
        className="mt-2.5 w-full rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white"
        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
        title="Add these steps to your draft — nothing is saved, activated, or run"
      >
        Apply to draft
      </button>

      {requirements.length > 0 ? (
        <div className="mt-2.5" data-testid="preview-setup-required">
          <div className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Setup required after you apply:
          </div>
          <ul className="mt-0.5 ml-3 list-disc space-y-0.5">
            {requirements.map((requirement) => (
              <RequirementRow key={requirement.key} requirement={requirement} />
            ))}
          </ul>
          <p className="mt-1 text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
            React will walk you through these once the steps are in your draft.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px]" style={{ color: "var(--builder-muted)" }}>
          Nothing else is needed — you can apply, test, and activate when you&apos;re ready.
        </p>
      )}

      <p className="mt-2 text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        Nothing is saved or activated until you choose to.
      </p>
    </section>
  );
}
