/**
 * @jest-environment node
 *
 * Tests for services/workflows/orchestratorFactory.ts.
 *
 * The factory wires the LifecycleOrchestrator with the real hooks. The
 * orchestrator already has its own deep test coverage in
 * tests/unit/services/workflows/lifecycleOrchestrator.test.ts; this file
 * only verifies the wiring — that the hooks the factory provides are the
 * exact functions from preconditions.ts and lifecycle.ts.
 */

const mockCheckPreconditions = jest.fn();
const mockRegister = jest.fn();
const mockUnregister = jest.fn();

jest.mock("@/services/triggers/preconditions", () => ({
  checkActivationPreconditions: (...args: unknown[]) =>
    mockCheckPreconditions(...args),
}));

jest.mock("@/services/triggers/lifecycle", () => ({
  registerWorkflowTriggers: (...args: unknown[]) => mockRegister(...args),
  unregisterWorkflowTriggers: (...args: unknown[]) => mockUnregister(...args),
}));

const mockGetById = jest.fn();
const mockApplyTransition = jest.fn();
// V2-READY-41B — the factory now wires snapshotRevision → snapshotActiveRevision,
// which calls createRevision + setActiveRevision on this repo. Mock them so the
// best-effort snapshot succeeds and the wiring can be asserted.
const mockCreateRevision = jest.fn();
const mockSetActiveRevision = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
  applyTransition: (...args: unknown[]) => mockApplyTransition(...args),
  createRevision: (...args: unknown[]) => mockCreateRevision(...args),
  setActiveRevision: (...args: unknown[]) => mockSetActiveRevision(...args),
}));

// 4.ACCOUNT-MODEL-10b — activate now calls the account freeze guard. Mock it as
// operational so these lifecycle wiring tests don't construct the real
// service-role client (which has no env in unit tests). Freeze behavior has its
// own coverage in tests/unit/services/accounts/accountFreeze.test.ts.
jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
}));

import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";

const baseWorkflow = {
  id: "wf-1",
  userId: "user-1",
  accountId: "acct-user-1",
  name: "Test",
  state: "draft" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

beforeEach(() => {
  mockCheckPreconditions.mockReset();
  mockRegister.mockReset();
  mockUnregister.mockReset();
  mockGetById.mockReset();
  mockApplyTransition.mockReset();
  mockCreateRevision.mockReset();
  mockCreateRevision.mockResolvedValue({
    id: "rev-1",
    workflowId: "wf-1",
    definition: { nodes: [], edges: [] },
    createdAt: "2026-06-15T00:00:00Z",
  });
  mockSetActiveRevision.mockReset();
  mockSetActiveRevision.mockResolvedValue({ ...baseWorkflow, activeRevisionId: "rev-1" });
});

describe("createLifecycleOrchestrator wiring", () => {
  it("activate runs checkPreconditions then registerTrigger then applyTransition", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    mockCheckPreconditions.mockResolvedValueOnce({ ok: true });
    mockRegister.mockResolvedValueOnce(undefined);
    mockApplyTransition.mockResolvedValueOnce({ ...baseWorkflow, state: "active" });

    const orch = createLifecycleOrchestrator();
    await orch.activate("wf-1");

    expect(mockCheckPreconditions).toHaveBeenCalledWith(baseWorkflow, "activate");
    // V2-READY-41C — register receives the published definition (the draft).
    expect(mockRegister).toHaveBeenCalledWith(baseWorkflow, baseWorkflow.draftDefinition);
    expect(mockApplyTransition).toHaveBeenCalled();
  });

  it("activate creates a revision from the published def and sets active_revision_id via the persist (V2-READY-41C wiring)", async () => {
    const next = { ...baseWorkflow, state: "active" as const, active_revision_id: "rev-1" };
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    mockCheckPreconditions.mockResolvedValueOnce({ ok: true });
    mockRegister.mockResolvedValueOnce(undefined);
    mockApplyTransition.mockResolvedValueOnce(next);

    const orch = createLifecycleOrchestrator();
    await orch.activate("wf-1");

    // Revision created from the SAME published definition register saw.
    expect(mockCreateRevision).toHaveBeenCalledWith({
      workflowId: "wf-1",
      definition: baseWorkflow.draftDefinition,
    });
    // 41C: pointer is set atomically in the transition, NOT via setActiveRevision.
    expect(mockSetActiveRevision).not.toHaveBeenCalled();
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toState: "active", activeRevisionId: "rev-1" }),
    );
  });

  it("activate aborts when preconditions return ok:false (orchestrator wraps with MISSING_PRECONDITIONS)", async () => {
    mockGetById.mockResolvedValueOnce(baseWorkflow);
    mockCheckPreconditions.mockResolvedValueOnce({
      ok: false,
      failures: [{ code: "INTEGRATION_NOT_CONNECTED", message: "Connect slack." }],
    });

    const orch = createLifecycleOrchestrator();
    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      code: "MISSING_PRECONDITIONS",
    });
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("disable calls unregisterTrigger after persistence (best-effort)", async () => {
    const active = { ...baseWorkflow, state: "active" as const };
    mockGetById.mockResolvedValueOnce(active);
    const next = {
      ...baseWorkflow,
      state: "disabled" as const,
      disabledReason: "manual_admin" as const,
    };
    mockApplyTransition.mockResolvedValueOnce(next);

    const orch = createLifecycleOrchestrator();
    await orch.disable({ workflowId: "wf-1", reason: "manual_admin" });

    expect(mockUnregister).toHaveBeenCalledWith(next);
  });

  it("pause does NOT touch trigger registration (rule: paused retains registration)", async () => {
    mockGetById.mockResolvedValueOnce({ ...baseWorkflow, state: "active" });
    mockApplyTransition.mockResolvedValueOnce({ ...baseWorkflow, state: "paused" });
    const orch = createLifecycleOrchestrator();
    await orch.pause("wf-1");
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockUnregister).not.toHaveBeenCalled();
  });
});
