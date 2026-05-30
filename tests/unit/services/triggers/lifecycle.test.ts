/**
 * @jest-environment node
 *
 * Tests for services/triggers/lifecycle.ts.
 *
 * Mocks the trigger_resources repository so the test never touches the DB.
 * Verifies that:
 *   - registerWorkflowTriggers upserts one row per trigger node.
 *   - Manual-only workflows (zero trigger nodes) are a no-op.
 *   - unregisterWorkflowTriggers deletes by workflow id.
 *   - The accountId is intentionally null on register (resolved later).
 */

const mockUpsert = jest.fn();
const mockDeleteByWorkflow = jest.fn();
const mockListByWorkflow = jest.fn();
jest.mock("@/repositories/triggerResources", () => ({
  upsert: (...args: unknown[]) => mockUpsert(...args),
  deleteByWorkflow: (...args: unknown[]) => mockDeleteByWorkflow(...args),
  listByWorkflow: (...args: unknown[]) => mockListByWorkflow(...args),
}));

const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import type { WorkflowRecord } from "@/repositories/workflows";
import {
  __resetActivationRegistryForTests,
  registerActivation,
  registerNativeActivation,
} from "@/services/triggers/activationRegistry";
import {
  __resetDeactivationRegistryForTests,
  registerDeactivation,
} from "@/services/triggers/deactivationRegistry";

function makeWorkflow(
  nodes: WorkflowRecord["draftDefinition"]["nodes"],
): WorkflowRecord {
  return {
    id: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    name: "Test",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes, edges: [] },
    deletedAt: null,
    createdAt: "2026-05-07T00:00:00Z",
    updatedAt: "2026-05-07T00:00:00Z",
  };
}

beforeEach(() => {
  mockUpsert.mockReset();
  mockDeleteByWorkflow.mockReset();
  mockListByWorkflow.mockReset();
  mockListByWorkflow.mockResolvedValue([]); // unregister loop is no-op by default
  mockGetActiveForExecution.mockReset();
  __resetActivationRegistryForTests();
  __resetDeactivationRegistryForTests();
});

describe("registerWorkflowTriggers", () => {
  it("upserts one row per trigger node, mirroring the node's provider/type/config", async () => {
    mockUpsert.mockResolvedValue({ id: "tr-1" });
    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n1",
          kind: "trigger",
          provider: "slack",
          type: "message_received",
          config: { channelId: "C123" },
          position: { x: 0, y: 0 },
        },
      ]),
    );
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith({
      workflowId: "wf-1",
      userId: "user-1",
      provider: "slack",
      eventType: "message_received",
      nodeId: "n1",
      config: { channelId: "C123" },
    });
  });

  it("ignores action nodes — only trigger nodes register", async () => {
    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n1",
          kind: "trigger",
          provider: "slack",
          type: "message_received",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 0, y: 100 },
        },
      ]),
    );
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0]![0]).toMatchObject({ nodeId: "n1" });
  });

  it("manual-only workflow (zero trigger nodes) is a no-op", async () => {
    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n1",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 0, y: 0 },
        },
      ]),
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  // ── Native (non-OAuth) activation path — Native Slice 2 Commit 3 ─────
  // Native triggers register via registerNativeActivation; lifecycle
  // calls them WITHOUT looking up an `integrations` row. See plan §6.2.

  it("invokes a NativeActivationFn with { node, workflowId } and merges its patch into config", async () => {
    const nativeActivation: jest.Mock = jest.fn(async () => ({
      nextFireAt: "2026-05-18T09:00:00Z",
      schedulerState: "armed",
    }));
    registerNativeActivation("native", "schedule.fired", nativeActivation);

    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n-sched",
          kind: "trigger",
          provider: "native",
          type: "schedule.fired",
          config: { cronExpression: "0 9 * * 1-5" },
          position: { x: 0, y: 0 },
        },
      ]),
    );

    expect(nativeActivation).toHaveBeenCalledTimes(1);
    const ctx = nativeActivation.mock.calls[0]![0] as Record<string, unknown>;
    expect(ctx.workflowId).toBe("wf-1");
    // No integration field on the native context.
    expect(ctx).not.toHaveProperty("integration");

    // Lifecycle did NOT call getActiveForExecution — native skips it.
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0]![0]).toMatchObject({
      provider: "native",
      eventType: "schedule.fired",
      nodeId: "n-sched",
      config: {
        cronExpression: "0 9 * * 1-5",
        nextFireAt: "2026-05-18T09:00:00Z",
        schedulerState: "armed",
      },
    });
  });

  it("manual_trigger workflow (no native + no provider activation registered) upserts the empty config straight through", async () => {
    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n-manual",
          kind: "trigger",
          provider: "native",
          type: "manual.run",
          config: {},
          position: { x: 0, y: 0 },
        },
      ]),
    );
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0]![0]).toMatchObject({
      provider: "native",
      eventType: "manual.run",
      config: {},
    });
  });

  it("native activation takes precedence over a provider activation registered for the same (provider, eventType)", async () => {
    const providerActivation = jest.fn(async () => ({ via: "provider" }));
    const nativeActivation = jest.fn(async () => ({ via: "native" }));
    registerActivation("native", "schedule.fired", providerActivation);
    registerNativeActivation("native", "schedule.fired", nativeActivation);

    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n-sched",
          kind: "trigger",
          provider: "native",
          type: "schedule.fired",
          config: {},
          position: { x: 0, y: 0 },
        },
      ]),
    );

    expect(nativeActivation).toHaveBeenCalledTimes(1);
    expect(providerActivation).not.toHaveBeenCalled();
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockUpsert.mock.calls[0]![0]).toMatchObject({
      config: { via: "native" },
    });
  });

  it("propagates upsert errors so the orchestrator wraps with TRIGGER_REGISTRATION_FAILED", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("permission denied"));
    await expect(
      registerWorkflowTriggers(
        makeWorkflow([
          {
            id: "n1",
            kind: "trigger",
            provider: "slack",
            type: "message_received",
            config: {},
            position: { x: 0, y: 0 },
          },
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("unregisterWorkflowTriggers", () => {
  it("deletes all trigger_resources rows for the workflow", async () => {
    await unregisterWorkflowTriggers(makeWorkflow([]));
    expect(mockDeleteByWorkflow).toHaveBeenCalledWith("wf-1");
  });

  it("calls a registered deactivation hook BEFORE deleting rows", async () => {
    const callOrder: string[] = [];
    const deactivation = jest.fn(async () => {
      callOrder.push("deactivation");
    });
    mockDeleteByWorkflow.mockImplementation(async () => {
      callOrder.push("delete");
    });

    registerDeactivation("google-calendar", "event_changed", deactivation);
    mockListByWorkflow.mockResolvedValueOnce([
      {
        id: "tr-1",
        workflowId: "wf-1",
        workflowAccountId: "acct-1",
        userId: "user-1",
        provider: "google-calendar",
        eventType: "event_changed",
        nodeId: "n1",
        config: { channelId: "abc", resourceId: "xyz" },
        providerAccountId: null,
        registeredAt: "",
        expiresAt: null,
        lastRenewedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce({ id: "int-1" });

    await unregisterWorkflowTriggers(makeWorkflow([]));

    expect(deactivation).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["deactivation", "delete"]);
  });

  it("swallows deactivation errors and still deletes the row", async () => {
    const deactivation = jest.fn(async () => {
      throw new Error("Google channels.stop 503");
    });
    registerDeactivation("google-calendar", "event_changed", deactivation);
    mockListByWorkflow.mockResolvedValueOnce([
      {
        id: "tr-1",
        workflowId: "wf-1",
        workflowAccountId: "acct-1",
        userId: "user-1",
        provider: "google-calendar",
        eventType: "event_changed",
        nodeId: "n1",
        config: { channelId: "abc", resourceId: "xyz" },
        providerAccountId: null,
        registeredAt: "",
        expiresAt: null,
        lastRenewedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce({ id: "int-1" });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await unregisterWorkflowTriggers(makeWorkflow([]));

    expect(deactivation).toHaveBeenCalledTimes(1);
    expect(mockDeleteByWorkflow).toHaveBeenCalledWith("wf-1");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("skips deactivation when no integration found, still deletes row", async () => {
    const deactivation = jest.fn();
    registerDeactivation("google-calendar", "event_changed", deactivation);
    mockListByWorkflow.mockResolvedValueOnce([
      {
        id: "tr-1",
        workflowId: "wf-1",
        workflowAccountId: "acct-1",
        userId: "user-1",
        provider: "google-calendar",
        eventType: "event_changed",
        nodeId: "n1",
        config: {},
        providerAccountId: null,
        registeredAt: "",
        expiresAt: null,
        lastRenewedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await unregisterWorkflowTriggers(makeWorkflow([]));

    expect(deactivation).not.toHaveBeenCalled();
    expect(mockDeleteByWorkflow).toHaveBeenCalledWith("wf-1");
  });

  it("rows without a registered deactivation are skipped without lookup", async () => {
    mockListByWorkflow.mockResolvedValueOnce([
      {
        id: "tr-1",
        workflowId: "wf-1",
        workflowAccountId: "acct-1",
        userId: "user-1",
        provider: "slack",
        eventType: "message_received",
        nodeId: "n1",
        config: {},
        providerAccountId: null,
        registeredAt: "",
        expiresAt: null,
        lastRenewedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    await unregisterWorkflowTriggers(makeWorkflow([]));

    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockDeleteByWorkflow).toHaveBeenCalledWith("wf-1");
  });
});

describe("registerWorkflowTriggers — activation hook (Slice 2e)", () => {
  it("calls a registered activation and merges its config patch into the upsert", async () => {
    const activation = jest
      .fn()
      .mockResolvedValue({ snapshot: { historyId: "12345" }, pollingEnabled: true });
    registerActivation("gmail", "new_email", activation);
    mockGetActiveForExecution.mockResolvedValue({
      id: "int-1",
      userId: "user-1",
      provider: "gmail",
      providerAccountId: "alice@example.com",
    });
    mockUpsert.mockResolvedValue({ id: "tr-1" });

    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n1",
          kind: "trigger",
          provider: "gmail",
          type: "new_email",
          config: { labelIds: ["INBOX"] },
          position: { x: 0, y: 0 },
        },
      ]),
    );

    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "user-1",
      "gmail",
      null,
    );
    expect(activation).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gmail",
        eventType: "new_email",
        config: {
          labelIds: ["INBOX"],
          snapshot: { historyId: "12345" },
          pollingEnabled: true,
        },
      }),
    );
  });

  it("throws when the integration is missing — orchestrator wraps as TRIGGER_REGISTRATION_FAILED", async () => {
    registerActivation("gmail", "new_email", async () => ({}));
    mockGetActiveForExecution.mockResolvedValue(null);

    await expect(
      registerWorkflowTriggers(
        makeWorkflow([
          {
            id: "n1",
            kind: "trigger",
            provider: "gmail",
            type: "new_email",
            config: {},
            position: { x: 0, y: 0 },
          },
        ]),
      ),
    ).rejects.toThrow(/no active gmail integration/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("propagates activation throws and skips the upsert", async () => {
    registerActivation("gmail", "new_email", async () => {
      throw new Error("getProfile 503");
    });
    mockGetActiveForExecution.mockResolvedValue({ id: "int-1" });

    await expect(
      registerWorkflowTriggers(
        makeWorkflow([
          {
            id: "n1",
            kind: "trigger",
            provider: "gmail",
            type: "new_email",
            config: {},
            position: { x: 0, y: 0 },
          },
        ]),
      ),
    ).rejects.toThrow(/getProfile 503/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("triggers without a registered activation skip the integration lookup (Slack pattern)", async () => {
    mockUpsert.mockResolvedValue({ id: "tr-1" });
    await registerWorkflowTriggers(
      makeWorkflow([
        {
          id: "n1",
          kind: "trigger",
          provider: "slack",
          type: "message_received",
          config: { channelId: "C123" },
          position: { x: 0, y: 0 },
        },
      ]),
    );
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });
});
