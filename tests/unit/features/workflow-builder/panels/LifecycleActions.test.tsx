/**
 * Tests for features/workflow-builder/panels/LifecycleActions.
 *
 * Verifies the per-state action set, the "save first" gating via the graph
 * slice's isDirty, and the typed-client wiring for activate / pause / resume.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockActivate = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockReactivate = jest.fn();
const mockPublish = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    activateWorkflow: (...args: unknown[]) => mockActivate(...args),
    pauseWorkflow: (...args: unknown[]) => mockPause(...args),
    resumeWorkflow: (...args: unknown[]) => mockResume(...args),
    reactivateWorkflow: (...args: unknown[]) => mockReactivate(...args),
    publishWorkflow: (...args: unknown[]) => mockPublish(...args),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { LifecycleActions } from "@/features/workflow-builder/panels/LifecycleActions";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import {
  WorkflowApiError,
  WorkflowConfirmationRequiredError,
} from "@/lib/api/workflows";

beforeEach(() => {
  mockActivate.mockReset();
  mockPause.mockReset();
  mockResume.mockReset();
  mockReactivate.mockReset();
  mockPublish.mockReset();
  mockRefresh.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

describe("LifecycleActions — Publish / unpublished changes (V2-READY-41G)", () => {
  it("shows the 'Unpublished changes' chip + 'Publish changes' button for an active workflow with drift", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="active" unpublishedChanges />,
    );
    expect(screen.getByTestId("unpublished-changes-chip")).toBeInTheDocument();
    expect(screen.getByTestId("publish-changes-button")).toBeInTheDocument();
  });

  it("does NOT show the chip/button when there is no drift", () => {
    render(<LifecycleActions workflowId="wf-1" state="active" />);
    expect(screen.queryByTestId("unpublished-changes-chip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("publish-changes-button")).not.toBeInTheDocument();
  });

  it("does NOT show the chip/button on a non-active workflow even if drift is passed", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="paused" unpublishedChanges />,
    );
    expect(screen.queryByTestId("publish-changes-button")).not.toBeInTheDocument();
  });

  it("clicking Publish calls publishWorkflow and refreshes", async () => {
    mockPublish.mockResolvedValueOnce({ id: "wf-1", state: "active" });
    render(
      <LifecycleActions workflowId="wf-1" state="active" unpublishedChanges />,
    );
    await userEvent.click(screen.getByTestId("publish-changes-button"));
    await waitFor(() => expect(mockPublish).toHaveBeenCalledWith("wf-1"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("Publish is disabled while there are unsaved (in-memory) changes", () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" }); // flips isDirty
    render(
      <LifecycleActions workflowId="wf-1" state="active" unpublishedChanges />,
    );
    expect(screen.getByTestId("publish-changes-button")).toBeDisabled();
  });
});

describe("LifecycleActions — per-state action set", () => {
  it("shows Activate when state is draft", () => {
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pause|resume/i })).toBeNull();
  });

  it("shows Pause when state is active", () => {
    render(<LifecycleActions workflowId="wf-1" state="active" />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("shows Resume when state is paused", () => {
    render(<LifecycleActions workflowId="wf-1" state="paused" />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("shows Resume when state is eligible_to_resume", () => {
    render(<LifecycleActions workflowId="wf-1" state="eligible_to_resume" />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("shows Reactivate when state is disabled (recovery via markEligibleToResume → Resume)", () => {
    render(<LifecycleActions workflowId="wf-1" state="disabled" />);
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument();
    // Not a direct activate/resume — those appear only after the workflow is eligible.
    expect(screen.queryByRole("button", { name: /^activate$|^resume$|^pause$/i })).toBeNull();
  });
});

describe("LifecycleActions — interactions", () => {
  it("disables the action while builder has unsaved changes", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    const btn = screen.getByRole("button", { name: /activate/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/save your changes/i));
  });

  it("calls activateWorkflow and refreshes the route on success", async () => {
    mockActivate.mockResolvedValueOnce({ id: "wf-1", state: "active" });
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() => {
      // Slice 3.POSTSEC-5 — activateWorkflow signature is
      // (id, { confirmationText? }). Initial call carries
      // confirmationText: undefined (back-compat: the client maps that
      // to body: null on the wire). Retry path supplies the phrase.
      expect(mockActivate).toHaveBeenCalledWith("wf-1", {
        confirmationText: undefined,
      });
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("calls pauseWorkflow when active", async () => {
    mockPause.mockResolvedValueOnce({ id: "wf-1", state: "paused" });
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="active" />);
    await user.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledWith("wf-1");
    });
  });

  it("calls reactivateWorkflow and refreshes when disabled (recovery handoff to Resume)", async () => {
    mockReactivate.mockResolvedValueOnce({ id: "wf-1", state: "eligible_to_resume" });
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="disabled" />);
    await user.click(screen.getByRole("button", { name: /reactivate/i }));
    await waitFor(() => {
      expect(mockReactivate).toHaveBeenCalledWith("wf-1");
      expect(mockRefresh).toHaveBeenCalled();
    });
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("surfaces a WorkflowApiError message inline; does NOT refresh", async () => {
    mockActivate.mockRejectedValueOnce(
      new WorkflowApiError("Slack disconnected.", "MISSING_PRECONDITIONS", 422),
    );
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/slack disconnected/i);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

// ─── Slice 3.POSTSEC-5 — typed-confirmation modal flow ──────────────────────
describe("LifecycleActions — destructive-action confirmation (Slice 3.POSTSEC-5)", () => {
  function makeConfirmationError(): WorkflowConfirmationRequiredError {
    return new WorkflowConfirmationRequiredError("Confirmation required.", 409, {
      requiresConfirmation: true,
      confirmationText: "CONFIRM",
      actions: [
        {
          nodeId: "refund-node",
          provider: "stripe",
          type: "create_refund",
          displayName: "Create Refund",
          riskDescription:
            "Reverses a Stripe charge — destructive, generally not reversible.",
        },
      ],
    });
  }

  it("on first-shot 409 CONFIRMATION_REQUIRED, opens the typed-confirmation modal and does NOT refresh", async () => {
    mockActivate.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    expect(
      await screen.findByTestId("destructive-action-confirmation-modal"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create Refund")).toBeInTheDocument();
    expect(screen.getByText("stripe:create_refund")).toBeInTheDocument();
    expect(screen.getByText(/reverses a stripe charge/i)).toBeInTheDocument();
    // activateWorkflow called once (the failing first attempt). Refresh NOT
    // called (workflow stays in draft).
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
    // The activate button is now disabled while the modal is open so the
    // user cannot re-trigger from the lifecycle bar.
    expect(screen.getByRole("button", { name: /activate/i })).toBeDisabled();
  });

  it("typing CONFIRM and clicking Confirm retries activateWorkflow with confirmationText=CONFIRM", async () => {
    mockActivate
      .mockRejectedValueOnce(makeConfirmationError())
      .mockResolvedValueOnce({ id: "wf-1", state: "active" });
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFIRM",
    );
    await user.click(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    );
    await waitFor(() => {
      expect(mockActivate).toHaveBeenCalledTimes(2);
    });
    // Second call carries the confirmationText.
    expect(mockActivate.mock.calls[1]).toEqual([
      "wf-1",
      { confirmationText: "CONFIRM" },
    ]);
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
    // Modal closes on success.
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });

  it("wrong phrase keeps Confirm disabled and never retries", async () => {
    mockActivate.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "confirm",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeDisabled();
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("Cancel closes the modal without retrying activate", async () => {
    mockActivate.mockRejectedValueOnce(makeConfirmationError());
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.click(
      screen.getByTestId("destructive-action-confirmation-cancel"),
    );
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
    // Activate button re-enabled (modal closed, pending cleared).
    expect(screen.getByRole("button", { name: /activate/i })).toBeEnabled();
  });

  it("low-risk activation still works without the modal (regression guard)", async () => {
    mockActivate.mockResolvedValueOnce({ id: "wf-1", state: "active" });
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() => {
      expect(mockActivate).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalled();
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    // First call carries no confirmationText (back-compat).
    expect(mockActivate).toHaveBeenCalledWith("wf-1", { confirmationText: undefined });
  });

  it("modal does NOT render workflow config or secrets even when the action node has a leaky id", async () => {
    // The modal only sees what the server's `findConfirmationRequiredActions`
    // returns — the route-safe shape. Defensive: assert the rendered
    // modal does NOT echo secret-looking strings the workflow MIGHT have
    // had in its config. This belt-and-suspenders catches a future
    // server regression where extra fields leak through.
    mockActivate.mockRejectedValueOnce(
      new WorkflowConfirmationRequiredError("Confirmation required.", 409, {
        requiresConfirmation: true,
        confirmationText: "CONFIRM",
        actions: [
          {
            nodeId: "refund-node",
            provider: "stripe",
            type: "create_refund",
            displayName: "Create Refund",
            // riskDescription is the only free-text field — make sure
            // tests don't accidentally trust it to carry safe data.
            riskDescription: "Reverses a Stripe charge.",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<LifecycleActions workflowId="wf-1" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    const modal = await screen.findByTestId(
      "destructive-action-confirmation-modal",
    );
    expect(modal).not.toHaveTextContent(/ch_secret_1/);
    expect(modal).not.toHaveTextContent(/cus_/);
    expect(modal).not.toHaveTextContent(/draftDefinition/);
  });
});

describe("LifecycleActions — BUILDER-READINESS gating", () => {
  it("disables Activate when there are blocking validation issues", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="draft" blockingIssueCount={1} />,
    );
    const activate = screen.getByRole("button", { name: /activate/i });
    expect(activate).toBeDisabled();
    expect(activate).toHaveAttribute("data-blocked-by-validation", "true");
  });

  it("enables Activate when there are no blocking issues", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="draft" blockingIssueCount={0} />,
    );
    expect(screen.getByRole("button", { name: /activate/i })).not.toBeDisabled();
  });

  it("does NOT block Pause for blocking issues (pause is always safe)", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="active" blockingIssueCount={3} />,
    );
    expect(screen.getByRole("button", { name: /pause/i })).not.toBeDisabled();
  });
});

describe("LifecycleActions — blocked-go-live visible reason (BUILDER-ACTIVATION-READINESS-UX-AUDIT-1)", () => {
  it("shows an always-visible reason line (not just a hover title) when Activate is blocked", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="draft" blockingIssueCount={2} />,
    );
    const hint = screen.getByTestId("lifecycle-blocked-hint");
    expect(hint).toHaveAttribute("role", "status");
    expect(hint).toHaveAttribute("data-issue-count", "2");
    // Plain-English, pluralized, references the go-live verb — no node ids / config keys.
    expect(hint.textContent).toMatch(/2 setup issues to fix before activate/i);
  });

  it("uses singular copy for a single issue and the correct verb for Resume", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="paused" blockingIssueCount={1} />,
    );
    expect(screen.getByTestId("lifecycle-blocked-hint").textContent).toMatch(
      /1 setup issue to fix before resume/i,
    );
  });

  it("does NOT render the reason line when there are no blocking issues", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="draft" blockingIssueCount={0} />,
    );
    expect(screen.queryByTestId("lifecycle-blocked-hint")).toBeNull();
  });

  it("does NOT render the reason line on a non-go-live state (active → Pause) even with issues", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="active" blockingIssueCount={3} />,
    );
    expect(screen.queryByTestId("lifecycle-blocked-hint")).toBeNull();
  });

  it("'Review' opens the validation panel via onReviewIssues", async () => {
    const user = userEvent.setup();
    const onReviewIssues = jest.fn();
    render(
      <LifecycleActions
        workflowId="wf-1"
        state="draft"
        blockingIssueCount={2}
        onReviewIssues={onReviewIssues}
      />,
    );
    await user.click(screen.getByTestId("lifecycle-review-issues"));
    expect(onReviewIssues).toHaveBeenCalledTimes(1);
  });

  it("renders the reason line WITHOUT a Review button when no onReviewIssues is wired", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="draft" blockingIssueCount={2} />,
    );
    expect(screen.getByTestId("lifecycle-blocked-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-review-issues")).toBeNull();
  });

  it("does not leak raw node ids / config keys in the reason copy", () => {
    render(
      <LifecycleActions workflowId="wf-1" state="draft" blockingIssueCount={4} />,
    );
    const text = screen.getByTestId("lifecycle-blocked-hint").textContent ?? "";
    // Only the count + plain words — no uuid-ish ids, no `provider:type`, no `{{ }}`.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(text).not.toMatch(/:|\{\{|\}\}/);
  });
});
