import type { WorkflowPresentation } from "@/contracts/workflowPresentation";
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

/** CS-4 — map rows include synthetic `section` PARENT rows over grouped blocks. */
export type MapRowKind = OutlineRowKind | "section";

export interface WholeWorkflowMapRow {
  readonly key: string;
  readonly kind: MapRowKind;
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
  /** CS-4 — set on a `section` parent row: the section id + collapse state. */
  readonly sectionId?: string;
  readonly sectionCollapsed?: boolean;
}

export interface WholeWorkflowMap {
  readonly rows: readonly WholeWorkflowMapRow[];
}

export interface BuildWholeWorkflowMapInput {
  readonly outline: readonly OutlineRow[];
  readonly issues: readonly BuilderValidationIssue[];
  readonly queue: SetupQueue;
  /** CS-4 — manual sections rendered as hierarchical parent rows over their blocks. */
  readonly presentation?: WorkflowPresentation | null | undefined;
}

export function buildWholeWorkflowMap(
  input: BuildWholeWorkflowMapInput,
): WholeWorkflowMap {
  const { outline, issues, queue, presentation } = input;

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

  return { rows: applyMapSections(rows, presentation) };
}

/**
 * CS-4 — insert synthetic `section` PARENT rows over contiguous runs of
 * top-level (depth-0) rows that share a section, indenting the contained rows.
 * Fork/lane/nested/rejoin/terminal hierarchy INSIDE a section is preserved
 * (every non-section row keeps its relative depth, shifted by 1). A section
 * whose members are split in document order simply yields two parent runs —
 * the map never reorders the workflow. Section parent status aggregates the
 * contained rows' statuses (most-severe wins).
 */
function applyMapSections(
  rows: readonly WholeWorkflowMapRow[],
  presentation: WorkflowPresentation | null | undefined,
): readonly WholeWorkflowMapRow[] {
  if (!presentation || presentation.sections.length === 0) return rows;

  const nodeToSection = new Map<string, WorkflowPresentation["sections"][number]>();
  for (const s of presentation.sections) {
    for (const id of s.nodeIds) nodeToSection.set(id, s);
  }
  const sectionOfTopRow = (
    row: WholeWorkflowMapRow,
  ): WorkflowPresentation["sections"][number] | null => {
    const anchor = row.nodeId ?? row.focusNodeId;
    return anchor ? (nodeToSection.get(anchor) ?? null) : null;
  };

  const out: WholeWorkflowMapRow[] = [];
  let currentSectionId: string | null = null;
  let parentIndex = -1; // index in `out` of the open section parent
  let runSeq = 0;

  for (const row of rows) {
    if (row.depth === 0) {
      const section = sectionOfTopRow(row);
      const sectionId = section?.id ?? null;
      if (sectionId !== currentSectionId) {
        currentSectionId = sectionId;
        if (section) {
          parentIndex = out.length;
          out.push({
            key: `section-${section.id}-${runSeq++}`,
            kind: "section",
            nodeId: null,
            depth: 0,
            title: section.title,
            subtitle: null,
            crumbs: [],
            status: "ready",
            queueItemIds: [],
            firstFieldKey: null,
            handoff: null,
            complexReason: null,
            focusNodeId: null,
            sectionId: section.id,
            sectionCollapsed: section.collapsed === true,
          });
        } else {
          parentIndex = -1;
        }
      }
    }
    if (currentSectionId !== null && parentIndex >= 0) {
      out.push({ ...row, depth: row.depth + 1 });
      // Aggregate the parent's status from its contained rows.
      const parent = out[parentIndex]!;
      out[parentIndex] = {
        ...parent,
        status: moreSevereStatus(parent.status, row.status),
      };
    } else {
      out.push(row);
    }
  }
  return out;
}

const STATUS_SEVERITY: Record<MapStatus, number> = {
  ready: 0,
  locked: 1,
  connection: 2,
  needs_detail: 3,
  warning: 4,
  unsupported: 5,
  structural_issue: 6,
};
function moreSevereStatus(a: MapStatus, b: MapStatus): MapStatus {
  return STATUS_SEVERITY[b] > STATUS_SEVERITY[a] ? b : a;
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
