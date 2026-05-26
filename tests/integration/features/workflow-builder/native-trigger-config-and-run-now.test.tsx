/**
 * Slice 3.3 integration test — full add-native-trigger →
 * configure → save → Run Now round trip through WorkflowBuilder.
 *
 *   1. Render WorkflowBuilder hydrated with an empty workflow.
 *   2. Add the native Scheduled Trigger via the Native section of the
 *      trigger picker.
 *   3. Verify the trigger node has the default config from meta.
 *   4. Configure the cronExpression in the rail → modal Save writes it
 *      into graphSlice.
 *   5. Toolbar Save calls updateWorkflow with the configured trigger.
 *   6. Swap to the manual trigger flow and click Run Now → posts to
 *      `runNowWorkflow` with empty inputs.
 *
 * Covers the architectural boundary spec'd in Slice 3.2 and reinforced
 * in 3.3: Modal Save is pending-only, Toolbar Save persists, Run Now
 * executes against the saved workflow.
 */

const mockUpdateWorkflow = jest.fn();
const mockRunNowWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
    runNowWorkflow: (...args: unknown[]) => mockRunNowWorkflow(...args),
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

import { openLastNodeOfKind } from "./helpers/openLastNodeOfKind";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

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

const scheduledTriggerMeta: TriggerMeta = {
  key: "native:schedule.fired",
  provider: "native",
  type: "schedule.fired",
  displayName: "Scheduled Trigger",
  description: "Fires on a cron expression.",
  category: "scheduling",
  activation: "scheduled",
  requiresIntegration: false,
  fields: [
    {
      name: "cronExpression",
      label: "Cron Expression",
      type: "cron",
      required: true,
      placeholder: "0 9 * * 1-5",
    },
  ],
  payloadShape: [],
  displayOrder: 20,
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

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([
    manualTriggerMeta,
    scheduledTriggerMeta,
  ]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

it("end-to-end: add scheduled trigger, configure cron, save modal, save workflow", async () => {
  mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
    ...baseWorkflow,
    draftDefinition: body.draftDefinition,
  }));
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // 1. Open the trigger picker, wait for the Native section, pick Scheduled.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Scheduled Trigger"));

  // 2. Verify the trigger node appeared.
  const trigger = useGraphSlice.getState().pendingNodes[0];
  expect(trigger).toBeDefined();
  expect(trigger!.provider).toBe("native");
  expect(trigger!.type).toBe("schedule.fired");

  // 3. Click Configure to open the modal.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(screen.getByLabelText("Cron Expression")).toBeInTheDocument();
  });

  // 4. Type a valid cron expression.
  await user.type(
    screen.getByLabelText("Cron Expression"),
    "*/15 * * * *",
  );
  expect(
    useConfigSlice.getState().drafts[trigger!.id]!.isDirty,
  ).toBe(true);

  // 5. Modal Save → graphSlice gets the new cronExpression.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  expect(
    useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === trigger!.id)!.config,
  ).toMatchObject({ cronExpression: "*/15 * * * *" });
  expect(
    useConfigSlice.getState().drafts[trigger!.id]!.isDirty,
  ).toBe(false);

  // 6. Toolbar Save — calls updateWorkflow with the configured trigger.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);

  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const callBody = mockUpdateWorkflow.mock.calls[0]![1];
  const persistedTrigger = callBody.draftDefinition.nodes.find(
    (n: { kind: string }) => n.kind === "trigger",
  );
  expect(persistedTrigger.provider).toBe("native");
  expect(persistedTrigger.type).toBe("schedule.fired");
  expect(persistedTrigger.config).toMatchObject({
    cronExpression: "*/15 * * * *",
  });

  // 7. Run Now panel must NOT be present for a scheduled trigger.
  expect(
    screen.queryByRole("region", { name: /manual run/i }),
  ).not.toBeInTheDocument();
});

it("end-to-end: add manual trigger, Run Now posts to runNowWorkflow", async () => {
  mockRunNowWorkflow.mockResolvedValueOnce({
    runId: "run-abc-123",
    enqueuedAt: "2026-05-17T10:00:00.000Z",
  });
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // 1. Pick the Manual Trigger from the Native section.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual Trigger"));

  // 2. RunNowPanel should now be visible.
  await waitFor(() => {
    expect(
      screen.getByRole("region", { name: /manual run/i }),
    ).toBeInTheDocument();
  });

  // 3. Unsaved-changes warning surfaces (graph is dirty after add).
  expect(screen.getByRole("status")).toHaveTextContent(/unsaved changes/i);

  // 4. Click Run Manually → typed-client called with the workflow id +
  //    empty inputs payload.
  await user.click(screen.getByTestId("run-controls-run-manually-button"));
  await waitFor(() => {
    // Slice 3.POSTSEC-6 / 6B — runNowWorkflow signature is now
    // (id, inputs, { testMode?, confirmationText? }). Run Manually
    // sends testMode:false explicitly; Test Workflow would send
    // testMode:true.
    expect(mockRunNowWorkflow).toHaveBeenCalledWith(
      "wf-1",
      { inputs: {} },
      { testMode: false },
    );
  });
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 5. Success message renders the run id.
  await waitFor(() => {
    expect(screen.getByTestId("run-now-success")).toHaveTextContent(
      /run-abc-123/,
    );
  });
});
