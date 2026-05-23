/**
 * Tests for features/workflow-builder/panels/RunNowPanel —
 * Slice 3.3 + Slice 3.POSTSEC-5 + Slice 3.POSTSEC-6.
 *
 * The panel only renders when the workflow has a `native:manual.run`
 * trigger. After POSTSEC-6 it exposes two explicit actions:
 *   - "Test Run" → runNowWorkflow(id, inputs, { testMode: true })
 *   - "Run Live" → runNowWorkflow(id, inputs, { testMode: false })
 *
 * Behavior boundaries verified here:
 *   - Test Run NEVER opens the destructive-action confirmation modal,
 *     even on workflows that would normally require confirmation
 *     (SEC-2 already blocks the destructive provider calls before the
 *     SEC-4B gate would fire).
 *   - Live Run opens the modal on 409 and retries with
 *     `testMode: false` + `confirmationText` — never silently promotes
 *     to a test run mid-flow.
 *   - Inputs are not polluted with `testMode` / `confirmationText`;
 *     those stay at the envelope (third-arg options) layer.
 *   - Each button has its own busy label; clicking either disables
 *     both to prevent double-fire.
 *   - The panel does NOT call updateWorkflow — Run Now is execution
 *     against the *saved* workflow, distinct from modal Save and
 *     toolbar Save (the Slice 3.2 boundary).
 */

const mockRunNowWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    runNowWorkflow: (...args: unknown[]) => mockRunNowWorkflow(...args),
  };
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunNowPanel } from "@/features/workflow-builder/panels/RunNowPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import {
  WorkflowApiError,
  WorkflowConfirmationRequiredError,
} from "@/lib/api/workflows";

function bootWithManualTrigger(): void {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice
    .getState()
    .addTrigger({ provider: "native", type: "manual.run" });
}

beforeEach(() => {
  mockRunNowWorkflow.mockReset();
  useGraphSlice.getState().reset();
});

describe("RunNowPanel — visibility", () => {
  it("renders nothing when the workflow has no trigger", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const { container } = render(<RunNowPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the trigger is not native:manual.run", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice
      .getState()
      .addTrigger({ provider: "native", type: "schedule.fired" });
    const { container } = render(<RunNowPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the trigger is a provider trigger (not native)", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack", type: "message_received" });
    const { container } = render(<RunNowPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the slice has not been hydrated yet (no workflowId)", () => {
    // No hydrate() call → workflowId is null, even if a trigger were
    // somehow present. Defensive check.
    const { container } = render(<RunNowPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders both Test Run and Run Live buttons when a manual trigger is present", () => {
    bootWithManualTrigger();
    render(<RunNowPanel />);
    expect(
      screen.getByRole("region", { name: /manual run/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("run-now-test-button")).toBeEnabled();
    expect(screen.getByTestId("run-now-live-button")).toBeEnabled();
  });

  it("renders the explanatory copy distinguishing Test Run and Run Live", () => {
    bootWithManualTrigger();
    render(<RunNowPanel />);
    // Test Run copy emphasises safety.
    expect(
      screen.getByText(/runs safely without calling connected provider apis/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/external actions are skipped/i)).toBeInTheDocument();
    // Live Run copy emphasises real execution.
    expect(
      screen.getByText(/runs for real and may call connected apps/i),
    ).toBeInTheDocument();
  });
});

// ─── Slice 3.POSTSEC-6 — Test Run path ─────────────────────────────────────
describe("RunNowPanel — Test Run (Slice 3.POSTSEC-6)", () => {
  it("dispatches runNowWorkflow with testMode:true and empty inputs", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-test-1",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
      isTest: true,
      triggeredBy: "test",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-test-button"));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    });
    expect(mockRunNowWorkflow).toHaveBeenCalledWith(
      "wf-1",
      { inputs: {} },
      { testMode: true },
    );
  });

  it("does NOT pollute inputs with testMode or confirmationText", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "r",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-test-button"));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalled();
    });
    const callArgs = mockRunNowWorkflow.mock.calls[0]!;
    expect(callArgs[1]).toEqual({ inputs: {} });
    expect(callArgs[1]).not.toHaveProperty("testMode");
    expect(callArgs[1]).not.toHaveProperty("confirmationText");
  });

  it("surfaces the runId and marks the success line as a test run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-test-success",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
      isTest: true,
      triggeredBy: "test",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-test-button"));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    const success = screen.getByTestId("run-now-success");
    expect(success).toHaveTextContent(/run-test-success/);
    // The success line distinguishes test vs live; without this the user
    // can't tell what they actually ran (one of the audit findings that
    // motivated POSTSEC-6).
    expect(success).toHaveTextContent(/test run/i);
  });

  it("does NOT open the confirmation modal on Test Run even if the server would have flagged the workflow", async () => {
    // Server-side SEC-4B does not fire for testMode=true (SEC-2 blocks
    // destructive handlers first), so the wire shape can't return a 409
    // here. Belt-and-braces: even if a (broken) server returned 409, the
    // Test Run handler treats it as a plain error rather than promoting
    // to a destructive-action confirmation flow — confirming destructive
    // intent on a test run would be UX nonsense.
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(
      new WorkflowConfirmationRequiredError("Confirmation required.", 409, {
        requiresConfirmation: true,
        confirmationText: "CONFIRM",
        actions: [
          {
            nodeId: "n",
            provider: "stripe",
            type: "create_refund",
            displayName: "Create Refund",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-test-button"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    // Modal MUST NOT appear for Test Run.
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    // And no retry was fired.
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while a Test Run is in-flight", async () => {
    bootWithManualTrigger();
    let resolveCall: (v: unknown) => void = () => {};
    mockRunNowWorkflow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-test-button"));
    expect(screen.getByTestId("run-now-test-button")).toBeDisabled();
    expect(screen.getByTestId("run-now-test-button")).toHaveTextContent(
      /testing/i,
    );
    expect(screen.getByTestId("run-now-live-button")).toBeDisabled();
    resolveCall({ runId: "r", enqueuedAt: "2026-05-23T00:00:00Z" });
    await waitFor(() => {
      expect(screen.getByTestId("run-now-test-button")).toBeEnabled();
    });
    expect(screen.getByTestId("run-now-live-button")).toBeEnabled();
  });
});

// ─── Slice 3.POSTSEC-6 — Run Live path ─────────────────────────────────────
describe("RunNowPanel — Run Live (Slice 3.POSTSEC-6)", () => {
  it("dispatches runNowWorkflow with testMode:false and empty inputs", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-live-1",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
      isTest: false,
      triggeredBy: "manual",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    });
    expect(mockRunNowWorkflow).toHaveBeenCalledWith(
      "wf-1",
      { inputs: {} },
      { testMode: false },
    );
  });

  it("surfaces the runId on a successful low-risk live run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-live-success",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    expect(screen.getByTestId("run-now-success")).toHaveTextContent(
      /run-live-success/,
    );
    // The success line for a live run does NOT carry the "test" label.
    expect(screen.getByTestId("run-now-success")).not.toHaveTextContent(
      /test run/i,
    );
    // And the modal never appeared (low-risk live run path).
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });

  it("disables both buttons while a Live Run is in-flight", async () => {
    bootWithManualTrigger();
    let resolveCall: (v: unknown) => void = () => {};
    mockRunNowWorkflow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    expect(screen.getByTestId("run-now-live-button")).toBeDisabled();
    expect(screen.getByTestId("run-now-live-button")).toHaveTextContent(
      /running/i,
    );
    expect(screen.getByTestId("run-now-test-button")).toBeDisabled();
    resolveCall({ runId: "r", enqueuedAt: "2026-05-23T00:00:00Z" });
    await waitFor(() => {
      expect(screen.getByTestId("run-now-live-button")).toBeEnabled();
    });
    expect(screen.getByTestId("run-now-test-button")).toBeEnabled();
  });

  it("surfaces a WorkflowApiError message inline", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(
      new WorkflowApiError(
        "Workflow state 'paused' does not accept run-now.",
        "LIFECYCLE_CONFLICT",
        409,
      ),
    );
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /workflow state 'paused' does not accept run-now/i,
      );
    });
  });

  it("surfaces a generic error message for non-WorkflowApiError throws", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/network down/i);
    });
  });

  it("does NOT call updateWorkflow (modal/toolbar save are separate paths)", async () => {
    // Sanity guard for the architectural boundary: Run Now must never
    // accidentally trigger a save. We snapshot the slice's saveError +
    // isDirty before and after; runNow should leave them untouched.
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "r",
      enqueuedAt: "2026-05-17T10:00:00.000Z",
    });
    const before = useGraphSlice.getState();
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await waitFor(() => expect(mockRunNowWorkflow).toHaveBeenCalled());
    const after = useGraphSlice.getState();
    expect(after.isDirty).toBe(before.isDirty);
    expect(after.saveError).toBe(before.saveError);
    expect(after.isSaving).toBe(before.isSaving);
  });
});

// ─── Slice 3.POSTSEC-5 — typed-confirmation modal flow (via Live Run) ──────
describe("RunNowPanel — destructive-action confirmation (Slice 3.POSTSEC-5)", () => {
  function makeConfirmationError(): WorkflowConfirmationRequiredError {
    return new WorkflowConfirmationRequiredError(
      "Confirmation required.",
      409,
      {
        requiresConfirmation: true,
        confirmationText: "CONFIRM",
        actions: [
          {
            nodeId: "pi-node",
            provider: "stripe",
            type: "create_payment_intent",
            displayName: "Create Payment Intent",
            riskDescription: "Starts a customer payment flow.",
          },
        ],
      },
    );
  }

  it("Live Run first-shot 409 opens the typed-confirmation modal and does NOT enqueue a run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    expect(
      await screen.findByTestId("destructive-action-confirmation-modal"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create Payment Intent")).toBeInTheDocument();
    expect(screen.getByText("stripe:create_payment_intent")).toBeInTheDocument();
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("run-now-success")).not.toBeInTheDocument();
    // Both buttons are back to enabled (in-flight cleared so the modal is
    // the sole focus surface).
    expect(screen.getByTestId("run-now-live-button")).toBeEnabled();
    expect(screen.getByTestId("run-now-test-button")).toBeEnabled();
  });

  it("typing CONFIRM and clicking Confirm retries runNowWorkflow with confirmationText + testMode:false + same inputs", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow
      .mockRejectedValueOnce(makeConfirmationError())
      .mockResolvedValueOnce({
        runId: "run-postsec5",
        enqueuedAt: "2026-05-23T00:00:00Z",
      });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFIRM",
    );
    await user.click(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    );
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalledTimes(2);
    });
    // Second call: inputs unchanged + confirmationText supplied + the
    // retry preserves testMode:false (no silent promotion to test).
    expect(mockRunNowWorkflow.mock.calls[1]).toEqual([
      "wf-1",
      { inputs: {} },
      { testMode: false, confirmationText: "CONFIRM" },
    ]);
    // Run id surfaces; modal closes.
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toHaveTextContent(
        /run-postsec5/,
      );
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });

  it("Cancel closes the modal without retrying Live Run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.click(
      screen.getByTestId("destructive-action-confirmation-cancel"),
    );
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("run-now-success")).not.toBeInTheDocument();
  });

  it("wrong phrase keeps Confirm disabled and never retries", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "confirm",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeDisabled();
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
  });

  it("low-risk Live Run still works without the modal (regression guard)", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-low-risk",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    // First call carries testMode:false (back-compat — server treats
    // false and omitted identically).
    expect(mockRunNowWorkflow.mock.calls[0]).toEqual([
      "wf-1",
      { inputs: {} },
      { testMode: false },
    ]);
  });
});

// ─── Slice 3.POSTSEC-6 — promotion / demotion invariants ───────────────────
describe("RunNowPanel — no silent promotion or demotion (Slice 3.POSTSEC-6)", () => {
  it("Test Run does NOT silently become Live Run anywhere on its path", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "r",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-test-button"));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalled();
    });
    // Every call from a Test Run carries testMode:true. There is no
    // codepath in the panel that retries Test Run with testMode:false.
    for (const call of mockRunNowWorkflow.mock.calls) {
      const opts = call[2] as { testMode?: boolean } | undefined;
      expect(opts?.testMode).toBe(true);
    }
  });

  it("Live Run does NOT silently become Test Run mid-confirmation", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow
      .mockRejectedValueOnce(
        new WorkflowConfirmationRequiredError(
          "Confirmation required.",
          409,
          {
            requiresConfirmation: true,
            confirmationText: "CONFIRM",
            actions: [
              {
                nodeId: "n",
                provider: "stripe",
                type: "create_refund",
                displayName: "Create Refund",
              },
            ],
          },
        ),
      )
      .mockResolvedValueOnce({
        runId: "r",
        enqueuedAt: "2026-05-23T00:00:00Z",
      });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByTestId("run-now-live-button"));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFIRM",
    );
    await user.click(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    );
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalledTimes(2);
    });
    // Every call from a Live Run carries testMode:false — even the
    // post-modal retry. The retry MUST NOT silently promote to a test
    // run "for safety" — that would defeat the user's clear intent.
    for (const call of mockRunNowWorkflow.mock.calls) {
      const opts = call[2] as { testMode?: boolean } | undefined;
      expect(opts?.testMode).toBe(false);
    }
  });
});

describe("RunNowPanel — dirty-state warning", () => {
  it("surfaces an unsaved-changes warning when the slice is dirty", () => {
    bootWithManualTrigger();
    // addTrigger flipped isDirty to true.
    expect(useGraphSlice.getState().isDirty).toBe(true);
    render(<RunNowPanel />);
    expect(screen.getByRole("status")).toHaveTextContent(/unsaved changes/i);
  });

  it("hides the warning once the slice is clean", () => {
    // Hydrate with a saved manual trigger already in the definition.
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "t1",
          kind: "trigger",
          provider: "native",
          type: "manual.run",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    expect(useGraphSlice.getState().isDirty).toBe(false);
    render(<RunNowPanel />);
    expect(
      screen.queryByText(/unsaved changes/i),
    ).not.toBeInTheDocument();
  });
});
