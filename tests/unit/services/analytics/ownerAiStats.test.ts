/**
 * @jest-environment node
 *
 * Tests for services/analytics/ownerAiStats.ts (Slice 4.COST-7).
 * Pure folds are tested directly with synthetic events; the async owner
 * functions are tested against a mocked repo (no DB). The billing module's
 * pure `summarizeAiCostEvents` is reused unmocked.
 */

const mockList = jest.fn();
jest.mock("@/repositories/aiCostEvents", () => ({
  listEventsForAnalytics: (...a: unknown[]) => mockList(...a),
  insertEvent: jest.fn(),
  listByWorkflow: jest.fn(),
}));

import type { AiCostEventRecord } from "@/repositories/aiCostEvents";
import {
  summarizeAiUsage,
  groupAiByFeature,
  groupAiByModel,
  getAiToolStats,
  getAiPatchOutcomeStats,
  getAiValidationFailureStats,
  getAiSafetyBlockStats,
  getAiFeedbackStats,
  getAiTemplateSignalStats,
  getAiCustomNodeSignalStats,
  getAiUsageOverview,
  getAiUsageByFeature,
  getAiCostByModel,
  getAiToolFailureStats,
  getAiPatchOutcomeStatsForRange,
  getAiValidationFailureStatsForRange,
  getAiFeedbackStatsForRange,
} from "@/services/analytics/ownerAiStats";

beforeEach(() => mockList.mockReset());

function ev(p: Partial<AiCostEventRecord> = {}): AiCostEventRecord {
  return {
    id: "x",
    userId: "user-1",
    workflowId: "wf-1",
    workflowRunId: null,
    patchId: null,
    conversationId: null,
    feature: "workflow_creation",
    eventType: "ai_model_call_completed",
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
    ...p,
  } as AiCostEventRecord;
}

describe("summarizeAiUsage", () => {
  it("extends the base summary with model/tool/safety/latency rollups", () => {
    const out = summarizeAiUsage([
      ev({ eventType: "ai_model_call_completed", inputTokens: 100, outputTokens: 50, estimatedCostMicros: 500, aiCreditsCharged: 1, latencyMs: 10 }),
      ev({ eventType: "ai_model_call_completed", inputTokens: 200, outputTokens: 80, totalTokens: 300, estimatedCostMicros: 900, aiCreditsCharged: 2, latencyMs: 30 }),
      ev({ eventType: "ai_model_call_failed", latencyMs: 50 }),
      ev({ eventType: "ai_tool_called", toolName: "getWorkflowGraph" }),
      ev({ eventType: "ai_tool_failed", toolName: "resolveOptionsSource" }),
      ev({ eventType: "ai_safety_block_triggered", safetyBlockReason: "HALLUCINATED_PROVIDER" }),
      ev({ eventType: "ai_patch_applied", accepted: true }),
      ev({ eventType: "ai_patch_rejected", accepted: false }),
    ]);
    expect(out.totalEvents).toBe(8);
    expect(out.totalInputTokens).toBe(300);
    expect(out.totalOutputTokens).toBe(130);
    expect(out.totalEstimatedCostMicros).toBe(1400);
    expect(out.totalAiCredits).toBe(3);
    expect(out.acceptedCount).toBe(1);
    expect(out.rejectedCount).toBe(1);
    expect(out.totalTokens).toBe(450); // 150 (derived) + 300 (explicit)
    expect(out.modelCallsCompleted).toBe(2);
    expect(out.modelCallsFailed).toBe(1);
    expect(out.toolCallCount).toBe(2);
    expect(out.toolFailureCount).toBe(1);
    expect(out.safetyBlockCount).toBe(1);
    expect(out.latencyAvgMs).toBe(30); // (10+30+50)/3
    expect(out.latencyP95Ms).toBe(50);
  });

  it("empty list → zeros and null latency", () => {
    const out = summarizeAiUsage([]);
    expect(out).toMatchObject({
      totalEvents: 0,
      totalTokens: 0,
      modelCallsCompleted: 0,
      toolCallCount: 0,
      safetyBlockCount: 0,
      latencyAvgMs: null,
      latencyP95Ms: null,
    });
  });
});

describe("groupAiByFeature", () => {
  it("rolls tokens/cost/credits per feature", () => {
    const g = groupAiByFeature([
      ev({ feature: "workflow_creation", inputTokens: 10, outputTokens: 5, estimatedCostMicros: 100, aiCreditsCharged: 1 }),
      ev({ feature: "workflow_creation", inputTokens: 20, outputTokens: 10, estimatedCostMicros: 200, aiCreditsCharged: 1 }),
      ev({ feature: "workflow_repair", inputTokens: 5, outputTokens: 5, estimatedCostMicros: 50 }),
    ]);
    expect(g.workflow_creation).toMatchObject({ count: 2, inputTokens: 30, outputTokens: 15, totalTokens: 45, estimatedCostMicros: 300, aiCredits: 2 });
    expect(g.workflow_repair).toMatchObject({ count: 1, estimatedCostMicros: 50, aiCredits: 0 });
  });
});

describe("groupAiByModel", () => {
  it("rolls per-model cost + latency avg/p95, skips model-less events", () => {
    const g = groupAiByModel([
      ev({ modelName: "claude-opus-4-7", eventType: "ai_model_call_completed", inputTokens: 100, outputTokens: 50, estimatedCostMicros: 500, aiCreditsCharged: 1, latencyMs: 10 }),
      ev({ modelName: "claude-opus-4-7", eventType: "ai_model_call_failed", latencyMs: 100 }),
      ev({ modelName: "claude-haiku-4-5", eventType: "ai_model_call_completed", inputTokens: 10, outputTokens: 5, estimatedCostMicros: 20, latencyMs: 5 }),
      ev({ modelName: null, eventType: "ai_tool_called", toolName: "x" }),
    ]);
    expect(Object.keys(g).sort()).toEqual(["claude-haiku-4-5", "claude-opus-4-7"]);
    expect(g["claude-opus-4-7"]).toMatchObject({ count: 2, completed: 1, failed: 1, totalTokens: 150, estimatedCostMicros: 500, latencyAvgMs: 55, latencyP95Ms: 100 });
    expect(g["claude-haiku-4-5"]).toMatchObject({ count: 1, completed: 1, latencyAvgMs: 5, latencyP95Ms: 5 });
  });
});

describe("getAiToolStats", () => {
  it("counts calls + failures overall and per tool", () => {
    const s = getAiToolStats([
      ev({ eventType: "ai_tool_called", toolName: "A" }),
      ev({ eventType: "ai_tool_called", toolName: "A" }),
      ev({ eventType: "ai_tool_failed", toolName: "A" }),
      ev({ eventType: "ai_tool_called", toolName: "B" }),
      ev({ eventType: "ai_model_call_completed" }), // ignored
    ]);
    expect(s.totalCalls).toBe(4);
    expect(s.totalFailures).toBe(1);
    expect(s.byTool.A).toEqual({ called: 3, failed: 1 });
    expect(s.byTool.B).toEqual({ called: 1, failed: 0 });
  });
});

describe("getAiPatchOutcomeStats", () => {
  it("counts each outcome + acceptance rate", () => {
    const s = getAiPatchOutcomeStats([
      ev({ eventType: "ai_patch_proposed" }),
      ev({ eventType: "ai_patch_proposed" }),
      ev({ eventType: "ai_patch_validation_failed" }),
      ev({ eventType: "ai_patch_previewed" }),
      ev({ eventType: "ai_patch_applied" }),
      ev({ eventType: "ai_patch_applied" }),
      ev({ eventType: "ai_patch_applied" }),
      ev({ eventType: "ai_patch_rejected" }),
    ]);
    expect(s).toMatchObject({ proposed: 2, validationFailed: 1, previewed: 1, applied: 3, rejected: 1 });
    expect(s.acceptanceRate).toBeCloseTo(0.75);
  });

  it("acceptance rate is 0 when no patch decided", () => {
    expect(getAiPatchOutcomeStats([]).acceptanceRate).toBe(0);
    expect(getAiPatchOutcomeStats([ev({ eventType: "ai_patch_proposed" })]).acceptanceRate).toBe(0);
  });
});

describe("getAiValidationFailureStats", () => {
  it("counts by error code, null → unknown", () => {
    const s = getAiValidationFailureStats([
      ev({ eventType: "ai_patch_validation_failed", validationErrorCode: "UNKNOWN_ACTION" }),
      ev({ eventType: "ai_patch_validation_failed", validationErrorCode: "UNKNOWN_ACTION" }),
      ev({ eventType: "ai_patch_validation_failed", validationErrorCode: "UNKNOWN_FIELD" }),
      ev({ eventType: "ai_patch_validation_failed", validationErrorCode: null }),
      ev({ eventType: "ai_patch_applied" }), // ignored
    ]);
    expect(s).toEqual({ UNKNOWN_ACTION: 2, UNKNOWN_FIELD: 1, unknown: 1 });
  });
});

describe("getAiSafetyBlockStats", () => {
  it("counts by reason", () => {
    const s = getAiSafetyBlockStats([
      ev({ eventType: "ai_safety_block_triggered", safetyBlockReason: "HALLUCINATED_PROVIDER" }),
      ev({ eventType: "ai_safety_block_triggered", safetyBlockReason: "HALLUCINATED_PROVIDER" }),
      ev({ eventType: "ai_safety_block_triggered", safetyBlockReason: "DESTRUCTIVE_NO_CONFIRM" }),
    ]);
    expect(s).toEqual({ HALLUCINATED_PROVIDER: 2, DESTRUCTIVE_NO_CONFIRM: 1 });
  });
});

describe("getAiFeedbackStats", () => {
  it("counts thumbs up/down", () => {
    const s = getAiFeedbackStats([
      ev({ eventType: "ai_user_feedback_submitted", accepted: true }),
      ev({ eventType: "ai_user_feedback_submitted", accepted: true }),
      ev({ eventType: "ai_user_feedback_submitted", accepted: false }),
      ev({ eventType: "ai_model_call_completed" }), // ignored
    ]);
    expect(s).toEqual({ total: 3, accepted: 2, rejected: 1 });
  });
});

describe("template + custom-node future-readiness signals", () => {
  it("counts template event types and presence-only metadata templateId", () => {
    const s = getAiTemplateSignalStats([
      ev({ eventType: "ai_template_recommended" }),
      ev({ eventType: "ai_template_instantiated" }),
      ev({ eventType: "ai_model_call_completed", metadata: { templateId: "tmpl_1" } }),
      ev({ eventType: "ai_model_call_completed", metadata: {} }),
    ]);
    expect(s).toEqual({ recommended: 1, instantiated: 1, metadataTemplateIdCount: 1 });
  });

  it("counts custom-node metadata signals by presence only", () => {
    const s = getAiCustomNodeSignalStats([
      ev({ metadata: { customProviderId: "cp_1", customNodeId: "cn_1" } }),
      ev({ metadata: { customNodeId: "cn_2" } }),
      ev({ metadata: {} }),
    ]);
    expect(s).toEqual({ customProviderIdCount: 1, customNodeIdCount: 2 });
  });
});

describe("async owner functions forward range to repo + fold", () => {
  it("getAiUsageOverview", async () => {
    mockList.mockResolvedValueOnce([ev({ inputTokens: 10, outputTokens: 5, latencyMs: 7 })]);
    const out = await getAiUsageOverview({ from: "A", to: "B" });
    expect(mockList).toHaveBeenCalledWith({ from: "A", to: "B" });
    expect(out.totalInputTokens).toBe(10);
    expect(out.latencyAvgMs).toBe(7);
  });

  it("getAiUsageByFeature", async () => {
    mockList.mockResolvedValueOnce([ev({ feature: "workflow_repair", estimatedCostMicros: 99 })]);
    const out = await getAiUsageByFeature({ from: "A" });
    expect(out.workflow_repair!.estimatedCostMicros).toBe(99);
  });

  it("getAiCostByModel", async () => {
    mockList.mockResolvedValueOnce([ev({ modelName: "m1", estimatedCostMicros: 12 })]);
    const out = await getAiCostByModel({});
    expect(out.m1!.estimatedCostMicros).toBe(12);
  });

  it("getAiToolFailureStats", async () => {
    mockList.mockResolvedValueOnce([ev({ eventType: "ai_tool_failed", toolName: "t" })]);
    const out = await getAiToolFailureStats({});
    expect(out.totalFailures).toBe(1);
  });

  it("getAiPatchOutcomeStatsForRange", async () => {
    mockList.mockResolvedValueOnce([ev({ eventType: "ai_patch_applied" })]);
    const out = await getAiPatchOutcomeStatsForRange({});
    expect(out.applied).toBe(1);
  });

  it("getAiValidationFailureStatsForRange", async () => {
    mockList.mockResolvedValueOnce([ev({ eventType: "ai_patch_validation_failed", validationErrorCode: "X" })]);
    const out = await getAiValidationFailureStatsForRange({});
    expect(out.X).toBe(1);
  });

  it("getAiFeedbackStatsForRange", async () => {
    mockList.mockResolvedValueOnce([ev({ eventType: "ai_user_feedback_submitted", accepted: true })]);
    const out = await getAiFeedbackStatsForRange({});
    expect(out).toEqual({ total: 1, accepted: 1, rejected: 0 });
  });

  it("empty repo result → zeroed overview", async () => {
    mockList.mockResolvedValueOnce([]);
    const out = await getAiUsageOverview({});
    expect(out.totalEvents).toBe(0);
    expect(out.totalTokens).toBe(0);
  });
});

describe("no metadata / secret leakage", () => {
  it("aggregates never echo metadata values, secrets, or template/custom-node ids", () => {
    const secrets = {
      accessToken: "ACCESSTOKEN-aaa",
      refreshToken: "REFRESHTOKEN-bbb",
      apiSecret: "APISECRET-ccc",
      clientSecret: "CLIENTSECRET-ddd",
      webhookSecret: "WEBHOOKSECRET-eee",
      botToken: "BOTTOKEN-fff",
      Authorization: "BEARER-ggg",
      rawPrompt: "RAWPROMPT-hhh",
      rawCompletion: "RAWCOMPLETION-iii",
      chainOfThought: "CHAINOFTHOUGHT-jjj",
      password: "PASSWORD-kkk",
      messageBody: "MESSAGEBODY-lll",
      fileContents: "FILECONTENTS-mmm",
      // presence-counted keys: VALUES must still never appear in output.
      templateId: "TEMPLATEID-VALUE-SHOULD-NOT-APPEAR",
      customNodeId: "CUSTOMNODEID-VALUE-SHOULD-NOT-APPEAR",
      customProviderId: "CUSTOMPROVIDERID-VALUE-SHOULD-NOT-APPEAR",
    };
    const events = [
      ev({ eventType: "ai_model_call_completed", modelName: "m1", feature: "workflow_creation", inputTokens: 10, metadata: secrets }),
      ev({ eventType: "ai_template_recommended", metadata: secrets }),
    ];
    const serialized = JSON.stringify({
      overview: summarizeAiUsage(events),
      byFeature: groupAiByFeature(events),
      byModel: groupAiByModel(events),
      tools: getAiToolStats(events),
      patches: getAiPatchOutcomeStats(events),
      validation: getAiValidationFailureStats(events),
      safety: getAiSafetyBlockStats(events),
      feedback: getAiFeedbackStats(events),
      templateSignals: getAiTemplateSignalStats(events),
      customNodeSignals: getAiCustomNodeSignalStats(events),
    });
    for (const v of Object.values(secrets)) expect(serialized).not.toContain(v);
    // Presence counting still works — value redacted, count surfaced. (The
    // `metadata*` substring legitimately appears in the `metadataTemplateIdCount`
    // FIELD NAME, so we assert on redacted VALUES, never on the literal "metadata".)
    expect(getAiTemplateSignalStats(events).metadataTemplateIdCount).toBe(2);
    expect(getAiCustomNodeSignalStats(events).customNodeIdCount).toBe(2);
  });
});
