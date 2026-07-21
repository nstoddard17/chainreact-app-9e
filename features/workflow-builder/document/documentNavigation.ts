import type { WholeWorkflowMapRow } from "./wholeWorkflowMapModel";

/**
 * Document Builder — typed, non-throwing navigation outcomes (5.DUAL-BUILDER-1 / CS-3).
 *
 * Pure decision layer for "what should happen when the user clicks a Whole
 * Workflow map row" (or asks to jump to a node). It NEVER mutates anything and
 * NEVER navigates — it returns a typed outcome the React layer executes with
 * the EXISTING mechanisms (Guided Stop / inspector / Visual-Builder reveal).
 * Stale ids and unsupported regions resolve to an explicit, safe refusal
 * instead of a throw or a silent no-op (planning doc: "Use typed, non-throwing
 * navigation outcomes where stale ids or unsupported regions are possible").
 */

export type DocumentNavOutcome =
  /** Scroll the Document to the node and highlight it (no editor). */
  | { readonly kind: "scroll"; readonly nodeId: string }
  /** Scroll + open the real CS-2 Guided Stop for a supported field. */
  | { readonly kind: "scroll_and_edit"; readonly nodeId: string; readonly fieldKey: string }
  /** Open the existing full step inspector (node-level setup). */
  | { readonly kind: "open_inspector"; readonly nodeId: string }
  /** Hand off to the Visual Builder, revealing a node when known. */
  | { readonly kind: "open_in_visual"; readonly nodeId: string | null }
  /** Nothing safe to do (stale id, structural connector, no target). */
  | { readonly kind: "refuse"; readonly reason: DocumentNavRefusal };

export type DocumentNavRefusal =
  | "stale_node"
  | "no_target"
  | "structural_connector";

/**
 * Decide the navigation outcome for a clicked map row against LIVE node ids
 * (the caller passes the current `pendingNodes` id set so a stale map can never
 * redirect onto a deleted node).
 */
export function resolveMapRowNavigation(
  row: WholeWorkflowMapRow,
  liveNodeIds: ReadonlySet<string>,
): DocumentNavOutcome {
  // Complex / unsupported regions always hand off honestly.
  if (row.kind === "complex") {
    return { kind: "open_in_visual", nodeId: row.focusNodeId };
  }
  // Lane warnings (broken branch wiring) are a Visual-Builder repair job.
  if ((row.kind === "lane" || row.kind === "always") && row.status === "warning") {
    return { kind: "open_in_visual", nodeId: row.focusNodeId };
  }
  // Structural connectors (terminal / rejoin / lane header) have no editor;
  // clicking scrolls to their nearest executable anchor when one exists.
  if (row.nodeId === null) {
    return { kind: "refuse", reason: "structural_connector" };
  }
  if (!liveNodeIds.has(row.nodeId)) {
    return { kind: "refuse", reason: "stale_node" };
  }
  if (row.handoff) {
    if (row.handoff.reason === "node_setup") {
      return { kind: "open_inspector", nodeId: row.nodeId };
    }
    // branch_wiring / structural / complex → Visual Builder.
    return { kind: "open_in_visual", nodeId: row.handoff.focusNodeId ?? row.nodeId };
  }
  if (row.firstFieldKey !== null) {
    return { kind: "scroll_and_edit", nodeId: row.nodeId, fieldKey: row.firstFieldKey };
  }
  return { kind: "scroll", nodeId: row.nodeId };
}
