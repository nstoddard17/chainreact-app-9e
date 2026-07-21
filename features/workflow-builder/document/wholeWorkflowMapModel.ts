import type {
  BuilderValidationIssue,
  BuilderValidationIssueCode,
} from "../validation/collectBuilderValidationIssues";
import type { ComplexRegionReason } from "./projectionTiers";
import type { OutlineRow, OutlineRowKind } from "./documentOutline";
import type { SetupQueue, SetupQueueHandoff, SetupQueueItem } from "./setupQueueModel";

/**
 * Document Builder — the Whole Workflow map model (5.DUAL-BUILDER-1 / CS-3).
 *
 * Pure, React-free derivation of the hierarchical map/tree from the SAME
 * Document outline the Finish Setup queue uses, annotated with per-step
 * readiness/status sourced ONLY from the shared validation issues + the queue
 * classification. It re-traverses nothing: the map is the `DocumentModel`
 * rendered as a tree (planning doc §6.1 rule 9), so it agrees with the
 * Document and the queue by construction.
 *
 * Status vocabulary is small and sourced from existing readiness state — it
 * never invents a status the builder's validator doesn't produce. `locked` /
 * `connection` are declared for parity with the design vocabulary but are not
 * emitted, because the builder has no distinct entitlement/connection signal
 * (see `validationIssueCategory.ts`): a blank account/resource field is just a
 * `missing_required_field` and surfaces as `needs_detail`.
 */

export type MapStatus =
  | "ready"
  | "needs_detail"
  | "warning"
  | "structural_issue"
  | "locked"
  | "connection"
  | "unsupported";

export interface WholeWorkflowMapRow {
  readonly key: string;
  readonly kind: OutlineRowKind;
  readonly nodeId: string | null;
  readonly depth: number;
  readonly title: string;
  readonly subtitle: string | null;
  readonly crumbs: readonly string[];
  readonly status: MapStatus;
  /** Supported field-stop ids anchored on this row (drives click-to-edit). */
  readonly queueItemIds: readonly string[];
  /** First anchored field key — the Guided Stop to open on click. */
  readonly firstFieldKey: string | null;
  /** Non-queueable handoff for this row (inspector / Visual Builder). */
  readonly handoff: SetupQueueHandoff | null;
  readonly complexReason: ComplexRegionReason | null;
  /** Best node to reveal for a complex/handoff navigation. */
  readonly focusNodeId: string | null;
}

export interface WholeWorkflowMap {
  readonly rows: readonly WholeWorkflowMapRow[];
}

export interface BuildWholeWorkflowMapInput {
  readonly outline: readonly OutlineRow[];
  readonly issues: readonly BuilderValidationIssue[];
  readonly queue: SetupQueue;
}

export function buildWholeWorkflowMap(
  input: BuildWholeWorkflowMapInput,
): WholeWorkflowMap {
  const { outline, issues, queue } = input;

  // Group the supported field stops + handoffs by owning node for O(1) lookup.
  const queueItemsByNode = new Map<string, SetupQueueItem[]>();
  for (const item of queue.items) {
    const bucket = queueItemsByNode.get(item.nodeId);
    if (bucket) bucket.push(item);
    else queueItemsByNode.set(item.nodeId, [item]);
  }
  const handoffByNode = new Map<string, SetupQueueHandoff>();
  for (const h of queue.handoffs) {
    if (h.nodeId && !handoffByNode.has(h.nodeId)) handoffByNode.set(h.nodeId, h);
  }
  const issueCodesByNode = new Map<string, Set<BuilderValidationIssueCode>>();
  for (const issue of issues) {
    if (!issue.nodeId) continue;
    const set = issueCodesByNode.get(issue.nodeId);
    if (set) set.add(issue.code);
    else issueCodesByNode.set(issue.nodeId, new Set([issue.code]));
  }

  const rows: WholeWorkflowMapRow[] = outline.map((row) => {
    const nodeQueueItems = row.nodeId ? (queueItemsByNode.get(row.nodeId) ?? []) : [];
    const handoff = row.nodeId ? (handoffByNode.get(row.nodeId) ?? null) : null;
    const codes = row.nodeId ? issueCodesByNode.get(row.nodeId) : undefined;

    return {
      key: row.key,
      kind: row.kind,
      nodeId: row.nodeId,
      depth: row.depth,
      title: row.title,
      subtitle: row.subtitle,
      crumbs: row.crumbs,
      status: statusFor(row, nodeQueueItems.length > 0, handoff, codes),
      queueItemIds: nodeQueueItems.map((i) => i.id),
      firstFieldKey: nodeQueueItems[0]?.fieldKey ?? null,
      handoff,
      complexReason: row.complexReason,
      focusNodeId: row.complexReason
        ? row.complexFocusNodeId
        : (handoff?.focusNodeId ?? row.nodeId),
    };
  });

  return { rows };
}

function statusFor(
  row: OutlineRow,
  hasQueueItems: boolean,
  handoff: SetupQueueHandoff | null,
  codes: ReadonlySet<BuilderValidationIssueCode> | undefined,
): MapStatus {
  if (row.kind === "complex") return "unsupported";
  if (row.kind === "lane" || row.kind === "always") {
    return row.laneWarning ? "warning" : "ready";
  }
  // Structural connectors carry no per-node readiness of their own.
  if (row.kind === "terminal" || row.kind === "rejoin") return "ready";

  // Executable node rows (trigger / step / fork).
  if (hasQueueItems) return "needs_detail";
  if (handoff) {
    if (handoff.reason === "branch_wiring") return "warning";
    if (handoff.reason === "structural") return "structural_issue";
    if (handoff.reason === "node_setup") return "needs_detail";
    return "unsupported";
  }
  // A non-anchored structural code touching this node (belt-and-braces).
  if (codes) {
    if (codes.has("unreachable_node") || codes.has("stale_edge") || codes.has("self_loop_edge")) {
      return "structural_issue";
    }
    if (codes.has("missing_branch_edge") || codes.has("stale_branch_edge")) {
      return "warning";
    }
  }
  return "ready";
}
