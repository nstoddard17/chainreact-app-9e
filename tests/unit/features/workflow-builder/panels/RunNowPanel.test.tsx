/**
 * Tests for features/workflow-builder/panels/RunNowPanel — Slice 3.3.
 *
 * The panel only renders when the workflow has a `native:manual.run`
 * trigger. Clicking "Run Now" dispatches the typed-client
 * `runNowWorkflow(id, { inputs: {} })` and surfaces the runId on
 * success / the error message on failure. It does NOT call the
 * workflow save path — Run Now is execution against the *saved*
 * workflow, distinct from modal Save and toolbar Save (the Slice 3.2
 * boundary).
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
import { WorkflowApiError } from "@/lib/api/workflows";

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

  it("renders the panel when a manual trigger is present", () => {
    bootWithManualTrigger();
    render(<RunNowPanel />);
    expect(
      screen.getByRole("region", { name: /manual run/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled();
  });
});

describe("RunNowPanel — execution", () => {
  it("dispatches runNowWorkflow with the workflowId and empty inputs", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-123",
      enqueuedAt: "2026-05-17T10:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByRole("button", { name: /run now/i }));
    await waitFor(() => {
      expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    });
    expect(mockRunNowWorkflow).toHaveBeenCalledWith("wf-1", { inputs: {} });
  });

  it("surfaces the runId on success", async () => {
    bootWithManualTrigger();
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-success-1",
      enqueuedAt: "2026-05-17T10:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<RunNowPanel />);
    await user.click(screen.getByRole("button", { name: /run now/i }));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    expect(screen.getByTestId("run-now-success")).toHaveTextContent(
      /run-success-1/,
    );
  });

  it("disables the Run Now button while a run is in-flight", async () => {
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
    const button = screen.getByRole("button", { name: /run now/i });
    await user.click(button);
    expect(
      screen.getByRole("button", { name: /running/i }),
    ).toBeDisabled();
    resolveCall({ runId: "r", enqueuedAt: "2026-05-17T10:00:00.000Z" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run now/i })).toBeEnabled();
    });
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
    await user.click(screen.getByRole("button", { name: /run now/i }));
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
    await user.click(screen.getByRole("button", { name: /run now/i }));
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
    await user.click(screen.getByRole("button", { name: /run now/i }));
    await waitFor(() => expect(mockRunNowWorkflow).toHaveBeenCalled());
    const after = useGraphSlice.getState();
    expect(after.isDirty).toBe(before.isDirty);
    expect(after.saveError).toBe(before.saveError);
    expect(after.isSaving).toBe(before.isSaving);
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
