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
import {
  WorkflowGuidancePanel,
  type WorkflowGuidancePanelProps,
} from "@/features/workflows/WorkflowGuidancePanel";
import type { ComposerSeed } from "@/features/workflows/composerSeed";
import type { GuidanceConversation } from "@/features/workflows/useGuidanceConversation";
import {
  BuilderPreviewSetupCard,
  type BuilderPreviewSetupCardProps,
} from "./BuilderPreviewSetupCard";

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
  /**
   * REACT-AGENT-RAIL-NODE-DISPLAY-NAMES-1 — registry display name per `provider:type`
   * (`slack:send_channel_message` → "Send Channel Message"), so the setup card names each step the
   * way the canvas and the config panel do instead of printing the raw capability key. Absent → the
   * card title-cases the type key itself (the shared `getNodeDisplayName` fallback).
   */
  readonly nodeDisplayNames?: Readonly<Record<string, string>>;
  /** Ephemeral guided-setup values (previewId → field → value). Owned by `WorkflowBuilder`. */
  readonly previewConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** REACT-CONFIG-COVERAGE-1 — user-request plan-config values (previewId → field → value) for display. */
  readonly previewPrefilledConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Record one ephemeral setup value. Preview-only — never mutates the real draft before Apply. */
  readonly onPreviewConfigChange?: (previewId: string, fieldName: string, value: unknown) => void;
  /**
   * REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1 — the preview-enrichment outcome from
   * `useBuilderPreview`, forwarded verbatim so the setup card can show which fields were mapped
   * automatically and which still need the user. Absent → the card renders as before.
   */
  readonly previewEnrichment?: BuilderPreviewSetupCardProps["enrichment"];
  /** The existing explicit "Apply preview" action — seeds previewConfig into the new draft nodes. */
  readonly onApplyPreview?: () => void;
  /**
   * REACT-AGENT-RESOLVER-RECOVERY-1 — provider display labels, so a field whose options failed to
   * load can name its provider honestly ("We couldn't load your Typeform forms.").
   */
  readonly providerLabels?: Readonly<Record<string, string>>;
  /**
   * REACT-AGENT-RESOLVER-RECOVERY-1 — the setup card's escape hatch for a preview field whose
   * options cannot load: apply this preview to the local draft (seeding everything already entered)
   * and open the resulting node's config panel focused on that field. Absent → not offered.
   */
  readonly onOpenPreviewStepEditor?: (previewId: string, fieldName: string) => void;
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
   * 5.DUAL-BUILDER-1 CS-7 — the keyed/versioned composer seed. Forwarded to the
   * conversational panel: a `restore` seed fills only an empty composer; an
   * explicit Document Ask React seed replaces it and a later version supersedes
   * an earlier unsent one. Never auto-sends.
   */
  readonly composerSeed?: ComposerSeed;
  /**
   * AI-TEMPLATE-APPLY-CURRENT — apply a React-Agent-suggested official template to the CURRENTLY-OPEN
   * workflow in place (overwrites the current draft via replace-from-template, with a pre-replace
   * checkpoint + History, then re-hydrates the canvas). Forwarded to the panel so the template match
   * dialog can offer "Apply to current workflow" as the primary choice. Owned by `WorkflowBuilder`.
   */
  readonly onTemplateApplyToCurrent?: (input: { templateId: string; templateName: string }) => Promise<void>;
  /**
   * DOC-REACT-AGENT-1 — the SHARED React Agent conversation owned by
   * `WorkflowBuilder`. Passing it makes this rail one PRESENTATION of the agent
   * rather than an agent of its own, so the Document workspace shows the same
   * transcript and a mode switch loses nothing. Absent → the panel owns its own.
   */
  readonly conversation?: GuidanceConversation;
  /**
   * DOC-REACT-AGENT-1 — suppress the panel's own composer footer. The Document
   * workspace supplies the composer (the bottom bar is the single entry point
   * there); the transcript is identical in both surfaces.
   */
  readonly hideComposer?: boolean;
  /**
   * REACT-AGENT-GUIDED-BUILD-1 — the guided build card (Connect → Configure →
   * Test → Activate), rendered as the transcript footer while a guided session
   * is active. The PREVIEW setup card wins while a preview is being reviewed
   * (that stage's surface); the guided card takes the slot afterwards. Owned by
   * `WorkflowBuilder` via `useGuidedBuild`.
   */
  readonly guidedFooter?: ReactNode;
  /**
   * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — judge a RESTORED proposal against
   * the saved workflow ("Not saved" / "Applied" / "Discarded" / "Stale") and say
   * whether reopening it is safe. Owned by `WorkflowBuilder` (only it knows the
   * saved graph revision and the change-history lifecycle rows); forwarded
   * verbatim so the rail stays presentation.
   */
  readonly reconcileRestoredPreview?: WorkflowGuidancePanelProps["reconcileRestoredPreview"];
}

export function BuilderGuidanceRail({
  accountId,
  workflowId,
  guidanceEnabled,
  onShowPreview,
  getCurrentDraft,
  previewForSetup,
  setupFieldsByType,
  nodeDisplayNames,
  previewConfig,
  previewPrefilledConfig,
  onPreviewConfigChange,
  previewEnrichment,
  onApplyPreview,
  providerLabels,
  onOpenPreviewStepEditor,
  getCheckReviewContext,
  getCurrentGraphShape,
  renderCheckSetup,
  composerSeed,
  onTemplateApplyToCurrent,
  conversation,
  hideComposer,
  guidedFooter,
  reconcileRestoredPreview,
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
            {...(composerSeed ? { composerSeed } : {})}
            {...(onTemplateApplyToCurrent ? { onTemplateApplyToCurrent } : {})}
            {...(conversation ? { conversation } : {})}
            {...(hideComposer ? { hideComposer } : {})}
            {...(reconcileRestoredPreview ? { reconcileRestoredPreview } : {})}
            {...(onShowPreview ? { onPreviewToCanvas: onShowPreview } : {})}
            {...(previewForSetup && onPreviewConfigChange && onApplyPreview
              ? {
                  transcriptFooter: (
                    <BuilderPreviewSetupCard
                      preview={previewForSetup}
                      {...(setupFieldsByType ? { setupFieldsByType } : {})}
                      {...(nodeDisplayNames ? { nodeDisplayNames } : {})}
                      {...(previewConfig ? { previewConfig } : {})}
                      {...(previewPrefilledConfig ? { prefilledConfig: previewPrefilledConfig } : {})}
                      {...(previewEnrichment ? { enrichment: previewEnrichment } : {})}
                      onPreviewConfigChange={onPreviewConfigChange}
                      onApply={onApplyPreview}
                      workflowId={workflowId}
                      {...(providerLabels ? { providerLabels } : {})}
                      {...(onOpenPreviewStepEditor ? { onOpenStepEditor: onOpenPreviewStepEditor } : {})}
                    />
                  ),
                }
              : guidedFooter
                ? { transcriptFooter: guidedFooter }
                : {})}
          />
        </div>
      ) : (
        <></>
      )}
      {/* AGENT-CHANGE-HISTORY-1 — the agent-change / checkpoint timeline moved OUT of the rail into
          the top-level "History" tab. The rail is now chat-only (plus the unavailable note). */}
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
