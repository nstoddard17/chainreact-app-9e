/**
 * @jest-environment node
 *
 * AGENT-CHANGE-HISTORY-1 — agent change history service.
 *
 * Business rules under test:
 *   - A "new" status (preview_created / restored_checkpoint) INSERTS a row with
 *     the prompt + value-free counts, then prunes to the recent cap.
 *   - A "transition" status (applied / discarded / undone / failed) UPDATES the
 *     row sharing the agent_change_id in place — preserving the prompt + counts
 *     captured at preview_created — and never re-sends them.
 *   - A transition that finds NO prior row falls through to an INSERT (out-of-order
 *     delivery never silently drops the event).
 *   - apply_failed carries the user-safe humanized reason.
 *   - Counts are clamped non-negative; free text is clamped to the column caps.
 *   - The returned DTO is value-free: it never carries accountId or a definition.
 *
 * Mocks are limited to the repository boundary; the service's own clamping +
 * create-vs-transition decision run for real.
 */

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockListRecent = jest.fn();
const mockPrune = jest.fn();
jest.mock("@/repositories/agentChangeHistory", () => ({
  create: (...a: unknown[]) => mockCreate(...a),
  updateStatusByAgentChangeId: (...a: unknown[]) => mockUpdate(...a),
  listRecentByWorkflow: (...a: unknown[]) => mockListRecent(...a),
  pruneToRecent: (...a: unknown[]) => mockPrune(...a),
}));

import {
  listAgentChanges,
  recordAgentChange,
} from "@/services/workflows/agentChangeHistory";
import type { AgentChangeHistoryRecord } from "@/repositories/agentChangeHistory";
import type { RecordAgentChangeRequest } from "@/contracts/agentChangeHistory";

const CHANGE_ID = "11111111-1111-4111-8111-111111111111";

function recordFixture(
  overrides: Partial<AgentChangeHistoryRecord> = {},
): AgentChangeHistoryRecord {
  return {
    id: "row-1",
    agentChangeId: CHANGE_ID,
    workflowId: "wf-1",
    accountId: "acct-1",
    createdByUserId: "user-1",
    source: "react_agent",
    status: "preview_created",
    prompt: "change slack to gmail",
    title: "1 node added, 1 node removed",
    summary: "Removed Slack; Added Gmail.",
    changedNodeCount: 0,
    addedNodeCount: 1,
    removedNodeCount: 1,
    changedConfigCount: 2,
    setupIssueCount: 1,
    previewPatchRef: "patch-1",
    checkpointId: null,
    runId: null,
    failureReason: null,
    createdAt: "2026-07-16T01:00:00Z",
    updatedAt: "2026-07-16T01:00:00Z",
    ...overrides,
  };
}

function req(overrides: Partial<RecordAgentChangeRequest>): RecordAgentChangeRequest {
  return { agentChangeId: CHANGE_ID, status: "preview_created", ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrune.mockResolvedValue(undefined);
});

describe("recordAgentChange — preview_created (new)", () => {
  it("inserts a row with the prompt + value-free counts, then prunes to the cap", async () => {
    mockCreate.mockResolvedValue(recordFixture());
    const dto = await recordAgentChange({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      request: req({
        status: "preview_created",
        prompt: "change slack to gmail",
        title: "1 node added, 1 node removed",
        summary: "Removed Slack; Added Gmail.",
        addedNodeCount: 1,
        removedNodeCount: 1,
        changedConfigCount: 2,
        setupIssueCount: 1,
        previewPatchRef: "patch-1",
      }),
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentChangeId: CHANGE_ID,
        workflowId: "wf-1",
        accountId: "acct-1",
        createdByUserId: "user-1",
        status: "preview_created",
        prompt: "change slack to gmail",
        addedNodeCount: 1,
        removedNodeCount: 1,
        changedConfigCount: 2,
        setupIssueCount: 1,
        previewPatchRef: "patch-1",
      }),
    );
    expect(mockPrune).toHaveBeenCalledWith("wf-1", 20);
    // DTO is value-free: no accountId, no definition.
    expect(dto.prompt).toBe("change slack to gmail");
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("accountId");
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("definition");
  });

  it("clamps negative counts to zero", async () => {
    mockCreate.mockResolvedValue(recordFixture());
    await recordAgentChange({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      request: req({ addedNodeCount: -5, setupIssueCount: -1 }),
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ addedNodeCount: 0, setupIssueCount: 0 }),
    );
  });
});

describe("recordAgentChange — transitions", () => {
  it("preview_applied updates the existing row in place and attaches the checkpoint link, NOT the prompt/counts", async () => {
    mockUpdate.mockResolvedValue(
      recordFixture({ status: "preview_applied", checkpointId: "cp-9" }),
    );
    const dto = await recordAgentChange({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      request: req({ status: "preview_applied", checkpointId: "22222222-2222-4222-8222-222222222222" }),
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentChangeId: CHANGE_ID,
        workflowId: "wf-1",
        status: "preview_applied",
        checkpointId: "22222222-2222-4222-8222-222222222222",
      }),
    );
    // It does NOT re-send the prompt/counts (those stay from preview_created).
    expect(mockUpdate.mock.calls[0]?.[0]).not.toHaveProperty("prompt");
    expect(dto.status).toBe("preview_applied");
    expect(dto.checkpointId).toBe("cp-9");
  });

  it("apply_failed carries the user-safe humanized reason", async () => {
    mockUpdate.mockResolvedValue(
      recordFixture({ status: "apply_failed", failureReason: "ChainReact could not safely apply this preview." }),
    );
    await recordAgentChange({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      request: req({ status: "apply_failed", failureReason: "ChainReact could not safely apply this preview." }),
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "apply_failed",
        failureReason: "ChainReact could not safely apply this preview.",
      }),
    );
  });

  it("falls through to an INSERT when no prior row exists (out-of-order delivery)", async () => {
    mockUpdate.mockResolvedValue(null); // no row matched the agent_change_id
    mockCreate.mockResolvedValue(recordFixture({ status: "undone" }));
    const dto = await recordAgentChange({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      request: req({ status: "undone" }),
    });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ agentChangeId: CHANGE_ID, status: "undone" }),
    );
    expect(dto.status).toBe("undone");
  });
});

describe("recordAgentChange — restored_checkpoint (new)", () => {
  it("inserts a restored_checkpoint row linked to the checkpoint", async () => {
    mockCreate.mockResolvedValue(
      recordFixture({ status: "restored_checkpoint", checkpointId: "cp-1", prompt: null, title: null, summary: null }),
    );
    await recordAgentChange({
      workflowId: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      request: req({ status: "restored_checkpoint", checkpointId: "33333333-3333-4333-8333-333333333333" }),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "restored_checkpoint",
        checkpointId: "33333333-3333-4333-8333-333333333333",
      }),
    );
  });
});

describe("listAgentChanges", () => {
  it("projects repo rows to value-free DTOs (no accountId leak)", async () => {
    mockListRecent.mockResolvedValue([
      recordFixture({ id: "row-2", status: "preview_applied", createdAt: "2026-07-16T02:00:00Z" }),
      recordFixture({ id: "row-1" }),
    ]);
    const list = await listAgentChanges("wf-1");
    expect(list.map((i) => i.id)).toEqual(["row-2", "row-1"]);
    expect(list[0] as unknown as Record<string, unknown>).not.toHaveProperty("accountId");
    expect(mockListRecent).toHaveBeenCalledWith("wf-1", { limit: 20 });
  });
});
