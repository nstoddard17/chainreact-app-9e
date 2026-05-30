/**
 * @jest-environment node
 *
 * Tests for services/analytics/aiAnalyticsReport.ts (Slice 4.AI-12).
 *
 * `buildAiAnalyticsReport` composes the COST-7 pure folds; `getAiAnalyticsForUser`
 * loads the caller's events (RLS-gated repo, mocked) and folds them. These pin
 * the combined shape, empty-data zeros, the user-scoped load wiring, and the
 * no-leak guarantee (metadata VALUES never surface in the report).
 */
const mockListByUser = jest.fn();
jest.mock("@/repositories/aiCostEvents", () => ({
  listByUser: (...a: unknown[]) => mockListByUser(...a),
}));

import {
  buildAiAnalyticsReport,
  getAiAnalyticsForUser,
} from "@/services/analytics/aiAnalyticsReport";
import type { AiCostEventRecord } from "@/repositories/aiCostEvents";

function ev(partial: Partial<AiCostEventRecord>): AiCostEventRecord {
  return {
    id: "e1",
    userId: "user-1",
    workflowId: null,
    workflowRunId: null,
    patchId: null,
    conversationId: null,
    feature: "workflow_creation",
    eventType: "ai_interaction_started",
    modelName: null,
    modelProvider: null,
    promptVersion: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCostMicros: null,
    aiCreditsCharged: null,
    latencyMs: null,
    toolName: null,
    toolStatus: null,
    validationErrorCode: null,
    safetyBlockReason: null,
    accepted: null,
    success: null,
    metadata: {},
    createdAt: "2026-05-25T00:00:00Z",
    ...partial,
  };
}

const sampleEvents: AiCostEventRecord[] = [
  ev({ eventType: "ai_interaction_started" }),
  ev({ eventType: "ai_model_call_completed", modelName: "claude-sonnet-4-6", inputTokens: 10, outputTokens: 20, latencyMs: 100 }),
  ev({ eventType: "ai_model_call_failed", modelName: "claude-sonnet-4-6", latencyMs: 50 }),
  ev({ eventType: "ai_patch_proposed" }),
  ev({ eventType: "ai_patch_previewed" }),
  ev({ eventType: "ai_patch_applied", accepted: true }),
  ev({ eventType: "ai_patch_validation_failed", validationErrorCode: "UNKNOWN_ACTION" }),
  ev({ eventType: "ai_safety_block_triggered", safetyBlockReason: "confirmation_required" }),
  ev({ eventType: "ai_user_feedback_submitted", accepted: false }),
];

describe("buildAiAnalyticsReport", () => {
  it("composes the COST-7 folds into the combined report shape", () => {
    const report = buildAiAnalyticsReport(sampleEvents);
    expect(report.overview.totalEvents).toBe(sampleEvents.length);
    expect(report.overview.modelCallsCompleted).toBe(1);
    expect(report.overview.modelCallsFailed).toBe(1);
    expect(report.overview.safetyBlockCount).toBe(1);
    expect(report.patchOutcomes.proposed).toBe(1);
    expect(report.patchOutcomes.previewed).toBe(1);
    expect(report.patchOutcomes.applied).toBe(1);
    expect(report.validationFailures.UNKNOWN_ACTION).toBe(1);
    expect(report.safetyBlocks.confirmation_required).toBe(1);
    expect(report.feedback.total).toBe(1);
    expect(report.feedback.rejected).toBe(1);
    expect(report.byModel["claude-sonnet-4-6"]?.count).toBe(2);
    expect(report.byFeature.workflow_creation?.count).toBe(sampleEvents.length);
  });

  it("returns zeros / empty maps for no events", () => {
    const report = buildAiAnalyticsReport([]);
    expect(report.overview.totalEvents).toBe(0);
    expect(report.byFeature).toEqual({});
    expect(report.byModel).toEqual({});
    expect(report.patchOutcomes.applied).toBe(0);
    expect(report.validationFailures).toEqual({});
    expect(report.safetyBlocks).toEqual({});
  });
});

describe("getAiAnalyticsForUser", () => {
  beforeEach(() => {
    mockListByUser.mockReset();
    mockListByUser.mockResolvedValue([]);
  });

  it("loads the caller's events with the requested range/limit and folds them", async () => {
    mockListByUser.mockResolvedValueOnce(sampleEvents);
    const report = await getAiAnalyticsForUser({
      userId: "u1",
      from: "2026-05-01T00:00:00Z",
      to: "2026-05-25T00:00:00Z",
      limit: 100,
    });
    expect(mockListByUser).toHaveBeenCalledWith("u1", {
      from: "2026-05-01T00:00:00Z",
      to: "2026-05-25T00:00:00Z",
      limit: 100,
    });
    expect(report.overview.totalEvents).toBe(sampleEvents.length);
  });
});

describe("no-leak", () => {
  it("never surfaces metadata VALUES (secrets) in the report", () => {
    const withSecret = [
      ev({
        eventType: "ai_model_call_completed",
        metadata: { accessToken: "ya29.LEAKED-SECRET", stage: "model" },
      }),
    ];
    const serialized = JSON.stringify(buildAiAnalyticsReport(withSecret));
    expect(serialized).not.toContain("ya29.LEAKED-SECRET");
    expect(serialized).not.toContain("accessToken");
  });
});
