import { createHash } from "node:crypto";
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from "@/contracts/workflowDefinition";

/**
 * Canonical workflow fingerprint (WORKFLOW-LIVE-TEST-3 §2).
 *
 * ONE server-owned digest binds a live-test consent to the exact saved workflow whose side
 * effects the user reviewed. Recomputed from SERVER-LOADED state at every stage — prepare, start,
 * capture authorization, execution revalidation — and compared to the hash frozen on the session.
 * A mismatch means the workflow (or its connection selection) changed after disclosure: the old
 * consent is stale and must be refused. A client-supplied fingerprint is never accepted anywhere.
 *
 * WHAT IS HASHED
 *   - workflowId + accountId (a copied definition on another workflow/account never matches);
 *   - every node: id, kind, provider, type, displayName, and the FULL config (variable mappings
 *     live in config values, so a re-mapped field changes the hash);
 *   - every edge: id, from, to, label (routing);
 *   - the SORTED set of bound connection ids (stored on integrations rows, outside the
 *     definition — a swapped connection changes the fingerprint even though the graph is
 *     identical).
 *
 * WHAT IS DELIBERATELY EXCLUDED — proven non-executable, nothing else:
 *   - `node.position` — canvas coordinates. The engine never reads them (execution walks ids and
 *     edges); moving a card changes no side effect, so it must not void consent.
 *   - top-level `presentation` — Document-view section metadata, contract-documented as
 *     display-only ("the execution engine, readiness, and entitlement never read it").
 *   `displayName` IS included: it is presentation-adjacent, but the disclosure and the progress
 *   UI show step names, so a rename conservatively re-requires review. Erring toward
 *   invalidation is safe; erring toward survival is not.
 *
 * DETERMINISM: object keys are sorted recursively at every depth; arrays keep their order where
 * order is meaningful (config arrays like Sheets row values), while nodes are sorted by id and
 * edges by id — their array position carries no execution meaning, so a meaningless reorder must
 * not void consent. Undefined values are dropped (JSON round-trip equivalence).
 */

export interface WorkflowFingerprintInput {
  readonly workflowId: string;
  readonly accountId: string;
  readonly definition: WorkflowDefinition;
  /** Bound integration row ids (from the binding collector — server-resolved, never client-sent). */
  readonly connectionIds: readonly string[];
}

/** Recursively sort object keys; preserve array order; drop undefined. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

function canonicalNode(node: WorkflowNode): Record<string, unknown> {
  // Explicit whitelist — `position` (and anything a future schema adds) must be CHOSEN into the
  // fingerprint, never inherited by accident.
  return {
    id: node.id,
    kind: node.kind,
    provider: node.provider,
    type: node.type,
    displayName: node.displayName ?? null,
    config: canonicalize(node.config ?? {}),
  };
}

function canonicalEdge(edge: WorkflowEdge): Record<string, unknown> {
  return { id: edge.id, from: edge.from, to: edge.to, label: edge.label ?? null };
}

/** The canonical pre-hash document — exported for tests to inspect determinism directly. */
export function canonicalFingerprintDocument(input: WorkflowFingerprintInput): string {
  const doc = {
    v: 1,
    workflowId: input.workflowId,
    accountId: input.accountId,
    nodes: [...input.definition.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(canonicalNode),
    edges: [...input.definition.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(canonicalEdge),
    connectionIds: [...input.connectionIds].sort(),
  };
  return JSON.stringify(doc);
}

/** SHA-256 hex over the canonical document. */
export function computeWorkflowFingerprint(input: WorkflowFingerprintInput): string {
  return createHash("sha256").update(canonicalFingerprintDocument(input), "utf8").digest("hex");
}
