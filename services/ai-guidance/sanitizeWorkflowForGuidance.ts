/**
 * Workflow → guidance-request sanitizer / generalizer (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * THE PRIVACY BOUNDARY. Converts a real `WorkflowDefinition` into the de-identified,
 * generalized `WorkflowGuidanceRequest` that may cross to an external guidance brain. It
 * keeps ONLY capability shape (node kind/provider/type) + edge topology (by opaque ref) +
 * the guidance kind + safe finding codes. It DROPS, wholesale and by construction:
 *   - every node `config` (values AND keys — never inspected, never forwarded),
 *   - node display labels (may carry user text),
 *   - real node / workflow / account / user ids (nodes become "n0", "n1", … — the real-id
 *     map is returned SEPARATELY for ChainReact-side use and never placed in the request),
 *   - any free-text; `findingCodes` are filtered to a strict code shape.
 *
 * Pure + non-mutating: it reads the definition and returns new objects; the input is never
 * changed. This is the function the privacy tests pin.
 */

import type { WorkflowDefinition } from "@/contracts/workflow";
import type {
  GeneralizedWorkflow,
  GuidanceKind,
  WorkflowGuidanceRequest,
} from "@/contracts/aiGuidance";
import { AI_GUIDANCE_SCHEMA_VERSION } from "@/contracts/aiGuidance";

export interface SanitizeWorkflowForGuidanceInput {
  readonly definition: WorkflowDefinition;
  readonly guidanceKind: GuidanceKind;
  /** Optional SAFE finding codes (registry enums). Anything not matching the code shape is dropped. */
  readonly findingCodes?: readonly string[];
}

export interface SanitizedWorkflowGuidance {
  /** The de-identified request — safe to send to a provider. */
  readonly request: WorkflowGuidanceRequest;
  /** INTERNAL ONLY: in-request ref → real node id. NEVER sent to a provider. */
  readonly refMap: ReadonlyMap<string, string>;
}

/** Codes/enums only — letters, digits, and `_.:-`, capped. Rejects free text / values. */
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

export function sanitizeWorkflowForGuidance(
  input: SanitizeWorkflowForGuidanceInput,
): SanitizedWorkflowGuidance {
  const def = input.definition;
  const nodes = Array.isArray(def?.nodes) ? def.nodes : [];
  const edges = Array.isArray(def?.edges) ? def.edges : [];

  const idToRef = new Map<string, string>();
  const refMap = new Map<string, string>();

  const genNodes = nodes.map((n, i) => {
    const ref = `n${i}`;
    idToRef.set(n.id, ref);
    refMap.set(ref, n.id);
    // CONFIG + LABEL + real id are intentionally NOT read past `n.id` (for the ref map) and
    // n.kind/provider/type (capability shape). Nothing else from the node crosses the boundary.
    return {
      ref,
      kind: typeof n.kind === "string" ? n.kind : "",
      provider: typeof n.provider === "string" ? n.provider : "",
      type: typeof n.type === "string" ? n.type : "",
    };
  });

  const genEdges = edges
    .map((e) => {
      const fromRef = idToRef.get(e.from);
      const toRef = idToRef.get(e.to);
      return fromRef && toRef ? { fromRef, toRef } : null;
    })
    .filter((e): e is { fromRef: string; toRef: string } => e !== null);

  const workflow: GeneralizedWorkflow = {
    nodeCount: genNodes.length,
    edgeCount: genEdges.length,
    nodes: genNodes,
    edges: genEdges,
  };

  const findingCodes = (input.findingCodes ?? []).filter(
    (c): c is string => typeof c === "string" && SAFE_CODE.test(c),
  );

  const request: WorkflowGuidanceRequest = {
    schemaVersion: AI_GUIDANCE_SCHEMA_VERSION,
    guidanceKind: input.guidanceKind,
    workflow,
    ...(findingCodes.length ? { findingCodes } : {}),
  };

  return { request, refMap };
}
