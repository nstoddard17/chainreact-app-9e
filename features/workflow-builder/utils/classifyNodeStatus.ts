/**
 * Pure status classifier for a workflow node (Slice 4.BUILDER-CANVAS-1).
 *
 * Forward-compatible: the union currently distinguishes only
 * `configured` vs `unconfigured`. Run-state branches (`running`,
 * `passed`, `failed`, `listening`, `paused`) land in a later slice once
 * the per-node run-state projection is reliable end-to-end. The signature
 * already accepts a `runStatus?` placeholder so future slices can extend
 * the branch table without rewiring every call site.
 *
 * Boundary rules:
 *   - Pure: no slice reads, no I/O, no provider-specific branches.
 *   - Input is the narrow view-model the canvas/adapter already passes —
 *     never a full WorkflowNode (the source-of-truth shape stays in
 *     graphSlice).
 */
export type NodeStatus =
  | "configured"
  | "unconfigured"
  // Reserved for follow-up slices. Not currently emitted.
  | "running"
  | "passed"
  | "failed"
  | "listening"
  | "paused";

export interface ClassifyNodeStatusInput {
  /**
   * The provider-scoped action/trigger type. Empty string means the node
   * was added via the bare `addTrigger({provider})` / `addAction({provider})`
   * paths and never picked a specific TriggerMeta / ActionMeta — the
   * canonical "unconfigured" signal already used by `NodeList` and the
   * new `WorkflowNodeCard`.
   */
  type: string;
  /**
   * Optional pre-classified run status from a future per-node run-state
   * projection. Honored as-is when present (so the helper stays a pure
   * branch table); for now the canvas never passes this.
   */
  runStatus?: Exclude<NodeStatus, "configured" | "unconfigured">;
}

export function classifyNodeStatus(input: ClassifyNodeStatusInput): NodeStatus {
  if (input.runStatus) return input.runStatus;
  return input.type ? "configured" : "unconfigured";
}
