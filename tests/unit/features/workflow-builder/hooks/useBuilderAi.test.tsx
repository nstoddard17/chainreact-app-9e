/**
 * Tests for features/workflow-builder/hooks/useBuilderAi.ts (Slice 4.AI-21).
 *
 * Pins the session-local follow-up chain semantics introduced in AI-21:
 *
 *   - A fresh `plan()` clears any prior chain state (no leaking between
 *     unrelated prompts).
 *   - A plan response with `requiredUserInput.length > 0` starts a chain
 *     (`followUpMode === true`).
 *   - `submitFollowUp(answer)` reconstructs the planner prompt
 *     (`composeFollowUpPrompt`) from the original prompt + asked labels +
 *     prior answers + this answer, sends it to `planWorkflow`, and either
 *     extends or completes the chain based on the next response.
 *   - Transport failures during a follow-up leave the chain intact so the
 *     user can retry.
 *   - `reset()` clears the chain.
 *   - The reconstructed planner prompt does NOT contain raw patch / config
 *     values — only the original prompt, the labels, the prior answers, the
 *     new answer.
 *
 * Tests mock the `lib/api/ai` client (no fetch, no network).
 */
import { act, renderHook, waitFor } from "@testing-library/react";

const mockPlan = jest.fn();
const mockApply = jest.fn();
// AI-35I — `completePlan` is mocked so the deterministic-vs-correction tests can
// assert which route a follow-up took (existing free-text tests never reach it).
const mockComplete = jest.fn();
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

// Pre-built planner responses
const needsInputResponse = {
  ok: true,
  intentSummary: "Add a Slack post",
  assumptions: [],
  requiredUserInput: [
    { label: "Which Slack channel should the message be sent to?", kind: "config_value" },
    { label: "What should the message say?", kind: "config_value" },
  ],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p1", operations: [], summary: "needs info" },
  preview: {
    ok: true,
    riskLevel: "low",
    requiresConfirmation: false,
    affectedNodeIds: [],
    affectedEdgeIds: [],
    changes: [],
    validation: { ok: true, errors: [], warnings: [] },
    taskCostEstimate: { estimatedTasksPerRun: 1 },
  },
  canApplyLater: false, // service gate — required input outstanding
  blockedReason: "More information is still needed — answer the questions above and run Plan with AI again.",
  model: { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" },
};

const applyReadyResponse = {
  ...needsInputResponse,
  requiredUserInput: [],
  canApplyLater: true,
  blockedReason: undefined,
};

const stillNeedsMessage = {
  ...needsInputResponse,
  requiredUserInput: [
    { label: "What should the message say?", kind: "config_value" },
  ],
};

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockComplete.mockReset();
});

describe("useBuilderAi — follow-up chain (AI-21)", () => {
  it("starts in followUpMode=false and stays there for a fresh apply-ready plan", async () => {
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    expect(result.current.followUpMode).toBe(false);
    await act(async () => {
      await result.current.plan("Send a Slack message to #general saying hi");
    });
    expect(result.current.followUpMode).toBe(false);
    expect(result.current.planResult).toEqual(applyReadyResponse);
  });

  it("flips followUpMode=true after a plan response with unresolved required input", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("Send a Slack message when I run.");
    });
    expect(result.current.followUpMode).toBe(true);
  });

  it("submitFollowUp sends the original prompt + asked labels + user answer to planWorkflow", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse); // turn 1
    mockPlan.mockResolvedValueOnce(applyReadyResponse); // turn 2 — completes chain
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("Create a workflow that sends a Slack message when I manually run it.");
    });
    await act(async () => {
      await result.current.submitFollowUp("Use #general and say Test from ChainReact AI.");
    });
    expect(mockPlan).toHaveBeenCalledTimes(2);
    const [, secondCallBody] = mockPlan.mock.calls[1]!;
    const reconstructed = (secondCallBody as { prompt: string }).prompt;
    expect(reconstructed).toContain("Original request:");
    expect(reconstructed).toContain("Create a workflow that sends a Slack message when I manually run it.");
    expect(reconstructed).toContain("The agent asked for:");
    expect(reconstructed).toContain("- Which Slack channel should the message be sent to?");
    expect(reconstructed).toContain("- What should the message say?");
    expect(reconstructed).toContain("User follow-up:");
    expect(reconstructed).toContain("Use #general and say Test from ChainReact AI.");
  });

  it("completes the chain (followUpMode=false) when the follow-up response has no unresolved required input", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("initial");
    });
    expect(result.current.followUpMode).toBe(true);
    await act(async () => {
      await result.current.submitFollowUp("done");
    });
    expect(result.current.followUpMode).toBe(false);
    expect(result.current.planResult).toEqual(applyReadyResponse);
  });

  it("extends the chain on a follow-up that still leaves required input unresolved; the next reconstructed prompt cites prior answers", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse); // turn 1 — asks 2 questions
    mockPlan.mockResolvedValueOnce(stillNeedsMessage); // turn 2 — answered channel, still need message
    mockPlan.mockResolvedValueOnce(applyReadyResponse); // turn 3 — complete
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("original prompt");
    });
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // After turn 2, chain still active (one question left)
    expect(result.current.followUpMode).toBe(true);
    await act(async () => {
      await result.current.submitFollowUp("Say 'hi'");
    });
    // After turn 3, chain complete
    expect(result.current.followUpMode).toBe(false);
    // Validate turn 3 reconstructed prompt cited turn 2's answer
    const [, thirdCallBody] = mockPlan.mock.calls[2]!;
    const thirdPrompt = (thirdCallBody as { prompt: string }).prompt;
    expect(thirdPrompt).toContain("Previous follow-up answers:");
    expect(thirdPrompt).toContain("- Use #general");
    expect(thirdPrompt).toContain("User follow-up:");
    expect(thirdPrompt).toContain("Say 'hi'");
  });

  it("submitFollowUp is a no-op when there is no chain in progress", async () => {
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.submitFollowUp("nothing to answer yet");
    });
    expect(mockPlan).not.toHaveBeenCalled();
    expect(result.current.followUpMode).toBe(false);
  });

  it("submitFollowUp is a no-op when answer is empty after trim", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("initial");
    });
    expect(result.current.followUpMode).toBe(true);
    await act(async () => {
      await result.current.submitFollowUp("   ");
    });
    // No second plan call — empty answer is rejected.
    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(result.current.followUpMode).toBe(true);
  });

  it("a fresh plan() clears any prior chain (no leaking between unrelated prompts)", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("first prompt");
    });
    expect(result.current.followUpMode).toBe(true);
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    await act(async () => {
      await result.current.plan("totally different prompt");
    });
    expect(result.current.followUpMode).toBe(false);
    // The second call must NOT be a reconstructed prompt — it's the fresh prompt as-is.
    const [, secondBody] = mockPlan.mock.calls[1]!;
    expect((secondBody as { prompt: string }).prompt).toBe("totally different prompt");
    expect((secondBody as { prompt: string }).prompt).not.toContain("Original request:");
  });

  it("reset() clears the chain", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("a");
    });
    expect(result.current.followUpMode).toBe(true);
    act(() => result.current.reset());
    expect(result.current.followUpMode).toBe(false);
    expect(result.current.planResult).toBeNull();
  });

  it("preserves the chain when submitFollowUp's network call fails (user can retry)", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("initial");
    });
    expect(result.current.followUpMode).toBe(true);

    mockPlan.mockRejectedValueOnce(new Error("network gone"));
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // The chain should still be active so the user can retry without re-typing the original prompt.
    expect(result.current.followUpMode).toBe(true);
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });

  it("plan() returns the AiPlanResult on success (AI-21B chat-layout requirement)", async () => {
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    let captured: unknown = undefined;
    await act(async () => {
      captured = await result.current.plan("send a slack dm");
    });
    expect(captured).toEqual(applyReadyResponse);
  });

  it("plan() returns null on a transport-layer rejection (AI-21B chat-layout requirement)", async () => {
    mockPlan.mockRejectedValueOnce(new Error("network gone"));
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    let captured: unknown = "unset";
    await act(async () => {
      captured = await result.current.plan("send a slack dm");
    });
    expect(captured).toBeNull();
  });

  it("submitFollowUp() returns the AiPlanResult on success and null on transport failure", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("send a slack dm");
    });
    let captured: unknown = "unset";
    await act(async () => {
      captured = await result.current.submitFollowUp("use #general and say hi");
    });
    expect(captured).toEqual(applyReadyResponse);

    // Retry with a transport failure on the next round.
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    mockPlan.mockRejectedValueOnce(new Error("network gone"));
    const { result: result2 } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result2.current.plan("send a slack dm");
    });
    let captured2: unknown = "unset";
    await act(async () => {
      captured2 = await result2.current.submitFollowUp("use #general");
    });
    expect(captured2).toBeNull();
  });

  it("submitFollowUp() returns null when called with no chain in progress (AI-21B chat-layout requirement)", async () => {
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    let captured: unknown = "unset";
    await act(async () => {
      captured = await result.current.submitFollowUp("anything");
    });
    expect(captured).toBeNull();
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("does not include raw patch / config in the reconstructed prompt", async () => {
    // The planner response carries a proposedPatch with config — the hook
    // must NOT echo it into the reconstructed prompt. Only labels +
    // original prompt + user answer are passed through.
    const responseWithLeakyConfig = {
      ...needsInputResponse,
      proposedPatch: {
        patchId: "p1",
        operations: [
          {
            op: "addNode",
            node: { id: "n1", config: { accessToken: "ya29.LEAKED-SECRET" } },
          },
        ],
        summary: "x",
      },
    };
    mockPlan.mockResolvedValueOnce(responseWithLeakyConfig);
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("send a slack message");
    });
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    const [, secondBody] = mockPlan.mock.calls[1]!;
    const reconstructed = (secondBody as { prompt: string }).prompt;
    expect(reconstructed).not.toContain("accessToken");
    expect(reconstructed).not.toContain("ya29.LEAKED-SECRET");
    expect(reconstructed).not.toContain("operations");
    expect(reconstructed).not.toContain("patchId");
  });
});

// ─── Slice 4.AI-24 — currentGraph snapshot pass-through ──────────────────────

describe("useBuilderAi — currentGraph (AI-24)", () => {
  const sampleSnapshot = {
    nodes: [
      {
        id: "trig-1",
        kind: "trigger" as const,
        provider: "gmail",
        type: "new_email",
      },
    ],
    edges: [],
  };

  it("forwards currentGraph to planWorkflow on plan()", async () => {
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("Send a Slack message when I get an email", undefined, {
        currentGraph: sampleSnapshot,
      });
    });
    expect(mockPlan).toHaveBeenCalledWith("wf-1", {
      prompt: "Send a Slack message when I get an email",
      currentGraph: sampleSnapshot,
      // AI-35D — plan() tags the request as the user's first prompt.
      interactionKind: "initial_plan",
    });
  });

  it("omits currentGraph from the body when the caller doesn't supply it", async () => {
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("Just a prompt");
    });
    const [, body] = mockPlan.mock.calls[0]!;
    // AI-35D — interactionKind is always present (observability); currentGraph
    // is still omitted when the caller doesn't supply it.
    expect(body).toEqual({ prompt: "Just a prompt", interactionKind: "initial_plan" });
    expect(body).not.toHaveProperty("currentGraph");
  });

  it("forwards currentGraph to planWorkflow on submitFollowUp()", async () => {
    // Start a chain so submitFollowUp's guards pass.
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    await act(async () => {
      await result.current.plan("first prompt");
    });
    // The follow-up call sends the canvas snapshot too.
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    await act(async () => {
      await result.current.submitFollowUp("Use #general", undefined, {
        currentGraph: sampleSnapshot,
      });
    });
    const [, followUpBody] = mockPlan.mock.calls[1]!;
    expect(followUpBody).toMatchObject({ currentGraph: sampleSnapshot });
  });

  it("forwards an EMPTY-canvas snapshot verbatim (does not omit)", async () => {
    mockPlan.mockResolvedValueOnce(applyReadyResponse);
    const { result } = renderHook(() =>
      useBuilderAi({ workflowId: "wf-1" }),
    );
    const empty = { nodes: [], edges: [] };
    await act(async () => {
      await result.current.plan("Build me a workflow", undefined, {
        currentGraph: empty,
      });
    });
    expect(mockPlan).toHaveBeenCalledWith("wf-1", {
      prompt: "Build me a workflow",
      currentGraph: empty,
      interactionKind: "initial_plan",
    });
  });
});

// ─── Slice 4.AI-25 — preserve follow-up chain on retryable failures ──────────

describe("useBuilderAi — preserve chain on retryable follow-up failures (AI-25)", () => {
  const rateLimitedFailure = {
    ok: false as const,
    code: "MODEL_FAILED",
    message: "The model did not return a plan (RATE_LIMITED).",
    errors: [
      { stage: "model", code: "RATE_LIMITED", message: "rate limited" },
    ],
    model: {
      modelId: "claude-sonnet-4-6",
      tier: "strong" as const,
      feature: "creation" as const,
      finishReason: "stop" as const,
    },
  };

  const parseFailedFailure = {
    ok: false as const,
    code: "PARSE_FAILED",
    message: "The model response could not be parsed into a valid plan.",
    errors: [{ stage: "parse", code: "NOT_JSON", message: "bad json" }],
    model: {
      modelId: "claude-sonnet-4-6",
      tier: "strong" as const,
      feature: "creation" as const,
      finishReason: "stop" as const,
    },
  };

  it("submitFollowUp RATE_LIMITED returns null and preserves followUpMode", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send a Slack message when I get an email");
    });
    expect(result.current.followUpMode).toBe(true);

    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    let captured: unknown = "unset";
    await act(async () => {
      captured = await result.current.submitFollowUp("Use #general");
    });
    // Hook signals retryable failure with null (panel restores composer +
    // staged answers + appends an error bubble).
    expect(captured).toBeNull();
    // Chain still active so the user can retry.
    expect(result.current.followUpMode).toBe(true);
  });

  it("submitFollowUp RATE_LIMITED preserves planResult (the prior needs-input plan stays the active turn)", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send a Slack message when I get an email");
    });
    const planBefore = result.current.planResult;
    expect(planBefore?.ok).toBe(true);

    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // planResult is NOT overwritten with the failure — the prior needs-input
    // plan stays in state so the chat's latest plan_result bubble (with
    // its controls) keeps rendering and apply gating stays correct.
    expect(result.current.planResult).toBe(planBefore);
    if (result.current.planResult?.ok) {
      expect(result.current.planResult.requiredUserInput.length).toBeGreaterThan(0);
    }
  });

  it("submitFollowUp PARSE_FAILED (also retryable) preserves chain + planResult", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("first");
    });
    const planBefore = result.current.planResult;

    mockPlan.mockResolvedValueOnce(parseFailedFailure);
    let captured: unknown = "unset";
    await act(async () => {
      captured = await result.current.submitFollowUp("Use #general");
    });
    expect(captured).toBeNull();
    expect(result.current.followUpMode).toBe(true);
    expect(result.current.planResult).toBe(planBefore);
  });

  it("RATE_LIMITED does NOT add the failed turn to priorFollowUpAnswers (no contamination on retry)", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse); // turn 1
    mockPlan.mockResolvedValueOnce(rateLimitedFailure); // turn 2 rate-limited
    mockPlan.mockResolvedValueOnce(applyReadyResponse); // turn 2 retry succeeds
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("original prompt");
    });
    // First follow-up attempt — rate limited.
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // Second follow-up attempt — same answer, succeeds.
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // The successful turn's reconstructed prompt must NOT contain a stale
    // "Previous follow-up answers" line citing the rate-limited turn —
    // that turn never made it into the chain history.
    const [, thirdCallBody] = mockPlan.mock.calls[2]!;
    const thirdPrompt = (thirdCallBody as { prompt: string }).prompt;
    expect(thirdPrompt).not.toContain("Previous follow-up answers:");
    expect(thirdPrompt).toContain("Original request:");
    expect(thirdPrompt).toContain("Use #general");
  });

  it("a successful follow-up AFTER a RATE_LIMITED retry completes the chain when requiredUserInput resolves", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse); // initial
    mockPlan.mockResolvedValueOnce(rateLimitedFailure); // rate-limited follow-up
    mockPlan.mockResolvedValueOnce(applyReadyResponse); // successful retry
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("first");
    });
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // Still in chain after rate-limited turn.
    expect(result.current.followUpMode).toBe(true);
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    // Apply-ready plan with no required input → chain genuinely complete.
    expect(result.current.followUpMode).toBe(false);
    expect(result.current.planResult?.ok).toBe(true);
  });

  it("reset() after a RATE_LIMITED retry clears all preserved chain state", async () => {
    mockPlan.mockResolvedValueOnce(needsInputResponse);
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("first");
    });
    await act(async () => {
      await result.current.submitFollowUp("Use #general");
    });
    expect(result.current.followUpMode).toBe(true);
    act(() => result.current.reset());
    expect(result.current.followUpMode).toBe(false);
    expect(result.current.planResult).toBeNull();
  });
});

// ─── Slice 4.AI-35I — follow-up intent-correction reconciliation ─────────────

describe("useBuilderAi — intent-correction follow-ups (AI-35I)", () => {
  // A Slack DM plan still asking who should receive it (the stale-intent setup).
  const dmNeedsUser = {
    ...needsInputResponse,
    intentSummary: "Send a Slack direct message when the workflow is run manually.",
    assumptions: ["Using a Slack direct message."],
    requiredUserInput: [
      { label: "Which Slack user should receive the DM?", kind: "config_value", nodeId: "n1", field: "userId", fieldType: "text" },
    ],
    proposedPatch: {
      patchId: "p-dm",
      operations: [
        { op: "addNode", node: { id: "n1", kind: "action", provider: "slack", type: "send_direct_message", config: { text: "Hey" } } },
      ],
      summary: "dm",
    },
  };

  // What the (mocked) planner returns after the correction: a channel message.
  const channelReplan = {
    ...needsInputResponse,
    intentSummary: "Send a Slack channel message when the workflow is run manually.",
    assumptions: ["Using a Slack channel message."],
    requiredUserInput: [
      { label: "Which Slack channel should receive the message?", kind: "config_value", nodeId: "n2", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    ],
    proposedPatch: { patchId: "p-ch", operations: [], summary: "channel" },
  };

  // A single-text-field plan that is eligible for deterministic completion.
  const messageNeedsText = {
    ...needsInputResponse,
    intentSummary: "Send a Slack message",
    requiredUserInput: [
      { label: "What should the message say?", kind: "config_value", nodeId: "n1", field: "text", fieldType: "textarea", allowFreeText: true },
    ],
  };
  const messageCompleted = { ...messageNeedsText, requiredUserInput: [], canApplyLater: true };

  function ans(nodeId: string, field: string, value: string, fieldLabel: string): RequiredInputAnswer {
    return { key: `${nodeId}::${field}`, display: value, value, descriptor: { label: fieldLabel, kind: "config_value", nodeId, field } };
  }

  it("(1) DM→channel correction skips deterministic completion and re-plans with override context", async () => {
    mockPlan.mockResolvedValueOnce(dmNeedsUser); // initial
    mockPlan.mockResolvedValueOnce(channelReplan); // correction re-plan
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a Slack DM when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "This is to a channel" });
    });

    // Deterministic completion was NOT attempted; the planner re-ran.
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(2);
    const [, body] = mockPlan.mock.calls[1]!;
    const reconstructed = (body as { prompt: string }).prompt;
    expect(reconstructed).toContain("Correction:");
    expect(reconstructed).toContain("The user's latest message is authoritative.");
    expect((body as { interactionKind: string }).interactionKind).toBe("follow_up");

    // Active plan replaced — no userId question remains; channel is asked.
    expect(result.current.planResult).toEqual(channelReplan);
    if (result.current.planResult?.ok) {
      expect(result.current.planResult.requiredUserInput.every((r) => r.field !== "userId")).toBe(true);
      expect(result.current.planResult.requiredUserInput.some((r) => /channel/i.test(r.label))).toBe(true);
    }
  });

  it("(2) 'I said this is to a channel' discards the stale DM userId input and re-plans", async () => {
    mockPlan.mockResolvedValueOnce(dmNeedsUser);
    mockPlan.mockResolvedValueOnce(channelReplan);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a Slack DM when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "I said this is to a channel" });
    });
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(2);
    const [, body] = mockPlan.mock.calls[1]!;
    expect((body as { prompt: string }).prompt).toContain("Correction:");
    // The stale DM question is gone — replaced, not merged.
    if (result.current.planResult?.ok) {
      expect(result.current.planResult.requiredUserInput.some((r) => /user/i.test(r.label))).toBe(false);
    }
  });

  it("(3) a plain field answer (no free text, no correction) still completes deterministically — no model call", async () => {
    mockPlan.mockResolvedValueOnce(messageNeedsText); // initial only
    mockComplete.mockResolvedValueOnce(messageCompleted);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send a Slack message when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ structuredAnswers: [ans("n1", "text", "Hey", "Message")] });
    });
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockPlan).toHaveBeenCalledTimes(1); // the follow-up did NOT call the model planner
    expect(result.current.planResult).toEqual(messageCompleted);
  });

  it("(4) a provider correction ('No, use Outlook') skips deterministic completion and re-plans", async () => {
    mockPlan.mockResolvedValueOnce(dmNeedsUser);
    mockPlan.mockResolvedValueOnce(channelReplan);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me an email when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "No, use Outlook" });
    });
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(2);
    const [, body] = mockPlan.mock.calls[1]!;
    const reconstructed = (body as { prompt: string }).prompt;
    expect(reconstructed).toContain("Correction:");
    expect(reconstructed).toContain("No, use Outlook");
  });

  it("(5) an action correction ('Actually send an email instead') re-plans, not deterministic", async () => {
    mockPlan.mockResolvedValueOnce(dmNeedsUser);
    mockPlan.mockResolvedValueOnce(channelReplan);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a Slack message when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "Actually send an email instead" });
    });
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(2);
    expect((mockPlan.mock.calls[1]![1] as { prompt: string }).prompt).toContain("Correction:");
  });

  it("(6) a later correction overrides a prior follow-up answer (latest wins over 'DM me')", async () => {
    mockPlan.mockResolvedValueOnce(dmNeedsUser); // turn 1
    mockPlan.mockResolvedValueOnce(dmNeedsUser); // turn 2: "DM me" still needs input
    mockPlan.mockResolvedValueOnce(channelReplan); // turn 3: correction
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a message when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "DM me" });
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "Actually send to channel" });
    });
    expect(mockPlan).toHaveBeenCalledTimes(3);
    const reconstructed = (mockPlan.mock.calls[2]![1] as { prompt: string }).prompt;
    // Prior answer is still cited as context, but the latest message is authoritative.
    expect(reconstructed).toContain("Previous follow-up answers:");
    expect(reconstructed).toContain("- DM me");
    expect(reconstructed).toContain("Actually send to channel");
    expect(reconstructed).toContain("Correction:");
    expect(reconstructed).toContain("The user's latest message is authoritative.");
  });

  it("(7) a correction follow-up never mutates the graph (no apply before an explicit Apply)", async () => {
    mockPlan.mockResolvedValueOnce(dmNeedsUser);
    mockPlan.mockResolvedValueOnce(channelReplan);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a Slack DM when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "This is to a channel" });
    });
    expect(mockApply).not.toHaveBeenCalled();
  });
});

// ─── Slice 4.AI-35J — preserve compatible answers across intent corrections ──

describe("useBuilderAi — preserve compatible answers across corrections (AI-35J)", () => {
  // A DM plan asking BOTH the message text AND the recipient — so answering the
  // message leaves the chain OPEN (and the answer lands in priorFollowUpAnswers).
  const dmAsksMessageAndUser = {
    ...needsInputResponse,
    intentSummary: "Send a Slack direct message when the workflow is run manually.",
    requiredUserInput: [
      { label: "What should the Slack direct message say?", kind: "config_value", nodeId: "n1", field: "text", fieldType: "textarea" },
      { label: "Which Slack user should receive the DM?", kind: "config_value", nodeId: "n1", field: "userId", fieldType: "text" },
    ],
    proposedPatch: {
      patchId: "p-dm",
      operations: [{ op: "addNode", node: { id: "n1", kind: "action", provider: "slack", type: "send_direct_message", config: {} } }],
      summary: "dm",
    },
  };
  // After answering the message, the DM plan still needs the recipient → chain
  // stays open; the message answer is now in priorFollowUpAnswers.
  const dmStillAsksUser = {
    ...dmAsksMessageAndUser,
    requiredUserInput: [
      { label: "Which Slack user should receive the DM?", kind: "config_value", nodeId: "n1", field: "userId", fieldType: "text" },
    ],
  };
  // The (mocked) correction re-plan: a channel message that reuses the message
  // and only needs the channel.
  const channelReplanReusingMessage = {
    ...needsInputResponse,
    intentSummary: "Send a Slack channel message when the workflow is run manually.",
    requiredUserInput: [
      { label: "Which Slack channel should receive the message?", kind: "config_value", nodeId: "n2", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    ],
    proposedPatch: { patchId: "p-ch", operations: [], summary: "channel" },
  };

  function ans(nodeId: string, field: string, value: string, fieldLabel: string): RequiredInputAnswer {
    return { key: `${nodeId}::${field}`, display: value, value, descriptor: { label: fieldLabel, kind: "config_value", nodeId, field } };
  }

  it("DM→channel correction preserves the already-supplied message text in the re-plan prompt", async () => {
    mockPlan.mockResolvedValueOnce(dmAsksMessageAndUser); // turn 1
    mockPlan.mockResolvedValueOnce(dmStillAsksUser); // turn 2: "hey" fills message, still needs user
    mockPlan.mockResolvedValueOnce(channelReplanReusingMessage); // turn 3: correction
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a Slack DM when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "hey" }); // message text
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "this is to a channel" }); // correction
    });

    // The correction did NOT complete deterministically — it re-planned.
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(3);
    const reconstructed = (mockPlan.mock.calls[2]![1] as { prompt: string }).prompt;
    // The prior message answer survives AND the planner is told to preserve it.
    expect(reconstructed).toContain("- hey");
    expect(reconstructed).toContain("PRESERVE earlier user-provided values that still apply");
    expect(reconstructed).toContain("Correction:");
    // And the incompatible-destination guard is present (userId must not become a channel).
    expect(reconstructed).toContain("destination details when the destination type is unchanged");
    expect(result.current.planResult).toEqual(channelReplanReusingMessage);
  });

  it("provider correction ('No, use Outlook') preserves the downstream message text in the re-plan prompt", async () => {
    mockPlan.mockResolvedValueOnce(dmAsksMessageAndUser); // turn 1
    mockPlan.mockResolvedValueOnce(dmStillAsksUser); // turn 2: message answered
    mockPlan.mockResolvedValueOnce(channelReplanReusingMessage); // turn 3: correction
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("When I get a Gmail email send a message saying notify the team");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "notify the team" });
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "No, use Outlook" });
    });
    const reconstructed = (mockPlan.mock.calls[2]![1] as { prompt: string }).prompt;
    expect(reconstructed).toContain("- notify the team");
    expect(reconstructed).toContain("PRESERVE earlier user-provided values that still apply");
    expect(reconstructed).toContain("Correction:");
  });

  it("a plain field fill (no correction) still completes deterministically — no model call (unchanged by AI-35J)", async () => {
    const messageOnly = {
      ...needsInputResponse,
      requiredUserInput: [
        { label: "What should the message say?", kind: "config_value", nodeId: "n1", field: "text", fieldType: "textarea", allowFreeText: true },
      ],
    };
    const completed = { ...messageOnly, requiredUserInput: [], canApplyLater: true };
    mockPlan.mockResolvedValueOnce(messageOnly);
    mockComplete.mockResolvedValueOnce(completed);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send a Slack message when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ structuredAnswers: [ans("n1", "text", "hey", "Message")] });
    });
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockPlan).toHaveBeenCalledTimes(1);
  });

  it("a correction re-plan goes through the standard planWorkflow path only (no completePlan, no apply, no routing change)", async () => {
    mockPlan.mockResolvedValueOnce(dmAsksMessageAndUser);
    mockPlan.mockResolvedValueOnce(channelReplanReusingMessage);
    const { result } = renderHook(() => useBuilderAi({ workflowId: "wf-1" }));
    await act(async () => {
      await result.current.plan("Send me a Slack DM when I manually run this workflow");
    });
    await act(async () => {
      await result.current.submitFollowUp({ freeText: "this is to a channel" });
    });
    // Only the standard planner route is exercised — AI-35J adds NO routing path.
    // (OpenAI-vs-Anthropic selection lives behind /ai/plan per AI-36 and is
    // untouched here; the hook never picks a model client.)
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(2);
  });
});
