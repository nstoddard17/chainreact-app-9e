import type { DocumentBlock } from "./documentModel";
import { blockOwnedNodeIds, blockPrimaryNodeId } from "./documentSections";

/**
 * 5.DUAL-BUILDER-1 CS-4 — the Document→section command boundary.
 *
 * Pure, non-throwing resolution of a Document BLOCK selection into the canonical
 * node ids the graphSlice section commands operate on, with the CS-4 safety
 * rules enforced here (the store stays graph-shaped and order-agnostic):
 *   - only TOP-LEVEL blocks are sectionable (a fork is one structural unit;
 *     nested lane steps can't be independently sectioned in CS-4);
 *   - a wrap selection must be CONTIGUOUS in document order and non-empty;
 *   - a structural connector with no owned nodes is not sectionable.
 *
 * The store command it delegates to re-validates node existence against live
 * pending state and refuses without mutation on a stale selection.
 */

export type SectionSelectionResult =
  | { readonly ok: true; readonly nodeIds: readonly string[] }
  | { readonly ok: false; readonly reason: SectionSelectionRefusal };

export type SectionSelectionRefusal =
  | "empty_selection"
  | "not_top_level"
  | "noncontiguous"
  | "no_owned_nodes";

/**
 * Resolve a set of selected top-level blocks (identified by their primary node
 * id) into the owned node ids to wrap, enforcing contiguity + top-level.
 */
export function resolveWrapSelection(
  topLevel: readonly DocumentBlock[],
  selectedPrimaryIds: readonly string[],
): SectionSelectionResult {
  if (selectedPrimaryIds.length === 0) return { ok: false, reason: "empty_selection" };

  const selected = new Set(selectedPrimaryIds);
  const indices: number[] = [];
  for (let i = 0; i < topLevel.length; i++) {
    const primary = blockPrimaryNodeId(topLevel[i]!);
    if (primary !== null && selected.has(primary)) indices.push(i);
  }
  // Every selected id must map to a TOP-LEVEL block (nested lane steps won't).
  if (indices.length !== selected.size) return { ok: false, reason: "not_top_level" };
  // Contiguous run check (document order).
  for (let k = 1; k < indices.length; k++) {
    if (indices[k]! !== indices[k - 1]! + 1) return { ok: false, reason: "noncontiguous" };
  }

  const nodeIds: string[] = [];
  for (const i of indices) nodeIds.push(...blockOwnedNodeIds(topLevel[i]!));
  if (nodeIds.length === 0) return { ok: false, reason: "no_owned_nodes" };
  return { ok: true, nodeIds };
}

/** Resolve the owned node ids of a SINGLE top-level block (wrap / add / remove one). */
export function resolveBlockNodeIds(block: DocumentBlock): SectionSelectionResult {
  const ids = blockOwnedNodeIds(block);
  if (ids.length === 0) return { ok: false, reason: "no_owned_nodes" };
  return { ok: true, nodeIds: ids };
}

/** Plain-language copy for a refused section selection (never a raw error). */
export function describeSectionRefusal(reason: SectionSelectionRefusal): string {
  switch (reason) {
    case "empty_selection":
      return "Pick at least one step to group.";
    case "not_top_level":
      return "Steps inside a branch can't be grouped on their own — group the whole split.";
    case "noncontiguous":
      return "Only steps next to each other can go in one section.";
    case "no_owned_nodes":
      return "There's nothing here to group.";
  }
}
