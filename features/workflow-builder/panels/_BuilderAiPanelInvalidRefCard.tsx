"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SelectedRepair } from "@/lib/api/ai";
import type { InvalidReferenceCard } from "../ai/attentionFindings";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Slice 4.AI-REPAIR-3I/3K/3L — the per-card rendering for ONE broken variable-reference
 * "Needs attention" card. Extracted from `_BuilderAiPanelRepairGoTo.tsx` so each panel
 * module stays under the line cap. Behavior / copy / testIds unchanged.
 *
 * Three shapes, by replacement-candidate count:
 *   - one    (+ preview handler) → direct "Preview fix" (3K) + secondary "Open <field>".
 *   - multiple (+ safe options + select handler) → an explicit replacement PICKER (3L):
 *     the user chooses, then "Preview selected fix" previews THAT exact choice. The app
 *     never auto-picks. "Open <field>" stays available.
 *   - zero / multiple-without-options / unknown → manual "Open <field> field" only.
 *
 * Apply is NEVER on this Check card — Preview is the only forward action; applying stays
 * a separate click on the resulting preview. Labels only — never the raw node id, field
 * key, token, or candidate reference.
 */
export function InvalidReferenceCardView({
  card,
  onPreviewFix,
  onPreviewSelected,
  previewing = false,
  alreadyPreviewed = false,
}: {
  readonly card: InvalidReferenceCard;
  readonly onPreviewFix?: () => void;
  readonly onPreviewSelected?: (selection: SelectedRepair) => void;
  readonly previewing?: boolean;
  readonly alreadyPreviewed?: boolean;
}) {
  const offerMultiPicker =
    card.replacementReason === "multiple" &&
    !!card.candidates &&
    card.candidates.length >= 2 &&
    !!onPreviewSelected;

  return (
    <div data-testid="builder-ai-diagnosis-invalid-ref" className="flex flex-col gap-1">
      {offerMultiPicker ? (
        <MultiCandidateRepairPicker
          card={card}
          candidates={card.candidates!}
          onPreviewSelected={onPreviewSelected!}
          previewing={previewing}
        />
      ) : (
        <>
          <p className="text-xs" style={{ color: "var(--builder-text)" }}>
            {card.message}
          </p>
          {onPreviewFix ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={onPreviewFix}
                  disabled={previewing || alreadyPreviewed}
                  data-testid="builder-ai-invalid-ref-preview-fix-button"
                >
                  {previewing ? "Previewing fix…" : alreadyPreviewed ? "Previewed" : "Preview fix"}
                </Button>
                <InvalidReferenceGoToField nodeId={card.nodeId} fieldKey={card.fieldKey} fieldLabel={card.fieldLabel} />
              </div>
              <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
                Preview shows the exact replacement first. Nothing is changed, saved, or run
                until you choose to apply it.
              </p>
            </>
          ) : (
            <InvalidReferenceGoToField nodeId={card.nodeId} fieldKey={card.fieldKey} fieldLabel={card.fieldLabel} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Slice 4.AI-REPAIR-3L — the explicit replacement PICKER for a multiple-candidate broken
 * reference. The user selects one safe candidate (by LABEL — the underlying
 * `{{nodeId.path}}` reference is held in state by INDEX and never rendered), then
 * "Preview selected fix" runs the deterministic preview for THAT exact choice. The app
 * never auto-picks; "Open <field> field" remains for manual inspection.
 *
 * No-leak: option labels are the safe server-built display strings; option VALUES are
 * list indices (not the node-id-bearing reference token), so no raw id reaches the DOM.
 */
function MultiCandidateRepairPicker({
  card,
  candidates,
  onPreviewSelected,
  previewing,
}: {
  readonly card: InvalidReferenceCard;
  readonly candidates: readonly { readonly reference: string; readonly label: string }[];
  readonly onPreviewSelected: (selection: SelectedRepair) => void;
  readonly previewing: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const chosen = selectedIndex >= 0 ? candidates[selectedIndex] : undefined;

  return (
    <>
      <p className="text-xs" style={{ color: "var(--builder-text)" }}>
        {`This ${card.fieldLabel} field references a missing step. More than one replacement may fit, so choose the correct variable.`}
      </p>
      <select
        value={selectedIndex}
        onChange={(e) => setSelectedIndex(Number(e.target.value))}
        aria-label={`Choose a replacement for ${card.fieldLabel}`}
        data-testid="builder-ai-invalid-ref-candidate-select"
        className="h-8 rounded-md border bg-transparent px-2 text-xs"
        style={{ borderColor: "var(--builder-border)", color: "var(--builder-text)" }}
      >
        <option value={-1}>Choose a replacement…</option>
        {candidates.map((c, i) => (
          <option key={i} value={i}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={!chosen || previewing}
          onClick={() => {
            if (!chosen) return;
            onPreviewSelected({ nodeId: card.nodeId, fieldKey: card.fieldKey, newReference: chosen.reference });
          }}
          data-testid="builder-ai-invalid-ref-preview-selected-button"
        >
          {previewing ? "Previewing fix…" : "Preview selected fix"}
        </Button>
        <InvalidReferenceGoToField nodeId={card.nodeId} fieldKey={card.fieldKey} fieldLabel={card.fieldLabel} />
      </div>
      <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
        You choose the replacement — ChainReact previews it first. Nothing is changed,
        saved, or run until you choose to apply it.
      </p>
    </>
  );
}

/**
 * Slice 4.AI-REPAIR-3I — "Open <field> field" navigation affordance for a broken
 * variable reference. NAVIGATION ONLY: resolves the affected node from the LIVE graph,
 * opens its config rail, pans the canvas to it, and highlights the field (the SAME
 * `revealNode` seam the missing-field + blocked-preview affordances use). NEVER writes a
 * config value, saves, runs, mutates the graph, or shows an Apply control. Renders
 * nothing-but-a-no-op when the node isn't on the canvas. Shows only the field LABEL —
 * never the raw node id or field key (both are navigation targets only).
 */
function InvalidReferenceGoToField({
  nodeId,
  fieldKey,
  fieldLabel,
}: {
  readonly nodeId: string;
  readonly fieldKey: string;
  readonly fieldLabel: string;
}) {
  function handleClick() {
    // Resolve the node's CURRENT config from the live graph for the rail draft. If the
    // node isn't on the canvas (stale diagnosis), no-op — never throw.
    const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId);
    if (!node) return;
    useConfigSlice.getState().revealNode({ nodeId: node.id, initialValues: node.config, fieldKey });
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        data-testid="builder-ai-invalid-ref-open-field-button"
        className="h-7 text-xs"
      >
        Open {fieldLabel} field
      </Button>
    </div>
  );
}
