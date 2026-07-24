import type { ComplexRegionReason } from "./projectionTiers";
import type { DocumentBlock, DocumentModel } from "./documentModel";

/**
 * Document Builder — the ordered outline of a projected DocumentModel
 * (5.DUAL-BUILDER-1 / CS-3).
 *
 * Pure, React-free flattening of the hierarchical `DocumentModel` into a
 * deterministic ordered row list. This is the ONE walk that both the Finish
 * Setup queue (`setupQueueModel`) and the Whole Workflow map
 * (`wholeWorkflowMapModel`) consume, so the queue, the map, and the Document
 * can never disagree about order, hierarchy, or branch/lane context — they are
 * all derived from the same projection (planning doc §6.1 rule 9: "the same
 * DocumentModel rendered as the tree sheet").
 *
 * The outline NEVER re-traverses the graph with independent semantics: forks,
 * lanes, nesting, rejoins, terminal paths, always-run continuations, and
 * complex regions come verbatim from the projection. Reading order is the
 * projection's block order (execution/projection order), lanes in the node's
 * returnable-label vocabulary order — never canvas x/y.
 */

export type OutlineRowKind =
  | "trigger"
  | "step"
  | "fork"
  | "lane"
  | "always"
  | "rejoin"
  | "terminal"
  | "complex";

export interface OutlineRow {
  /** Stable-per-build React key (unique across the outline). */
  readonly key: string;
  readonly kind: OutlineRowKind;
  /**
   * The canonical executable node id for `trigger` / `step` / `fork` rows and
   * the `rejoin` connector (which points at the reconvergence node). Null for
   * lane / always / terminal / complex structural rows.
   */
  readonly nodeId: string | null;
  /** Indentation depth for the hierarchical map (0 = top level). */
  readonly depth: number;
  /** Global reading-order sequence across every row (document order). */
  readonly order: number;
  readonly title: string;
  readonly subtitle: string | null;
  /**
   * Branch/lane breadcrumb to THIS row's context, e.g.
   * `["Qualify & route", "Hot lead", "Enterprise"]` — the outermost fork title
   * then each enclosing lane title. Empty at the top level. Derived only from
   * canonical Document projection titles + edge labels, never canvas position.
   */
  readonly crumbs: readonly string[];
  /** Shared branch-wiring finding carried by a lane row (CS-2 vocabulary). */
  readonly laneWarning:
    | { readonly code: "missing_branch_edge" | "stale_branch_edge"; readonly message: string }
    | null;
  /** Nodes listed inside a `complex` region row (deterministic order). */
  readonly complexNodeIds: readonly string[];
  readonly complexReason: ComplexRegionReason | null;
  /** Best node to reveal when a `complex` row hands off to the Visual Builder. */
  readonly complexFocusNodeId: string | null;
}

/**
 * Flatten a projected `DocumentModel` into ordered outline rows. Pure + total:
 * for any model the projection can produce (it is itself total), this walk
 * terminates and never throws. Deterministic: same model → same rows.
 */
export function buildDocumentOutline(model: DocumentModel): readonly OutlineRow[] {
  const rows: OutlineRow[] = [];
  let seq = 0;
  let keyCounter = 0;
  const nextKey = (base: string) => `${base}#${keyCounter++}`;

  const walk = (
    blocks: readonly DocumentBlock[],
    depth: number,
    crumbs: readonly string[],
  ): void => {
    for (const block of blocks) {
      if (block.kind === "sentence") {
        rows.push({
          key: nextKey(`s-${block.nodeId}`),
          kind: block.nodeKind === "trigger" ? "trigger" : "step",
          nodeId: block.nodeId,
          depth,
          order: seq++,
          title: block.title,
          subtitle: null,
          crumbs,
          laneWarning: null,
          complexNodeIds: [],
          complexReason: null,
          complexFocusNodeId: null,
        });
        continue;
      }
      if (block.kind === "fork") {
        rows.push({
          key: nextKey(`f-${block.nodeId}`),
          kind: "fork",
          nodeId: block.nodeId,
          depth,
          order: seq++,
          title: block.title,
          subtitle: block.conditionSummary,
          crumbs,
          laneWarning: null,
          complexNodeIds: [],
          complexReason: null,
          complexFocusNodeId: null,
        });
        for (const lane of block.lanes) {
          // Breadcrumb: seed with the (outermost) fork title, then append each
          // enclosing lane title as we descend — matches the design mock
          // "Qualify & route › Hot lead › Enterprise" (nested fork titles are
          // not repeated once a context exists).
          const laneCrumbs =
            crumbs.length === 0 ? [block.title, lane.title] : [...crumbs, lane.title];
          rows.push({
            key: nextKey(`l-${block.nodeId}-${lane.label || "always"}`),
            kind: lane.kindHint === "always" ? "always" : "lane",
            nodeId: null,
            depth: depth + 1,
            order: seq++,
            title: lane.title,
            subtitle: lane.subtitle,
            crumbs,
            laneWarning: lane.warning,
            complexNodeIds: [],
            complexReason: null,
            complexFocusNodeId: null,
          });
          walk(lane.blocks, depth + 2, laneCrumbs);
          if (lane.terminal) {
            rows.push({
              key: nextKey(`term-${block.nodeId}-${lane.label || "always"}`),
              kind: "terminal",
              nodeId: null,
              depth: depth + 2,
              order: seq++,
              title: "Ends here — nothing else runs on this path.",
              subtitle: null,
              crumbs: laneCrumbs,
              laneWarning: null,
              complexNodeIds: [],
              complexReason: null,
              complexFocusNodeId: null,
            });
          }
        }
        if (block.rejoinNodeId) {
          // Connector marker only — the reconvergence step itself is a normal
          // sibling `step` row emitted next (the projection emits it once).
          rows.push({
            key: nextKey(`rejoin-${block.nodeId}`),
            kind: "rejoin",
            nodeId: block.rejoinNodeId,
            depth,
            order: seq++,
            title: "The paths come back together",
            subtitle: null,
            crumbs,
            laneWarning: null,
            complexNodeIds: [],
            complexReason: null,
            complexFocusNodeId: null,
          });
        }
        continue;
      }
      // complex region
      rows.push({
        key: nextKey(`c-${block.reason}`),
        kind: "complex",
        nodeId: null,
        depth,
        order: seq++,
        title: block.message,
        subtitle: null,
        crumbs,
        laneWarning: null,
        complexNodeIds: block.nodeIds,
        complexReason: block.reason,
        complexFocusNodeId: block.focusNodeId,
      });
    }
  };

  walk(model.blocks, 0, []);
  return rows;
}
