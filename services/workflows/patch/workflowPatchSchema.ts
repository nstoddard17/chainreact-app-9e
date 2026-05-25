import { z } from "zod";
import { RiskLevelSchema } from "@/contracts/actionMeta";
import {
  WorkflowEdgeSchema,
  WorkflowNodePositionSchema,
  WorkflowNodeSchema,
} from "@/contracts/workflowDefinition";

/**
 * Zod schemas for the WorkflowPatch envelope + operation union (Slice 4.AI-3).
 *
 * Structural validation only — these reject malformed envelopes/operations.
 * Semantic validation (registry grounding, config-against-meta, variable
 * references, risk, cost) lives in `validateWorkflowPatch.ts`.
 *
 * Node/edge sub-shapes reuse the canonical contracts so a patched node has
 * exactly the same shape the engine + resolver consume — no parallel node
 * definition. All operation objects are `.strict()` so unexpected keys are
 * rejected (a hallucinated extra field on an op fails fast).
 */

const AddNodeOpSchema = z
  .object({ op: z.literal("addNode"), node: WorkflowNodeSchema })
  .strict();

const UpdateNodeConfigOpSchema = z
  .object({
    op: z.literal("updateNodeConfig"),
    nodeId: z.string().min(1),
    config: z.record(z.string(), z.unknown()),
    replace: z.boolean().optional(),
  })
  .strict();

const RemoveNodeOpSchema = z
  .object({ op: z.literal("removeNode"), nodeId: z.string().min(1) })
  .strict();

const AddEdgeOpSchema = z
  .object({ op: z.literal("addEdge"), edge: WorkflowEdgeSchema })
  .strict();

const RemoveEdgeOpSchema = z
  .object({ op: z.literal("removeEdge"), edgeId: z.string().min(1) })
  .strict();

const ReplaceEdgeOpSchema = z
  .object({
    op: z.literal("replaceEdge"),
    edgeId: z.string().min(1),
    edge: WorkflowEdgeSchema,
  })
  .strict();

const MoveNodeOpSchema = z
  .object({
    op: z.literal("moveNode"),
    nodeId: z.string().min(1),
    position: WorkflowNodePositionSchema,
  })
  .strict();

const RepairVariableReferenceOpSchema = z
  .object({
    op: z.literal("repairVariableReference"),
    nodeId: z.string().min(1),
    fieldPath: z.string().min(1),
    newReference: z.string(),
  })
  .strict();

const ReplaceTriggerOpSchema = z
  .object({ op: z.literal("replaceTrigger"), node: WorkflowNodeSchema })
  .strict();

export const PatchOperationSchema = z.discriminatedUnion("op", [
  AddNodeOpSchema,
  UpdateNodeConfigOpSchema,
  RemoveNodeOpSchema,
  AddEdgeOpSchema,
  RemoveEdgeOpSchema,
  ReplaceEdgeOpSchema,
  MoveNodeOpSchema,
  RepairVariableReferenceOpSchema,
  ReplaceTriggerOpSchema,
]);

export const WorkflowPatchSchema = z
  .object({
    patchId: z.string().min(1),
    workflowId: z.string().min(1).nullable(),
    // Empty string is allowed by the schema so the validator can emit the
    // precise BASE_REVISION_MISSING error rather than a generic parse failure.
    baseRevision: z.string(),
    operations: z.array(PatchOperationSchema).min(1),
    summary: z.string(),
    rationale: z.string(),
    // Advisory model proposals — the validator recomputes + overrides these.
    riskLevel: RiskLevelSchema.optional(),
    requiresConfirmation: z.boolean().optional(),
  })
  .strict();

/** The Zod discriminator literals — used to detect an unknown `op` value. */
export const SUPPORTED_OPERATION_KINDS = [
  "addNode",
  "updateNodeConfig",
  "removeNode",
  "addEdge",
  "removeEdge",
  "replaceEdge",
  "moveNode",
  "repairVariableReference",
  "replaceTrigger",
] as const;
