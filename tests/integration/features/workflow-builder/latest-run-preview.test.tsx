/**
 * Slice 3.8 integration test — Run Now → latest-run polling →
 * RunResultsPanel shows step output.
 *
 *   1. Render WorkflowBuilder, add manual trigger + native action.
 *   2. Click Run Now → typed-client returns runId.
 *   3. RunResultsPanel switches from idle → pending.
 *   4. Poll #1: 404 (engine hasn't written the row yet) → still pending,
 *      pollCount bumps.
 *   5. Poll #2: 200 with terminal succeeded detail → panel renders the
 *      step pills, hides polling.
 *   6. Click "View output" on the action step → JSON output appears.
 *   7. Toolbar Save is not called by polling or output viewing.
 *   8. Run Now did NOT auto-save.
 */

jest.useFakeTimers();

const mockUpdateWorkflow = jest.fn();
const mockRunNowWorkflow = jest.fn();
const mockGetWorkflowRun = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
    runNowWorkflow: (...args: unknown[]) => mockRunNowWorkflow(...args),
    getWorkflowRun: (...args: unknown[]) => mockGetWorkflowRun(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { WorkflowApiError } from "@/lib/api/workflows";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type {
  WorkflowDetail,
  WorkflowRunDetail,
} from "@/contracts/workflow";

const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Trigger",
  description: "Runs when you click Run Now.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

const successDetail: WorkflowRunDetail = {
  id: "run-abc-123",
  workflowId: "wf-1",
  status: "succeeded",
  triggerNodeId: "t1",
  startedAt: "2026-05-17T10:00:00Z",
  finishedAt: "2026-05-17T10:00:01Z",
  errorClassification: null,
  triggerEvent: {
    provider: "native",
    eventType: "manual.run",
    eventId: "ev-1",
    occurredAt: "2026-05-17T10:00:00Z",
    accountId: "system",
    payload: { inputs: {} },
  },
  steps: [
    { nodeId: "t1", status: "succeeded", output: { event: "fired" } },
  ],
  fatalError: null,
};

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockGetWorkflowRun.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

afterEach(() => {
  jest.clearAllTimers();
});

it("Run Now → polling 404 then 200 → RunResultsPanel renders step output", async () => {
  mockRunNowWorkflow.mockResolvedValueOnce({
    runId: "run-abc-123",
    enqueuedAt: "2026-05-17T10:00:00.000Z",
  });
  // First poll: engine hasn't written the row yet → 404.
  // Second poll: terminal success.
  mockGetWorkflowRun
    .mockRejectedValueOnce(
      new WorkflowApiError("Run not found.", "WORKFLOW_NOT_FOUND", 404),
    )
    .mockResolvedValueOnce(successDetail);

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // 1. Idle state by default — Run Now hasn't fired yet.
  expect(screen.getByTestId("latest-run-idle")).toBeInTheDocument();

  // 2. Add the manual trigger.
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual Trigger"));

  // 3. Click Run Now → typed-client called.
  await user.click(screen.getByRole("button", { name: /run now/i }));
  await waitFor(() => {
    // Slice 3.POSTSEC-5 — runNowWorkflow signature is now
    // (id, inputs, { confirmationText? }). First-shot call passes
    // empty options.
    expect(mockRunNowWorkflow).toHaveBeenCalledWith(
      "wf-1",
      { inputs: {} },
      {},
    );
  });

  // 4. RunResultsPanel switches to pending. (advancing zero timers,
  //    just wait for the post-click microtask to flush state.)
  await waitFor(() => {
    expect(screen.getByTestId("latest-run-pending")).toBeInTheDocument();
  });

  // 5. Tick 1s → first poll (404) → still pending.
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await waitFor(() => {
    expect(mockGetWorkflowRun).toHaveBeenCalledTimes(1);
  });
  expect(screen.getByTestId("latest-run-pending")).toBeInTheDocument();

  // 6. Tick 1s → second poll (200 success) → panel switches.
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await waitFor(() => {
    expect(mockGetWorkflowRun).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.queryByTestId("latest-run-pending")).not.toBeInTheDocument();
  });

  // 7. Step row appears with succeeded pill.
  expect(screen.getByTestId("step-t1")).toHaveAttribute(
    "data-status",
    "succeeded",
  );

  // 8. "View output" reveals JSON.
  await user.click(screen.getByTestId("step-t1-toggle"));
  expect(screen.getByTestId("step-t1-output").textContent).toContain(
    '"event"',
  );

  // 9. Polling stops on terminal status — extra ticks don't fire new fetches.
  const callsAfterTerminal = mockGetWorkflowRun.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(mockGetWorkflowRun.mock.calls.length).toBe(callsAfterTerminal);

  // 10. Regression guards: no autosave + no autosave-from-viewing-output.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();
});
