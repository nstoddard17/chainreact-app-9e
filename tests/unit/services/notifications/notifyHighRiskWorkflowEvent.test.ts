/**
 * @jest-environment node
 *
 * Slice 3.POSTSEC-8 — tests for the high-risk workflow audit emitter.
 *
 * The emitter writes directly to the notifications repo with the
 * pure builder's output. These tests verify:
 *   - the correct repo call (type, severity, userId, metadata shape)
 *   - skip-on-empty-actions and skip-on-test-mode predicates
 *   - best-effort error handling (repo throw → outcome=failed,
 *     never re-thrown to caller)
 *   - no-leak on the wire path
 */

const mockCreate = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
}));

import {
  notifyHighRiskActivation,
  notifyHighRiskRun,
} from "@/services/notifications/notifyHighRiskWorkflowEvent";
import type { ConfirmationRequiredAction } from "@/services/workflows/riskConfirmation";

const SAMPLE_ACTION: ConfirmationRequiredAction = {
  nodeId: "refund-node",
  provider: "stripe",
  type: "create_refund",
  displayName: "Create Refund",
  riskDescription:
    "Reverses a Stripe charge — moves money back to the customer.",
};

const ACTIVATION_INPUT = {
  workflowId: "wf-1",
  workflowName: "Refund handler",
  actorUserId: "user-1",
  confirmationRequiredActions: [SAMPLE_ACTION],
};

const RUN_INPUT = {
  ...ACTIVATION_INPUT,
  runId: "run-42",
  isTest: false,
  triggeredBy: "manual",
};

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    id: "n-1",
    userId: "user-1",
    type: "workflow_high_risk_activated",
    severity: "warning",
    title: "x",
    body: "x",
    actionUrl: "/workflows/wf-1",
    metadata: {},
    readAt: null,
    createdAt: "2026-05-24T00:00:00Z",
  });
});

// ── notifyHighRiskActivation ───────────────────────────────────────────────
describe("notifyHighRiskActivation", () => {
  it("writes a notification of type 'workflow_high_risk_activated' for the actor", async () => {
    const result = await notifyHighRiskActivation(ACTIVATION_INPUT);
    expect(result.outcome).toBe("emitted");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.userId).toBe("user-1");
    expect(arg.type).toBe("workflow_high_risk_activated");
    expect(arg.severity).toBe("warning");
    expect(arg.actionUrl).toBe("/workflows/wf-1");
  });

  it("includes the structured metadata from the pure builder", async () => {
    await notifyHighRiskActivation(ACTIVATION_INPUT);
    const arg = mockCreate.mock.calls[0]![0] as {
      metadata: Record<string, unknown>;
    };
    expect(arg.metadata.eventType).toBe("workflow_high_risk_activated");
    expect(arg.metadata.workflowId).toBe("wf-1");
    expect(arg.metadata.workflowName).toBe("Refund handler");
    expect(arg.metadata.actorUserId).toBe("user-1");
    expect(arg.metadata.confirmationRequiredActions).toEqual([
      {
        nodeId: "refund-node",
        provider: "stripe",
        type: "create_refund",
        displayName: "Create Refund",
        riskDescription:
          "Reverses a Stripe charge — moves money back to the customer.",
      },
    ]);
    expect(typeof arg.metadata.emittedAt).toBe("string");
  });

  it("skips when the actions array is empty (defensive — route already filters)", async () => {
    const result = await notifyHighRiskActivation({
      ...ACTIVATION_INPUT,
      confirmationRequiredActions: [],
    });
    expect(result.outcome).toBe("skipped_no_actions");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("never throws — repo errors are swallowed and reported as outcome:failed", async () => {
    mockCreate.mockRejectedValueOnce(new Error("DB down"));
    const result = await notifyHighRiskActivation(ACTIVATION_INPUT);
    expect(result.outcome).toBe("failed");
    expect(result.reason).toMatch(/DB down/);
  });

  it("activation metadata does NOT carry runId / isTest / triggeredBy", async () => {
    await notifyHighRiskActivation(ACTIVATION_INPUT);
    const arg = mockCreate.mock.calls[0]![0] as {
      metadata: Record<string, unknown>;
    };
    expect(arg.metadata).not.toHaveProperty("runId");
    expect(arg.metadata).not.toHaveProperty("isTest");
    expect(arg.metadata).not.toHaveProperty("triggeredBy");
  });
});

// ── notifyHighRiskRun ──────────────────────────────────────────────────────
describe("notifyHighRiskRun", () => {
  it("writes a notification of type 'workflow_high_risk_run' for a real-mode run", async () => {
    const result = await notifyHighRiskRun(RUN_INPUT);
    expect(result.outcome).toBe("emitted");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.type).toBe("workflow_high_risk_run");
    expect(arg.userId).toBe("user-1");
  });

  it("includes runId + isTest:false + triggeredBy in the metadata", async () => {
    await notifyHighRiskRun(RUN_INPUT);
    const arg = mockCreate.mock.calls[0]![0] as {
      metadata: Record<string, unknown>;
    };
    expect(arg.metadata.runId).toBe("run-42");
    expect(arg.metadata.isTest).toBe(false);
    expect(arg.metadata.triggeredBy).toBe("manual");
  });

  it("SKIPS emission when isTest is true (test-mode runs must not pollute the audit feed)", async () => {
    const result = await notifyHighRiskRun({
      ...RUN_INPUT,
      isTest: true,
      triggeredBy: "test",
    });
    expect(result.outcome).toBe("skipped_test_mode");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("SKIPS emission when the actions array is empty", async () => {
    const result = await notifyHighRiskRun({
      ...RUN_INPUT,
      confirmationRequiredActions: [],
    });
    expect(result.outcome).toBe("skipped_no_actions");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("never throws — repo errors are swallowed and reported as outcome:failed", async () => {
    mockCreate.mockRejectedValueOnce(new Error("connection refused"));
    const result = await notifyHighRiskRun(RUN_INPUT);
    expect(result.outcome).toBe("failed");
    expect(result.reason).toMatch(/connection refused/);
  });
});

// ── no-leak on the wire path ───────────────────────────────────────────────
describe("notifyHighRiskWorkflowEvent — no leak through the repo call", () => {
  it("repo `create` arg does not contain workflow config, resolved values, or Stripe object IDs", async () => {
    // Pass a corrupted action object (extra non-safe keys). The
    // builder strips them before they reach the repo.
    const dangerousAction = {
      nodeId: "refund-node",
      provider: "stripe",
      type: "create_refund",
      displayName: "Create Refund",
      riskDescription: "Reverses a Stripe charge.",
      config: { chargeId: "ch_internal_leak" },
      resolvedAmount: 99999,
      stripeObjectId: "re_LEAK",
    } as unknown as ConfirmationRequiredAction;

    await notifyHighRiskActivation({
      ...ACTIVATION_INPUT,
      confirmationRequiredActions: [dangerousAction],
    });

    const arg = mockCreate.mock.calls[0]![0];
    const wireText = JSON.stringify(arg);
    expect(wireText).not.toContain("ch_internal_leak");
    expect(wireText).not.toContain("re_LEAK");
    expect(wireText).not.toContain("resolvedAmount");
    expect(wireText).not.toContain("99999");
    expect(wireText).not.toContain("\"config\"");
  });
});
