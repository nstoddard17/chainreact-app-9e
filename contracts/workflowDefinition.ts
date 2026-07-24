import { z } from "zod";
import {
  WorkflowPresentationSchema,
  normalizePresentation,
  type WorkflowPresentation,
} from "./workflowPresentation";

/**
 * Structured contract for the workflow definition (nodes + edges).
 *
 * Per docs/rules/workflow-builder-ui.md and workflow-state-store.md: the
 * shape is the source of truth that the builder UI, the variable resolver,
 * and the execution engine all consume. Slice 1H stored a passthrough
 * `unknown` shape; Slice 1I formalizes it.
 *
 * `provider` matches a provider id from the registry (e.g. "slack"). `type`
 * is provider-scoped (e.g. "send_channel_message" for a Slack action) and
 * is the dispatch key the execution engine uses to select a handler. The
 * `config` payload stays opaque here — per-provider Zod schemas live next
 * to the action/trigger handlers (Slice 1L+) and are validated at handler
 * dispatch, not at definition save.
 */

export const WorkflowNodeKindSchema = z.enum(["trigger", "action"]);
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;

export const WorkflowNodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type WorkflowNodePosition = z.infer<typeof WorkflowNodePositionSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  kind: WorkflowNodeKindSchema,
  /** Provider id from the registry (lowercase, e.g. "slack"). */
  provider: z.string().min(1),
  /**
   * Provider-scoped action/trigger type the execution engine dispatches on.
   * Empty string is allowed transiently while the user has added a node but
   * not yet selected the specific action — the API accepts it but the engine
   * (Slice 1K+) refuses to execute a node without a type.
   */
  type: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  position: WorkflowNodePositionSchema.default({ x: 0, y: 0 }),
  /**
   * Optional USER-FACING node name (Slice 4.BUILDER-NODE-IDENTITY-1). Purely
   * for human display in the builder UI, validation copy, and run history —
   * it is NEVER identity: edges, patch references, execution dispatch, and
   * persistence all key on `id`, never this. When absent/blank the UI derives
   * a friendly default from metadata (see `getNodeDisplayName`).
   *
   * Owned by the USER only (the rename UI). The AI/planner NEVER sets it —
   * any `displayName` arriving on an AI patch node is stripped unconditionally
   * at the apply/preview boundary (`materializeAiPatchNodeIds`).
   */
  displayName: z.string().max(120).optional(),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /**
   * Optional branch label. When present, the execution engine only follows
   * this edge when the source node's handler returns a matching
   * `branchTaken`. Unlabeled edges are always followed (legacy behavior).
   * See docs/slices/parity/engine-branching-plan.md §3.1.
   */
  label: z.string().min(1).max(64).optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

/**
 * Top-level workflow definition. Stored as `workflows.draft_definition` and
 * snapshotted into `workflow_revisions.definition` on publish.
 *
 * Invariants enforced here:
 *   - At most one trigger node. (V2 supports multi-trigger later; the rule
 *     doc §"Workflow with multiple triggers" defers this.)
 *   - Edge endpoints must reference existing node ids.
 *   - No self-loops; no duplicate edges between the same (from, to) pair.
 *
 * Cycle detection is intentionally NOT enforced here — the builder may
 * compose graphs with retry / loop-back constructs once logic nodes ship.
 * The execution engine (Slice 1K) is responsible for cycle handling.
 */
export const WorkflowDefinitionSchema = z
  .object({
    nodes: z.array(WorkflowNodeSchema).default([]),
    edges: z.array(WorkflowEdgeSchema).default([]),
    /**
     * 5.DUAL-BUILDER-1 CS-4 — optional, presentation-only manual SECTION
     * metadata. Display-only: the execution engine, readiness, and entitlement
     * never read it (they consume only nodes/edges). Old definitions with only
     * `{ nodes, edges }` parse unchanged. Structural abuse (unknown version,
     * over-length titles, over-cap sections, duplicate section ids) is rejected
     * here; stale/overlapping MEMBERSHIP is normalized (not rejected) by the
     * transform below against the definition's own node ids, so a node deletion
     * can never make a workflow unsaveable.
     */
    presentation: WorkflowPresentationSchema.optional(),
  })
  .superRefine((def, ctx) => {
    const triggerCount = def.nodes.filter((n) => n.kind === "trigger").length;
    if (triggerCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes"],
        message: "A workflow may have at most one trigger node.",
      });
    }

    const nodeIds = new Set(def.nodes.map((n) => n.id));
    const seenEdgeKeys = new Set<string>();
    for (let i = 0; i < def.edges.length; i++) {
      const edge = def.edges[i]!;
      if (edge.from === edge.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i],
          message: `Edge '${edge.id}' is a self-loop (from === to).`,
        });
      }
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "from"],
          message: `Edge '${edge.id}' references unknown node '${edge.from}'.`,
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "to"],
          message: `Edge '${edge.id}' references unknown node '${edge.to}'.`,
        });
      }
      // Dedup keyed on (from, to, label ?? "") so a router/branch node may
      // fan out same-labeled paths to different targets, and same-target
      // pairs may differ by branch label. Same-source/same-target/same-label
      // (or both unlabeled) is still rejected. See engine-branching-plan.md
      // §3.5 (locked accept).
      const key = `${edge.from}->${edge.to}::${edge.label ?? ""}`;
      if (seenEdgeKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i],
          message: edge.label
            ? `Duplicate edge between '${edge.from}' and '${edge.to}' with label '${edge.label}'.`
            : `Duplicate edge between '${edge.from}' and '${edge.to}'.`,
        });
      }
      seenEdgeKeys.add(key);
    }

    const ids = new Set<string>();
    for (let i = 0; i < def.nodes.length; i++) {
      const id = def.nodes[i]!.id;
      if (ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "id"],
          message: `Duplicate node id '${id}'.`,
        });
      }
      ids.add(id);
    }
  })
  // 5.DUAL-BUILDER-1 CS-4 — normalize presentation membership against the
  // definition's OWN node ids at the type boundary (the single shared cleanup
  // rule): prune stale ids, enforce one-section-per-node, drop empty sections.
  // Presentation is omitted entirely when nothing survives, so the persisted /
  // API shape never carries an empty block. Nodes/edges are untouched.
  .transform((def): WorkflowDefinitionShape => {
    const ids = new Set(def.nodes.map((n) => n.id));
    const presentation = normalizePresentation(def.presentation, ids);
    if (presentation === null) {
      if (def.presentation === undefined) return def;
      const { presentation: _dropped, ...rest } = def;
      return rest;
    }
    return { ...def, presentation };
  });

/** The normalized definition shape (post-transform). */
export interface WorkflowDefinitionShape {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  presentation?: WorkflowPresentation;
}
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type { WorkflowPresentation };

/** Empty definition — the default for newly-created drafts. */
export const EMPTY_WORKFLOW_DEFINITION: WorkflowDefinition = {
  nodes: [],
  edges: [],
};
