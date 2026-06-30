/**
 * @jest-environment node
 *
 * CHECKPOINTS-1 — workflow checkpoints service.
 *
 * Business rules under test (docs: named-checkpoints slice):
 *   - Creating a checkpoint persists the prompt, summary, source, name, and the
 *     PRE-change draft snapshot, and prunes to the recent cap.
 *   - Restoring a checkpoint writes the checkpoint's CAPTURED definition back as
 *     the workflow's draft (returning the workflow to that earlier graph/config),
 *     going through the shared saveDraftDefinition path.
 *   - A checkpoint id that is not for this workflow restores nothing.
 *
 * Mocks are limited to the repository boundary; saveDraftDefinition runs for
 * real (the rule it embodies — write-then-maybe-deactivate — is not the function
 * under test here, and for a draft workflow it simply writes).
 */

const mockCreate = jest.fn();
const mockListRecent = jest.fn();
const mockGetByIdForWorkflow = jest.fn();
const mockPrune = jest.fn();
jest.mock("@/repositories/workflowCheckpoints", () => ({
  create: (...a: unknown[]) => mockCreate(...a),
  listRecentByWorkflow: (...a: unknown[]) => mockListRecent(...a),
  getByIdForWorkflow: (...a: unknown[]) => mockGetByIdForWorkflow(...a),
  pruneToRecent: (...a: unknown[]) => mockPrune(...a),
}));

const mockUpdateDraftDefinition = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  updateDraftDefinition: (...a: unknown[]) => mockUpdateDraftDefinition(...a),
}));

import {
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from "@/services/workflows/checkpoints";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const PRE_CHANGE: WorkflowDefinition = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "slack", type: "new_message", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};

const CURRENT_DRAFT: WorkflowDefinition = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "slack", type: "new_message", config: {}, position: { x: 0, y: 0 } },
    { id: "a2", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e2", from: "t1", to: "a2" }],
};

function baseWorkflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-1",
    createdByUserId: "user-1",
    name: "WF",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: CURRENT_DRAFT,
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrune.mockResolvedValue(undefined);
});

describe("createCheckpoint", () => {
  it("persists prompt, summary, source, name and the pre-change definition, then prunes to the recent cap", async () => {
    mockCreate.mockResolvedValue({
      id: "cp-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      source: "react_agent",
      name: "Before React Agent change",
      prompt: "change slack message to gmail send email",
      summary: "Removed Slack; Added Gmail.",
      definition: PRE_CHANGE,
      createdAt: "2026-07-15T01:00:00Z",
    });

    const dto = await createCheckpoint({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      source: "react_agent",
      name: "Before React Agent change",
      prompt: "change slack message to gmail send email",
      summary: "Removed Slack; Added Gmail.",
      definition: PRE_CHANGE,
    });

    // The repo received every field, INCLUDING the captured pre-change snapshot.
    expect(mockCreate).toHaveBeenCalledWith({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      source: "react_agent",
      name: "Before React Agent change",
      prompt: "change slack message to gmail send email",
      summary: "Removed Slack; Added Gmail.",
      definition: PRE_CHANGE,
    });
    // Unbounded growth is prevented.
    expect(mockPrune).toHaveBeenCalledWith("wf-1", 20);
    // The returned DTO carries the metadata (and never the raw definition / accountId).
    expect(dto).toMatchObject({
      id: "cp-1",
      source: "react_agent",
      name: "Before React Agent change",
      prompt: "change slack message to gmail send email",
      summary: "Removed Slack; Added Gmail.",
      createdAt: "2026-07-15T01:00:00Z",
    });
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("definition");
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("accountId");
  });

  it("defaults optional prompt/summary to null when absent", async () => {
    mockCreate.mockResolvedValue({
      id: "cp-2", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "manual", name: "Manual checkpoint", prompt: null, summary: null,
      definition: PRE_CHANGE, createdAt: "2026-07-15T02:00:00Z",
    });
    await createCheckpoint({
      workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "manual", name: "Manual checkpoint", definition: PRE_CHANGE,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: null, summary: null }),
    );
  });
});

describe("listCheckpoints", () => {
  it("returns the recent metadata DTOs newest-first from the repo", async () => {
    mockListRecent.mockResolvedValue([
      { id: "cp-2", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1", source: "react_agent", name: "Before React Agent change", prompt: "p2", summary: "s2", createdAt: "2026-07-15T02:00:00Z" },
      { id: "cp-1", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1", source: "react_agent", name: "Before React Agent change", prompt: "p1", summary: "s1", createdAt: "2026-07-15T01:00:00Z" },
    ]);
    const list = await listCheckpoints("wf-1");
    expect(list.map((c) => c.id)).toEqual(["cp-2", "cp-1"]);
    expect(list[0]).not.toHaveProperty("definition");
  });
});

describe("restoreCheckpoint", () => {
  it("writes the checkpoint's captured definition back as the new draft graph", async () => {
    mockGetByIdForWorkflow.mockResolvedValue({
      id: "cp-1", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "react_agent", name: "Before React Agent change", prompt: null, summary: null,
      definition: PRE_CHANGE, createdAt: "2026-07-15T01:00:00Z",
    });
    // Echo what saveDraftDefinition writes so we can assert the restored graph.
    mockUpdateDraftDefinition.mockImplementation(async (_id: string, def: WorkflowDefinition) =>
      baseWorkflow({ draftDefinition: def, updatedAt: "2026-07-15T03:00:00Z" }),
    );

    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ draftDefinition: CURRENT_DRAFT }),
      checkpointId: "cp-1",
    });

    expect(result.ok).toBe(true);
    // The checkpoint id was scoped to THIS workflow when read.
    expect(mockGetByIdForWorkflow).toHaveBeenCalledWith("cp-1", "wf-1");
    // The write persisted the checkpoint's captured graph, not the current draft.
    expect(mockUpdateDraftDefinition).toHaveBeenCalledWith("wf-1", PRE_CHANGE);
    if (result.ok) {
      expect(result.record.draftDefinition).toEqual(PRE_CHANGE);
      expect(result.record.draftDefinition).not.toEqual(CURRENT_DRAFT);
    }
  });

  it("restores nothing and reports checkpoint_not_found when the id is not for this workflow", async () => {
    mockGetByIdForWorkflow.mockResolvedValue(null);
    const result = await restoreCheckpoint({
      workflow: baseWorkflow(),
      checkpointId: "cp-other",
    });
    expect(result).toEqual({ ok: false, reason: "checkpoint_not_found" });
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });
});
