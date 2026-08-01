/**
 * Slice 3.POSTSEC-5 integration test — destructive-action confirmation
 * modal end-to-end through the LifecycleActions + HeaderRunControls mountings.
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

// LIVE-TEST-HEADER-UX-1 — the automated surface's single primary testing action is
// Run Live Test, whose journey starts at the typed prepare endpoint. Mocked at the
// same typed-API boundary as lib/api/workflows above; the full live-test journey is
// covered in tests/unit/features/workflow-builder/live-test/liveTestJourney.test.tsx.
const mockPrepareLiveTest = jest.fn();
jest.mock("@/lib/api/liveTest", () => {
  const actual = jest.requireActual("@/lib/api/liveTest");
  return {
    ...actual,
    prepareLiveTest: (...args: unknown[]) => mockPrepareLiveTest(...args),
    getLiveTestStatus: jest.fn(),
    startLiveTest: jest.fn(),
    cancelLiveTest: jest.fn(),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifecycleActions } from "@/features/workflow-builder/panels/LifecycleActions";
import { HeaderRunControls } from "@/features/workflow-builder/layout/HeaderRunControls";
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
  // LIVE-TEST-HEADER-UX-1 — prepare answers with the typed unsupported refusal so a
  // Run Live Test click settles deterministically without a live-capture session.
  const { LiveTestApiError } = jest.requireActual("@/lib/api/liveTest");
  mockPrepareLiveTest.mockReset().mockRejectedValue(
    new LiveTestApiError({
      message: "Live trigger capture is not yet supported for this trigger.",
      code: "trigger_capture_unsupported",
      status: 422,
    }),
  );
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

describe("integration — Run Manually → CONFIRMATION_REQUIRED → modal → Cancel → no retry", () => {
  it("modal appears on 409 and Cancel closes it without enqueuing a run", async () => {
    mockRunNowWorkflow.mockRejectedValueOnce(
      makeStripeRefundConfirmationError(),
    );
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-run-manually-button"));
    await screen.findByTestId("destructive-action-confirmation-modal");

    // First call — testMode:false (explicit user choice via Run Manually),
    // no confirmationText yet.
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    expect(mockRunNowWorkflow.mock.calls[0]).toEqual([
      "wf-int",
      { inputs: {} },
      { testMode: false },
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

  it("modal Confirm retries Run Manually with confirmationText + testMode:false preserved + inputs preserved", async () => {
    mockRunNowWorkflow
      .mockRejectedValueOnce(makeStripeRefundConfirmationError())
      .mockResolvedValueOnce({
        runId: "run-int-1",
        enqueuedAt: "2026-05-23T00:00:00Z",
      });
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-run-manually-button"));
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
    // Retry carries confirmationText AND keeps testMode:false. The
    // panel MUST NOT silently promote the destructive-confirmation
    // flow to a test run — the user explicitly chose Run Manually
    // and the confirmation modal is the safety net for THAT choice.
    const retryArgs = mockRunNowWorkflow.mock.calls[1]!;
    expect(retryArgs[0]).toBe("wf-int");
    expect(retryArgs[1]).toEqual({ inputs: {} });
    expect(retryArgs[2]).toEqual({
      testMode: false,
      confirmationText: "CONFIRM",
    });
    // testMode never sneaks into inputs — envelope vs payload separation.
    expect(retryArgs[1]).not.toHaveProperty("testMode");
    expect(retryArgs[1]).not.toHaveProperty("confirmationText");

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

  it("low-risk Run Manually: success first shot → no modal, run id surfaces immediately", async () => {
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-low-risk-int",
      enqueuedAt: "2026-05-23T00:00:00Z",
    });
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-run-manually-button"));
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

// ─── Slice 3.POSTSEC-6 — Test Workflow bypasses the confirmation modal ────
describe("integration — Test Workflow skips the confirmation modal (Slice 3.POSTSEC-6)", () => {
  it("Test Workflow on a destructive workflow does NOT open the modal — sends testMode:true and enqueues immediately", async () => {
    // Test Workflow never trips the SEC-4B server gate because SEC-2
    // already blocks the destructive provider call before the gate
    // evaluates. The server's run-now route returns 202 with
    // isTest:true / triggeredBy:"test" — the panel surfaces the runId
    // without ever touching the destructive-action confirmation modal.
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-test-destructive",
      enqueuedAt: "2026-05-23T00:00:00Z",
      isTest: true,
      triggeredBy: "test",
    });
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toHaveTextContent(
        /run-test-destructive/,
      );
    });
    // No modal — even though, on a destructive workflow, Live Run would
    // have opened it.
    expect(
      screen.queryByTestId("destructive-action-confirmation-modal"),
    ).not.toBeInTheDocument();
    // Wire shape: testMode:true at the envelope, NEVER inside inputs.
    expect(mockRunNowWorkflow).toHaveBeenCalledTimes(1);
    const callArgs = mockRunNowWorkflow.mock.calls[0]!;
    expect(callArgs[0]).toBe("wf-int");
    expect(callArgs[1]).toEqual({ inputs: {} });
    expect(callArgs[2]).toEqual({ testMode: true });
    expect(callArgs[1]).not.toHaveProperty("testMode");
  });

  it("Test Workflow on a low-risk manual workflow ALSO sends testMode:true (no demotion to Run Manually)", async () => {
    mockRunNowWorkflow.mockResolvedValueOnce({
      runId: "run-test-low-risk",
      enqueuedAt: "2026-05-23T00:00:00Z",
      isTest: true,
      triggeredBy: "test",
    });
    const user = userEvent.setup();
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    await user.click(screen.getByTestId("run-controls-test-button"));
    await waitFor(() => {
      expect(screen.getByTestId("run-now-success")).toBeInTheDocument();
    });
    // Test Workflow NEVER silently degrades to Run Manually — even if
    // the workflow would have been safe to run live. testMode:true
    // reflects the user's explicit intent.
    const opts = mockRunNowWorkflow.mock.calls[0]![2] as {
      testMode?: boolean;
    };
    expect(opts.testMode).toBe(true);
  });

  it("Both buttons are visible on manual workflows — the user always sees an explicit Test Workflow vs Run Manually choice", async () => {
    bootWithManualTrigger();
    render(<HeaderRunControls />);
    expect(screen.getByTestId("run-controls-test-button")).toBeEnabled();
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
    expect(
      screen.getByTestId("run-controls-test-button"),
    ).toHaveTextContent(/test workflow/i);
    expect(
      screen.getByTestId("run-controls-run-manually-button"),
    ).toHaveTextContent(/run manually/i);
    // Explanatory copy is rendered so the user doesn't have to guess
    // what each button does — the entire point of POSTSEC-6.
    expect(
      screen.getByText(/runs safely without calling connected provider apis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/runs for real and may call connected apps/i),
    ).toBeInTheDocument();
  });
});

// ─── Slice 3.POSTSEC-6B — automated workflows hide Run Manually ───────────
describe("integration — automated workflows expose only the test surface (Slice 3.POSTSEC-6B)", () => {
  // Hydrate with the trigger already saved so isDirty stays false —
  // LifecycleActions gates the Activate button on isDirty, and we
  // want to drive the activation path in the destructive-action
  // confirmation test below.
  function bootWithScheduledTrigger(): void {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-int", {
      nodes: [
        {
          id: "t-sched",
          kind: "trigger",
          provider: "native",
          type: "schedule.fired",
          config: { cronExpression: "0 9 * * *" },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
  }

  function bootWithProviderEventTrigger(): void {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-int", {
      nodes: [
        {
          id: "t-stripe",
          kind: "trigger",
          provider: "stripe",
          type: "invoice.paid",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
  }

  it("scheduled-trigger workflow does NOT expose Run Manually and renders Run Live Test enabled", () => {
    bootWithScheduledTrigger();
    render(<HeaderRunControls />);
    // Automated panel is rendered, manual panel is not.
    expect(
      screen.getByTestId("run-controls-panel-automated"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("run-controls-panel-manual"),
    ).not.toBeInTheDocument();
    // Run Manually / live-run button is NEVER exposed.
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).not.toBeInTheDocument();
    // LIVE-TEST-HEADER-UX-1 — the automated surface offers ONE primary testing action:
    // Run Live Test. Safe Test is no longer a button here (a safe dry run cannot
    // fabricate a provider event, WORKFLOW-LIVE-TEST-2 §4); its unavailability is
    // explained in the attached testing-options popover instead.
    expect(
      screen.queryByTestId("run-controls-test-button"),
    ).not.toBeInTheDocument();
    const liveTestButton = screen.getByTestId("run-controls-live-test-button");
    expect(liveTestButton).toBeEnabled();
    expect(liveTestButton).toHaveTextContent(/run live test/i);
  });

  it("provider-event-trigger workflow does NOT expose Run Manually", () => {
    bootWithProviderEventTrigger();
    render(<HeaderRunControls />);
    expect(
      screen.queryByTestId("run-controls-run-manually-button"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("run-controls-panel-automated"),
    ).toBeInTheDocument();
  });

  it("automated panel never fires runNowWorkflow (Run Live Test opens the live-test journey instead)", async () => {
    bootWithScheduledTrigger();
    const user = userEvent.setup();
    render(<HeaderRunControls />);
    // LIVE-TEST-HEADER-UX-1 / WORKFLOW-LIVE-TEST-4 — the click routes into the live-test
    // prepare endpoint (disclosure-first; nothing runs until the user starts listening),
    // and never into the run-now route the automated surface would reject.
    await user.click(screen.getByTestId("run-controls-live-test-button"));
    expect(mockPrepareLiveTest).toHaveBeenCalledTimes(1);
    expect(mockRunNowWorkflow).not.toHaveBeenCalled();
  });

  it("automated workflow activation still works through LifecycleActions — confirmation modal still applies", async () => {
    // Activation is the primary action for automated workflows. The
    // confirmation modal logic is identical to manual workflows: a
    // destructive action in the graph trips the SEC-4B gate at the
    // /activate route, and LifecycleActions opens the same modal +
    // retries with confirmationText.
    mockActivateWorkflow
      .mockRejectedValueOnce(makeStripeRefundConfirmationError())
      .mockResolvedValueOnce({ id: "wf-int", state: "active" });

    const user = userEvent.setup();
    bootWithScheduledTrigger();
    render(<LifecycleActions workflowId="wf-int" state="draft" />);
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
      expect(mockActivateWorkflow).toHaveBeenCalledTimes(2);
    });
    expect(mockActivateWorkflow.mock.calls[1]).toEqual([
      "wf-int",
      { confirmationText: "CONFIRM" },
    ]);
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
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
