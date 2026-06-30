"use client";

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";
import type { ReactNode } from "react";
import type {
  CheckWorkflowReviewContext,
  CheckWorkflowSetupTarget,
} from "@/core/workflows/checkWorkflowReview";
import type { CanvasPreviewGraphNode } from "@/core/workflows/canvasPreviewEligibility";
import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";
import { BuilderPreviewSetupCard } from "./BuilderPreviewSetupCard";

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
  readonly onShowPreview?: (payload: { plan: WorkflowPlan; preview: DraftPreview; proposedDefinition?: WorkflowDefinition; prompt?: string }) => void;
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR — getter for the user's CURRENT local draft (stable ids + config +
   * edges), forwarded to the panel so a change request is proposed against the live canvas.
   */
  readonly getCurrentDraft?: () => WorkflowDefinition;
  /**
   * HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX — the LATEST preview shown on the canvas. When present,
   * the rail renders a compact "Finish these details" setup card below the chat, tied to this preview.
   * Owned by `WorkflowBuilder` (the same state that drives the holographic overlay). Absent → no card.
   */
  readonly previewForSetup?: DraftPreview | null;
  /** Supported, metadata-derived setup fields per `provider:type` (drives the card's controls). */
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  /** Ephemeral guided-setup values (previewId → field → value). Owned by `WorkflowBuilder`. */
  readonly previewConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Record one ephemeral setup value. Preview-only — never mutates the real draft before Apply. */
  readonly onPreviewConfigChange?: (previewId: string, fieldName: string, value: unknown) => void;
  /** The existing explicit "Apply preview" action — seeds previewConfig into the new draft nodes. */
  readonly onApplyPreview?: () => void;
  /**
   * BUILDER-AGENT-RAIL-CHECK-WORKFLOW-REVIEW — getter for the current DETERMINISTIC validation snapshot
   * (the builder computes it from the same validator that drives the header pill / validation drawer).
   * Forwarded verbatim to the panel so the "Check workflow" review reflects, and never contradicts, the
   * validation surface. Absent → the pill is a plain prefill.
   */
  readonly getCheckReviewContext?: () => CheckWorkflowReviewContext;
  /**
   * BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD — getter for the live draft graph shape (kind/provider/type
   * only). Forwarded to the panel so "Show on canvas" is suppressed for a same-shape restatement.
   */
  readonly getCurrentGraphShape?: () => readonly CanvasPreviewGraphNode[];
  /**
   * BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP — render the inline "Fix setup issues" card for existing
   * draft nodes the Check workflow review found with missing required fields. Forwarded to the panel.
   */
  readonly renderCheckSetup?: (targets: readonly CheckWorkflowSetupTarget[]) => ReactNode;
  /**
   * ANON-BUILDER-2 — one-shot composer seed (e.g. the prompt restored from an
   * anonymous draft after sign-up). Forwarded to the conversational panel, which
   * fills only an empty, untouched composer and never auto-sends.
   */
  readonly initialComposerValue?: string;
  /**
   * CHECKPOINTS-1 — the recent-checkpoints surface, rendered as a fixed footer
   * region below the scrollable chat (owned by `WorkflowBuilder`, which holds the
   * useWorkflowCheckpoints hook + graph re-hydration). Absent → no footer.
   */
  readonly checkpointsPanel?: ReactNode;
}

export function BuilderGuidanceRail({
  accountId,
  workflowId,
  guidanceEnabled,
  onShowPreview,
  getCurrentDraft,
  previewForSetup,
  setupFieldsByType,
  previewConfig,
  onPreviewConfigChange,
  onApplyPreview,
  getCheckReviewContext,
  getCurrentGraphShape,
  renderCheckSetup,
  initialComposerValue,
  checkpointsPanel,
}: BuilderGuidanceRailProps) {
  // HERMES-AGENT-BUILDER-RAIL-CHAT-AVAILABLE — a SINGLE availability decision with a dev-observable
  // reason. `available` renders the conversational chat; otherwise the "unavailable" note carries a
  // safe `data-reason` (no secrets) so the empty-rail state is diagnosable in tests/logs. Only TRUE
  // unavailable states qualify: Hermes disabled (`guidance-disabled`) or no resolved account
  // (`no-account`). With both present, the chat input renders.
  const unavailableReason: "guidance-disabled" | "no-account" | null =
    guidanceEnabled !== true ? "guidance-disabled" : !accountId ? "no-account" : null;
  const available = unavailableReason === null;

  return (
    <section
      aria-label="AI assistant"
      data-testid="builder-guidance-rail"
      className="flex h-full min-h-0 flex-col"
      style={{ color: "var(--builder-text)" }}
    >
      {available ? (
        <div className="min-h-0 flex-1">
          {/* Reuse the verified guidance panel verbatim — same helper / route / preview controls.
              The builder workflowId + the canvas-preview hook are the only builder-specific wiring.
              HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH — the guided-setup card is passed as the transcript
              FOOTER so it renders INSIDE the scrollable chat (after the latest response), and the panel's
              composer stays pinned at the bottom. It is NOT a sibling below the composer. */}
          <WorkflowGuidancePanel
            accountId={accountId!}
            workflowId={workflowId}
            conversational
            {...(getCheckReviewContext ? { getCheckReviewContext } : {})}
            {...(getCurrentGraphShape ? { getCurrentGraphShape } : {})}
            {...(getCurrentDraft ? { getCurrentDraft } : {})}
            {...(renderCheckSetup ? { renderCheckSetup } : {})}
            {...(initialComposerValue ? { initialComposerValue } : {})}
            {...(onShowPreview ? { onPreviewToCanvas: onShowPreview } : {})}
            {...(previewForSetup && onPreviewConfigChange && onApplyPreview
              ? {
                  transcriptFooter: (
                    <BuilderPreviewSetupCard
                      preview={previewForSetup}
                      {...(setupFieldsByType ? { setupFieldsByType } : {})}
                      {...(previewConfig ? { previewConfig } : {})}
                      onPreviewConfigChange={onPreviewConfigChange}
                      onApply={onApplyPreview}
                      workflowId={workflowId}
                    />
                  ),
                }
              : {})}
          />
        </div>
      ) : (
        <></>
      )}
      {/* CHECKPOINTS-1 — recent-checkpoints footer. Shown whenever the builder supplies it
          (independent of guidance availability — checkpoints can be restored even if the
          agent is off). Fixed region below the scrollable chat. */}
      {checkpointsPanel ? <div className="shrink-0">{checkpointsPanel}</div> : null}
      {!available ? (
        <div
          data-testid="builder-guidance-rail-unavailable"
          data-reason={unavailableReason ?? undefined}
          className="m-2 rounded-md p-3 text-[12px]"
          style={{
            background: "var(--builder-panel-2)",
            border: "1px solid var(--builder-border)",
            color: "var(--builder-muted)",
          }}
        >
          AI guidance is currently unavailable. You can keep building your workflow manually.
        </div>
      ) : null}
    </section>
  );
}
