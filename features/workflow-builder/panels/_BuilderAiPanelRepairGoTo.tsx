"use client";

import { Button } from "@/components/ui/button";
import type { AgentWorkflowDiagnosis, RepairPreview, SelectedRepair } from "@/lib/api/ai";
import { missingFieldNodeIds } from "../ai/firstMissingFieldNodeId";
import { setupFindingCards } from "../ai/setupFindings";
import { attentionFindingCards, danglingEdgeCards, invalidReferenceCards } from "../ai/attentionFindings";
import { DanglingEdgeCardView, InvalidReferenceCardView } from "./_BuilderAiPanelInvalidRefCard";
import {
  useRepairFieldTarget,
  useRepairFieldTargets,
  type RepairFieldTarget,
} from "../ai/useRepairFieldTarget";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Slice 4.AI-CONFIG-ASSIST CS-4/CS-5 â€” the single navigation seam shared by every
 * "Open <field> field" affordance (diagnosis card + repair proposal). Selects the
 * node, opens its config rail, pans/zooms the canvas to it (via `useCanvasNodeFocus`),
 * and highlights the field. NAVIGATION ONLY â€” never writes a value, saves, runs, or
 * mutates the graph. After it runs, the highlighted field is what activates chat-fill.
 */
function revealFieldTarget(target: RepairFieldTarget): void {
  useConfigSlice.getState().revealNode({
    nodeId: target.nodeId,
    initialValues: target.initialValues,
    fieldKey: target.fieldKey,
  });
}

/**
 * Slice 4.AI-REPAIR-2F â€” "Go to field" navigation affordance for a blocked
 * repair preview. NAVIGATION ONLY: selects the affected node, opens its config
 * rail, pans the canvas to it, and highlights the field. NEVER writes a config
 * value, saves, runs, or mutates the graph â€” and there is NO Apply control.
 * Renders nothing unless the preview carries a `nodeId` focus target plus a
 * display LABEL; labels are the only thing shown (raw id/key are targets only).
 * Absent metadata (e.g. rehydrated history) â†’ safe guidance with no button.
 */
export function RepairPreviewGoToTarget({
  preview,
}: {
  readonly preview: RepairPreview;
}) {
  // First blocked error that carries a node focus target AND a display label.
  const target = preview.validation.errors.find(
    (e) => e.nodeId && (e.fieldLabel || e.nodeLabel),
  );
  if (!target || !target.nodeId) return null;

  const { nodeId, path: fieldKey, fieldLabel, nodeLabel } = target;
  // Labels only â€” never the raw nodeId / field key.
  const label = fieldLabel ? `Open ${fieldLabel} field` : `Go to ${nodeLabel}`;

  function handleClick() {
    // Resolve the node's CURRENT config from the live graph for the rail draft.
    // If the node isn't on the canvas (stale preview), no-op â€” never throw.
    const node = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId);
    if (!node) return;
    useConfigSlice.getState().revealNode({
      nodeId: node.id,
      initialValues: node.config,
      ...(fieldKey ? { fieldKey } : {}),
    });
  }

  return (
    <div className="pt-0.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        data-testid="builder-ai-repair-preview-goto"
        className="h-7 text-xs"
      >
        {label}
      </Button>
    </div>
  );
}

/**
 * Slice 4.AI-CONFIG-ASSIST CS-4 â€” action area for a repair PROPOSAL bubble.
 *
 * Product rule: a KNOWN, user-input-required missing field is something only the
 * user can fill â€” so don't force them to run a (paid) "Preview fix" of a
 * non-automatic fix just to open the field. When `goToNodeId` resolves to a node
 * with a still-empty required field (`useRepairFieldTarget`), the PRIMARY action
 * becomes "Open <field> field" â€” the SAME navigation seam (`revealNode`) the
 * blocked-preview "Go to field" button uses: it selects the node, opens its config
 * rail, pans/zooms the canvas, and highlights the field. NAVIGATION ONLY â€” it never
 * writes a config value, saves, runs, or mutates the graph; there is no Apply.
 *
 * "Preview fix" is NOT removed â€” when a target exists it's demoted to a secondary
 * control (still available for inspecting an actual patch). When there is NO
 * targetable field (the issue isn't a single fillable field, or the field is
 * already filled), the original Preview-fix-only block renders unchanged.
 *
 * Labels only ever show field/node DISPLAY labels â€” never the raw id / field key.
 */
export function RepairProposalActions({
  goToNodeId,
  canPreview,
  previewing,
  alreadyPreviewed,
  onPreviewFix,
}: {
  /** Internal target node id from the diagnosis, or null when none is targetable. */
  readonly goToNodeId: string | null;
  /** Whether the (paid) "Preview fix" affordance should be offered at all. */
  readonly canPreview: boolean;
  readonly previewing: boolean;
  readonly alreadyPreviewed: boolean;
  readonly onPreviewFix?: () => void;
}) {
  const target = useRepairFieldTarget(goToNodeId);

  // The "Preview fix" control â€” identical behavior whether it's the sole action
  // (no target) or a secondary control beside "Open <field> field" (target present).
  const previewButton = canPreview ? (
    <Button
      type="button"
      size="sm"
      variant={target ? "ghost" : "outline"}
      onClick={onPreviewFix}
      disabled={previewing || alreadyPreviewed}
      data-testid="builder-ai-preview-fix-button"
      {...(target ? { className: "h-7 text-xs" } : {})}
    >
      {previewing ? "Previewing fixâ€¦" : alreadyPreviewed ? "Previewed" : "Preview fix"}
    </Button>
  ) : null;

  if (target) {
    return (
      <div
        data-testid="builder-ai-repair-open-field"
        className="flex flex-col gap-1 pt-1"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => revealFieldTarget(target)}
            data-testid="builder-ai-repair-open-field-button"
          >
            Open {target.fieldLabel} field
          </Button>
          {previewButton}
        </div>
        <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
          Opens the step and highlights the field so you can fill it in. Nothing is
          changed, saved, or run.
        </p>
      </div>
    );
  }

  // No targetable field â†’ the original Preview-fix-only block (markup unchanged).
  if (!canPreview) return null;
  return (
    <div data-testid="builder-ai-repair-preview-fix" className="flex flex-col gap-1 pt-1">
      <div>{previewButton}</div>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        AI proposes specific changes and shows what would change. Nothing is applied,
        saved, or run.
      </p>
    </div>
  );
}

/**
 * Slice 4.AI-CONFIG-ASSIST CS-8 â€” the open-field actions for ONE diagnosed node:
 * one "Open <field> field" button per still-empty required field on that node. A
 * node-scoped component so the per-provider metadata hook (`useRepairFieldTargets`)
 * resolves correctly for an arbitrary node. Renders nothing when nothing required is
 * empty / the node isn't on the canvas / its metadata isn't loaded (so a stale or
 * already-filled node shows no button â€” never a broken one). Labels only.
 *
 * Open-field navigation is offered for EVERY empty required field (including
 * recipient/destination fields CS-1 blocks from chat-fill) â€” the button only opens +
 * highlights; chat-fill is suggested separately (CS-6) and stays eligibility-gated.
 */
function NodeFieldActions({ nodeId }: { readonly nodeId: string }) {
  const targets = useRepairFieldTargets(nodeId);
  if (targets.length === 0) return null;
  return (
    <>
      {targets.map((target) => (
        <li
          key={`${target.nodeId}:${target.fieldKey}`}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
        >
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => revealFieldTarget(target)}
            data-testid="builder-ai-diagnosis-open-field-button"
          >
            Open {target.fieldLabel} field
          </Button>
          <span className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
            on {target.nodeLabel}
          </span>
        </li>
      ))}
    </>
  );
}

/**
 * Slice 4.AI-CONFIG-ASSIST CS-5/CS-8 â€” the "Needs your input" actionable group on the
 * "Check workflow" diagnosis card.
 *
 * Product model: Check produces actionable issue cards whose PRIMARY action fits the
 * problem type. For missing user-input fields (e.g. Slack "Send Channel Message"
 * missing Message), that action is "Open <field> field" â€” the user just needs to fill
 * it, so they should NOT have to run "Suggest a fix" or "Preview fix" first. CS-8
 * generalizes CS-5 from a single target to ALL missing-required-field nodes: one
 * action per (node, empty required field), across every affected node, de-duplicated.
 * Each reuses the SAME `revealNode` navigation (select node â†’ open rail â†’ pan/zoom â†’
 * highlight field); highlighting a field is what then arms chat-fill (CS-3/CS-6).
 *
 * Connection/setup, structural, and run findings are NOT rendered here â€” they stay in
 * the deterministic `nextSteps` guidance (never offered an open-field/chat-fill action).
 *
 * NAVIGATION ONLY â€” never writes a config value, saves, runs, or mutates the graph;
 * there is no Apply. Shows only display LABELS â€” never the raw node id / field key.
 */
export function DiagnosisFieldActions({
  diagnosis,
}: {
  readonly diagnosis: AgentWorkflowDiagnosis;
}) {
  const nodeIds = missingFieldNodeIds(diagnosis);
  if (nodeIds.length === 0) return null;
  return (
    <div data-testid="builder-ai-diagnosis-open-field" className="flex flex-col gap-1 pt-1">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-text)" }}>
        Needs your input
      </p>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        Fill these fields before this workflow can run.
      </p>
      <ul className="flex flex-col gap-1">
        {nodeIds.map((id) => (
          <NodeFieldActions key={id} nodeId={id} />
        ))}
      </ul>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        Opens the step and highlights the field so you can fill it in â€” then type the
        value in chat. Nothing is changed, saved, or run.
      </p>
    </div>
  );
}

/**
 * Slice 4.CHECK-ACTIONS-1 â€” the "Needs setup" actionable group on the "Check
 * workflow" diagnosis card.
 *
 * Product model: Check produces actionable issue cards whose PRIMARY action fits the
 * problem TYPE. Setup/auth/connection problems (provider disconnected, token expired,
 * reconnect required, missing permissions, owner-must-reconnect) are NOT missing-field
 * problems â€” they can't be filled in chat and there's no automatic patch. So they get
 * their own group: friendly guidance plus, when the current user can act on it, a link
 * to the existing Apps page (`/apps`) â€” the SAME safe destination the builder's
 * combobox-field "Reconnect â€¦ in Apps" guidance already uses.
 *
 * Classification + copy live in the pure `setupFindingCards` helper. Guidance-only
 * findings (owner-must-reconnect, provider disabled/unknown) render text with NO
 * button â€” never a broken affordance. This group offers NO open-field action and arms
 * NO chat-fill (it never calls `revealNode`); chat-fill is exclusively for missing
 * user-input fields (CS-1/CS-6).
 *
 * NAVIGATION ONLY â€” links out to Apps; never writes config, saves, runs, or mutates
 * the graph; there is no Apply. Shows only the provider's public display name â€” never a
 * raw code, node id, field key, scope name, or provider error string.
 */
export function DiagnosisSetupActions({
  diagnosis,
}: {
  readonly diagnosis: AgentWorkflowDiagnosis;
}) {
  const cards = setupFindingCards(diagnosis);
  if (cards.length === 0) return null;
  return (
    <div data-testid="builder-ai-diagnosis-setup" className="flex flex-col gap-1 pt-1">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-text)" }}>
        Needs setup
      </p>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        Reconnect or update app access.
      </p>
      <ul className="flex flex-col gap-1.5">
        {cards.map((card) => (
          <li
            key={card.key}
            data-testid="builder-ai-diagnosis-setup-item"
            className="flex flex-col gap-0.5 text-xs"
          >
            <span style={{ color: "var(--builder-text)" }}>{card.message}</span>
            {card.action && (
              <a
                href={card.action.href}
                data-testid="builder-ai-diagnosis-setup-link"
                className="font-medium underline underline-offset-2"
                style={{ color: "var(--builder-text)" }}
              >
                {card.action.label}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        These need attention outside the builder. Nothing here is changed, saved, or run.
      </p>
    </div>
  );
}

/**
 * Slice 4.CHECK-ACTIONS-2 â€” the "Needs attention" manual-guidance group on the "Check
 * workflow" diagnosis card.
 *
 * Holds the non-targetable issues that aren't a missing field (â†’ "Needs your input")
 * or a connection/auth problem (â†’ "Needs setup"): structural/graph problems and a
 * failed most-recent run. Each renders deterministic, friendly guidance with NO button
 * â€” there's no single safe in-app action for "no trigger" or "the last run failed", so
 * this group never renders a broken affordance.
 *
 * Classification + copy live in the pure `attentionFindingCards` helper. Read-only:
 * never writes config, saves, runs, or mutates the graph. Shows only guidance text â€”
 * never a raw code, node id, field key, provider/type key, or config value.
 */
export function DiagnosisAttentionActions({
  diagnosis,
  onPreviewInvalidRef,
  onPreviewSelectedInvalidRef,
  onPreviewDanglingEdge,
  previewing = false,
  alreadyPreviewedInvalidRef = false,
}: {
  readonly diagnosis: AgentWorkflowDiagnosis;
  /**
   * AI-REPAIR-3K â€” explicit-click handler for the one-candidate "Preview fix" action.
   * Runs the SAME deterministic repair-preview round-trip the repair-proposal "Preview
   * fix" uses (no LLM / no credits / no model telemetry â€” the route runs the
   * deterministic path BEFORE the gate, AI-REPAIR-3H). Absent â†’ no Preview-fix button
   * is offered (Open-field manual guidance only), so a historical/non-latest diagnosis
   * never shows it.
   */
  readonly onPreviewInvalidRef?: () => void;
  /**
   * AI-REPAIR-3L â€” explicit-choice handler for the MULTIPLE-candidate case. The user
   * picks a replacement from the safe candidate list, then this previews THAT exact
   * choice deterministically (re-validated server-side; no LLM / no credits / no
   * telemetry). The app never auto-picks. Absent â†’ no picker is offered.
   */
  readonly onPreviewSelectedInvalidRef?: (selection: SelectedRepair) => void;
  /**
   * AI-REPAIR-4A — explicit-click handler for the dangling/broken-edge "Preview fix".
   * Runs the deterministic `removeEdge` cleanup preview (no LLM / no credits / no
   * telemetry). Absent → no Preview-fix button on the dangling-edge card.
   */
  readonly onPreviewDanglingEdge?: () => void;
  /** A preview round-trip is in flight (disables the Preview-fix button). */
  readonly previewing?: boolean;
  /** This diagnosis already triggered a preview (disables + relabels â€” no repeat). */
  readonly alreadyPreviewedInvalidRef?: boolean;
}) {
  const cards = attentionFindingCards(diagnosis);
  // AI-REPAIR-3I â€” actionable broken-variable-reference cards (each with an
  // "Open <field> field" button) render in the SAME "Needs attention" group.
  const refCards = invalidReferenceCards(diagnosis);
  // AI-REPAIR-4A — actionable dangling/broken-edge cards (each with a "Preview fix").
  const edgeCards = danglingEdgeCards(diagnosis);
  if (cards.length === 0 && refCards.length === 0 && edgeCards.length === 0) return null;
  return (
    <div data-testid="builder-ai-diagnosis-attention" className="flex flex-col gap-1 pt-1">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-text)" }}>
        Needs attention
      </p>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        Review these issues manually.
      </p>
      {cards.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
          {cards.map((card) => (
            <li
              key={card.key}
              data-testid="builder-ai-diagnosis-attention-item"
              style={{ color: "var(--builder-text)" }}
            >
              {card.message}
            </li>
          ))}
        </ul>
      )}
      {refCards.map((card) => (
        <InvalidReferenceCardView
          key={card.key}
          card={card}
          {...(card.replacementReason === "one" && onPreviewInvalidRef
            ? { onPreviewFix: onPreviewInvalidRef }
            : {})}
          {...(onPreviewSelectedInvalidRef ? { onPreviewSelected: onPreviewSelectedInvalidRef } : {})}
          previewing={previewing}
          alreadyPreviewed={alreadyPreviewedInvalidRef}
        />
      ))}
      {edgeCards.map((card) => (
        <DanglingEdgeCardView
          key={card.key}
          card={card}
          {...(onPreviewDanglingEdge ? { onPreviewFix: onPreviewDanglingEdge } : {})}
          previewing={previewing}
        />
      ))}
    </div>
  );
}
