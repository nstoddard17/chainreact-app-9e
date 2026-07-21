import type {
  BuilderValidationIssue,
  BuilderValidationIssueCode,
  BuilderValidationSeverity,
} from "../validation/collectBuilderValidationIssues";
import type { OutlineRow } from "./documentOutline";

/**
 * Document Builder — the pure Finish Setup queue model (5.DUAL-BUILDER-1 / CS-3).
 *
 * Derives an ORDERED, deterministic queue of setup stops from the SAME
 * authoritative validation output that drives the header issues pill, per-node
 * "Needs setup", activation blocking, and the Document blank chips
 * (`collectBuilderValidationIssues`). There is NO second readiness or
 * "setup-completeness" system here — this file only CLASSIFIES + ORDERS the
 * issues the shared collector already produced, using the Document outline for
 * order and branch/lane context.
 *
 * The queue is intentionally NARROW: only issues an ordinary user can resolve
 * through the real CS-2 Guided Stop (a specific node + field) become normal
 * queue stops. Structural problems (no/multiple trigger, unreachable, stale
 * edges, self-loops), branch-wiring findings, and node-level setup that needs
 * the full inspector or the Visual Builder are surfaced as typed HANDOFFS, not
 * as misleading field stops (planning doc: "It must not treat every structural
 * error as a normal Guided Stop").
 *
 * Pure + React-free + non-throwing: it consumes plain data (outline + issues)
 * and is fully unit-testable.
 */

/** Codes that become a normal, counted Guided-Stop queue item (field-level). */
const FIELD_STOP_CODES: ReadonlySet<BuilderValidationIssueCode> = new Set([
  "missing_required_field",
  "broken_variable_reference",
]);

/** Structural graph problems — Visual Builder repair, never a field stop. */
const STRUCTURAL_CODES: ReadonlySet<BuilderValidationIssueCode> = new Set([
  "no_trigger",
  "multiple_triggers",
  "unreachable_node",
  "stale_edge",
  "self_loop_edge",
]);

/** Broken branch wiring — CS-2 in-fork warning + Visual Builder repair. */
const BRANCH_WIRING_CODES: ReadonlySet<BuilderValidationIssueCode> = new Set([
  "missing_branch_edge",
  "stale_branch_edge",
]);

/** Node-level setup that needs the full inspector (not a single-field stop). */
const NODE_SETUP_CODES: ReadonlySet<BuilderValidationIssueCode> = new Set([
  "unconfigured_node",
  "router_routes_invalid",
]);

export type SetupHandoffReason =
  | "structural"
  | "branch_wiring"
  | "node_setup"
  | "complex_region";

/**
 * One resolvable setup stop. Stable identity is `${nodeId}::${fieldKey}` so the
 * queue can re-order under live edits without ever losing track of, reopening,
 * or skipping the item the user is on.
 */
export interface SetupQueueItem {
  readonly id: string;
  readonly nodeId: string;
  readonly fieldKey: string;
  readonly issueCode: BuilderValidationIssueCode;
  readonly severity: BuilderValidationSeverity;
  readonly kind: "field";
  /** Document reading-order position of the owning node (deterministic). */
  readonly documentOrder: number;
  /** Branch/lane breadcrumb to the owning node (from the Document outline). */
  readonly crumbs: readonly string[];
  /** Plain-language label (the shared collector's author-facing message). */
  readonly label: string;
}

/** A setup problem the Document surfaces but does not host as a field stop. */
export interface SetupQueueHandoff {
  readonly id: string;
  readonly nodeId: string | null;
  readonly issueCode: BuilderValidationIssueCode;
  readonly reason: SetupHandoffReason;
  readonly message: string;
  /** Best node to reveal on a Visual-Builder / inspector handoff. */
  readonly focusNodeId: string | null;
}

export interface SetupQueue {
  /** The ordered, counted field-stop queue. */
  readonly items: readonly SetupQueueItem[];
  /** Non-queueable problems (structural / wiring / node-setup / complex). */
  readonly handoffs: readonly SetupQueueHandoff[];
  /** `items.length` — the banner's "N left" count of SUPPORTED setup items. */
  readonly supportedCount: number;
}

export interface BuildSetupQueueInput {
  readonly outline: readonly OutlineRow[];
  readonly issues: readonly BuilderValidationIssue[];
}

/**
 * Build the deterministic Finish Setup queue from the Document outline + the
 * shared validation issues.
 *
 * Ordering (locked by tests):
 *   1. owning node's Document reading order (outline `order`);
 *   2. within a node, the issue's position in the collector output — which is
 *      required-field metadata order (the collector iterates
 *      `missingRequiredFields`), then broken-reference findings;
 *   3. a stable original-index tie-break so the order never depends on engine
 *      sort stability.
 *
 * A field issue whose node is NOT representable as an editable Document block
 * (it lives only inside a complex region, or was pruned) is demoted to a
 * `complex_region` handoff — never a field stop the Document can't anchor.
 */
export function buildSetupQueue(input: BuildSetupQueueInput): SetupQueue {
  const { outline, issues } = input;

  // Owning-node context: only true executable step/fork/trigger rows carry a
  // node the Document can host a stop on. (The `rejoin` connector row also has
  // a nodeId but its real step row is emitted separately; taking the first
  // occurrence keeps the earliest reading position.)
  const nodeContext = new Map<string, { order: number; crumbs: readonly string[] }>();
  const complexNodeIds = new Set<string>();
  for (const row of outline) {
    if (
      (row.kind === "trigger" || row.kind === "step" || row.kind === "fork") &&
      row.nodeId !== null &&
      !nodeContext.has(row.nodeId)
    ) {
      nodeContext.set(row.nodeId, { order: row.order, crumbs: row.crumbs });
    }
    if (row.kind === "complex") {
      for (const id of row.complexNodeIds) complexNodeIds.add(id);
    }
  }

  const scored: Array<{ item: SetupQueueItem; origIndex: number }> = [];
  const handoffs: SetupQueueHandoff[] = [];

  issues.forEach((issue, origIndex) => {
    if (FIELD_STOP_CODES.has(issue.code) && issue.nodeId && issue.fieldName) {
      const ctx = nodeContext.get(issue.nodeId);
      if (ctx && !complexNodeIds.has(issue.nodeId)) {
        scored.push({
          origIndex,
          item: {
            id: `${issue.nodeId}::${issue.fieldName}`,
            nodeId: issue.nodeId,
            fieldKey: issue.fieldName,
            issueCode: issue.code,
            severity: issue.severity,
            kind: "field",
            documentOrder: ctx.order,
            crumbs: ctx.crumbs,
            label: issue.message,
          },
        });
        return;
      }
      // A field issue we cannot anchor as a Document stop (node only inside a
      // complex region) is an honest Visual-Builder handoff, not a fake stop.
      handoffs.push({
        id: issue.id,
        nodeId: issue.nodeId,
        issueCode: issue.code,
        reason: "complex_region",
        message: issue.message,
        focusNodeId: issue.nodeId,
      });
      return;
    }
    handoffs.push(classifyHandoff(issue));
  });

  scored.sort(
    (a, b) => a.item.documentOrder - b.item.documentOrder || a.origIndex - b.origIndex,
  );
  const items = scored.map((s) => s.item);

  return { items, handoffs, supportedCount: items.length };
}

function classifyHandoff(issue: BuilderValidationIssue): SetupQueueHandoff {
  const reason: SetupHandoffReason = STRUCTURAL_CODES.has(issue.code)
    ? "structural"
    : BRANCH_WIRING_CODES.has(issue.code)
      ? "branch_wiring"
      : NODE_SETUP_CODES.has(issue.code)
        ? "node_setup"
        : "structural";
  return {
    id: issue.id,
    nodeId: issue.nodeId ?? null,
    issueCode: issue.code,
    reason,
    message: issue.message,
    focusNodeId: issue.nodeId ?? null,
  };
}

// ---- banner state -------------------------------------------------------------

export type SetupBannerPrimary =
  | "needs_setup"
  | "blocked_structural"
  | "ready_unsaved"
  | "ready_saved";

export interface SetupBannerState {
  readonly primary: SetupBannerPrimary;
  /** Supported unresolved setup items — the "N left" count. */
  readonly supportedCount: number;
  /** True when ≥1 structural / wiring / complex handoff needs the Visual Builder. */
  readonly hasVisualBlockers: boolean;
  /** Blocking (error-severity) issues total — the activation-gating count. */
  readonly blockingErrorCount: number;
}

/**
 * Derive the banner state from the SAME live signals the header uses. Readiness
 * is never a second definition: "ready" means zero supported stops AND zero
 * blocking errors (structural blockers keep it honest). Save is still explicit —
 * a ready-but-dirty draft is `ready_unsaved`, not "activatable".
 */
export function deriveSetupBannerState(input: {
  readonly queue: SetupQueue;
  readonly blockingErrorCount: number;
  readonly isDirty: boolean;
}): SetupBannerState {
  const { queue, blockingErrorCount, isDirty } = input;
  const hasVisualBlockers = queue.handoffs.some(
    (h) =>
      h.reason === "structural" ||
      h.reason === "branch_wiring" ||
      h.reason === "complex_region",
  );
  let primary: SetupBannerPrimary;
  if (queue.supportedCount > 0) {
    primary = "needs_setup";
  } else if (blockingErrorCount > 0 || queue.handoffs.length > 0) {
    primary = "blocked_structural";
  } else if (isDirty) {
    primary = "ready_unsaved";
  } else {
    primary = "ready_saved";
  }
  return {
    primary,
    supportedCount: queue.supportedCount,
    hasVisualBlockers,
    blockingErrorCount,
  };
}
