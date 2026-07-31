/**
 * WORKFLOW-LIVE-TEST-4 §3-§5 — the builder's Run Live Test journey:
 *
 *   Run Live Test → server-generated disclosure (consent screen) → EXPLICIT "Start listening" →
 *   waiting UI with countdown + cancel → captured/running/terminal states from the polled
 *   session DTO.
 *
 * Boundaries verified here:
 *   - Opening the disclosure calls ONLY prepare — start is a separate explicit click, and the
 *     nonce travels exactly once, from prepare's response to start's request.
 *   - A blocked pre-flight opens the setup summary and calls NO live-test API at all.
 *   - The waiting state always offers cancellation, and cancel renders the honest
 *     nothing-executed outcome.
 *   - A session_in_progress refusal offers the typed recovery (cancel the blocking session,
 *     then re-prepare) — never a dead end.
 *   - The UI renders ONLY DTO fields (status, safe preview, typed advisory) — it never invents
 *     progress the server didn't report.
 */

const mockPrepare = jest.fn();
const mockStart = jest.fn();
const mockStatus = jest.fn();
const mockCancel = jest.fn();
jest.mock("@/lib/api/liveTest", () => {
  const actual = jest.requireActual("@/lib/api/liveTest");
  return {
    ...actual,
    prepareLiveTest: (...a: unknown[]) => mockPrepare(...a),
    startLiveTest: (...a: unknown[]) => mockStart(...a),
    getLiveTestStatus: (...a: unknown[]) => mockStatus(...a),
    cancelLiveTest: (...a: unknown[]) => mockCancel(...a),
  };
});

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderRunControls } from "@/features/workflow-builder/layout/HeaderRunControls";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { LiveTestApiError } from "@/lib/api/liveTest";

function bootWithGmailTrigger(): void {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice.getState().addTrigger({ provider: "gmail", type: "new_email" });
}

const DISCLOSURE = {
  effects: [
    {
      nodeId: "trigger",
      provider: "gmail",
      providerLabel: "Gmail",
      operation: "New Email",
      stepName: null,
      kind: "reads" as const,
      destructive: false,
      mayBeIrreversible: false,
      requiresAttention: false,
      riskDescription: null,
    },
    {
      nodeId: "a1",
      provider: "gmail",
      providerLabel: "Gmail",
      operation: "Send Email",
      stepName: "Notify the team",
      kind: "sends" as const,
      destructive: false,
      mayBeIrreversible: true,
      requiresAttention: false,
      riskDescription: null,
    },
  ],
  internalSteps: [],
  statements: [
    "This live test calls your real connected apps and may create or change real data.",
    "The workflow stays inactive — this runs once and does not turn it on.",
  ],
  disclosureDigest: "digest-1",
};

const PREP = {
  sessionId: "sess-1",
  nonce: "nonce-secret-1",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  reused: false,
  disclosure: DISCLOSURE,
  trigger: { nodeId: "trigger", provider: "gmail", eventType: "new_email" },
};

function sessionDto(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessionId: "sess-1",
    workflowId: "wf-1",
    status: "waiting_for_trigger",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    consentedAt: new Date().toISOString(),
    triggerCapturedAt: null,
    triggerPreview: null,
    workflowRunId: null,
    failureCode: null,
    failureMessage: null,
    canCancel: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  bootWithGmailTrigger();
  useRunSlice.getState().reset();
});

describe("Run Live Test — entry + consent boundary", () => {
  it("the automated panel offers Run Live Test as its single primary testing action (LIVE-TEST-HEADER-UX-1)", () => {
    render(<HeaderRunControls />);
    expect(screen.getByTestId("run-controls-panel-automated")).toBeInTheDocument();
    expect(screen.getByTestId("run-controls-live-test-button")).toBeEnabled();
    // No competing Safe Test button and no tiny inline explanation — Safe Test's
    // unavailability lives in the attached testing-options popover.
    expect(screen.queryByTestId("run-controls-test-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("run-controls-safe-test-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("run-controls-testing-options-trigger")).toBeEnabled();
  });

  it("clicking Run Live Test prepares and shows the disclosure — it does NOT start listening", async () => {
    mockPrepare.mockResolvedValue(PREP);
    const user = userEvent.setup();
    render(<HeaderRunControls />);

    await user.click(screen.getByTestId("run-controls-live-test-button"));

    await waitFor(() => expect(screen.getByTestId("live-test-modal")).toBeInTheDocument());
    expect(mockPrepare).toHaveBeenCalledWith("wf-1");
    expect(mockStart).not.toHaveBeenCalled();

    // The server-generated effects render verbatim, irreversibility flagged.
    expect(screen.getByTestId("live-test-effect-a1")).toHaveTextContent("Send Email");
    expect(screen.getByTestId("live-test-effect-a1")).toHaveTextContent(/may not be reversible/i);
    // Every fixed consent statement is on screen.
    for (const statement of DISCLOSURE.statements) {
      expect(screen.getByTestId("live-test-disclosure-statements")).toHaveTextContent(statement);
    }
  });

  it("a blocked pre-flight opens the setup summary and calls NO live-test API", async () => {
    const onOpenValidation = jest.fn();
    const user = userEvent.setup();
    render(
      <HeaderRunControls
        preflight={{ ok: false, summary: "2 steps need setup before testing.", blocking: [] } as never}
        onOpenValidation={onOpenValidation}
      />,
    );
    await user.click(screen.getByTestId("run-controls-live-test-button"));
    expect(onOpenValidation).toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(screen.queryByTestId("live-test-modal")).not.toBeInTheDocument();
  });

  it("Start listening sends the prepare-issued nonce exactly once and shows the waiting UI", async () => {
    mockPrepare.mockResolvedValue(PREP);
    mockStart.mockResolvedValue({ session: sessionDto(), alreadyListening: false });
    const user = userEvent.setup();
    render(<HeaderRunControls />);

    await user.click(screen.getByTestId("run-controls-live-test-button"));
    await waitFor(() => screen.getByTestId("live-test-start-button"));
    await user.click(screen.getByTestId("live-test-start-button"));

    await waitFor(() => expect(screen.getByTestId("live-test-waiting")).toBeInTheDocument());
    expect(mockStart).toHaveBeenCalledWith("wf-1", "sess-1", "nonce-secret-1");
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("live-test-countdown")).toBeInTheDocument();
    expect(screen.getByTestId("live-test-cancel-button")).toBeEnabled();
  });
});

describe("Run Live Test — honest progress and cancellation", () => {
  async function enterListening(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    mockPrepare.mockResolvedValue(PREP);
    mockStart.mockResolvedValue({ session: sessionDto(), alreadyListening: false });
    await user.click(screen.getByTestId("run-controls-live-test-button"));
    await waitFor(() => screen.getByTestId("live-test-start-button"));
    await user.click(screen.getByTestId("live-test-start-button"));
    await waitFor(() => screen.getByTestId("live-test-waiting"));
  }

  it("cancelling while listening renders the honest nothing-executed outcome", async () => {
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await enterListening(user);

    mockCancel.mockResolvedValue({
      session: sessionDto({ status: "cancelled", canCancel: false }),
      alreadyCancelled: false,
    });
    await user.click(screen.getByTestId("live-test-cancel-button"));

    await waitFor(() => expect(screen.getByTestId("live-test-cancelled")).toBeInTheDocument());
    expect(mockCancel).toHaveBeenCalledWith("wf-1", "sess-1");
    expect(screen.getByTestId("live-test-cancelled")).toHaveTextContent(/nothing was executed/i);
  });

  it("a captured event renders ONLY the safe preview; the run outcome states the workflow stays inactive", async () => {
    const user = userEvent.setup();
    render(<HeaderRunControls />);

    mockPrepare.mockResolvedValue(PREP);
    mockStart.mockResolvedValue({
      session: sessionDto({
        status: "succeeded",
        canCancel: false,
        workflowRunId: "run-1",
        triggerPreview: {
          from: "sender@example.com",
          subject: "Order received",
          receivedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
      alreadyListening: false,
    });
    await user.click(screen.getByTestId("run-controls-live-test-button"));
    await waitFor(() => screen.getByTestId("live-test-start-button"));
    await user.click(screen.getByTestId("live-test-start-button"));

    await waitFor(() => expect(screen.getByTestId("live-test-succeeded")).toBeInTheDocument());
    expect(screen.getByTestId("live-test-succeeded")).toHaveTextContent(/remains inactive/i);
    expect(screen.getByTestId("live-test-preview")).toHaveTextContent("sender@example.com");
    expect(screen.getByTestId("live-test-preview")).toHaveTextContent("Order received");
    expect(screen.getByTestId("live-test-run-link")).toHaveTextContent(/live test/i);
    // The nonce never renders anywhere in the dialog.
    expect(screen.getByTestId("live-test-modal").textContent).not.toContain("nonce-secret-1");
  });

  it("session_in_progress offers the typed recovery: cancel the blocking session, then re-prepare", async () => {
    mockPrepare.mockRejectedValueOnce(
      new LiveTestApiError({
        message: "A live test for this workflow is already in progress. Cancel it first.",
        code: "session_in_progress",
        status: 409,
        sessionId: "sess-other",
      }),
    );
    const user = userEvent.setup();
    render(<HeaderRunControls />);

    await user.click(screen.getByTestId("run-controls-live-test-button"));
    await waitFor(() => expect(screen.getByTestId("live-test-error")).toBeInTheDocument());

    mockCancel.mockResolvedValue({
      session: sessionDto({ sessionId: "sess-other", status: "cancelled", canCancel: false }),
      alreadyCancelled: false,
    });
    mockPrepare.mockResolvedValue(PREP);
    await user.click(screen.getByTestId("live-test-cancel-existing"));

    await waitFor(() => expect(screen.getByTestId("live-test-start-button")).toBeInTheDocument());
    expect(mockCancel).toHaveBeenCalledWith("wf-1", "sess-other");
    expect(mockPrepare).toHaveBeenCalledTimes(2);
  });

  it("a typed usage-limit advisory renders actionable copy without failing the session", async () => {
    // Fake timers from the start so the polling interval is scheduled on the fake clock.
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HeaderRunControls />);

      mockPrepare.mockResolvedValue(PREP);
      mockStart.mockResolvedValue({
        session: sessionDto({ status: "trigger_received" }),
        alreadyListening: false,
      });
      await user.click(screen.getByTestId("run-controls-live-test-button"));
      await waitFor(() => screen.getByTestId("live-test-start-button"));
      await user.click(screen.getByTestId("live-test-start-button"));
      await waitFor(() => screen.getByTestId("live-test-captured"));

      // The next poll reports the typed advisory alongside the honest status.
      mockStatus.mockResolvedValue({
        session: sessionDto({ status: "trigger_received" }),
        advisory: "usage_limit_reached",
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4100);
      });
      expect(screen.getByTestId("live-test-advisory")).toHaveTextContent(/task limit/i);
      expect(screen.getByTestId("live-test-captured")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
