/**
 * Tests for features/workflow-builder/layout/HeaderRunControls —
 * Slice 3.3 + Slice 3.POSTSEC-5 + Slice 3.POSTSEC-6 + Slice 3.POSTSEC-6B.
 *
 * The panel branches on the workflow's trigger kind (see
 * `features/workflow-builder/state/triggerKind.ts`):
 *
 *   - Manual workflows  → Test Workflow + Run Manually
 *   - Automated workflows → Test Workflow (disabled, with copy)
 *   - No trigger        → nothing rendered
 *
 * Behavior boundaries verified here:
 *   - Test Workflow NEVER opens the destructive-action confirmation
 *     modal — even on workflows that would normally require
 *     confirmation. SEC-2 already blocks the destructive provider
 *     calls before the SEC-4B gate would fire.
 *   - Run Manually opens the modal on 409 and retries with
 *     `testMode: false` + `confirmationText` — never silently promotes
 *     to a test run mid-flow.
 *   - Automated workflows NEVER expose Run Manually / live-run.
 *   - Inputs are not polluted with `testMode` / `confirmationText`;
 *     those stay at the envelope (third-arg options) layer.
 *   - Each button has its own busy label; clicking either disables
 *     both to prevent double-fire.
 *   - The panel does NOT call updateWorkflow — run controls execute
 *     the *saved* workflow, distinct from modal Save and toolbar Save
 *     (the Slice 3.2 boundary).
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
import { HeaderRunControls } from "@/features/workflow-builder/layout/HeaderRunControls";
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

function bootWithScheduledTrigger(): void {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice
    .getState()
    .addTrigger({
      provider: "native",
      type: "schedule.fired",
      config: { cronExpression: "0 9 * * *" },
    });
}

function bootWithProviderTrigger(): void {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice
    .getState()
    .addTrigger({ provider: "slack", type: "message_received" });
}

beforeEach(() => {
  mockRunNowWorkflow.mockReset();
  useGraphSlice.getState().reset();
});

describe("HeaderRunControls (migrated from RunNowPanel) — visibility", () => {
  it("renders nothing when the workflow has no trigger", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const { container } = render(<HeaderRunControls />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the slice has not been hydrated yet (no workflowId)", () => {
    // No hydrate() call → workflowId is null. Defensive check.
    const { container } = render(<HeaderRunControls />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the manual surface when the trigger is native:manual.run", () => {
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.getByTestId("run-controls-panel-manual"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("run-controls-test-button")).toBeEnabled();
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
    // Automated surface is NOT rendered.
    expect(
      screen.queryByTestId("run-controls-panel-automated"),
    ).not.toBeInTheDocument();
  });

  it("renders the automated surface when the trigger is native scheduled", () => {
    bootWithScheduledTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.getByTestId("run-controls-panel-automated"),
    ).toBeInTheDocument();
    // Manual surface is NOT rendered.
    expect(
      screen.queryByTestId("run-controls-panel-manual"),
    ).not.toBeInTheDocument();
    // Run Manually / live-run button is NEVER exposed on automated.
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).not.toBeInTheDocument();
  });

  it("renders the automated surface when the trigger is a provider event trigger", () => {
    bootWithProviderTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.getByTestId("run-controls-panel-automated"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).not.toBeInTheDocument();
  });
});

describe("HeaderRunControls (migrated from RunNowPanel) — manual workflow copy", () => {
  it("renders the manual-context explanatory copy on both buttons", () => {
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.getByText(/runs safely without calling connected provider apis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/external actions are skipped/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/runs for real and may call connected apps/i),
    ).toBeInTheDocument();
  });

  it("labels the buttons 'Test Workflow' and 'Run Manually' (POSTSEC-6B rename)", () => {
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    expect(screen.getByTestId("run-controls-test-button")).toHaveTextContent(
      /test workflow/i,
    );
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toHaveTextContent(/run manually/i);
    // Pre-POSTSEC-6B labels MUST NOT survive — they implied universal
    // applicability that doesn't match the product model.
    expect(
      screen.getByTestId("run-controls-test-button"),
    ).not.toHaveTextContent(/^test run$/i);
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).not.toHaveTextContent(/^run live$/i);
  });
});

// ─── Slice 3.POSTSEC-6 / 6B — Test Workflow path (manual workflows) ────────
describe("HeaderRunControls (migrated from RunNowPanel) — Test Workflow (manual workflows)", () => {
  it("dispatches runNowWorkflow with testMode:true and empty inputs", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-test-1",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
      isTest: true,
      triggeredBy: "test",
    });
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
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
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalled();
    });
    const callArgs = mockRunNowWorkflow.mock.calls[0]!;
    expect(callArgs[1]).toEqual({ inputs: {} });
    expect(callArgs[1]).not.toHaveProperty("testMode");
    expect(callArgs[1]).not.toHaveProperty("confirmationText");
  });

  it("marks the success line as a test run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-test-success",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    const success = screen.getByTestId("run-now-success");
    expect(success).toHaveTextContent(/run-test-success/);
    expect(success).toHaveTextContent(/test run/i);
  });

  it("does NOT open the confirmation modal on Test Workflow even if the server (somehow) returned 409", async () => {
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
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while a Test Workflow run is in-flight", async () => {
    bootWithManualTrigger();
    let resolveCall: (v: unknown) => void = () => {};
    mockRunNowWorkflow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    expect(screen.getByTestId("run-controls-test-button")).toBeDisabled();
    expect(screen.getByTestId("run-controls-test-button")).toHaveTextContent(
      /testing/i,
    );
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeDisabled();
    resolveCall({ runId: "r", enqueuedAt: "2026-05-23T00:00:00Z" });
    await waitFor(() => {
      expect(screen.getByTestId("run-controls-test-button")).toBeEnabled();
    });
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
  });
});

// ─── Slice 3.POSTSEC-6 / 6B — Run Manually path (manual workflows) ─────────
describe("HeaderRunControls (migrated from RunNowPanel) — Run Manually (manual workflows)", () => {
  it("dispatches runNowWorkflow with testMode:false and empty inputs", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-manual-1",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
      isTest: false,
      triggeredBy: "manual",
    });
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    });
    expect(mockRunNowWorkflow).toHaveBeenCalledWith(
      "wf-1",
      { inputs: {} },
      { testMode: false },
    );
  });

  it("surfaces the runId on a successful low-risk manual run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-manual-success",
      enqueuedAt: "2026-05-23T10:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    expect(screen.getByTestId("run-now-success")).toHaveTextContent(
      /run-manual-success/,
    );
    // The success line for a manual (live) run does NOT carry the
    // "test" label.
    expect(screen.getByTestId("run-now-success")).not.toHaveTextContent(
      /test run/i,
    );
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });

  it("disables both buttons while a manual run is in-flight", async () => {
    bootWithManualTrigger();
    let resolveCall: (v: unknown) => void = () => {};
    mockRunNowWorkflow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeDisabled();
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toHaveTextContent(/running/i);
    expect(screen.getByTestId("run-controls-test-button")).toBeDisabled();
    resolveCall({ runId: "r", enqueuedAt: "2026-05-23T00:00:00Z" });
    await waitFor(() => {
      expect(
        screen.getByTestId("run-controls-run-manually-button"),
      ).toBeEnabled();
    });
    expect(screen.getByTestId("run-controls-test-button")).toBeEnabled();
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
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
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
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/network down/i);
    });
  });

  it("does NOT call updateWorkflow (modal/toolbar save are separate paths)", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "r",
      enqueuedAt: "2026-05-17T10:00:00.000Z",
    });
    const before = useGraphSlice.getState();
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    await waitFor(() => expect(mockRunNowWorkflow).toHaveBeenCalled());
    const after = useGraphSlice.getState();
    expect(after.isDirty).toBe(before.isDirty);
    expect(after.saveError).toBe(before.saveError);
    expect(after.isSaving).toBe(before.isSaving);
  });
});

// ─── Slice 3.POSTSEC-5 — typed-confirmation modal flow (via Run Manually) ──
describe("HeaderRunControls (migrated from RunNowPanel) — destructive-action confirmation (Slice 3.POSTSEC-5)", () => {
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

  it("Run Manually first-shot 409 opens the typed-confirmation modal and does NOT enqueue a run", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    expect(
      await screen.findByTestId("destructive-action-confirmation-modal"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create Payment Intent")).toBeInTheDocument();
    expect(screen.getByText("stripe:create_payment_intent")).toBeInTheDocument();
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("run-now-success")).not.toBeInTheDocument();
    // Both buttons are back to enabled (in-flight cleared so the modal is
    // the sole focus surface).
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
    expect(screen.getByTestId("run-controls-test-button")).toBeEnabled();
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
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
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
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toHaveTextContent(
        /run-postsec5/,
      );
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });

  it("Cancel closes the modal without retrying", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
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
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
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

  it("low-risk Run Manually still works without the modal (regression guard)", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-low-risk",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    expect(mockRunNowWorkflow.mock.calls[0]).toEqual([
      "wf-1",
      { inputs: {} },
      { testMode: false },
    ]);
  });
});

// ─── Slice 3.POSTSEC-6 — no silent promotion / demotion ────────────────────
describe("HeaderRunControls (migrated from RunNowPanel) — no silent promotion or demotion (Slice 3.POSTSEC-6)", () => {
  it("Test Workflow does NOT silently become Run Manually anywhere on its path", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "r",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalled();
    });
    for (const call of mockRunNowWorkflow.mock.calls) {
      const opts = call[2] as { testMode?: boolean } | undefined;
      expect(opts?.testMode).toBe(true);
    }
  });

  it("Run Manually does NOT silently become Test Workflow mid-confirmation", async () => {
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
    render(<HeaderRunControls />);
    await user.click(
      screen.getByTestId("run-controls-run-manually-button"),
    );
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
    for (const call of mockRunNowWorkflow.mock.calls) {
      const opts = call[2] as { testMode?: boolean } | undefined;
      expect(opts?.testMode).toBe(false);
    }
  });
});

// ─── Slice 3.POSTSEC-6B — automated workflow surface ───────────────────────
describe("HeaderRunControls (migrated from RunNowPanel) — automated workflows (Slice 3.POSTSEC-6B)", () => {
  it("does NOT render Run Manually for scheduled triggers", () => {
    bootWithScheduledTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).not.toBeInTheDocument();
  });

  it("does NOT render Run Manually for provider event triggers", () => {
    bootWithProviderTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).not.toBeInTheDocument();
  });

  it("renders a disabled Test Workflow button with explanatory copy on scheduled workflows", () => {
    bootWithScheduledTrigger();
    render(<HeaderRunControls />);
    const button = screen.getByTestId("run-controls-test-button");
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/test workflow/i);
    // Copy explains the alternative path is Activate.
    expect(
      screen.getByText(/test runs for automated workflows are in development/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/activate it and trigger the source event/i),
    ).toBeInTheDocument();
  });

  it("renders a disabled Test Workflow button on provider event workflows", () => {
    bootWithProviderTrigger();
    render(<HeaderRunControls />);
    const button = screen.getByTestId("run-controls-test-button");
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("never calls runNowWorkflow from the automated panel — the button is non-interactive", async () => {
    bootWithScheduledTrigger();
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    // Clicking a disabled button is a no-op in real browsers; userEvent
    // mirrors that. The handler must never fire.
    await user.click(screen.getByTestId("run-controls-test-button"));
    expect(mockRunNowWorkflow).not.toHaveBeenCalled();
  });

  it("automated panel describes the workflow as external-event-driven", () => {
    bootWithScheduledTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.getByText(/fired by an external event/i),
    ).toBeInTheDocument();
  });
});

// ─── Slice 3.3 — dirty-state warning (manual workflows only) ───────────────
describe("HeaderRunControls (migrated from RunNowPanel) — dirty-state warning (manual workflows)", () => {
  it("surfaces an unsaved-changes warning when the slice is dirty", () => {
    bootWithManualTrigger();
    expect(useGraphSlice.getState().isDirty).toBe(true);
    render(<HeaderRunControls />);
    expect(screen.getByRole("status")).toHaveTextContent(/unsaved changes/i);
  });

  it("hides the warning once the slice is clean", () => {
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
    render(<HeaderRunControls />);
    expect(
      screen.queryByText(/unsaved changes/i),
    ).not.toBeInTheDocument();
  });
});

describe("HeaderRunControls — BUILDER-READINESS gating", () => {
  it("disables Run Manually when there are blocking validation issues", () => {
    bootWithManualTrigger();
    render(<HeaderRunControls blockingIssueCount={2} />);
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeDisabled();
    // Test Workflow stays enabled (test mode skips external handlers).
    expect(screen.getByTestId("run-controls-test-button")).not.toBeDisabled();
    expect(screen.getByTestId("run-controls-blocked-status")).toBeInTheDocument();
  });

  it("enables Run Manually when there are no blocking issues", () => {
    bootWithManualTrigger();
    render(<HeaderRunControls blockingIssueCount={0} />);
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).not.toBeDisabled();
    expect(screen.queryByTestId("run-controls-blocked-status")).toBeNull();
  });
});
