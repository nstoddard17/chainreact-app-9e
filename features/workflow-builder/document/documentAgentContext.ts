import type { DocumentBlock, DocumentModel } from "./documentModel";
import type { DocumentPreviewModel } from "./documentPreviewProjection";
import type { WorkflowPresentation } from "@/contracts/workflowPresentation";

/**
 * Document Builder — what the React Agent is currently "working on", and which
 * document sentences a proposal touches (DOC-REACT-AGENT-1).
 *
 * Pure, total, deterministic helpers over the ALREADY-PROJECTED DocumentModel
 * and the existing preview projection. They read state the Document already
 * owns — the open Guided Stop, the top-level multi-selection, the stored
 * presentation groups, and the preview's `statusByNodeId` — and never introduce
 * a second selection/agent/proposal model. Nothing here mutates, fetches, or
 * touches the graph.
 */

export type DocumentAgentContextKind = "field" | "step" | "group" | "workflow";

export interface DocumentAgentContext {
  readonly kind: DocumentAgentContextKind;
  /** Short human label, e.g. "Schedule", "Send Channel Message", "Whole workflow". */
  readonly label: string;
  /** The canonical node the context points at (null for the whole-workflow case). */
  readonly nodeId: string | null;
  /** The focused unresolved field, when the context is a specific field. */
  readonly fieldName: string | null;
  /** True when the user can clear this context back to the whole workflow. */
  readonly clearable: boolean;
}

export const WHOLE_WORKFLOW_CONTEXT: DocumentAgentContext = {
  kind: "workflow",
  label: "Whole workflow",
  nodeId: null,
  fieldName: null,
  clearable: false,
};

/** Depth-first lookup of a projected sentence/fork block by its canonical node id. */
export function findBlockByNodeId(
  blocks: readonly DocumentBlock[],
  nodeId: string,
): DocumentBlock | null {
  for (const block of blocks) {
    if (block.kind === "sentence" && block.nodeId === nodeId) return block;
    if (block.kind === "fork") {
      if (block.nodeId === nodeId) return block;
      for (const lane of block.lanes) {
        const hit = findBlockByNodeId(lane.blocks, nodeId);
        if (hit) return hit;
      }
    }
    if (block.kind === "complex" && block.nodeIds.includes(nodeId)) return block;
  }
  return null;
}

/** The display title of the step a node id belongs to (falls back to a neutral label). */
export function titleForNodeId(model: DocumentModel, nodeId: string): string {
  const block = findBlockByNodeId(model.blocks, nodeId);
  if (!block) return "this step";
  if (block.kind === "sentence") return block.title;
  if (block.kind === "fork") return block.title;
  return "this part of the workflow";
}

/** The label of one field on a step (from the projected chips), or the raw name. */
export function fieldLabel(
  model: DocumentModel,
  nodeId: string,
  fieldName: string,
): string {
  const block = findBlockByNodeId(model.blocks, nodeId);
  if (!block || block.kind !== "sentence") return fieldName;
  for (const chip of block.blankChips) if (chip.name === fieldName) return chip.label;
  for (const chip of block.valueChips) if (chip.name === fieldName) return chip.label;
  return fieldName;
}

/**
 * The agent's working context, by the locked priority:
 *   1. an actively focused unresolved field (the open Guided Stop),
 *   2. a selected / focused workflow sentence,
 *   3. a selected group,
 *   4. the whole workflow.
 *
 * Multi-select is NEVER required: a single focused sentence or an open field is
 * enough, and with nothing chosen the agent works on the whole workflow.
 */
export function resolveDocumentAgentContext(input: {
  readonly model: DocumentModel;
  readonly stop: { readonly nodeId: string; readonly fieldName: string } | null;
  readonly selectedIds: ReadonlySet<string>;
  readonly presentation?: WorkflowPresentation | null | undefined;
}): DocumentAgentContext {
  const { model, stop, selectedIds, presentation } = input;

  if (stop) {
    return {
      kind: "field",
      label: fieldLabel(model, stop.nodeId, stop.fieldName),
      nodeId: stop.nodeId,
      fieldName: stop.fieldName,
      clearable: true,
    };
  }

  const selected = [...selectedIds];
  if (selected.length === 1) {
    const nodeId = selected[0]!;
    return {
      kind: "step",
      label: titleForNodeId(model, nodeId),
      nodeId,
      fieldName: null,
      clearable: true,
    };
  }

  // A multi-selection that sits entirely inside ONE group reads as that group.
  if (selected.length > 1) {
    const group = presentation?.sections.find((s) =>
      selected.every((id) => s.nodeIds.includes(id)),
    );
    if (group) {
      return { kind: "group", label: group.title, nodeId: null, fieldName: null, clearable: true };
    }
    return {
      kind: "step",
      label: `${selected.length} steps`,
      nodeId: selected[0] ?? null,
      fieldName: null,
      clearable: true,
    };
  }

  return WHOLE_WORKFLOW_CONTEXT;
}

/** One sentence a pending proposal would add, change, or remove. */
export interface DocumentAgentChangeRef {
  /**
   * Canonical LIVE node id — the sentence this reference can focus. Null when
   * the proposal adds a step that isn't in the document yet (nothing to focus).
   */
  readonly nodeId: string | null;
  readonly title: string;
  readonly status: "added" | "changed" | "removed";
}

/**
 * The sentences a pending proposal touches, derived from the EXISTING preview
 * projection (`statusByNodeId` + `ghosts` + `removed`) — not from prose, and not
 * from a second diff format. Bounded so a huge proposal can't flood the
 * workspace.
 */
export function describeProposalChanges(
  preview: DocumentPreviewModel | null | undefined,
  model: DocumentModel,
  limit = 12,
): readonly DocumentAgentChangeRef[] {
  if (!preview) return [];
  const out: DocumentAgentChangeRef[] = [];
  // Titles come from the PROPOSED projection when there is one (an added step
  // has no live sentence yet); focus only ever points at a LIVE node id.
  const titleSource = preview.proposedModel ?? model;
  for (const [nodeId, status] of preview.statusByNodeId) {
    if (status === "unchanged") continue;
    const live = findBlockByNodeId(model.blocks, nodeId) !== null;
    out.push({
      nodeId: live ? nodeId : null,
      title: titleForNodeId(titleSource, nodeId),
      status: status === "added" ? "added" : "changed",
    });
    if (out.length >= limit) return out;
  }
  for (const ghost of preview.ghosts) {
    out.push({ nodeId: null, title: ghost.title, status: "added" });
    if (out.length >= limit) return out;
  }
  for (const removed of preview.removed) {
    out.push({ nodeId: removed.nodeId, title: removed.title, status: "removed" });
    if (out.length >= limit) return out;
  }
  return out;
}
