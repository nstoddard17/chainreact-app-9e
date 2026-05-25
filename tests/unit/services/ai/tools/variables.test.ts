/**
 * @jest-environment node
 *
 * Tests for services/ai/tools/variables.ts (Slice 4.AI-2).
 *
 * Mocks the workflows repo; uses the REAL discovery registry + the REAL
 * upstream-topology / reference-format helpers from core/workflows.
 */
const mockGetById = jest.fn();

jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
}));

import { getAvailableVariablesForAI } from "@/services/ai/tools/variables";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import type { OutputMeta } from "@/contracts/actionMeta";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const triggerWithPayload = listAllTriggerMetas().find((m) => m.payloadShape.length > 0)!;
const actionWithOutputs = listAllActionMetas().find((m) => m.outputs.length > 0)!;

function makeRecord(draftDefinition: WorkflowDefinition): WorkflowRecord {
  return {
    id: "wf-1",
    userId: "owner-1",
    name: "My Workflow",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition,
    deletedAt: null,
    createdAt: "2026-05-25T00:00:00Z",
    updatedAt: "2026-05-25T00:00:00Z",
  };
}

function firstTopLevelSensitive(outputs: readonly OutputMeta[]): string | null {
  for (const o of outputs) if (o.sensitive === true) return o.name;
  return null;
}

beforeEach(() => mockGetById.mockReset());

describe("getAvailableVariablesForAI", () => {
  it("returns upstream outputs from ancestors and the trigger alias", async () => {
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "trigger", provider: triggerWithPayload.provider, type: triggerWithPayload.type, config: {}, position: { x: 0, y: 0 } },
          { id: "n2", kind: "action", provider: actionWithOutputs.provider, type: actionWithOutputs.type, config: {}, position: { x: 0, y: 1 } },
          { id: "n3", kind: "action", provider: actionWithOutputs.provider, type: actionWithOutputs.type, config: {}, position: { x: 0, y: 2 } },
        ],
        edges: [
          { id: "e1", from: "n1", to: "n2" },
          { id: "e2", from: "n2", to: "n3" },
        ],
      }),
    );

    const result = await getAvailableVariablesForAI("owner-1", "wf-1", "n3");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.triggerAlias).toBe("trigger");

    const triggerPath = triggerWithPayload.payloadShape[0]!.name;
    const triggerVar = result.data.variables.find(
      (v) => v.nodeId === "n1" && v.path === triggerPath,
    );
    expect(triggerVar).toBeDefined();
    expect(triggerVar!.reference).toBe(`{{n1.${triggerPath}}}`);
    expect(triggerVar!.nodeKind).toBe("trigger");

    // Upstream action output present too.
    expect(result.data.variables.some((v) => v.nodeId === "n2")).toBe(true);
  });

  it("excludes downstream / unreachable nodes (no upstream → empty)", async () => {
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "trigger", provider: triggerWithPayload.provider, type: triggerWithPayload.type, config: {}, position: { x: 0, y: 0 } },
          { id: "n2", kind: "action", provider: actionWithOutputs.provider, type: actionWithOutputs.type, config: {}, position: { x: 0, y: 1 } },
        ],
        edges: [{ id: "e1", from: "n1", to: "n2" }],
      }),
    );
    const result = await getAvailableVariablesForAI("owner-1", "wf-1", "n1");
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.variables).toEqual([]);
    expect(result.data.triggerAlias).toBeNull();
  });

  it("preserves the sensitive flag on output variables", async () => {
    const sensitiveAction = listAllActionMetas().find(
      (m) => firstTopLevelSensitive(m.outputs) !== null,
    );
    expect(sensitiveAction).toBeDefined();
    const sensitivePath = firstTopLevelSensitive(sensitiveAction!.outputs)!;

    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [
          { id: "n1", kind: "action", provider: sensitiveAction!.provider, type: sensitiveAction!.type, config: {}, position: { x: 0, y: 0 } },
          { id: "n2", kind: "action", provider: actionWithOutputs.provider, type: actionWithOutputs.type, config: {}, position: { x: 0, y: 1 } },
        ],
        edges: [{ id: "e1", from: "n1", to: "n2" }],
      }),
    );

    const result = await getAvailableVariablesForAI("owner-1", "wf-1", "n2");
    if (!result.ok) throw new Error("expected ok");
    const entry = result.data.variables.find((v) => v.nodeId === "n1" && v.path === sensitivePath);
    expect(entry).toBeDefined();
    expect(entry!.sensitive).toBe(true);
  });

  it("returns NOT_FOUND for an unknown node id", async () => {
    mockGetById.mockResolvedValue(makeRecord({ nodes: [], edges: [] }));
    const result = await getAvailableVariablesForAI("owner-1", "wf-1", "ghost");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when the caller does not own the workflow", async () => {
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [{ id: "n1", kind: "action", provider: actionWithOutputs.provider, type: actionWithOutputs.type, config: {}, position: { x: 0, y: 0 } }],
        edges: [],
      }),
    );
    const result = await getAvailableVariablesForAI("intruder", "wf-1", "n1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_FOUND");
  });
});
