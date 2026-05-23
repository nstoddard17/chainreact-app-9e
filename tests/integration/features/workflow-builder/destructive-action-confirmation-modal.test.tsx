/**
 * Slice 3.POSTSEC-5 integration test — destructive-action confirmation
 * modal end-to-end through the LifecycleActions + RunNowPanel mountings.
 *
 * Per the existing builder integration-test pattern (see
 * `native-trigger-config-and-run-now.test.tsx`), this test mocks at the
 * typed-API boundary (`lib/api/workflows`) — the parseError →
 * WorkflowConfirmationRequiredError → modal → retry contract on the
 * wire is covered by `tests/unit/lib/api/workflows.test.ts` (which
 * runs in @jest-environment node where `Response` is available).
 *
 * Three flows covered:
 *   1. Activation — destructive workflow → 409 → modal → CONFIRM → retry → success.
 *   2. Run Now — destructive workflow → 409 → modal → Cancel → no retry.
 *   3. Run Now — low-risk workflow → no modal (regression guard).
 */

const mockActivateWorkflow = jest.fn();
const mockRunNowWorkflow = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    activateWorkflow: (...args: unknown[]) => mockActivateWorkflow(...args),
    runNowWorkflow: (...args: unknown[]) => mockRunNowWorkflow(...args),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifecycleActions } from "@/features/workflow-builder/panels/LifecycleActions";
import { RunNowPanel } from "@/features/workflow-builder/panels/RunNowPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { WorkflowConfirmationRequiredError } from "@/lib/api/workflows";

function makeStripeRefundConfirmationError(): WorkflowConfirmationRequiredError {
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
          "Reverses a Stripe charge — moves money back to the customer.",
      },
    ],
  });
}

function bootWithManualTrigger(): void {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-int", { nodes: [], edges: [] });
  useGraphSlice
    .getState()
    .addTrigger({ provider: "native", type: "manual.run" });
}

beforeEach(() => {
  mockActivateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockRefresh.mockReset();
  useGraphSlice.getState().reset();
});

describe("integration — activation → CONFIRMATION_REQUIRED → modal → CONFIRM → retry → success", () => {
  it("opens the modal on 409, retries activate with confirmationText, refreshes route on success", async () => {
    mockActivateWorkflow
      .mockRejectedValueOnce(makeStripeRefundConfirmationError())
      .mockResolvedValueOnce({ id: "wf-int", state: "active" });

    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-int", { nodes: [], edges: [] });
    render(<LifecycleActions workflowId="wf-int" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));

    // Modal appears with the server-supplied action descriptor.
    const modal = await screen.findByTestId(
      "destructive-action-confirmation-modal",
    );
    expect(modal).toHaveTextContent("Create Refund");
    expect(modal).toHaveTextContent("stripe:create_refund");
    expect(modal).toHaveTextContent(/reverses a stripe charge/i);

    // Initial activate call carries no confirmationText (back-compat).
    expect(mockActivateWorkflow).toHaveBeenCalledTimes(1);
    expect(mockActivateWorkflow.mock.calls[0]).toEqual([
      "wf-int",
      { confirmationText: undefined },
    ]);
    expect(mockRefresh).not.toHaveBeenCalled();

    // Type CONFIRM + confirm.
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "CONFIRM",
    );
    await user.click(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    );

    // Retry carries the confirmationText.
    await waitFor(() => {
      expect(mockActivateWorkflow).toHaveBeenCalledTimes(2);
    });
    expect(mockActivateWorkflow.mock.calls[1]).toEqual([
      "wf-int",
      { confirmationText: "CONFIRM" },
    ]);

    // router.refresh() fires on success; modal closes.
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });

  it("wrong phrase keeps Confirm disabled and never retries", async () => {
    mockActivateWorkflow.mockRejectedValueOnce(
      makeStripeRefundConfirmationError(),
    );
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-int", { nodes: [], edges: [] });
    render(<LifecycleActions workflowId="wf-int" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await screen.findByTestId("destructive-action-confirmation-modal");
    await user.type(
      screen.getByTestId("destructive-action-confirmation-input"),
      "confirm",
    );
    expect(
      screen.getByTestId("destructive-action-confirmation-confirm"),
    ).toBeDisabled();
    expect(mockActivateWorkflow).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("integration — run-now → CONFIRMATION_REQUIRED → modal → Cancel → no retry", () => {
  it("modal appears on 409 and Cancel closes it without enqueuing a run", async () => {
    mockRunNowWorkflow.mockRejectedValueOnce(
      makeStripeRefundConfirmationError(),
    );
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<RunNowPanel />);
    await user.click(screen.getByRole("button", { name: /run now/i }));
    await screen.findByTestId("destructive-action-confirmation-modal");

    // First call — no confirmationText.
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    expect(mockRunNowWorkflow.mock.calls[0]).toEqual([
      "wf-int",
      { inputs: {} },
      {},
    ]);

    // Cancel — no further call.
    await user.click(
      screen.getByTestId("destructive-action-confirmation-cancel"),
    );
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("run-now-success")).not.toBeInTheDocument();
  });

  it("modal Confirm retries run-now with confirmationText + inputs preserved + no testMode promotion", async () => {
    mockRunNowWorkflow
      .mockRejectedValueOnce(makeStripeRefundConfirmationError())
      .mockResolvedValueOnce({
        runId: "run-int-1",
        enqueuedAt: "2026-05-23T00:00:00Z",
      });
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<RunNowPanel />);
    await user.click(screen.getByRole("button", { name: /run now/i }));
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
    // Retry carries confirmationText; inputs unchanged; testMode NEVER
    // sneaks in (the panel does not silently promote real run to test).
    const retryArgs = mockRunNowWorkflow.mock.calls[1]!;
    expect(retryArgs[0]).toBe("wf-int");
    expect(retryArgs[1]).toEqual({ inputs: {} });
    expect(retryArgs[2]).toEqual({ confirmationText: "CONFIRM" });
    expect(retryArgs[1]).not.toHaveProperty("testMode");
    expect(retryArgs[2]).not.toHaveProperty("testMode");

    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toHaveTextContent(
        /run-int-1/,
      );
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });
});

describe("integration — low-risk activation + run-now do NOT show the modal", () => {
  it("low-risk activation: success first shot → no modal, route refreshes", async () => {
    mockActivateWorkflow.mockResolvedValueOnce({
      id: "wf-int",
      state: "active",
    });
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-int", { nodes: [], edges: [] });
    render(<LifecycleActions workflowId="wf-int" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    expect(mockActivateWorkflow).toHaveBeenCalledTimes(1);
  });

  it("low-risk run-now: success first shot → no modal, run id surfaces immediately", async () => {
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-low-risk-int",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<RunNowPanel />);
    await user.click(screen.getByRole("button", { name: /run now/i }));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toHaveTextContent(
        /run-low-risk-int/,
      );
    });
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
  });
});

describe("integration — destructive workflow modal contents are route-safe (no config leakage)", () => {
  it("modal renders ONLY server-supplied displayName/provider/type/riskDescription — never workflow config", async () => {
    mockActivateWorkflow.mockRejectedValueOnce(
      // The server's `findConfirmationRequiredActions` MUST NOT leak
      // workflow config. This test simulates the documented shape and
      // asserts the modal never shows config-shaped strings even if
      // the rest of the page somehow had them. The server-side route
      // tests (activate-route.test.ts, runNow-route.test.ts) cover the
      // server's own no-leakage guarantee.
      new WorkflowConfirmationRequiredError("Confirmation required.", 409, {
        requiresConfirmation: true,
        confirmationText: "CONFIRM",
        actions: [
          {
            nodeId: "refund-node",
            provider: "stripe",
            type: "create_refund",
            displayName: "Create Refund",
            riskDescription:
              "Reverses a Stripe charge — moves money back to the customer.",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-int", { nodes: [], edges: [] });
    render(<LifecycleActions workflowId="wf-int" state="draft" />);
    await user.click(screen.getByRole("button", { name: /activate/i }));
    const modal = await screen.findByTestId(
      "destructive-action-confirmation-modal",
    );
    // None of these strings appear in the documented action shape;
    // any future leak would surface here.
    expect(modal).not.toHaveTextContent(/ch_secret/);
    expect(modal).not.toHaveTextContent(/cus_/);
    expect(modal).not.toHaveTextContent(/draftDefinition/);
    expect(modal).not.toHaveTextContent(/internal.*do-not-leak/);
  });
});
