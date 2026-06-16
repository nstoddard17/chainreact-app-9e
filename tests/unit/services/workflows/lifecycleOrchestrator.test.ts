/**
 * @jest-environment node
 *
 * Unit tests for services/workflows/lifecycleOrchestrator.ts.
 *
 * Mocks the workflows repository so we can drive the orchestrator's logic in
 * isolation:
 *   - state-machine validation
 *   - precondition gate
 *   - trigger registration ordering (before-persist for activate, after-persist
 *     for disable / delete) per rule §"V2 intended behavior"
 *   - rollback on persist failure during activate
 *   - best-effort semantics on unregisterTrigger and notify
 *   - LIFECYCLE_CONFLICT mapping when applyTransition returns null
 */
import {
  LifecycleOrchestrator,
  type LifecycleSideEffects,
} from "@/services/workflows/lifecycleOrchestrator";
import { LifecycleError } from "@/core/workflows/lifecycle";
import type { WorkflowRecord } from "@/repositories/workflows";

const mockGetById = jest.fn();
const mockApplyTransition = jest.fn();

jest.mock("@/repositories/workflows", () => ({
  getById: (...args: unknown[]) => mockGetById(...args),
  applyTransition: (...args: unknown[]) => mockApplyTransition(...args),
}));

// 4.ACCOUNT-MODEL-10b — activate calls the account freeze guard. Mock it as
// operational so these orchestrator unit tests don't construct the real
// service-role client. Freeze behavior is covered in accountFreeze.test.ts.
jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
}));

function makeWorkflow(
  state: WorkflowRecord["state"],
  overrides: Partial<WorkflowRecord> = {},
): WorkflowRecord {
  return {
    id: "wf-1",
    createdByUserId: "user-1",
    accountId: "acct-user-1",
    name: "Test workflow",
    state,
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes: [], edges: [] },
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-05-06T00:00:00Z",
    updatedAt: "2026-05-06T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetById.mockReset();
  mockApplyTransition.mockReset();
});

describe("LifecycleOrchestrator.activate", () => {
  it("registers the trigger BEFORE persisting state and notifies after (rule §V2 intended behavior)", async () => {
    const wf = makeWorkflow("draft");
    const next = makeWorkflow("active");
    const order: string[] = [];
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockImplementationOnce(async () => {
      order.push("apply");
      return next;
    });
    const hooks: LifecycleSideEffects = {
      registerTrigger: jest.fn(async () => {
        order.push("register");
      }),
      notify: jest.fn(async () => {
        order.push("notify");
      }),
    };

    const orch = new LifecycleOrchestrator(hooks);
    const result = await orch.activate("wf-1");

    expect(order).toEqual(["register", "apply", "notify"]);
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1",
        expectedFromState: "draft",
        toState: "active",
        disabledReason: null,
        disabledContext: null,
      }),
    );
    expect(result).toBe(next);
  });

  it("throws MISSING_PRECONDITIONS when checkPreconditions returns ok:false; no register, no persist", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    const registerTrigger = jest.fn();
    const orch = new LifecycleOrchestrator({
      registerTrigger,
      checkPreconditions: async () => ({
        ok: false,
        failures: [{ code: "INTEGRATION_UNHEALTHY", message: "Slack disconnected" }],
      }),
    });

    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      name: "LifecycleError",
      code: "MISSING_PRECONDITIONS",
    });
    expect(registerTrigger).not.toHaveBeenCalled();
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("throws TRIGGER_REGISTRATION_FAILED when registerTrigger rejects; never persists", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {
        throw new Error("Slack API 500");
      },
    });

    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      name: "LifecycleError",
      code: "TRIGGER_REGISTRATION_FAILED",
    });
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("rolls back trigger registration when applyTransition throws (rule §Edge cases: activation rolls back)", async () => {
    const wf = makeWorkflow("draft");
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockRejectedValueOnce(new Error("db error"));
    const unregisterTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {},
      unregisterTrigger,
    });

    await expect(orch.activate("wf-1")).rejects.toThrow("db error");
    expect(unregisterTrigger).toHaveBeenCalledWith(wf);
  });

  it("maps applyTransition returning null (concurrent transition) to LIFECYCLE_CONFLICT and rolls back trigger", async () => {
    const wf = makeWorkflow("draft");
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockResolvedValueOnce(null);
    const unregisterTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {},
      unregisterTrigger,
    });

    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      name: "LifecycleError",
      code: "LIFECYCLE_CONFLICT",
    });
    expect(unregisterTrigger).toHaveBeenCalled();
  });

  it("rejects when current state is not 'draft' (rule §Allowed transitions: only draft -> active)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("paused"));
    const orch = new LifecycleOrchestrator();
    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });
});

describe("LifecycleOrchestrator — active revision wiring (V2-READY-41C)", () => {
  it("activate registers + snapshots from the published def, then persists with active_revision_id (order: register -> snapshot -> apply)", async () => {
    const wf = makeWorkflow("draft");
    const next = makeWorkflow("active", { activeRevisionId: "rev-1" });
    const order: string[] = [];
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockImplementationOnce(async () => {
      order.push("apply");
      return next;
    });
    const registerTrigger = jest.fn(async () => {
      order.push("register");
    });
    const snapshotRevision = jest.fn(async () => {
      order.push("snapshot");
      return "rev-1";
    });
    const orch = new LifecycleOrchestrator({ registerTrigger, snapshotRevision });

    await orch.activate("wf-1");

    expect(order).toEqual(["register", "snapshot", "apply"]);
    // Both register + snapshot get the SAME published definition (the draft).
    expect(registerTrigger).toHaveBeenCalledWith(wf, wf.draftDefinition);
    expect(snapshotRevision).toHaveBeenCalledWith(wf, wf.draftDefinition);
    // The pointer is set atomically in the state transition.
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toState: "active", activeRevisionId: "rev-1" }),
    );
  });

  it("does NOT create a revision when registration fails (no orphan on failed activation)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    const snapshotRevision = jest.fn();
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {
        throw new Error("Slack API 500");
      },
      snapshotRevision,
    });

    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      code: "TRIGGER_REGISTRATION_FAILED",
    });
    expect(snapshotRevision).not.toHaveBeenCalled();
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("swallows a snapshot failure — activation succeeds and persists WITHOUT a revision pointer (safe draft fallback)", async () => {
    const next = makeWorkflow("active");
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    mockApplyTransition.mockResolvedValueOnce(next);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {},
      snapshotRevision: async () => {
        throw new Error("revisions insert failed");
      },
    });

    const result = await orch.activate("wf-1");

    expect(result).toBe(next);
    // Persisted with no active_revision_id — getActiveDefinition falls back to draft.
    expect(mockApplyTransition.mock.calls[0]![0].activeRevisionId).toBeUndefined();
    const logged = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("workflow.active_revision.snapshot_failed");
    warnSpy.mockRestore();
  });

  it("rolls back registration when the persist conflicts (LIFECYCLE_CONFLICT)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    mockApplyTransition.mockResolvedValueOnce(null);
    const unregisterTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {},
      unregisterTrigger,
      snapshotRevision: async () => "rev-1",
    });

    await expect(orch.activate("wf-1")).rejects.toMatchObject({
      code: "LIFECYCLE_CONFLICT",
    });
    expect(unregisterTrigger).toHaveBeenCalled();
  });

  it("resume from eligible_to_resume snapshots and persists with active_revision_id", async () => {
    const wf = makeWorkflow("eligible_to_resume", {
      disabledReason: "integration_revoked",
    });
    const next = makeWorkflow("active", { activeRevisionId: "rev-9" });
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockResolvedValueOnce(next);
    const snapshotRevision = jest.fn(async () => "rev-9");
    const orch = new LifecycleOrchestrator({
      registerTrigger: async () => {},
      snapshotRevision,
    });

    await orch.resume("wf-1");

    expect(snapshotRevision).toHaveBeenCalledWith(wf, wf.draftDefinition);
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toState: "active", activeRevisionId: "rev-9" }),
    );
  });

  it("resume from paused does NOT snapshot and persists without active_revision_id", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("paused"));
    mockApplyTransition.mockResolvedValueOnce(makeWorkflow("active"));
    const snapshotRevision = jest.fn();
    const orch = new LifecycleOrchestrator({
      registerTrigger: jest.fn(),
      snapshotRevision,
    });

    await orch.resume("wf-1");

    expect(snapshotRevision).not.toHaveBeenCalled();
    expect(mockApplyTransition.mock.calls[0]![0].activeRevisionId).toBeUndefined();
  });
});

describe("LifecycleOrchestrator.pause", () => {
  it("transitions active -> paused without touching the trigger registration (rule §pause retains registration)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    mockApplyTransition.mockResolvedValueOnce(makeWorkflow("paused"));
    const registerTrigger = jest.fn();
    const unregisterTrigger = jest.fn();
    const orch = new LifecycleOrchestrator({ registerTrigger, unregisterTrigger });

    await orch.pause("wf-1");

    expect(registerTrigger).not.toHaveBeenCalled();
    expect(unregisterTrigger).not.toHaveBeenCalled();
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFromState: "active",
        toState: "paused",
      }),
    );
  });
});

describe("LifecycleOrchestrator.resume", () => {
  it("from paused: does NOT call registerTrigger (registration was retained)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("paused"));
    mockApplyTransition.mockResolvedValueOnce(makeWorkflow("active"));
    const registerTrigger = jest.fn();
    const orch = new LifecycleOrchestrator({ registerTrigger });

    await orch.resume("wf-1");

    expect(registerTrigger).not.toHaveBeenCalled();
  });

  it("from eligible_to_resume: re-registers trigger before persisting (rule §eligible_to_resume -> active re-registers)", async () => {
    const wf = makeWorkflow("eligible_to_resume", {
      disabledReason: "integration_revoked",
    });
    const order: string[] = [];
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockImplementationOnce(async () => {
      order.push("apply");
      return makeWorkflow("active");
    });
    const registerTrigger = jest.fn(async () => {
      order.push("register");
    });

    const orch = new LifecycleOrchestrator({ registerTrigger });
    await orch.resume("wf-1");

    expect(order).toEqual(["register", "apply"]);
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFromState: "eligible_to_resume",
        toState: "active",
        // Resume clears the disable context.
        disabledReason: null,
        disabledContext: null,
      }),
    );
  });

  it("preconditions block resume from eligible_to_resume; no registerTrigger called", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("eligible_to_resume"));
    const registerTrigger = jest.fn();
    const orch = new LifecycleOrchestrator({
      registerTrigger,
      checkPreconditions: async () => ({
        ok: false,
        failures: [{ code: "INTEGRATION_UNHEALTHY", message: "Slack still revoked" }],
      }),
    });

    await expect(orch.resume("wf-1")).rejects.toMatchObject({
      code: "MISSING_PRECONDITIONS",
    });
    expect(registerTrigger).not.toHaveBeenCalled();
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("rejects from disabled (rule §Disallowed: disabled -> active without eligible_to_resume)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("disabled"));
    const orch = new LifecycleOrchestrator();
    await expect(orch.resume("wf-1")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
});

describe("LifecycleOrchestrator.resume — paused drift (V2-READY-41F)", () => {
  it("paused + drift: unregister stale -> register from draft -> snapshot -> persist with new pointer", async () => {
    const wf = makeWorkflow("paused");
    const next = makeWorkflow("active", { activeRevisionId: "rev-new" });
    const order: string[] = [];
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockImplementationOnce(async () => {
      order.push("apply");
      return next;
    });
    const unregisterTrigger = jest.fn(async () => {
      order.push("unregister");
    });
    const registerTrigger = jest.fn(async () => {
      order.push("register");
    });
    const snapshotRevision = jest.fn(async () => {
      order.push("snapshot");
      return "rev-new";
    });
    const orch = new LifecycleOrchestrator({
      hasDraftDrift: async () => true,
      unregisterTrigger,
      registerTrigger,
      snapshotRevision,
    });

    await orch.resume("wf-1");

    expect(order).toEqual(["unregister", "register", "snapshot", "apply"]);
    expect(registerTrigger).toHaveBeenCalledWith(wf, wf.draftDefinition);
    expect(snapshotRevision).toHaveBeenCalledWith(wf, wf.draftDefinition);
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toState: "active", activeRevisionId: "rev-new" }),
    );
  });

  it("paused + NO drift: no unregister / register / snapshot, persists without a pointer", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("paused"));
    mockApplyTransition.mockResolvedValueOnce(makeWorkflow("active"));
    const unregisterTrigger = jest.fn();
    const registerTrigger = jest.fn();
    const snapshotRevision = jest.fn();
    const orch = new LifecycleOrchestrator({
      hasDraftDrift: async () => false,
      unregisterTrigger,
      registerTrigger,
      snapshotRevision,
    });

    await orch.resume("wf-1");

    expect(unregisterTrigger).not.toHaveBeenCalled();
    expect(registerTrigger).not.toHaveBeenCalled();
    expect(snapshotRevision).not.toHaveBeenCalled();
    expect(mockApplyTransition.mock.calls[0]![0].activeRevisionId).toBeUndefined();
  });

  it("paused + drift + registration fails: stays paused (no persist); stale resources cleared first", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("paused"));
    const unregisterTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({
      hasDraftDrift: async () => true,
      unregisterTrigger,
      registerTrigger: async () => {
        throw new Error("Slack API 500");
      },
      snapshotRevision: jest.fn(),
    });

    await expect(orch.resume("wf-1")).rejects.toMatchObject({
      code: "TRIGGER_REGISTRATION_FAILED",
    });
    expect(unregisterTrigger).toHaveBeenCalledTimes(1); // stale cleared, nothing new left
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("paused + drift + persist conflict: rolls back the new registration (LIFECYCLE_CONFLICT)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("paused"));
    mockApplyTransition.mockResolvedValueOnce(null);
    const unregisterTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({
      hasDraftDrift: async () => true,
      unregisterTrigger,
      registerTrigger: async () => {},
      snapshotRevision: async () => "rev-new",
    });

    await expect(orch.resume("wf-1")).rejects.toMatchObject({
      code: "LIFECYCLE_CONFLICT",
    });
    // once to clear stale, once to roll back the new register on persist failure.
    expect(unregisterTrigger).toHaveBeenCalledTimes(2);
  });

  it("eligible_to_resume does NOT consult drift and does NOT unregister (resources cleared at disable)", async () => {
    const wf = makeWorkflow("eligible_to_resume", {
      disabledReason: "integration_revoked",
    });
    mockGetById.mockResolvedValueOnce(wf);
    mockApplyTransition.mockResolvedValueOnce(
      makeWorkflow("active", { activeRevisionId: "rev-9" }),
    );
    const hasDraftDrift = jest.fn(async () => true);
    const unregisterTrigger = jest.fn();
    const snapshotRevision = jest.fn(async () => "rev-9");
    const orch = new LifecycleOrchestrator({
      hasDraftDrift,
      unregisterTrigger,
      registerTrigger: async () => {},
      snapshotRevision,
    });

    await orch.resume("wf-1");

    expect(hasDraftDrift).not.toHaveBeenCalled(); // drift check is paused-only
    expect(unregisterTrigger).not.toHaveBeenCalled();
    expect(snapshotRevision).toHaveBeenCalledWith(wf, wf.draftDefinition);
  });
});

describe("LifecycleOrchestrator.disable", () => {
  it("persists FIRST then unregisters trigger best-effort (rule §V2 intended behavior)", async () => {
    const next = makeWorkflow("disabled", {
      disabledReason: "integration_revoked",
    });
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    const order: string[] = [];
    mockApplyTransition.mockImplementationOnce(async () => {
      order.push("apply");
      return next;
    });
    const unregisterTrigger = jest.fn(async () => {
      order.push("unregister");
    });

    const orch = new LifecycleOrchestrator({ unregisterTrigger });
    await orch.disable({ workflowId: "wf-1", reason: "integration_revoked" });

    expect(order).toEqual(["apply", "unregister"]);
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFromState: "active",
        toState: "disabled",
        disabledReason: "integration_revoked",
        disabledContext: null,
      }),
    );
    expect(unregisterTrigger).toHaveBeenCalledWith(next);
  });

  it("swallows unregisterTrigger errors (best-effort — webhook dispatcher guards)", async () => {
    const next = makeWorkflow("disabled", { disabledReason: "billing_exhausted" });
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    mockApplyTransition.mockResolvedValueOnce(next);
    const orch = new LifecycleOrchestrator({
      unregisterTrigger: async () => {
        throw new Error("Slack API 503");
      },
    });

    await expect(
      orch.disable({ workflowId: "wf-1", reason: "billing_exhausted" }),
    ).resolves.toBe(next);
  });

  it("rejects disable from draft (rule §Disallowed: draft -> disabled)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    const orch = new LifecycleOrchestrator();
    await expect(
      orch.disable({ workflowId: "wf-1", reason: "manual_admin" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("forwards optional context to the persisted row", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    mockApplyTransition.mockResolvedValueOnce(
      makeWorkflow("disabled", {
        disabledReason: "manual_admin",
        disabledContext: "Quarterly audit",
      }),
    );
    const orch = new LifecycleOrchestrator();
    await orch.disable({
      workflowId: "wf-1",
      reason: "manual_admin",
      context: "Quarterly audit",
    });

    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        disabledContext: "Quarterly audit",
      }),
    );
  });
});

describe("LifecycleOrchestrator.markEligibleToResume", () => {
  it("transitions disabled -> eligible_to_resume; preserves disabled_reason for UI history", async () => {
    mockGetById.mockResolvedValueOnce(
      makeWorkflow("disabled", { disabledReason: "integration_revoked" }),
    );
    mockApplyTransition.mockResolvedValueOnce(
      makeWorkflow("eligible_to_resume", { disabledReason: "integration_revoked" }),
    );

    const orch = new LifecycleOrchestrator();
    await orch.markEligibleToResume("wf-1");

    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFromState: "disabled",
        toState: "eligible_to_resume",
      }),
    );
    // The orchestrator did not pass disabledReason — repo leaves the column untouched.
    const callArg = mockApplyTransition.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("disabledReason");
  });

  it("rejects from active (rule §Allowed transitions: only disabled can mark eligible)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    const orch = new LifecycleOrchestrator();
    await expect(orch.markEligibleToResume("wf-1")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
});

describe("LifecycleOrchestrator.delete", () => {
  it("soft-deletes from active; persists with setDeletedAt then best-effort unregister", async () => {
    const next = makeWorkflow("deleted", { deletedAt: "2026-05-06T01:00:00Z" });
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    mockApplyTransition.mockResolvedValueOnce(next);
    const unregisterTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({ unregisterTrigger });

    await orch.delete("wf-1");

    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFromState: "active",
        toState: "deleted",
        setDeletedAt: true,
      }),
    );
    expect(unregisterTrigger).toHaveBeenCalledWith(next);
  });

  it("delete is allowed from draft (no trigger registration to remove)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    mockApplyTransition.mockResolvedValueOnce(
      makeWorkflow("deleted", { deletedAt: "2026-05-06T01:00:00Z" }),
    );
    const orch = new LifecycleOrchestrator();
    const result = await orch.delete("wf-1");
    expect(result.state).toBe("deleted");
  });

  it("rejects delete on already-deleted workflow (rule §Allowed transitions: deleted is terminal)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("deleted"));
    const orch = new LifecycleOrchestrator();
    await expect(orch.delete("wf-1")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("WF-3: delete with trash metadata stamps the trash columns (not legacy setDeletedAt)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    mockApplyTransition.mockResolvedValueOnce(
      makeWorkflow("deleted", { deletedAt: "2026-06-03T00:00:00Z" }),
    );
    const orch = new LifecycleOrchestrator();
    await orch.delete("wf-1", {
      deletedAt: "2026-06-03T00:00:00Z",
      deletedByUserId: "user-1",
      purgeAfter: "2026-06-10T00:00:00Z",
      deletedFromFolderId: "folder-1",
      deleteOperationId: "op-1",
    });
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        toState: "deleted",
        deletedAt: "2026-06-03T00:00:00Z",
        deletedByUserId: "user-1",
        purgeAfter: "2026-06-10T00:00:00Z",
        deletedFromFolderId: "folder-1",
        deleteOperationId: "op-1",
      }),
    );
    expect(mockApplyTransition.mock.calls[0]![0]).not.toHaveProperty("setDeletedAt");
  });
});

describe("LifecycleOrchestrator.restore (WF-3)", () => {
  it("restores deleted → draft, clears trash columns, relocates folder, and does NOT register triggers", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("deleted", { deletedAt: "2026-06-03T00:00:00Z" }));
    mockApplyTransition.mockResolvedValueOnce(makeWorkflow("draft"));
    const registerTrigger = jest.fn(async () => {});
    const orch = new LifecycleOrchestrator({ registerTrigger });

    const result = await orch.restore("wf-1", { folderId: "folder-1" });

    expect(result.state).toBe("draft");
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFromState: "deleted",
        toState: "draft",
        deletedAt: null,
        deletedByUserId: null,
        purgeAfter: null,
        deletedFromFolderId: null,
        deleteOperationId: null,
        folderId: "folder-1",
      }),
    );
    // Restored workflow is inactive — never re-register triggers (locked decision).
    expect(registerTrigger).not.toHaveBeenCalled();
  });

  it("rejects restore on a non-deleted workflow (INVALID_TRANSITION)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    const orch = new LifecycleOrchestrator();
    await expect(orch.restore("wf-1", { folderId: null })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
});

describe("LifecycleOrchestrator (cross-cutting)", () => {
  it("throws WORKFLOW_NOT_FOUND when getById returns null", async () => {
    mockGetById.mockResolvedValueOnce(null);
    const orch = new LifecycleOrchestrator();
    await expect(orch.pause("nope")).rejects.toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
    });
  });

  it("swallows notify errors so transitions never fail on observability concerns", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    const next = makeWorkflow("paused");
    mockApplyTransition.mockResolvedValueOnce(next);

    const orch = new LifecycleOrchestrator({
      notify: async () => {
        throw new Error("Email service down");
      },
    });

    await expect(orch.pause("wf-1")).resolves.toBe(next);
  });

  it("LIFECYCLE_CONFLICT on pause (no rollback work since no trigger side-effect)", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("active"));
    mockApplyTransition.mockResolvedValueOnce(null);
    const orch = new LifecycleOrchestrator();
    await expect(orch.pause("wf-1")).rejects.toMatchObject({
      code: "LIFECYCLE_CONFLICT",
    });
  });

  it("LifecycleError instances expose code + details for callers / API mapping", async () => {
    mockGetById.mockResolvedValueOnce(makeWorkflow("draft"));
    const orch = new LifecycleOrchestrator();
    try {
      await orch.disable({ workflowId: "wf-1", reason: "manual_admin" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LifecycleError);
      expect((e as LifecycleError).code).toBe("INVALID_TRANSITION");
      expect((e as LifecycleError).details).toMatchObject({
        from: "draft",
        transition: "disable",
      });
    }
  });
});
