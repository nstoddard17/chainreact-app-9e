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

// WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — restore writes through the
// canonical guarded compare-and-swap (there is no unguarded writer any more).
const mockGuardedUpdate = jest.fn();
const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  updateDraftDefinitionIfRevisionMatches: (...a: unknown[]) => mockGuardedUpdate(...a),
  getById: (...a: unknown[]) => mockGetById(...a),
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
    mockGuardedUpdate.mockImplementation(
      async (input: { draftDefinition: WorkflowDefinition }) =>
        baseWorkflow({ draftDefinition: input.draftDefinition, updatedAt: "2026-07-15T03:00:00Z" }),
    );

    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ draftDefinition: CURRENT_DRAFT }),
      checkpointId: "cp-1",
      expectedRevision: "2026-07-15T00:00:00Z",
    });

    expect(result.ok).toBe(true);
    // The checkpoint id was scoped to THIS workflow when read.
    expect(mockGetByIdForWorkflow).toHaveBeenCalledWith("cp-1", "wf-1");
    // The write persisted the checkpoint's captured graph via the GUARDED
    // compare-and-swap, keyed on the caller's expected revision.
    expect(mockGuardedUpdate).toHaveBeenCalledWith({
      accountId: "acct-1",
      workflowId: "wf-1",
      draftDefinition: PRE_CHANGE,
      expectedUpdatedAt: "2026-07-15T00:00:00Z",
    });
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
      expectedRevision: "2026-07-15T00:00:00Z",
    });
    expect(result).toEqual({ ok: false, reason: "checkpoint_not_found" });
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  // WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — a stale session must
  // never restore over a newer draft another session just saved.
  it("rejects a stale expectedRevision BEFORE reading the checkpoint (no write, typed conflict)", async () => {
    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ updatedAt: "2026-07-15T02:00:00Z" }),
      checkpointId: "cp-1",
      expectedRevision: "2026-07-15T00:00:00Z", // older than the loaded row
    });
    expect(result).toEqual({
      ok: false,
      reason: "revision_conflict",
      latestRevision: "2026-07-15T02:00:00Z",
    });
    expect(mockGetByIdForWorkflow).not.toHaveBeenCalled();
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  it("classifies a compare-and-swap miss as revision_conflict with the CURRENT server token", async () => {
    mockGetByIdForWorkflow.mockResolvedValue({
      id: "cp-1", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "react_agent", name: "Before React Agent change", prompt: null, summary: null,
      definition: PRE_CHANGE, createdAt: "2026-07-15T01:00:00Z",
    });
    mockGuardedUpdate.mockResolvedValue(null); // row moved between load and UPDATE
    mockGetById.mockResolvedValue(baseWorkflow({ updatedAt: "2026-07-15T06:00:00Z" }));

    const result = await restoreCheckpoint({
      workflow: baseWorkflow(),
      checkpointId: "cp-1",
      expectedRevision: "2026-07-15T00:00:00Z",
    });
    expect(result).toEqual({
      ok: false,
      reason: "revision_conflict",
      latestRevision: "2026-07-15T06:00:00Z",
    });
  });
});

// ─── RECONV-1 S1 — a reconverging (diamond) graph round-trips verbatim ──────
//
// Checkpoint create/restore must never rewrite, reorder, or drop rejoining
// edges: the payload handed to the repo IS the input definition, labels
// included. The branch node here is a plain action carrying labeled edges
// (labeled edges alone are not plan-gated), so the restore path's real
// saveDraftDefinition run stays entitlement-neutral.
describe("RECONV-1 — diamond definition round-trip", () => {
  const DIAMOND: WorkflowDefinition = {
    nodes: [
      { id: "t1", kind: "trigger", provider: "slack", type: "new_message", config: {}, position: { x: 0, y: 0 } },
      { id: "branch", kind: "action", provider: "slack", type: "route", config: {}, position: { x: 0, y: 100 } },
      { id: "A", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: -100, y: 200 } },
      { id: "B", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 100, y: 200 } },
      { id: "S", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C2" }, position: { x: 0, y: 300 } },
    ],
    edges: [
      { id: "e1", from: "t1", to: "branch" },
      { id: "e2", from: "branch", to: "A", label: "true" },
      { id: "e3", from: "branch", to: "B", label: "false" },
      { id: "e4", from: "A", to: "S" },
      { id: "e5", from: "B", to: "S" },
    ],
  };

  it("createCheckpoint hands the repo the diamond's edges (labels included) verbatim", async () => {
    mockCreate.mockResolvedValue({
      id: "cp-d", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "manual", name: "Before rewire", prompt: null, summary: null,
      definition: DIAMOND, createdAt: "2026-07-15T04:00:00Z",
    });
    await createCheckpoint({
      workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "manual", name: "Before rewire", definition: DIAMOND,
    });
    const stored = mockCreate.mock.calls[0]![0] as { definition: WorkflowDefinition };
    expect(stored.definition.edges).toEqual(DIAMOND.edges);
    expect(stored.definition).toEqual(DIAMOND);
  });

  it("restoreCheckpoint writes the captured diamond back verbatim (stored payload === input edges)", async () => {
    mockGetByIdForWorkflow.mockResolvedValue({
      id: "cp-d", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "manual", name: "Before rewire", prompt: null, summary: null,
      definition: DIAMOND, createdAt: "2026-07-15T04:00:00Z",
    });
    mockGuardedUpdate.mockImplementation(
      async (input: { draftDefinition: WorkflowDefinition }) =>
        baseWorkflow({ draftDefinition: input.draftDefinition, updatedAt: "2026-07-15T05:00:00Z" }),
    );

    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ draftDefinition: CURRENT_DRAFT }),
      checkpointId: "cp-d",
      expectedRevision: "2026-07-15T00:00:00Z",
    });

    expect(result.ok).toBe(true);
    expect(mockGuardedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1", draftDefinition: DIAMOND }),
    );
    if (result.ok) {
      expect(result.record.draftDefinition.edges).toEqual(DIAMOND.edges);
      expect(result.record.draftDefinition).toEqual(DIAMOND);
    }
  });
});

/**
 * SUPABASE-TABLE-TYPING-1D — a checkpoint whose persisted snapshot did not
 * validate carries the safe EMPTY definition plus `definitionInvalid`.
 * Restoring it would overwrite a live workflow with an empty canvas, i.e.
 * cause exactly the data loss the restore feature exists to undo.
 */
describe("restoreCheckpoint — a corrupt snapshot is refused, not restored", () => {
  it("refuses before the compare-and-swap and writes nothing", async () => {
    mockGetByIdForWorkflow.mockResolvedValue({
      id: "cp-bad", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "react_agent", name: "Damaged", prompt: null, summary: null,
      definition: { nodes: [], edges: [] }, definitionInvalid: true,
      createdAt: "2026-07-15T01:00:00Z",
    });

    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ draftDefinition: CURRENT_DRAFT }),
      checkpointId: "cp-bad",
      expectedRevision: "2026-07-15T00:00:00Z",
    });

    expect(result).toEqual({ ok: false, reason: "checkpoint_definition_invalid" });
    // The live workflow was never touched.
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  it("still restores a checkpoint that is genuinely EMPTY but valid", async () => {
    // The distinction the old `?? { nodes: [], edges: [] }` cast destroyed:
    // an empty checkpoint is a legitimate restore target.
    mockGetByIdForWorkflow.mockResolvedValue({
      id: "cp-empty", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "manual", name: "Blank canvas", prompt: null, summary: null,
      definition: { nodes: [], edges: [] }, definitionInvalid: false,
      createdAt: "2026-07-15T01:00:00Z",
    });
    mockGuardedUpdate.mockImplementation(
      async (input: { draftDefinition: WorkflowDefinition }) =>
        baseWorkflow({ draftDefinition: input.draftDefinition, updatedAt: "2026-07-15T03:00:00Z" }),
    );

    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ draftDefinition: CURRENT_DRAFT }),
      checkpointId: "cp-empty",
      expectedRevision: "2026-07-15T00:00:00Z",
    });

    expect(result.ok).toBe(true);
    expect(mockGuardedUpdate).toHaveBeenCalled();
  });

  it("checks the revision conflict FIRST — a stale session is still a conflict", async () => {
    mockGetByIdForWorkflow.mockResolvedValue({
      id: "cp-bad", workflowId: "wf-1", accountId: "acct-1", createdByUserId: "user-1",
      source: "react_agent", name: "Damaged", prompt: null, summary: null,
      definition: { nodes: [], edges: [] }, definitionInvalid: true,
      createdAt: "2026-07-15T01:00:00Z",
    });

    const result = await restoreCheckpoint({
      workflow: baseWorkflow({ updatedAt: "2026-07-15T09:99:00Z" }),
      checkpointId: "cp-bad",
      expectedRevision: "2026-07-15T00:00:00Z",
    });

    expect(result).toMatchObject({ ok: false, reason: "revision_conflict" });
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });
});
