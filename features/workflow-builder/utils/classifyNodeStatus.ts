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
  // BUILDER-READINESS — node picked a type but is missing a required config
  // field (e.g. HTTP Request without Method/URL). Surfaced as "Needs setup".
  | "needs_setup"
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
  runStatus?: Exclude<NodeStatus, "configured" | "unconfigured" | "needs_setup">;
  /**
   * BUILDER-READINESS — true when the node picked its type but a required
   * config field is empty. Computed by the canvas adapter from the metadata
   * required-field lookup + live `node.config`. Drives the "Needs setup" state.
   */
  missingRequiredConfig?: boolean;
}

export function classifyNodeStatus(input: ClassifyNodeStatusInput): NodeStatus {
  if (input.runStatus) return input.runStatus;
  if (!input.type) return "unconfigured";
  return input.missingRequiredConfig ? "needs_setup" : "configured";
}
