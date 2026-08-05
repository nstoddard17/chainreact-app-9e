/**
 * @jest-environment node
 *
 * Checkpoint capture + restore preserve presentation (CS-4).
 *
 * Checkpoints snapshot the FULL WorkflowDefinition jsonb (no whitelist), so
 * section metadata rides along on capture and is written back verbatim on
 * restore through the shared saveDraftDefinition path.
 */
const mockCreate = jest.fn();
const mockGetByIdForWorkflow = jest.fn();
const mockPrune = jest.fn();
jest.mock("@/repositories/workflowCheckpoints", () => ({
  create: (...a: unknown[]) => mockCreate(...a),
  listRecentByWorkflow: jest.fn(),
  getByIdForWorkflow: (...a: unknown[]) => mockGetByIdForWorkflow(...a),
  pruneToRecent: (...a: unknown[]) => mockPrune(...a),
}));
// WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — restore writes through the
// canonical guarded compare-and-swap.
const mockUpdateDraftDefinition = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  updateDraftDefinitionIfRevisionMatches: (...a: unknown[]) => mockUpdateDraftDefinition(...a),
  getById: jest.fn(),
}));

import { createCheckpoint, restoreCheckpoint } from "@/services/workflows/checkpoints";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const DEF_WITH_SECTIONS: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "slack", type: "new_message", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C", text: "hi" }, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e1", from: "t", to: "a" }],
  presentation: { version: 1, sections: [{ id: "s1", title: "Group", nodeIds: ["a"] }] },
};

function workflow(): WorkflowRecord {
  return {
    id: "wf1",
    accountId: "acc1",
    name: "W",
    state: "draft",
    draftDefinition: { nodes: [], edges: [] },
    createdByUserId: "u1",
    updatedAt: "2026-07-21T00:00:00Z",
  } as unknown as WorkflowRecord;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockGetByIdForWorkflow.mockReset();
  mockPrune.mockReset();
  mockUpdateDraftDefinition.mockReset();
});

it("capture stores the definition WITH presentation", async () => {
  mockCreate.mockResolvedValue({
    id: "cp1", workflowId: "wf1", accountId: "acc1", createdByUserId: "u1",
    source: "manual", name: "n", prompt: null, summary: null, createdAt: "2026-07-21T00:00:00Z",
  });
  mockPrune.mockResolvedValue(undefined);
  await createCheckpoint({
    workflowId: "wf1", accountId: "acc1", createdByUserId: "u1", source: "manual",
    name: "n", definition: DEF_WITH_SECTIONS,
  });
  expect(mockCreate.mock.calls[0]![0].definition.presentation.sections[0].title).toBe("Group");
});

it("restore writes the checkpoint's presentation back to the draft", async () => {
  mockGetByIdForWorkflow.mockResolvedValue({
    id: "cp1", workflowId: "wf1", definition: DEF_WITH_SECTIONS,
  });
  mockUpdateDraftDefinition.mockResolvedValue({ ...workflow(), draftDefinition: DEF_WITH_SECTIONS });
  const res = await restoreCheckpoint({
    workflow: workflow(),
    checkpointId: "cp1",
    expectedRevision: "2026-07-21T00:00:00Z",
  });
  expect(res.ok).toBe(true);
  const written = (mockUpdateDraftDefinition.mock.calls[0]![0] as { draftDefinition: WorkflowDefinition })
    .draftDefinition;
  expect(written.presentation?.sections[0]!.title).toBe("Group");
});
