import type { WorkflowNode } from "@/contracts/workflow";
import { nodeTypeKey } from "@/core/workflows/advancedBranching";
import { formatTypeKey, getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { buildNodeConfigSummary } from "@/core/workflows/nodeConfigSummary";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import {
  missingRequiredFields,
  requirementLookupKey,
} from "@/core/workflows/requiredFields";
import { complexRegionMessage, type ComplexRegionReason } from "./projectionTiers";
import type {
  DocumentBlock,
  DocumentComplexRegionBlock,
  DocumentValueChip,
  ProjectionMeta,
} from "./documentModel";

/**
 * Document Builder — deterministic sentence/fork copy (5.DUAL-BUILDER-1 / CS-1).
 *
 * Pure, React-free text + block derivation for the projection: sentences reuse
 * the SHARED cores (`getNodeDisplayName`, `buildNodeConfigSummary`,
 * `missingRequiredFields`) so the Document can never disagree with the canvas
 * about titles, summaries, or what still needs setup. All copy is
 * template-based — never LLM-generated, never persisted.
 */

export function providerLabelFor(meta: ProjectionMeta, providerId: string): string {
  return meta.providerLabels?.[providerId] ?? formatTypeKey(providerId);
}

export function forkMetaDisplayName(
  meta: ProjectionMeta,
  node: WorkflowNode,
): { displayName?: string } | undefined {
  const summary = meta.summaryFieldsByType?.[requirementLookupKey(node)];
  return summary ? { displayName: summary.displayName } : undefined;
}

export function blankChipsFor(meta: ProjectionMeta, node: WorkflowNode) {
  return missingRequiredFields(node, meta.requiredFieldsByType).map((r) => ({
    name: r.name,
    label: r.label,
  }));
}

/**
 * Emit the block(s) for one non-branching node: a sentence, or — when the
 * metadata maps are provided and genuinely don't know this `provider:type` —
 * a single-node complex region (unknown types stay honest, the walk continues).
 */
export function sentenceBlocksFor(
  meta: ProjectionMeta,
  byId: ReadonlyMap<string, WorkflowNode>,
  node: WorkflowNode,
): DocumentBlock[] {
  const key = requirementLookupKey(node);
  const summary = meta.summaryFieldsByType?.[key];
  const required = meta.requiredFieldsByType?.[key];
  const metaProvided =
    meta.summaryFieldsByType !== undefined || meta.requiredFieldsByType !== undefined;

  if (node.type !== "" && metaProvided && !summary && !required) {
    return [complexBlock("unknown_node_type", [node.id], byId, meta.summaryFieldsByType)];
  }

  const valueChips: DocumentValueChip[] = summary
    ? buildNodeConfigSummary({
        displayName: summary.displayName,
        fields: summary.fields,
        config: node.config ?? {},
      }).segments.map((s) => ({
        label: s.label,
        display: s.display,
        kind: s.kind,
        ...(s.unresolved ? { unresolved: true } : {}),
      }))
    : [];

  return [
    {
      kind: "sentence",
      nodeId: node.id,
      nodeKind: node.kind,
      title: getNodeDisplayName(node, summary ? { displayName: summary.displayName } : undefined),
      providerId: node.provider,
      providerLabel: providerLabelFor(meta, node.provider),
      untyped: node.type === "",
      valueChips,
      blankChips: blankChipsFor(meta, node),
    },
  ];
}

export function complexBlock(
  reason: ComplexRegionReason,
  ids: readonly string[],
  byId: ReadonlyMap<string, WorkflowNode>,
  summaryFieldsByType: NodeSummaryFieldsByType | undefined,
): DocumentComplexRegionBlock {
  const titles = ids.map((nodeId) => {
    const node = byId.get(nodeId);
    if (!node) return nodeId;
    const summary = summaryFieldsByType?.[requirementLookupKey(node)];
    return getNodeDisplayName(node, summary ? { displayName: summary.displayName } : undefined);
  });
  return {
    kind: "complex",
    reason,
    message: complexRegionMessage(reason),
    nodeIds: ids,
    nodeTitles: titles,
    focusNodeId: ids[0] ?? null,
  };
}

// ---- fork copy ----------------------------------------------------------------

function describeOperand(value: unknown): string {
  if (value === undefined || value === null || value === "") return "…";
  const s = String(value);
  const m = s.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return m ? m[1]! : s;
}

function humanizeOperator(operator: unknown): string {
  if (typeof operator !== "string" || operator === "") return "…";
  return formatTypeKey(operator).toLowerCase();
}

export function forkConditionSummary(
  node: WorkflowNode,
  vocabulary: readonly string[],
): string {
  const config = (node.config ?? {}) as Record<string, unknown>;
  if (nodeTypeKey(node) === "native:if_then_condition") {
    const input = config.input;
    const operator = config.operator;
    if (input === undefined || input === "" || operator === undefined || operator === "") {
      return "Condition not set up yet";
    }
    const value = config.value;
    const valuePart =
      value === undefined || value === null || value === "" ? "" : ` ${describeOperand(value)}`;
    return `If ${describeOperand(input)} ${humanizeOperator(operator)}${valuePart}`;
  }
  // native:router
  const routeCount = vocabulary.length;
  return `Picks 1 of ${routeCount} route${routeCount === 1 ? "" : "s"} — first match wins`;
}

export function laneTitle(
  typeKey: string,
  label: string,
  kindHint: "labeled" | "always",
  node: WorkflowNode,
): string {
  if (kindHint === "always") return "Always";
  if (typeKey === "native:if_then_condition") {
    if (label === "true") return "If yes";
    if (label === "false") return "Otherwise";
  }
  const config = (node.config ?? {}) as Record<string, unknown>;
  if (
    typeKey === "native:router" &&
    typeof config.defaultRoute === "string" &&
    config.defaultRoute === label
  ) {
    const routes = Array.isArray(config.routes) ? config.routes : [];
    const isAlsoRoute = routes.some((r) => (r as { label?: unknown } | null)?.label === label);
    if (!isAlsoRoute) return `${label} (otherwise)`;
  }
  return label;
}

export function laneSubtitle(
  typeKey: string,
  label: string,
  node: WorkflowNode,
): string | null {
  if (typeKey !== "native:router" || label === "") return null;
  const config = (node.config ?? {}) as Record<string, unknown>;
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const route = routes.find((r) => (r as { label?: unknown } | null)?.label === label) as
    | { condition?: { input?: unknown; operator?: unknown; value?: unknown } }
    | undefined;
  const condition = route?.condition;
  if (!condition || condition.input === undefined || condition.operator === undefined) {
    return null;
  }
  const value =
    condition.value === undefined || condition.value === null || condition.value === ""
      ? ""
      : ` ${describeOperand(condition.value)}`;
  return `${describeOperand(condition.input)} ${humanizeOperator(condition.operator)}${value}`;
}
