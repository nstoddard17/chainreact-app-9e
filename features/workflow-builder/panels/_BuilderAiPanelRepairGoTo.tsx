"use client";

import { Button } from "@/components/ui/button";
import type { AgentWorkflowDiagnosis, RepairPreview } from "@/lib/api/ai";
import { missingFieldNodeIds } from "../ai/firstMissingFieldNodeId";
import {
  useRepairFieldTarget,
  useRepairFieldTargets,
  type RepairFieldTarget,
} from "../ai/useRepairFieldTarget";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Slice 4.AI-CONFIG-ASSIST CS-4/CS-5 — the single navigation seam shared by every
 * "Open <field> field" affordance (diagnosis card + repair proposal). Selects the
 * node, opens its config rail, pans/zooms the canvas to it (via `useCanvasNodeFocus`),
 * and highlights the field. NAVIGATION ONLY — never writes a value, saves, runs, or
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
 * Slice 4.AI-REPAIR-2F — "Go to field" navigation affordance for a blocked
 * repair preview. NAVIGATION ONLY: selects the affected node, opens its config
 * rail, pans the canvas to it, and highlights the field. NEVER writes a config
 * value, saves, runs, or mutates the graph — and there is NO Apply control.
 * Renders nothing unless the preview carries a `nodeId` focus target plus a
 * display LABEL; labels are the only thing shown (raw id/key are targets only).
 * Absent metadata (e.g. rehydrated history) → safe guidance with no button.
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
  // Labels only — never the raw nodeId / field key.
  const label = fieldLabel ? `Open ${fieldLabel} field` : `Go to ${nodeLabel}`;

  function handleClick() {
    // Resolve the node's CURRENT config from the live graph for the rail draft.
    // If the node isn't on the canvas (stale preview), no-op — never throw.
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
 * Slice 4.AI-CONFIG-ASSIST CS-4 — action area for a repair PROPOSAL bubble.
 *
 * Product rule: a KNOWN, user-input-required missing field is something only the
 * user can fill — so don't force them to run a (paid) "Preview fix" of a
 * non-automatic fix just to open the field. When `goToNodeId` resolves to a node
 * with a still-empty required field (`useRepairFieldTarget`), the PRIMARY action
 * becomes "Open <field> field" — the SAME navigation seam (`revealNode`) the
 * blocked-preview "Go to field" button uses: it selects the node, opens its config
 * rail, pans/zooms the canvas, and highlights the field. NAVIGATION ONLY — it never
 * writes a config value, saves, runs, or mutates the graph; there is no Apply.
 *
 * "Preview fix" is NOT removed — when a target exists it's demoted to a secondary
 * control (still available for inspecting an actual patch). When there is NO
 * targetable field (the issue isn't a single fillable field, or the field is
 * already filled), the original Preview-fix-only block renders unchanged.
 *
 * Labels only ever show field/node DISPLAY labels — never the raw id / field key.
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

  // The "Preview fix" control — identical behavior whether it's the sole action
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
      {previewing ? "Previewing fix…" : alreadyPreviewed ? "Previewed" : "Preview fix"}
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

  // No targetable field → the original Preview-fix-only block (markup unchanged).
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
 * Slice 4.AI-CONFIG-ASSIST CS-8 — the open-field actions for ONE diagnosed node:
 * one "Open <field> field" button per still-empty required field on that node. A
 * node-scoped component so the per-provider metadata hook (`useRepairFieldTargets`)
 * resolves correctly for an arbitrary node. Renders nothing when nothing required is
 * empty / the node isn't on the canvas / its metadata isn't loaded (so a stale or
 * already-filled node shows no button — never a broken one). Labels only.
 *
 * Open-field navigation is offered for EVERY empty required field (including
 * recipient/destination fields CS-1 blocks from chat-fill) — the button only opens +
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
 * Slice 4.AI-CONFIG-ASSIST CS-5/CS-8 — the "Needs your input" actionable group on the
 * "Check workflow" diagnosis card.
 *
 * Product model: Check produces actionable issue cards whose PRIMARY action fits the
 * problem type. For missing user-input fields (e.g. Slack "Send Channel Message"
 * missing Message), that action is "Open <field> field" — the user just needs to fill
 * it, so they should NOT have to run "Suggest a fix" or "Preview fix" first. CS-8
 * generalizes CS-5 from a single target to ALL missing-required-field nodes: one
 * action per (node, empty required field), across every affected node, de-duplicated.
 * Each reuses the SAME `revealNode` navigation (select node → open rail → pan/zoom →
 * highlight field); highlighting a field is what then arms chat-fill (CS-3/CS-6).
 *
 * Connection/setup, structural, and run findings are NOT rendered here — they stay in
 * the deterministic `nextSteps` guidance (never offered an open-field/chat-fill action).
 *
 * NAVIGATION ONLY — never writes a config value, saves, runs, or mutates the graph;
 * there is no Apply. Shows only display LABELS — never the raw node id / field key.
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
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
        Needs your input
      </p>
      <ul className="flex flex-col gap-1">
        {nodeIds.map((id) => (
          <NodeFieldActions key={id} nodeId={id} />
        ))}
      </ul>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        Opens the step and highlights the field so you can fill it in — then type the
        value in chat. Nothing is changed, saved, or run.
      </p>
    </div>
  );
}
