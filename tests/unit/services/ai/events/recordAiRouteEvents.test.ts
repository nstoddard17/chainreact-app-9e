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
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

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
  recordAiRepairOutcome,
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
    await recordAiPlanOutcome({ accountId: "acct-u1", userId: "u1", workflowId: "wf1" }, planSuccess() as never);

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
    await recordAiPlanOutcome({ accountId: "acct-u1", userId: "u1", workflowId: "wf1" }, planSuccess({ canApplyLater: false }) as never);
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(expect.anything(), "proposed", expect.anything());
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "PREVIEW_REJECTED" }),
    );
  });

  it("emits no patch event for a no-patch (needs-input) plan", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ proposedPatch: null, canApplyLater: false }) as never,
    );
    expect(recordAiModelCallCompleted).toHaveBeenCalledTimes(1);
    expect(recordAiPatchOutcome).not.toHaveBeenCalled();
  });

  it("maps MODEL_FAILED to a failed model call with stage=model", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
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
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
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
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
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
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
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
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1", patchId: "p1" },
      { ok: false, code: "CONFIRMATION_REQUIRED", message: "x" } as never,
    );
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(expect.anything(), "confirmation_required");
  });

  it("maps other apply failures to validation_failed with the code", async () => {
    await recordAiApplyOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1", patchId: "p1" },
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
      recordAiPlanOutcome({ accountId: "acct-u1", userId: "u1", workflowId: "wf1" }, planSuccess() as never),
    ).resolves.toBeUndefined();
  });

  it("recordAiApplyOutcome resolves even when the recorder throws", async () => {
    recordAiPatchOutcome.mockRejectedValueOnce(new Error("ledger down"));
    await expect(
      recordAiApplyOutcome(
        { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
        { ok: true, appliedPatchId: "p1", appliedOperationCount: 1, riskLevel: "low" } as never,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("AI-28 — prompt packet attribution", () => {
  const promptAttribution = {
    packetVersion: "workflow-planner-v1",
    totalPacketChars: 140767,
    catalogChars: 124261,
    rulesChars: 10021,
    connectedIntegrationsChars: 252,
    currentCanvasChars: 74,
    userRequestChars: 50,
    catalogProviderCount: 26,
    catalogActionCount: 286,
    catalogTriggerCount: 62,
    catalogFieldCount: 1339,
    catalogOutputFieldCount: 2250,
    connectedIntegrationCount: 2,
    currentCanvasNodeCount: 0,
    currentCanvasEdgeCount: 0,
  } as const;

  it("forwards packetVersion as the top-level promptVersion column on a completed call", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttribution }) as never,
    );
    expect(recordAiModelCallCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ promptVersion: "workflow-planner-v1" }),
    );
  });

  it("folds per-section chars + structural counts into ai_model_call_completed metadata", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttribution }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).toMatchObject({
      packetVersion: "workflow-planner-v1",
      catalogChars: 124261,
      rulesChars: 10021,
      connectedIntegrationsChars: 252,
      currentCanvasChars: 74,
      userRequestChars: 50,
      totalPacketChars: 140767,
      catalogProviderCount: 26,
      catalogActionCount: 286,
      catalogTriggerCount: 62,
      catalogFieldCount: 1339,
      catalogOutputFieldCount: 2250,
      connectedIntegrationCount: 2,
      currentCanvasNodeCount: 0,
      currentCanvasEdgeCount: 0,
      // Pre-AI-28 fields still present (regression guard).
      tier: "strong",
      finishReason: "stop",
    });
  });

  it("folds attribution + packetVersion into ai_model_call_failed metadata on MODEL_FAILED", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planFail("MODEL_FAILED", [{ stage: "model", code: "NOT_CONFIGURED" }]) as never &
        { prompt?: typeof promptAttribution },
    );
    // The legacy helper omits `prompt` from planFail — re-call with one
    // present so we cover both branches.
    recordAiModelCallFailed.mockClear();
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      { ...planFail("MODEL_FAILED", [{ stage: "model", code: "NOT_CONFIGURED" }]), prompt: promptAttribution } as never,
    );
    expect(recordAiModelCallFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          stage: "model",
          code: "NOT_CONFIGURED",
          packetVersion: "workflow-planner-v1",
          catalogChars: 124261,
          totalPacketChars: 140767,
        }),
      }),
    );
  });

  it("folds attribution into ai_model_call_failed metadata on PARSE_FAILED", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      { ...planFail("PARSE_FAILED", [{ stage: "parse", code: "INVALID_PATCH" }]), prompt: promptAttribution } as never,
    );
    expect(recordAiModelCallFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          stage: "parse",
          code: "INVALID_PATCH",
          packetVersion: "workflow-planner-v1",
          catalogChars: 124261,
        }),
      }),
    );
  });

  it("works when prompt attribution is absent (back-compat — legacy callers)", async () => {
    // A plan result with no `prompt` field (pre-AI-28 shape) must still
    // record cleanly — no thrown error, no NaN, no undefined keys.
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess() as never,
    );
    const completedCall = recordAiModelCallCompleted.mock.calls[0]![1] as Record<string, unknown>;
    expect(completedCall).not.toHaveProperty("promptVersion");
    const metadata = (completedCall as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).not.toHaveProperty("packetVersion");
    expect(metadata).not.toHaveProperty("catalogChars");
    // Pre-AI-28 fields still recorded.
    expect(metadata).toMatchObject({ tier: "strong", finishReason: "stop" });
  });

  it("never forwards raw prompt text or catalog content via the attribution channel", async () => {
    // Even though planSuccess doesn't accept user-prompt content, prove
    // that the recorder never echoes secret-shaped substrings even if a
    // future caller stuffed a value-shaped string into prompt.* by
    // mistake. (The attribution shape is numeric — this guard catches
    // any future drift.)
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttribution }) as never,
    );
    expect(allCallArgs()).not.toMatch(/xox[bpsr]-|Bearer\s|ya29\.|sk-ant-|accessToken|refreshToken|access_token/);
  });

  it("attribution metadata keys do NOT match the sanitizer denylist", async () => {
    // Forward-compat: assert each emitted metadata key passes the same
    // denylist the COST-6 sanitizer enforces. A regression that renamed
    // an attribution field to e.g. `catalogTokens` would silently drop
    // the data; this test makes that visible.
    const BLOCKED = [
      /token/i,
      /secret/i,
      /password/i,
      /authorization/i,
      /api[-_]?key/i,
      /credential/i,
      /prompt/i,
      /completion/i,
      /body/i,
      /config/i,
      /\braw/i,
    ];
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttribution }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    for (const key of Object.keys(metadata)) {
      for (const re of BLOCKED) {
        if (re.test(key)) {
          throw new Error(
            `Metadata key '${key}' matches sanitizer denylist /${re.source}/${re.flags} — sanitizeAiEventMetadata would drop it.`,
          );
        }
      }
    }
  });
});

describe("AI-30 — narrowing-attribution flows through metadata", () => {
  const promptAttributionNarrowed = {
    packetVersion: "workflow-planner-v3",
    totalPacketChars: 12000,
    catalogChars: 8000,
    rulesChars: 2000,
    connectedIntegrationsChars: 200,
    currentCanvasChars: 50,
    userRequestChars: 40,
    catalogProviderCount: 3,
    catalogActionCount: 12,
    catalogTriggerCount: 6,
    catalogFieldCount: 40,
    catalogOutputFieldCount: 60,
    connectedIntegrationCount: 1,
    currentCanvasNodeCount: 0,
    currentCanvasEdgeCount: 0,
    // Narrowing fields from AI-30.
    catalogProvidersTotal: 26,
    providerNarrowingEnabled: true,
    providerNarrowingMode: "narrowed",
    providerNarrowingFallbackUsed: false,
    providerNarrowingOmittedCount: 23,
  } as const;

  const promptAttributionFallback = {
    ...promptAttributionNarrowed,
    catalogProviderCount: 26,
    providerNarrowingMode: "full-catalog",
    providerNarrowingFallbackUsed: true,
    providerNarrowingOmittedCount: 0,
    providerNarrowingReason: "ambiguous_broad_request",
  } as const;

  it("folds narrowing fields into ai_model_call_completed metadata", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttributionNarrowed }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).toMatchObject({
      catalogProvidersTotal: 26,
      providerNarrowingEnabled: true,
      providerNarrowingMode: "narrowed",
      providerNarrowingFallbackUsed: false,
      providerNarrowingOmittedCount: 23,
    });
    // Reason is OMITTED when narrowing was applied (fallbackReason is null).
    expect(metadata).not.toHaveProperty("providerNarrowingReason");
  });

  it("forwards providerNarrowingReason on the full-catalog fallback path", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttributionFallback }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).toMatchObject({
      providerNarrowingMode: "full-catalog",
      providerNarrowingFallbackUsed: true,
      providerNarrowingOmittedCount: 0,
      providerNarrowingReason: "ambiguous_broad_request",
    });
  });

  it("narrowing field names do NOT match the sanitizer denylist", async () => {
    // Same defensive denylist as the AI-28 attribution test — ensures
    // future narrowing-field renames don't accidentally trip the
    // sanitizer (which would silently drop the data).
    const BLOCKED = [
      /token/i,
      /secret/i,
      /password/i,
      /authorization/i,
      /api[-_]?key/i,
      /credential/i,
      /prompt/i,
      /completion/i,
      /body/i,
      /config/i,
      /\braw/i,
    ];
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttributionNarrowed }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    for (const key of Object.keys(metadata)) {
      for (const re of BLOCKED) {
        if (re.test(key)) {
          throw new Error(
            `Metadata key '${key}' matches sanitizer denylist /${re.source}/${re.flags}`,
          );
        }
      }
    }
  });

  it("folds narrowing fields into ai_model_call_failed metadata on MODEL_FAILED too", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      { ...planFail("MODEL_FAILED", [{ stage: "model", code: "NOT_CONFIGURED" }]), prompt: promptAttributionNarrowed } as never,
    );
    expect(recordAiModelCallFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          providerNarrowingMode: "narrowed",
          providerNarrowingOmittedCount: 23,
        }),
      }),
    );
  });
});

describe("AI-31 — tier-routing metadata flows through", () => {
  const promptAttributionStrongDeterministic = {
    packetVersion: "workflow-planner-v3",
    totalPacketChars: 12000,
    catalogChars: 8000,
    rulesChars: 2000,
    connectedIntegrationsChars: 200,
    currentCanvasChars: 50,
    userRequestChars: 40,
    catalogProviderCount: 3,
    catalogActionCount: 12,
    catalogTriggerCount: 6,
    catalogFieldCount: 40,
    catalogOutputFieldCount: 60,
    connectedIntegrationCount: 1,
    currentCanvasNodeCount: 0,
    currentCanvasEdgeCount: 0,
    catalogProvidersTotal: 26,
    providerNarrowingEnabled: true,
    providerNarrowingMode: "narrowed",
    providerNarrowingFallbackUsed: false,
    providerNarrowingOmittedCount: 23,
    // AI-31 tier-routing fields.
    plannerModelTier: "strong",
    classifierUsed: true,
    classifierModelTier: null,
    classifierConfidence: "high",
    classifierProviderCount: 3,
    deterministicProviderCount: 3,
    finalProviderCount: 3,
    fallbackToDeterministic: false,
    fallbackToFullCatalog: false,
    tierRoutingReason: "feature_default_strong",
  } as const;

  const promptAttributionClassifierDisabled = {
    ...promptAttributionStrongDeterministic,
    classifierUsed: false,
    classifierConfidence: null,
    classifierProviderCount: null,
    tierRoutingReason: "classifier_disabled",
  } as const;

  it("folds all tier-routing fields into ai_model_call_completed metadata", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttributionStrongDeterministic }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).toMatchObject({
      plannerModelTier: "strong",
      classifierUsed: true,
      classifierModelTier: null,
      classifierConfidence: "high",
      classifierProviderCount: 3,
      deterministicProviderCount: 3,
      finalProviderCount: 3,
      fallbackToDeterministic: false,
      fallbackToFullCatalog: false,
      tierRoutingReason: "feature_default_strong",
    });
  });

  it("reflects classifier_disabled when classifier is off", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttributionClassifierDisabled }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).toMatchObject({
      classifierUsed: false,
      classifierConfidence: null,
      classifierProviderCount: null,
      tierRoutingReason: "classifier_disabled",
    });
  });

  it("folds tier-routing fields into ai_model_call_failed metadata too (MODEL_FAILED)", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      {
        ...planFail("MODEL_FAILED", [{ stage: "model", code: "NOT_CONFIGURED" }]),
        prompt: promptAttributionStrongDeterministic,
      } as never,
    );
    expect(recordAiModelCallFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          plannerModelTier: "strong",
          classifierUsed: true,
          tierRoutingReason: "feature_default_strong",
        }),
      }),
    );
  });

  it("tier-routing field names do NOT match the sanitizer denylist", async () => {
    const BLOCKED = [
      /token/i,
      /secret/i,
      /password/i,
      /authorization/i,
      /api[-_]?key/i,
      /credential/i,
      /prompt/i,
      /completion/i,
      /body/i,
      /\bconfig\b/i,
      /\braw/i,
    ];
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: promptAttributionStrongDeterministic }) as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    const tierRoutingKeys = [
      "plannerModelTier",
      "classifierUsed",
      "classifierModelTier",
      "classifierConfidence",
      "classifierProviderCount",
      "deterministicProviderCount",
      "finalProviderCount",
      "fallbackToDeterministic",
      "fallbackToFullCatalog",
      "tierRoutingReason",
    ];
    for (const key of tierRoutingKeys) {
      expect(metadata).toHaveProperty(key);
      for (const re of BLOCKED) {
        if (re.test(key)) {
          throw new Error(
            `Tier-routing metadata key '${key}' matches sanitizer denylist /${re.source}/${re.flags}`,
          );
        }
      }
    }
  });
});

describe("AI-35D — classifier telemetry + interactionKind", () => {
  const classifierModelCall = {
    modelName: "gpt-4.1-mini",
    modelProvider: "openai" as const,
    responded: true,
    inputTokens: 60,
    outputTokens: 12,
    latencyMs: 7,
    confidence: "high" as const,
    candidateProviderCount: 3,
    validProviderCount: 2,
    outcome: "model_succeeded" as const,
  };

  function discoveryCall() {
    return recordAiModelCallCompleted.mock.calls.find(
      (c) => (c[0] as { feature?: string }).feature === "provider_discovery",
    );
  }

  it("emits a DISTINCT provider_discovery classifier model call when telemetry is present", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: { packetVersion: "workflow-planner-v3", classifierModelCall } }) as never,
    );
    const call = discoveryCall();
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({ feature: "provider_discovery", workflowId: "wf1" });
    expect(call![1]).toMatchObject({
      modelName: "gpt-4.1-mini",
      modelProvider: "openai",
      inputTokens: 60,
      outputTokens: 12,
      metadata: expect.objectContaining({
        classifierOnly: true,
        classifierPurpose: "provider_narrowing",
        classifierOutcome: "model_succeeded",
        classifierConfidence: "high",
        candidateProviderCount: 3,
        validProviderCount: 2,
      }),
    });
    // The planner's own workflow_creation completed call still fires too.
    const plannerCall = recordAiModelCallCompleted.mock.calls.find(
      (c) => (c[0] as { feature?: string }).feature === "workflow_creation",
    );
    expect(plannerCall).toBeDefined();
  });

  it("records a FAILED classifier call (responded:false) as ai_model_call_failed under provider_discovery", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({
        prompt: {
          packetVersion: "workflow-planner-v3",
          classifierModelCall: { ...classifierModelCall, responded: false, outcome: "model_failed" },
        },
      }) as never,
    );
    const failedDiscovery = recordAiModelCallFailed.mock.calls.find(
      (c) => (c[0] as { feature?: string }).feature === "provider_discovery",
    );
    expect(failedDiscovery).toBeDefined();
    expect(failedDiscovery![1]).toMatchObject({ modelProvider: "openai", modelName: "gpt-4.1-mini" });
  });

  it("emits NO provider_discovery event when the classifier did not run (no telemetry)", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      planSuccess({ prompt: { packetVersion: "workflow-planner-v3" } }) as never,
    );
    expect(discoveryCall()).toBeUndefined();
    // Only the planner's own completed call fired.
    expect(recordAiModelCallCompleted).toHaveBeenCalledTimes(1);
  });

  it("folds plannerInteractionKind into the planner model-call metadata when provided", async () => {
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1", interactionKind: "follow_up" },
      planSuccess() as never,
    );
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).toMatchObject({ plannerInteractionKind: "follow_up" });
  });

  it("omits plannerInteractionKind for legacy callers (back-compat)", async () => {
    await recordAiPlanOutcome({ accountId: "acct-u1", userId: "u1", workflowId: "wf1" }, planSuccess() as never);
    const metadata = (recordAiModelCallCompleted.mock.calls[0]![1] as { metadata: Record<string, unknown> })
      .metadata;
    expect(metadata).not.toHaveProperty("plannerInteractionKind");
  });

  it("classifier metadata keys pass the sanitizer denylist and carry no secrets", async () => {
    const BLOCKED = [/token/i, /secret/i, /password/i, /authorization/i, /prompt/i, /completion/i, /body/i, /\bconfig\b/i, /\braw/i];
    await recordAiPlanOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1", interactionKind: "initial_plan" },
      planSuccess({ prompt: { packetVersion: "workflow-planner-v3", classifierModelCall } }) as never,
    );
    const call = discoveryCall();
    const metadata = (call![1] as { metadata: Record<string, unknown> }).metadata;
    for (const key of Object.keys(metadata)) {
      for (const re of BLOCKED) {
        if (re.test(key)) throw new Error(`classifier metadata key '${key}' matches denylist /${re.source}/`);
      }
    }
    expect(allCallArgs()).not.toMatch(/xox[bpsr]-|Bearer\s|ya29\.|sk-ant-|access_token/);
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
    await recordAiPlanOutcome({ accountId: "acct-u1", userId: "u1", workflowId: "wf1" }, withSecret as never);
    expect(allCallArgs()).not.toContain("ya29.LEAKED");
    expect(allCallArgs()).not.toContain("accessToken");
  });
});

describe("recordAiRepairOutcome (AI-13) — mapping", () => {
  const SCOPE = { accountId: "acct-u1", userId: "u1", workflowId: "wf1", workflowRunId: "run-1" };

  const failureSummary = {
    failed: true,
    status: "failed" as const,
    isTest: false,
    failedNodeId: "n-slack",
    errorCode: "MISSING_REQUIRED_FIELD",
    classification: null,
  };

  const baseRepairable = {
    ok: true as const,
    workflowId: "wf1",
    workflowRunId: "run-1",
    failureSummary,
    repairability: "repairable" as const,
    reasonCode: "MISSING_REQUIRED_FIELD" as const,
    proposedPatch: {
      patchId: "repair:run-1",
      workflowId: "wf1",
      baseRevision: "rev",
      operations: [{ op: "updateNodeConfig" as const, nodeId: "n-slack", config: {} }],
      summary: "Repair proposal",
      rationale: "Missing required field.",
    },
    preview: { ok: true, workflowId: "wf1" } as never,
    requiredUserInput: [],
    recommendations: ["Fill the required field"],
    confidence: "medium" as const,
    safetyNotes: [],
    noMutation: true as const,
  };

  it("emits interaction_started + proposed + previewed for a repairable result with a preview-validated patch", async () => {
    await recordAiRepairOutcome(SCOPE, baseRepairable);
    // 1. Interaction (workflow_repair feature, scope includes workflowRunId + patchId).
    expect(recordAiCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        workflowId: "wf1",
        workflowRunId: "run-1",
        patchId: "repair:run-1",
        feature: "workflow_repair",
        eventType: "ai_interaction_started",
      }),
    );
    // 2. Patch proposed + previewed.
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", patchId: "repair:run-1" }),
      "proposed",
      expect.objectContaining({
        metadata: expect.objectContaining({ opCount: 1, reasonCode: "MISSING_REQUIRED_FIELD" }),
      }),
    );
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair" }),
      "previewed",
      expect.anything(),
    );
    expect(recordAiModelCallCompleted).not.toHaveBeenCalled();
    expect(recordAiModelCallFailed).not.toHaveBeenCalled();
  });

  it("emits validation_failed for FAILED_PREVIEW (strategy proposed but preview rejected)", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ...baseRepairable,
      repairability: "noSafeRepair",
      reasonCode: "FAILED_PREVIEW",
      proposedPatch: undefined,
      preview: undefined,
    });
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", workflowRunId: "run-1" }),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "FAILED_PREVIEW" }),
    );
  });

  it("emits ai_safety_block_triggered with needs_user_input when the service asks for input", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ...baseRepairable,
      repairability: "needsUserInput",
      reasonCode: "MISSING_REQUIRED_FIELD",
      proposedPatch: undefined,
      preview: undefined,
    });
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", workflowRunId: "run-1" }),
      "needs_user_input",
      expect.objectContaining({ reasonCode: "MISSING_REQUIRED_FIELD" }),
    );
  });

  it("emits ai_safety_block_triggered with no_safe_repair for a recommendation-only outcome (e.g. BILLING_LIMIT)", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ...baseRepairable,
      repairability: "noSafeRepair",
      reasonCode: "BILLING_LIMIT",
      proposedPatch: undefined,
      preview: undefined,
      recommendations: ["Upgrade your plan."],
    });
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair" }),
      "no_safe_repair",
      expect.objectContaining({ reasonCode: "BILLING_LIMIT" }),
    );
  });

  it("emits a validation_failed event for service-level NOT_FOUND so the funnel can count it", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ok: false,
      code: "NOT_FOUND",
      message: "No run.",
      noMutation: true,
    });
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", workflowRunId: "run-1" }),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "NOT_FOUND" }),
    );
    expect(recordAiCostEvent).not.toHaveBeenCalled(); // interaction_started is skipped on hard failure
  });

  it("emits a validation_failed event for service-level READ_FAILED", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ok: false,
      code: "READ_FAILED",
      message: "Couldn't read.",
      noMutation: true,
    });
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "READ_FAILED" }),
    );
  });

  it("never has a RUNTIME import of a model client / planner / apply / repair service — only TYPE imports are allowed", () => {
    // The emission module owns mapping → ledger only. A future regression that
    // pulled in a runtime service binding (vs. a `import type {...}`) would
    // break this assertion. `import type` is fine: TypeScript erases it.
    const src = readFileSync(
      pathResolve(process.cwd(), "services/ai/events/recordAiRouteEvents.ts"),
      "utf8",
    );
    // Hard ban: any reference to a model adapter.
    expect(src).not.toMatch(/from\s+["']@\/core\/ai\/modelClient/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/modelClients/);
    // Soft ban: runtime (non-`import type`) imports of the AI services.
    const runtimeImport = (mod: string) =>
      new RegExp(`^import \\{[^}]*\\} from ["']${mod}["']`, "m");
    expect(src).not.toMatch(runtimeImport("@/services/ai/planner"));
    expect(src).not.toMatch(runtimeImport("@/services/ai/apply"));
    expect(src).not.toMatch(runtimeImport("@/services/ai/repair"));
  });

  it("is fail-open — a recorder throw never propagates", async () => {
    recordAiCostEvent.mockRejectedValueOnce(new Error("ledger down"));
    await expect(recordAiRepairOutcome(SCOPE, baseRepairable)).resolves.toBeUndefined();
  });

  it("no-leak: never forwards raw classification text / config values / secret-shaped values", async () => {
    const withSensitive = {
      ...baseRepairable,
      failureSummary: {
        ...failureSummary,
        classification: {
          title: "boom",
          description: "user-facing",
          severity: "error" as const,
        },
      },
      proposedPatch: {
        ...baseRepairable.proposedPatch,
        operations: [
          {
            op: "updateNodeConfig" as const,
            nodeId: "n-slack",
            config: {
              accessToken: "ya29.LEAKED-IN-CONFIG",
              text: "secret message body",
            },
          },
        ],
      },
    };
    await recordAiRepairOutcome(SCOPE, withSensitive);
    // The emission layer forwards only ids/counts/codes. Patch operations are
    // NOT forwarded as raw payload — only the opCount + reasonCode.
    const dump = allCallArgs();
    expect(dump).not.toContain("ya29.LEAKED-IN-CONFIG");
    expect(dump).not.toContain("accessToken");
    expect(dump).not.toContain("secret message body");
  });
});
