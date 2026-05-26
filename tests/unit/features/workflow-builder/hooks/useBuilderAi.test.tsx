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
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
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
