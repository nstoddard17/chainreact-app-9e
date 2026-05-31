/**
 * @jest-environment node
 *
 * Tests for services/billing/aiCostEvents.ts (Slice 4.COST-6).
 * The repo is mocked so we capture the exact insert payload the service
 * produces (after sanitization) without a DB.
 */

const mockInsertEvent = jest.fn();
jest.mock("@/repositories/aiCostEvents", () => ({
  insertEvent: (...a: unknown[]) => mockInsertEvent(...a),
  listByWorkflow: jest.fn(),
}));

import type { AiCostEventInsert, AiCostEventRecord } from "@/repositories/aiCostEvents";
import {
  recordAiCostEvent,
  recordAiModelCallCompleted,
  recordAiModelCallFailed,
  recordAiToolCalled,
  recordAiPatchOutcome,
  recordAiSafetyBlock,
  recordAiUserFeedback,
  sanitizeAiEventMetadata,
  summarizeAiCostEvents,
  type AiEventScope,
} from "@/services/billing/aiCostEvents";

beforeEach(() => mockInsertEvent.mockReset());

function lastInsert(): AiCostEventInsert {
  return mockInsertEvent.mock.calls[mockInsertEvent.mock.calls.length - 1]![0] as AiCostEventInsert;
}

const scope: AiEventScope = { accountId: "acct-1", userId: "user-1", feature: "workflow_creation", workflowId: "wf-1" };

describe("sanitizeAiEventMetadata", () => {
  it("drops blocked keys (secrets / tokens / raw model IO / chain-of-thought / bodies / configs)", () => {
    const clean = sanitizeAiEventMetadata({
      intent: "create a slack notifier",
      nodeCount: 3,
      accessToken: "ACCESS-aaa",
      refreshToken: "REFRESH-bbb",
      apiSecret: "APISECRET-ccc",
      clientSecret: "CLIENT-ddd",
      webhookSecret: "WH-eee",
      botToken: "BOT-fff",
      Authorization: "Bearer ggg",
      password: "p",
      rawPrompt: "system: you are...",
      rawCompletion: "{...}",
      chainOfThought: "first I will...",
      messageBody: "hello world",
      fileContents: "....",
      config: { to: "x@y.com" },
    });
    expect(clean).toEqual({ intent: "create a slack notifier", nodeCount: 3 });
  });

  it("caps long strings and bounds depth + array size", () => {
    const clean = sanitizeAiEventMetadata({
      long: "x".repeat(5000),
      nested: { a: { b: { c: { d: "too deep" } } } },
      arr: Array.from({ length: 200 }, (_, i) => i),
    });
    expect((clean.long as string).length).toBe(512);
    expect((clean.arr as unknown[]).length).toBe(50);
    // Depth bound: nesting beyond MAX_DEPTH is pruned (no throw, no crash).
    expect(clean.nested).toBeDefined();
  });

  it("returns {} for null/undefined", () => {
    expect(sanitizeAiEventMetadata(null)).toEqual({});
    expect(sanitizeAiEventMetadata(undefined)).toEqual({});
  });

  it("preserves template / custom-node future-readiness keys (not blocked)", () => {
    const clean = sanitizeAiEventMetadata({
      templateId: "tmpl_123",
      templateRecommendationShown: true,
      customProviderId: "cp_1",
      customNodeId: "cn_1",
      customNodeVersion: "2",
    });
    expect(clean).toEqual({
      templateId: "tmpl_123",
      templateRecommendationShown: true,
      customProviderId: "cp_1",
      customNodeId: "cn_1",
      customNodeVersion: "2",
    });
  });
});

describe("recordAiCostEvent — sanitizes before insert", () => {
  it("sanitizes metadata on the way to the repo", async () => {
    await recordAiCostEvent({
      ...scope,
      eventType: "ai_interaction_started",
      metadata: { intent: "ok", accessToken: "ACCESS-aaa", chainOfThought: "secret reasoning" },
    });
    expect(lastInsert().metadata).toEqual({ intent: "ok" });
  });
});

describe("typed recorders map correctly", () => {
  it("recordAiModelCallCompleted computes total_tokens + success", async () => {
    await recordAiModelCallCompleted(scope, {
      modelName: "claude-opus-4-7",
      modelProvider: "anthropic",
      inputTokens: 1000,
      outputTokens: 250,
      estimatedCostMicros: 4200,
      aiCreditsCharged: 2,
      latencyMs: 800,
    });
    expect(lastInsert()).toMatchObject({
      eventType: "ai_model_call_completed",
      modelName: "claude-opus-4-7",
      inputTokens: 1000,
      outputTokens: 250,
      totalTokens: 1250,
      estimatedCostMicros: 4200,
      aiCreditsCharged: 2,
      success: true,
    });
  });

  it("recordAiModelCallFailed sets success=false", async () => {
    await recordAiModelCallFailed(scope, { modelName: "claude-opus-4-7", latencyMs: 30 });
    expect(lastInsert()).toMatchObject({ eventType: "ai_model_call_failed", success: false });
  });

  it("recordAiToolCalled → ai_tool_called for ok, ai_tool_failed for failed", async () => {
    await recordAiToolCalled(scope, { toolName: "getWorkflowGraph", toolStatus: "ok" });
    expect(lastInsert()).toMatchObject({ eventType: "ai_tool_called", toolName: "getWorkflowGraph", success: true });
    await recordAiToolCalled(scope, { toolName: "getWorkflowGraph", toolStatus: "failed" });
    expect(lastInsert()).toMatchObject({ eventType: "ai_tool_failed", toolStatus: "failed", success: false });
  });

  it("recordAiPatchOutcome maps each outcome", async () => {
    await recordAiPatchOutcome(scope, "validation_failed", { validationErrorCode: "UNKNOWN_ACTION" });
    expect(lastInsert()).toMatchObject({ eventType: "ai_patch_validation_failed", validationErrorCode: "UNKNOWN_ACTION", success: false });
    await recordAiPatchOutcome(scope, "applied");
    expect(lastInsert()).toMatchObject({ eventType: "ai_patch_applied", accepted: true });
    await recordAiPatchOutcome(scope, "rejected");
    expect(lastInsert()).toMatchObject({ eventType: "ai_patch_rejected", accepted: false });
  });

  it("recordAiSafetyBlock records the reason", async () => {
    await recordAiSafetyBlock(scope, "HALLUCINATED_PROVIDER");
    expect(lastInsert()).toMatchObject({ eventType: "ai_safety_block_triggered", safetyBlockReason: "HALLUCINATED_PROVIDER" });
  });

  it("recordAiUserFeedback records accepted", async () => {
    await recordAiUserFeedback(scope, false, { reasonCategory: "wrong_provider" });
    expect(lastInsert()).toMatchObject({ eventType: "ai_user_feedback_submitted", accepted: false, metadata: { reasonCategory: "wrong_provider" } });
  });
});

describe("no secret leakage in recorded payloads", () => {
  it("a model-call event with secret-laden metadata stores none of it", async () => {
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
    };
    await recordAiModelCallCompleted(scope, {
      modelName: "claude-opus-4-7",
      metadata: { intent: "ok", ...secrets },
    });
    const serialized = JSON.stringify(lastInsert());
    for (const v of Object.values(secrets)) expect(serialized).not.toContain(v);
    expect(JSON.stringify(lastInsert().metadata)).toEqual(JSON.stringify({ intent: "ok" }));
  });
});

describe("summarizeAiCostEvents (pure rollup)", () => {
  function rec(partial: Partial<AiCostEventRecord>): AiCostEventRecord {
    return {
      id: "x",
      userId: "user-1",
      feature: "workflow_creation",
      eventType: "ai_model_call_completed",
      metadata: {},
      createdAt: "2026-05-25T00:00:00Z",
      ...partial,
    } as AiCostEventRecord;
  }

  it("aggregates tokens, cost, credits, accept/reject, and breakdowns", () => {
    const summary = summarizeAiCostEvents([
      rec({ inputTokens: 100, outputTokens: 50, estimatedCostMicros: 500, aiCreditsCharged: 1, feature: "workflow_creation", eventType: "ai_model_call_completed" }),
      rec({ inputTokens: 200, outputTokens: 80, estimatedCostMicros: 900, aiCreditsCharged: 2, feature: "workflow_repair", eventType: "ai_patch_applied", accepted: true }),
      rec({ feature: "workflow_repair", eventType: "ai_patch_rejected", accepted: false }),
    ]);
    expect(summary.totalEvents).toBe(3);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(130);
    expect(summary.totalEstimatedCostMicros).toBe(1400);
    expect(summary.totalAiCredits).toBe(3);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.byFeature).toEqual({ workflow_creation: 1, workflow_repair: 2 });
    expect(summary.byEventType.ai_model_call_completed).toBe(1);
  });

  it("handles an empty list", () => {
    expect(summarizeAiCostEvents([])).toMatchObject({ totalEvents: 0, totalAiCredits: 0, byFeature: {} });
  });
});
