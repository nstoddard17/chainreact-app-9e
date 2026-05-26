/**
 * @jest-environment node
 *
 * Tests for services/ai/events/recordAiRouteEvents.ts (Slice 4.AI-10).
 *
 * AI-10 reuses the COST-6 ledger + recorder. This emission layer maps plan/apply
 * RESULTS onto the existing recorder helpers. The recorder is mocked so we assert
 * the mapping (event types + safe args), fail-open behavior (a recorder throw
 * never propagates), and no-leak (raw patch config is never forwarded).
 */
const recordAiCostEvent = jest.fn();
const recordAiModelCallCompleted = jest.fn();
const recordAiModelCallFailed = jest.fn();
const recordAiPatchOutcome = jest.fn();
const recordAiSafetyBlock = jest.fn();

jest.mock("@/services/billing/aiCostEvents", () => ({
  recordAiCostEvent: (...a: unknown[]) => recordAiCostEvent(...a),
  recordAiModelCallCompleted: (...a: unknown[]) => recordAiModelCallCompleted(...a),
  recordAiModelCallFailed: (...a: unknown[]) => recordAiModelCallFailed(...a),
  recordAiPatchOutcome: (...a: unknown[]) => recordAiPatchOutcome(...a),
  recordAiSafetyBlock: (...a: unknown[]) => recordAiSafetyBlock(...a),
}));

import {
  recordAiApplyOutcome,
  recordAiPlanOutcome,
} from "@/services/ai/events/recordAiRouteEvents";
import { MODELS } from "@/core/ai/models";

function model(overrides: Record<string, unknown> = {}) {
  return {
    modelId: MODELS.strong.id,
    tier: "strong",
    feature: "creation",
    finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 20 },
    latencyMs: 123,
    ...overrides,
  };
}

function planSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    intentSummary: "x",
    assumptions: [],
    requiredUserInput: [],
    unsupportedRequests: [],
    safetyNotes: [],
    proposedPatch: {
      patchId: "p1",
      workflowId: "wf1",
      baseRevision: "r",
      operations: [{ op: "moveNode", nodeId: "n1", position: { x: 1, y: 2 } }],
      summary: "s",
      rationale: "r",
    },
    canApplyLater: true,
    model: model(),
    noMutation: true,
    ...overrides,
  };
}

const planFail = (code: string, errors: { stage: string; code: string }[], withModel = true) => ({
  ok: false,
  code,
  message: "x",
  ...(withModel ? { model: model() } : {}),
  errors,
  noMutation: true,
});

function allCallArgs(): string {
  const calls = [
    recordAiCostEvent,
    recordAiModelCallCompleted,
    recordAiModelCallFailed,
    recordAiPatchOutcome,
    recordAiSafetyBlock,
  ].flatMap((m) => m.mock.calls);
  return JSON.stringify(calls);
}

beforeEach(() => {
  for (const m of [
    recordAiCostEvent,
    recordAiModelCallCompleted,
    recordAiModelCallFailed,
    recordAiPatchOutcome,
    recordAiSafetyBlock,
  ]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
});

describe("recordAiPlanOutcome — mapping", () => {
  it("emits interaction_started + model_completed + proposed + previewed for an apply-ready plan", async () => {
    await recordAiPlanOutcome({ userId: "u1", workflowId: "wf1" }, planSuccess() as never);

    expect(recordAiCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ai_interaction_started", feature: "workflow_creation", patchId: "p1" }),
    );
    expect(recordAiModelCallCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_creation" }),
      expect.objectContaining({ modelName: MODELS.strong.id, modelProvider: "anthropic", inputTokens: 10, outputTokens: 20 }),
    );
    const outcomes = recordAiPatchOutcome.mock.calls.map((c) => c[1]);
    expect(outcomes).toEqual(["proposed", "previewed"]);
  });

  it("emits proposed + validation_failed(PREVIEW_REJECTED) for a not-apply-ready patch", async () => {
    await recordAiPlanOutcome({ userId: "u1", workflowId: "wf1" }, planSuccess({ canApplyLater: false }) as never);
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(expect.anything(), "proposed", expect.anything());
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "PREVIEW_REJECTED" }),
    );
  });

  it("emits no patch event for a no-patch (needs-input) plan", async () => {
    await recordAiPlanOutcome(
      { userId: "u1", workflowId: "wf1" },
      planSuccess({ proposedPatch: null, canApplyLater: false }) as never,
    );
    expect(recordAiModelCallCompleted).toHaveBeenCalledTimes(1);
    expect(recordAiPatchOutcome).not.toHaveBeenCalled();
  });

  it("maps MODEL_FAILED to a failed model call with stage=model", async () => {
    await recordAiPlanOutcome(
      { userId: "u1", workflowId: "wf1" },
      planFail("MODEL_FAILED", [{ stage: "model", code: "NOT_CONFIGURED" }]) as never,
    );
    expect(recordAiModelCallFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ stage: "model", code: "NOT_CONFIGURED" }) }),
    );
    expect(recordAiModelCallCompleted).not.toHaveBeenCalled();
    expect(recordAiPatchOutcome).not.toHaveBeenCalled();
  });

  it("maps PARSE_FAILED to a failed model call with stage=parse and NO completed event", async () => {
    await recordAiPlanOutcome(
      { userId: "u1", workflowId: "wf1" },
      planFail("PARSE_FAILED", [{ stage: "parse", code: "INVALID_PATCH" }]) as never,
    );
    expect(recordAiModelCallFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ stage: "parse", code: "INVALID_PATCH" }) }),
    );
    // Locks the two-line log fingerprint the diagnosis relies on: a parse
    // failure NEVER emits ai_model_call_completed (that would imply 502 via
    // PREVIEW_UNAVAILABLE, not PARSE_FAILED) and never a patch event.
    expect(recordAiModelCallCompleted).not.toHaveBeenCalled();
    expect(recordAiPatchOutcome).not.toHaveBeenCalled();
  });

  it("maps PREVIEW_UNAVAILABLE to model_completed + validation_failed", async () => {
    await recordAiPlanOutcome(
      { userId: "u1", workflowId: "wf1" },
      planFail("PREVIEW_UNAVAILABLE", [{ stage: "preview", code: "NOT_FOUND" }]) as never,
    );
    expect(recordAiModelCallCompleted).toHaveBeenCalledTimes(1);
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "PREVIEW_UNAVAILABLE" }),
    );
  });
});

describe("recordAiApplyOutcome — mapping", () => {
  it("maps a successful apply to ai_patch_applied", async () => {
    await recordAiApplyOutcome(
      { userId: "u1", workflowId: "wf1" },
      { ok: true, appliedPatchId: "p1", appliedOperationCount: 2, riskLevel: "low" } as never,
    );
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_editing", patchId: "p1" }),
      "applied",
      expect.objectContaining({ metadata: expect.objectContaining({ opCount: 2, riskLevel: "low" }) }),
    );
  });

  it("maps CONFIRMATION_REQUIRED to a safety block", async () => {
    await recordAiApplyOutcome(
      { userId: "u1", workflowId: "wf1", patchId: "p1" },
      { ok: false, code: "CONFIRMATION_REQUIRED", message: "x" } as never,
    );
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(expect.anything(), "confirmation_required");
  });

  it("maps other apply failures to validation_failed with the code", async () => {
    await recordAiApplyOutcome(
      { userId: "u1", workflowId: "wf1", patchId: "p1" },
      { ok: false, code: "STALE_PATCH", message: "x" } as never,
    );
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "STALE_PATCH" }),
    );
  });
});

describe("fail-open", () => {
  it("recordAiPlanOutcome resolves even when the recorder throws", async () => {
    recordAiCostEvent.mockRejectedValueOnce(new Error("ledger down"));
    await expect(
      recordAiPlanOutcome({ userId: "u1", workflowId: "wf1" }, planSuccess() as never),
    ).resolves.toBeUndefined();
  });

  it("recordAiApplyOutcome resolves even when the recorder throws", async () => {
    recordAiPatchOutcome.mockRejectedValueOnce(new Error("ledger down"));
    await expect(
      recordAiApplyOutcome(
        { userId: "u1", workflowId: "wf1" },
        { ok: true, appliedPatchId: "p1", appliedOperationCount: 1, riskLevel: "low" } as never,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("no-leak", () => {
  it("never forwards raw patch config values to the recorder", async () => {
    const withSecret = planSuccess({
      proposedPatch: {
        patchId: "p1",
        workflowId: "wf1",
        baseRevision: "r",
        operations: [
          {
            op: "addNode",
            node: { id: "n2", kind: "action", provider: "slack", type: "send", config: { accessToken: "ya29.LEAKED" } },
          },
        ],
        summary: "s",
        rationale: "r",
      },
    });
    await recordAiPlanOutcome({ userId: "u1", workflowId: "wf1" }, withSecret as never);
    expect(allCallArgs()).not.toContain("ya29.LEAKED");
    expect(allCallArgs()).not.toContain("accessToken");
  });
});
