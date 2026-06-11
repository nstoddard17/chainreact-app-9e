import type { WorkflowNode } from "@/contracts/workflow";
import { buildRequiredFieldsByType } from "@/features/workflow-builder/validation/buildRequiredFieldsByType";
import {
  missingRequiredFields,
  requirementLookupKey,
} from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";

/**
 * Run-Manually readiness preflight (A — server-side).
 *
 * The builder's "Needs setup" indicator is client-only; the run-now route did
 * NOT validate node config before enqueue, so a workflow saved with an
 * unconfigured node (e.g. an HTTP Request with no Method/URL) could be executed
 * for real and fail deep in the handler with a raw Zod dump
 * (`HANDLER_FAILED: [...]`).
 *
 * This helper reuses the SAME pure, metadata-derived required-field rules the
 * canvas uses — `buildRequiredFieldsByType` + `missingRequiredFields` — so the
 * server's verdict can never diverge from what the user saw as "Ready". No
 * parallel hardcoded rules: `fields[].required` in the action/trigger metadata
 * is the single source of truth.
 *
 * The handler Zod schemas remain the final runtime safety net; this is a
 * friendly pre-run gate, not a replacement for them.
 */

export interface UnconfiguredNode {
  readonly nodeId: string;
  /** Author-facing node name (user label, else metadata display name). */
  readonly displayName: string;
  /** Author-facing labels of the empty required fields, e.g. ["Method", "URL"]. */
  readonly missingFields: readonly string[];
}

/**
 * The action/trigger nodes whose required config is currently empty. Empty
 * array ⇒ the workflow is runnable from a required-field standpoint.
 */
export function findUnconfiguredNodes(
  nodes: readonly WorkflowNode[],
): readonly UnconfiguredNode[] {
  const requiredFieldsByType = buildRequiredFieldsByType(
    listAllActionMetas(),
    listAllTriggerMetas(),
  );
  const out: UnconfiguredNode[] = [];
  for (const node of nodes) {
    const missing = missingRequiredFields(node, requiredFieldsByType);
    if (missing.length === 0) continue;
    const reqs = requiredFieldsByType[requirementLookupKey(node)];
    out.push({
      nodeId: node.id,
      displayName: node.displayName ?? reqs?.displayName ?? node.type,
      missingFields: missing.map((f) => f.label),
    });
  }
  return out;
}

/**
 * Human-readable, builder-voiced message for the blocked run. Names the first
 * offending node explicitly (the common single-node case) and counts the rest.
 * e.g. "HTTP Request is missing required fields: Method, URL."
 */
export function formatUnconfiguredMessage(
  nodes: readonly UnconfiguredNode[],
): string {
  const first = nodes[0];
  if (!first) return "A node is missing required fields.";
  const base = `${first.displayName} is missing required fields: ${first.missingFields.join(", ")}.`;
  if (nodes.length === 1) return base;
  const others = nodes.length - 1;
  return `${base} (${others} other node${others === 1 ? "" : "s"} also need${others === 1 ? "s" : ""} setup.)`;
}
