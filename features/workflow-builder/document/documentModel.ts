import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { ConfigSummaryKind } from "@/core/workflows/nodeConfigSummary";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { ComplexRegionReason } from "./projectionTiers";

/**
 * Document Builder — the in-memory DocumentModel (5.DUAL-BUILDER-1 / CS-1).
 *
 * Pure type definitions for the graph→Document projection. The model is
 * DERIVED from the canonical draft graph on every store change and never
 * persisted — prose is always a projection, never data (planning doc §4).
 * Every executable step keeps its canonical `nodeId`; structural blocks keep
 * the node/edge identities future editing slices will need.
 */

export interface DocumentProjectionInput {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  /** Same maps the canvas gets from the server (page.tsx); all optional. */
  readonly requiredFieldsByType?: RequiredFieldsByType | undefined;
  readonly summaryFieldsByType?: NodeSummaryFieldsByType | undefined;
  readonly providerLabels?: Readonly<Record<string, string>> | undefined;
}

/** The metadata slice of the projection input (threaded through helpers). */
export interface ProjectionMeta {
  readonly requiredFieldsByType?: RequiredFieldsByType | undefined;
  readonly summaryFieldsByType?: NodeSummaryFieldsByType | undefined;
  readonly providerLabels?: Readonly<Record<string, string>> | undefined;
}

/** A configured value shown inline in a sentence (from the shared summary core). */
export interface DocumentValueChip {
  readonly label: string;
  readonly display: string;
  readonly kind: ConfigSummaryKind;
  readonly unresolved?: boolean;
}

/** A required-but-empty field (same rule as the canvas "Needs setup" chip). */
export interface DocumentBlankChip {
  readonly name: string;
  readonly label: string;
}

export interface DocumentSentenceBlock {
  readonly kind: "sentence";
  readonly nodeId: string;
  readonly nodeKind: "trigger" | "action";
  /** Friendly step title (user rename → metadata displayName → type key). */
  readonly title: string;
  readonly providerId: string;
  readonly providerLabel: string;
  /** True when the node has no type yet (freshly added, unchosen). */
  readonly untyped: boolean;
  readonly valueChips: readonly DocumentValueChip[];
  readonly blankChips: readonly DocumentBlankChip[];
}

export interface DocumentForkLane {
  /** The persisted edge label this lane follows ("" for the always lane). */
  readonly label: string;
  /** Reader-facing lane title ("If yes", "Otherwise", a route name, "Always"). */
  readonly title: string;
  /** Optional condition detail for router routes. */
  readonly subtitle: string | null;
  readonly kindHint: "labeled" | "always";
  readonly blocks: readonly DocumentBlock[];
  /** True when this lane's path ends (no continuation to a rejoin). */
  readonly terminal: boolean;
}

export interface DocumentForkBlock {
  readonly kind: "fork";
  readonly nodeId: string;
  readonly title: string;
  readonly providerId: string;
  readonly providerLabel: string;
  /** Deterministic plain-language condition line (never LLM-generated). */
  readonly conditionSummary: string;
  readonly blankChips: readonly DocumentBlankChip[];
  readonly lanes: readonly DocumentForkLane[];
  /** The single node all non-terminal lanes continue to, when proven. */
  readonly rejoinNodeId: string | null;
  readonly depth: number;
}

export interface DocumentComplexRegionBlock {
  readonly kind: "complex";
  readonly reason: ComplexRegionReason;
  readonly message: string;
  /** Canonical node ids in this region, deterministic order. */
  readonly nodeIds: readonly string[];
  /** Friendly titles matching `nodeIds` (for display without lookups). */
  readonly nodeTitles: readonly string[];
  /** Best node to reveal when handing off to the Visual Builder. */
  readonly focusNodeId: string | null;
}

export type DocumentBlock =
  | DocumentSentenceBlock
  | DocumentForkBlock
  | DocumentComplexRegionBlock;

export interface ProjectionWarning {
  readonly code:
    | "no_trigger"
    | "invalid_edge_skipped"
    | "duplicate_node_id"
    | "region_degraded";
  readonly message: string;
}

export interface DocumentModel {
  readonly empty: boolean;
  /** "A" = fully prose; "B" = prose with ≥1 complex region; "C" = whole-graph fallback. */
  readonly tier: "A" | "B" | "C";
  readonly blocks: readonly DocumentBlock[];
  readonly warnings: readonly ProjectionWarning[];
  readonly nodeCount: number;
}
