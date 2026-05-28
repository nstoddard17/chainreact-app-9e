/**
 * @jest-environment jsdom
 *
 * Slice 4.AI-35B — useBuilderAi deterministic-first follow-up.
 *
 * Pins the cost win + the Slack-DM-edit fix at the hook layer:
 *   - a pure structured-answer follow-up whose answers map to known config
 *     fields calls `completePlan` (NO model) and NOT `planWorkflow`.
 *   - a `NEEDS_REPLAN` signal from `completePlan` falls back to `planWorkflow`.
 *   - a `provider_choice` follow-up skips `completePlan` and re-plans directly.
 */
import { act, renderHook } from "@testing-library/react";

const mockPlan = jest.fn();
const mockComplete = jest.fn();
const mockApply = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
  completePlan: (...a: unknown[]) => mockComplete(...a),
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  AiApiError: class AiApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AiApiError";
      this.status = status;
    }
  },
}));

import { useBuilderAi } from "@/features/workflow-builder/hooks/useBuilderAi";
import type { RequiredInputAnswer } from "@/features/workflow-builder/ai";

const preview = {
  ok: true,
  riskLevel: "low",
  requiresConfirmation: false,
  affectedNodeIds: ["n1"],
  affectedEdgeIds: [],
  changes: [],
  validation: { ok: true, errors: [], warnings: [] },
  taskCostEstimate: { estimatedTasksPerRun: 1 },
};
const model = { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" };

const needsConfig = {
  ok: true,
  intentSummary: "Add a Slack post",
  assumptions: [],
  requiredUserInput: [
    { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    { label: "Text", kind: "config_value", nodeId: "n1", field: "text", fieldType: "textarea", allowFreeText: true },
  ],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p1", operations: [] },
  preview,
  canApplyLater: false,
  model,
};

const completedReady = { ...needsConfig, requiredUserInput: [], canApplyLater: true };

function ans(nodeId: string, field: string, value: string, fieldLabel: string): RequiredInputAnswer {
  return {
    key: `${nodeId}::${field}`,
    display: value,
    value,
    descriptor: { label: fieldLabel, kind: "config_value", nodeId, field },
  };
}

const currentGraph = {
  nodes: [{ id: "n1", kind: "action" as const, provider: "slack", type: "send_channel_message" }],
  edges: [],
};

beforeEach(() => {
  mockPlan.mockReset();
  mockComplete.mockReset();
  mockApply.mockReset();
});

it("a structured-answer follow-up completes deterministically (completePlan, NOT planWorkflow)", async () => {
  mockPlan.mockResolvedValueOnce(needsConfig); // initial plan only
  mockComplete.mockResolvedValueOnce(completedReady);
  const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));

  await act(async () => {
    await result.current.plan("Post to Slack on new email", undefined, { currentGraph });
  });
  await act(async () => {
    await result.current.submitFollowUp(
      { structuredAnswers: [ans("n1", "channel", "C123", "Channel"), ans("n1", "text", "hi", "Text")] },
      undefined,
      { currentGraph },
    );
  });

  expect(mockComplete).toHaveBeenCalledTimes(1);
  expect(mockPlan).toHaveBeenCalledTimes(1); // ← the follow-up did NOT call the model planner
  expect(result.current.planResult).toEqual(completedReady);
  expect(result.current.followUpMode).toBe(false); // chain complete

  // The deterministic call forwarded the answers + the pending patch.
  const [, body] = mockComplete.mock.calls[0]!;
  expect((body as { answers: unknown[] }).answers).toEqual([
    { nodeId: "n1", field: "channel", value: "C123" },
    { nodeId: "n1", field: "text", value: "hi" },
  ]);
});

it("falls back to the model planner when completePlan returns NEEDS_REPLAN", async () => {
  mockPlan.mockResolvedValueOnce(needsConfig); // initial
  mockComplete.mockResolvedValueOnce({ ok: false, code: "NEEDS_REPLAN", reason: "preview_rejected" });
  mockPlan.mockResolvedValueOnce(completedReady); // fallback re-plan
  const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));

  await act(async () => {
    await result.current.plan("Post to Slack", undefined, { currentGraph });
  });
  await act(async () => {
    await result.current.submitFollowUp(
      { structuredAnswers: [ans("n1", "channel", "C123", "Channel"), ans("n1", "text", "hi", "Text")] },
      undefined,
      { currentGraph },
    );
  });

  expect(mockComplete).toHaveBeenCalledTimes(1);
  expect(mockPlan).toHaveBeenCalledTimes(2); // initial + fallback re-plan
  expect(result.current.planResult).toEqual(completedReady);
});

it("a provider_choice follow-up skips deterministic completion and re-plans directly", async () => {
  const needsChoice = {
    ...needsConfig,
    requiredUserInput: [
      { label: "Which email app?", kind: "provider_choice", category: "email", options: [{ label: "Gmail", value: "gmail" }] },
    ],
    proposedPatch: undefined, // ambiguous → null patch
  };
  mockPlan.mockResolvedValueOnce(needsChoice); // initial
  mockPlan.mockResolvedValueOnce(completedReady); // re-plan after choice
  const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));

  await act(async () => {
    await result.current.plan("When I get an email send a Slack message", undefined, { currentGraph });
  });
  await act(async () => {
    await result.current.submitFollowUp(
      {
        structuredAnswers: [
          { key: "label::Which email app?", display: "Gmail", value: "gmail", descriptor: { label: "Which email app?", kind: "provider_choice", category: "email" } },
        ],
      },
      undefined,
      { currentGraph },
    );
  });

  expect(mockComplete).not.toHaveBeenCalled();
  expect(mockPlan).toHaveBeenCalledTimes(2); // initial + model re-plan
});
