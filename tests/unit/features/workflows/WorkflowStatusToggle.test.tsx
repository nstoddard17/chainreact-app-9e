/**
 * Tests for features/workflows/WorkflowStatusToggle.
 *
 * Pins Slice 4.WORKFLOWS-PAGE-1's status-toggle contract:
 *   - Non-optimistic: the displayed state does NOT flip until the API
 *     succeeds; `onChanged` only fires AFTER success.
 *   - Pause / Resume / Activate route to the existing lifecycle APIs.
 *   - Activate → CONFIRMATION_REQUIRED opens the typed confirm dialog;
 *     echoing the phrase retries the API.
 *   - A readiness/lifecycle failure surfaces the message + an "Open builder"
 *     link (never traps the user); status stays unchanged.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockActivate = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    activateWorkflow: (...a: unknown[]) => mockActivate(...a),
    pauseWorkflow: (...a: unknown[]) => mockPause(...a),
    resumeWorkflow: (...a: unknown[]) => mockResume(...a),
  };
});

import {
  WorkflowApiError,
  WorkflowConfirmationRequiredError,
} from "@/lib/api/workflows";
import { WorkflowStatusToggle } from "@/features/workflows/WorkflowStatusToggle";
import type { WorkflowListItem } from "@/contracts/workflow";

function wf(
  state: WorkflowListItem["state"],
  overrides: Partial<WorkflowListItem> = {},
): WorkflowListItem {
  return {
    id: "wf-1",
    name: "Test workflow",
    state,
    disabledReason: state === "disabled" ? "manual_admin" : null,
    disabledContext: null,
    deletedAt: null,
    createdAt: "2026-05-29T00:00:00Z",
    updatedAt: "2026-05-29T00:00:00Z",
    providers: [],
    triggerCount: 0,
    actionCount: 0,
    runStats: {
      total: 0,
      succeeded: 0,
      successRate: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockActivate.mockReset();
  mockPause.mockReset();
  mockResume.mockReset();
});

describe("WorkflowStatusToggle — routes to the right lifecycle API", () => {
  it("active → pauseWorkflow", async () => {
    mockPause.mockResolvedValueOnce({ id: "wf-1", state: "paused" });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("active")} onChanged={onChanged} />);

    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    await waitFor(() => expect(mockPause).toHaveBeenCalledWith("wf-1"));
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("paused → resumeWorkflow", async () => {
    mockResume.mockResolvedValueOnce({ id: "wf-1", state: "active" });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("paused")} onChanged={onChanged} />);
    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    await waitFor(() => expect(mockResume).toHaveBeenCalledWith("wf-1"));
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockPause).not.toHaveBeenCalled();
  });

  it("draft → activateWorkflow", async () => {
    mockActivate.mockResolvedValueOnce({ id: "wf-1", state: "active" });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("draft")} onChanged={onChanged} />);
    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    await waitFor(() => expect(mockActivate).toHaveBeenCalledWith("wf-1"));
  });

  it("disabled state → toggle is disabled (no API call)", async () => {
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("disabled")} onChanged={jest.fn()} />);
    const toggle = screen.getByTestId("workflow-status-toggle-switch");
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });
});

describe("WorkflowStatusToggle — NON-OPTIMISTIC behavior", () => {
  it("does NOT flip the displayed state until the API succeeds (pending call leaves switch in old position)", async () => {
    // A pending pause keeps the toggle in the "checked" (active) state.
    let resolvePause: ((v: unknown) => void) | undefined;
    mockPause.mockReturnValueOnce(
      new Promise((res) => {
        resolvePause = res;
      }),
    );
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("active")} onChanged={onChanged} />);
    const toggle = screen.getByTestId("workflow-status-toggle-switch");
    expect(toggle).toHaveAttribute("data-state", "checked");

    await user.click(toggle);
    await waitFor(() => expect(mockPause).toHaveBeenCalled());

    // Switch stays in the active (checked) position while the call is in flight.
    // onChanged has NOT fired yet — the parent's data hasn't changed.
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(onChanged).not.toHaveBeenCalled();

    resolvePause?.({ id: "wf-1", state: "paused" });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("on failure, the toggle stays in its original position (nothing to revert)", async () => {
    mockActivate.mockRejectedValueOnce(
      new WorkflowApiError("Missing trigger.", "MISSING_PRECONDITIONS", 422),
    );
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("draft")} onChanged={onChanged} />);
    const toggle = screen.getByTestId("workflow-status-toggle-switch");
    expect(toggle).toHaveAttribute("data-state", "unchecked");

    await user.click(toggle);
    await waitFor(() =>
      expect(screen.getByTestId("workflow-status-toggle-error")).toBeInTheDocument(),
    );

    // Still unchecked; onChanged never fired.
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("WorkflowStatusToggle — confirmation dialog flow", () => {
  it("activate → CONFIRMATION_REQUIRED opens the typed-confirmation dialog; typing the phrase retries activate", async () => {
    const detail = {
      requiresConfirmation: true as const,
      confirmationText: "CONFIRM",
      actions: [
        {
          nodeId: "n1",
          provider: "slack",
          type: "send_channel_message",
          displayName: "Send Slack message",
        },
      ],
    };
    mockActivate
      .mockRejectedValueOnce(
        new WorkflowConfirmationRequiredError("Confirmation required", 409, detail),
      )
      .mockResolvedValueOnce({ id: "wf-1", state: "active" });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("draft")} onChanged={onChanged} />);

    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    await screen.findByTestId("workflow-activate-confirm-dialog");
    // Submit is disabled until the user echoes the phrase verbatim.
    expect(screen.getByTestId("workflow-activate-confirm-submit")).toBeDisabled();
    await user.type(screen.getByTestId("workflow-activate-confirm-input"), "CONFIRM");
    expect(screen.getByTestId("workflow-activate-confirm-submit")).toBeEnabled();
    await user.click(screen.getByTestId("workflow-activate-confirm-submit"));

    await waitFor(() => expect(mockActivate).toHaveBeenCalledTimes(2));
    expect(mockActivate).toHaveBeenLastCalledWith("wf-1", {
      confirmationText: "CONFIRM",
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});

describe("WorkflowStatusToggle — readiness failure shows Open builder, never traps", () => {
  it("MISSING_PRECONDITIONS surfaces the message + Open builder link", async () => {
    mockActivate.mockRejectedValueOnce(
      new WorkflowApiError(
        "Add a trigger before activating.",
        "MISSING_PRECONDITIONS",
        422,
      ),
    );
    const user = userEvent.setup();
    render(<WorkflowStatusToggle workflow={wf("draft")} onChanged={jest.fn()} />);
    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    const errBox = await screen.findByTestId("workflow-status-toggle-error");
    expect(errBox).toHaveTextContent(/Add a trigger before activating/i);
    const openBuilder = screen.getByTestId("workflow-status-toggle-open-builder");
    expect(openBuilder).toHaveAttribute("href", "/workflows/wf-1");
  });
});
