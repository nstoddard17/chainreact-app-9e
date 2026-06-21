import type { WorkflowNode } from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import {
  missingRequiredFields,
  requirementLookupKey,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";

/**
 * Post-apply config hints for nodes added by an explicit "Apply preview"
 * (HERMES-AGENT-APPLY-CONFIG-HINTS).
 *
 * After the user applies an AI preview, the newly-added nodes land with EMPTY
 * config (nothing inferred — HERMES-AGENT-APPLY-PREVIEW-PATCH). This pure helper
 * tells the UI WHICH required fields each new node still needs, so the user
 * immediately understands what to configure before saving / activating.
 *
 * STRICT SAFETY CONTRACT — this surfaces field KEY/LABEL names ONLY:
 *   - The source of truth is the action/trigger METADATA (`requiredFieldsByType`,
 *     built from the discovery registry) via the SAME `missingRequiredFields`
 *     rule the builder validation + canvas "Needs setup" chip already use. It is
 *     never derived from the Hermes plan prose.
 *   - It returns required-field LABELS (e.g. "Channel", "Message") — NEVER field
 *     VALUES, secrets, OAuth/refresh tokens, provider account ids, credential
 *     ids, or any other connection detail (those are not even in scope here —
 *     the node config is empty and the metadata carries labels only).
 *   - When a node's type has NO metadata entry (`hasMetadata: false`), the helper
 *     reports nothing field-specific; the UI shows a conservative generic notice
 *     ("Review this step's required fields.").
 *
 * Pure: no state, no fetch, no mutation. A node id that no longer exists in
 * `nodes` (removed since apply) is dropped.
 */
export interface AppliedConfigHint {
  readonly nodeId: string;
  /** Human node label (display name / friendly type key). NEVER the raw id or a value. */
  readonly label: string;
  /**
   * Required-field LABELS still empty, sourced from metadata. Names only —
   * never values/secrets/credential ids. Empty when the node is ready OR when
   * metadata is unavailable (`hasMetadata: false`).
   */
  readonly missingFieldLabels: readonly string[];
  /** True when provider/action metadata was found for this node's type. */
  readonly hasMetadata: boolean;
}

/**
 * Compute config hints for the given applied node ids. Order follows
 * `appliedNodeIds`. See the safety contract above.
 */
export function buildAppliedConfigHints(
  appliedNodeIds: readonly string[],
  nodes: readonly WorkflowNode[],
  requiredFieldsByType?: RequiredFieldsByType,
): readonly AppliedConfigHint[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hints: AppliedConfigHint[] = [];
  for (const id of appliedNodeIds) {
    const node = byId.get(id);
    if (!node) continue; // removed since apply — nothing to hint
    const label = getNodeDisplayName(node);
    const reqs = requiredFieldsByType?.[requirementLookupKey(node)];
    if (!reqs) {
      // No metadata for this type → conservative generic notice in the UI.
      hints.push({ nodeId: id, label, missingFieldLabels: [], hasMetadata: false });
      continue;
    }
    const missingFieldLabels = missingRequiredFields(node, requiredFieldsByType).map(
      (f) => f.label,
    );
    hints.push({ nodeId: id, label, missingFieldLabels, hasMetadata: true });
  }
  return hints;
}

/**
 * A hint needs surfacing when the node still has missing required fields OR we
 * have no metadata to confirm it's ready. A node whose required fields are all
 * satisfied (or all default-backed) and whose metadata is known is complete and
 * produces no hint row.
 */
export function appliedConfigHintNeedsAttention(hint: AppliedConfigHint): boolean {
  return !hint.hasMetadata || hint.missingFieldLabels.length > 0;
}
