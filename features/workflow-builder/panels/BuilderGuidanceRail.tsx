"use client";

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";

/**
 * Builder left-rail AI assistant — Hermes Agent workflow guidance
 * (HERMES-AGENT-REPLACE-BUILDER-AI-PLAN).
 *
 * This is now the SINGLE, primary builder AI entry point. It replaces the old
 * plan-based `BuilderAiPanel` (which called the deprecated
 * `POST /api/workflows/[id]/ai/plan`, currently 503) AND the separate floating
 * "Build with me" pill (`BuilderGuidanceEntry`). The user types a goal in the
 * left rail and gets Hermes guidance → optional draft preview → Show on canvas →
 * Apply preview, all through the EXISTING verified Hermes path.
 *
 * Network: it renders the dashboard's {@link WorkflowGuidancePanel} verbatim, so
 * it calls ONLY `POST /api/accounts/[id]/ai/workflow-guidance` (via the
 * `requestWorkflowGuidance` helper) — never the deprecated plan/apply endpoints,
 * never the Render gateway / a model vendor / Nous / the private Hermes Agent,
 * and never sees `CHAINREACT_AI_GATEWAY_TOKEN`. No new request logic is added
 * here. `accountId` + `workflowId` come from trusted server/builder props.
 *
 * Apply is still explicit + additive-local-draft only (the overlay's "Apply
 * preview" → `graphSlice.applyAdditivePatch`). This rail NEVER auto-saves,
 * activates, runs, or creates a separate workflow.
 *
 * Gating mirrors the dashboard: the live panel renders only when guidance is
 * enabled AND an account is resolved; otherwise a safe "unavailable" note shows
 * (no dead box, no call to a disabled route). The wrapper testid is always
 * present so the rail mount/collapse behavior is unaffected.
 */

export interface BuilderGuidanceRailProps {
  /** Owning account for the request — resolved server-side, never user-supplied. */
  readonly accountId?: string;
  /** The workflow currently open in the builder — forwarded as trusted draft context. */
  readonly workflowId: string;
  /** Server-evaluated `isHermesAgentEnabled()` (default OFF). */
  readonly guidanceEnabled?: boolean;
  /**
   * Hand the validated `WorkflowPlan` + display `DraftPreview` to the builder's
   * non-applied canvas overlay (UI state owned by `WorkflowBuilder`). Showing the
   * overlay applies/mutates nothing — an explicit "Apply preview" does the
   * additive local-draft edit.
   */
  readonly onShowPreview?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
}

export function BuilderGuidanceRail({
  accountId,
  workflowId,
  guidanceEnabled,
  onShowPreview,
}: BuilderGuidanceRailProps) {
  const available = guidanceEnabled === true && !!accountId;

  return (
    <section
      aria-label="AI assistant"
      data-testid="builder-guidance-rail"
      className="flex h-full min-h-0 flex-col"
      style={{ color: "var(--builder-text)" }}
    >
      {available ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Reuse the verified guidance panel verbatim — same helper / route / preview controls.
              The builder workflowId + the canvas-preview hook are the only builder-specific wiring. */}
          <WorkflowGuidancePanel
            accountId={accountId!}
            workflowId={workflowId}
            conversational
            {...(onShowPreview ? { onPreviewToCanvas: onShowPreview } : {})}
          />
        </div>
      ) : (
        <div
          data-testid="builder-guidance-rail-unavailable"
          className="m-2 rounded-md p-3 text-[12px]"
          style={{
            background: "var(--builder-panel-2)",
            border: "1px solid var(--builder-border)",
            color: "var(--builder-muted)",
          }}
        >
          AI guidance is currently unavailable. You can keep building your workflow manually.
        </div>
      )}
    </section>
  );
}
