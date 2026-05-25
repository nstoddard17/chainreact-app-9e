/**
 * @jest-environment node
 *
 * Structural-parse tests for the WorkflowPatch Zod schema (Slice 4.AI-3).
 */

import {
  WorkflowPatchSchema,
  PatchOperationSchema,
  SUPPORTED_OPERATION_KINDS,
} from "@/services/workflows/patch/workflowPatchSchema";

const okNode = {
  id: "n1",
  kind: "action",
  provider: "gmail",
  type: "send_email",
  config: {},
  position: { x: 0, y: 0 },
};

describe("WorkflowPatchSchema", () => {
  it("parses a well-formed patch", () => {
    const res = WorkflowPatchSchema.safeParse({
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "rev-1",
      operations: [{ op: "moveNode", nodeId: "n1", position: { x: 1, y: 2 } }],
      summary: "s",
      rationale: "r",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an empty operations array", () => {
    const res = WorkflowPatchSchema.safeParse({
      patchId: "p1",
      workflowId: null,
      baseRevision: "rev-1",
      operations: [],
      summary: "s",
      rationale: "r",
    });
    expect(res.success).toBe(false);
  });

  it("rejects unexpected envelope keys (strict)", () => {
    const res = WorkflowPatchSchema.safeParse({
      patchId: "p1",
      workflowId: null,
      baseRevision: "rev-1",
      operations: [{ op: "removeNode", nodeId: "n1" }],
      summary: "s",
      rationale: "r",
      sneaky: true,
    });
    expect(res.success).toBe(false);
  });

  it("each supported op kind parses", () => {
    const ops: Record<string, unknown> = {
      addNode: { op: "addNode", node: okNode },
      updateNodeConfig: { op: "updateNodeConfig", nodeId: "n1", config: { a: 1 } },
      removeNode: { op: "removeNode", nodeId: "n1" },
      addEdge: { op: "addEdge", edge: { id: "e1", from: "n1", to: "n2" } },
      removeEdge: { op: "removeEdge", edgeId: "e1" },
      replaceEdge: { op: "replaceEdge", edgeId: "e1", edge: { id: "e1", from: "n1", to: "n2" } },
      moveNode: { op: "moveNode", nodeId: "n1", position: { x: 0, y: 0 } },
      repairVariableReference: { op: "repairVariableReference", nodeId: "n1", fieldPath: "to", newReference: "{{trigger.from}}" },
      replaceTrigger: { op: "replaceTrigger", node: { ...okNode, kind: "trigger", type: "new_email" } },
    };
    for (const kind of SUPPORTED_OPERATION_KINDS) {
      expect(PatchOperationSchema.safeParse(ops[kind]).success).toBe(true);
    }
  });

  it("rejects an unknown op discriminator", () => {
    expect(PatchOperationSchema.safeParse({ op: "teleport", nodeId: "n1" }).success).toBe(false);
  });

  it("rejects an op with extra keys (strict)", () => {
    expect(
      PatchOperationSchema.safeParse({ op: "removeNode", nodeId: "n1", extra: 1 }).success,
    ).toBe(false);
  });
});
