/**
 * Slice 3.6 integration test — full add native router →
 * configure routes editor → modal Save → toolbar Save.
 *
 *  1. Render WorkflowBuilder hydrated with an empty workflow.
 *  2. Add a manual trigger via the native trigger picker.
 *  3. Add the native Router action via the native action picker.
 *  4. Click Configure on the router node → ConfigModalShell mounts the
 *     RouterRoutesField renderer (not the Slice 3.2 banner).
 *  5. Save is initially disabled (empty routes → invalid).
 *  6. Add a route, fill label + input + value → Save enables.
 *  7. Modal Save writes the runtime-schema-shaped routes into graphSlice.
 *  8. Toolbar Save calls updateWorkflow with the persisted router config.
 *
 * Pins the Slice 3.2/3.3/3.4/3.5 boundaries:
 *   - Modal Save updates pending graph state only.
 *   - Toolbar Save persists the workflow.
 *   - The validator gates Save so malformed router configs cannot
 *     reach graphSlice (and therefore cannot reach updateWorkflow).
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn(async (_p: string) => []);
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

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

const routerMeta: ActionMeta = {
  key: "native:router",
  provider: "native",
  type: "router",
  displayName: "Router",
  description: "Route execution down one of many labeled paths.",
  category: "logic",
  requiresIntegration: false,
  fields: [
    {
      name: "routes",
      label: "Routes",
      type: "router-routes",
      required: true,
    },
    {
      name: "defaultRoute",
      label: "Default Route",
      type: "text",
      required: false,
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

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

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([routerMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

it("end-to-end: add router, configure routes via the new editor, save modal, save workflow", async () => {
  mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
    ...baseWorkflow,
    draftDefinition: body.draftDefinition,
  }));
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  // 1. Manual trigger from the Native section.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual Trigger"));

  // 2. Router from the Native action section.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("Router")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Router"));

  const routerNode = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.provider === "native" && n.type === "router");
  expect(routerNode).toBeDefined();

  // 3. Configure the router node.
  // Two Configure buttons exist (trigger + action). Locate the action
  // row via the NodeList accessible name.
  // Only one action node exists (the router); the "Configure action
  // node" button is unique to it. The trigger row's button is
  // "Configure trigger node".
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );

  await waitFor(() => {
    expect(screen.getByTestId("router-routes-field")).toBeInTheDocument();
  });

  // 4. Slice 3.2 banner is gone.
  expect(
    screen.queryByText(/Router routes need a dedicated editor/i),
  ).not.toBeInTheDocument();

  // 5. Save disabled — no routes yet.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  expect(within(modal).getByRole("button", { name: /^save$/i })).toBeDisabled();

  // 6. Add a route and fill it.
  await user.click(screen.getByRole("button", { name: /^add route$/i }));
  await user.type(screen.getByLabelText("Route 1 label"), "approved");
  await user.type(
    screen.getByLabelText("Route 1 input"),
    // user-event v14 escapes `{` by doubling it; type `{{{{x}}` to
    // produce the literal `{{x}}` inside the input.
    "{{{{trigger.inputs.status}}",
  );
  await user.type(screen.getByLabelText("Route 1 value"), "ok");

  // 7. Modal Save → graphSlice.
  expect(within(modal).getByRole("button", { name: /^save$/i })).toBeEnabled();
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const persisted = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === routerNode!.id);
  expect(persisted?.config).toMatchObject({
    routes: [
      {
        label: "approved",
        condition: {
          input: "{{trigger.inputs.status}}",
          operator: "equals",
          value: "ok",
        },
      },
    ],
  });
  expect(useConfigSlice.getState().drafts[routerNode!.id]!.isDirty).toBe(false);

  // 8. Toolbar Save → updateWorkflow with the runtime-schema-shaped routes.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const callBody = mockUpdateWorkflow.mock.calls[0]![1];
  const persistedRouter = callBody.draftDefinition.nodes.find(
    (n: { provider: string; type: string }) =>
      n.provider === "native" && n.type === "router",
  );
  expect(persistedRouter.config).toMatchObject({
    routes: [
      {
        label: "approved",
        condition: {
          input: "{{trigger.inputs.status}}",
          operator: "equals",
          value: "ok",
        },
      },
    ],
  });
});

it("modal Save stays disabled while the routes editor has any per-row validation error", async () => {
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  // Manual trigger + router.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual Trigger")).toBeInTheDocument());
  await user.click(screen.getByText("Manual Trigger"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => expect(screen.getByText("Router")).toBeInTheDocument());
  await user.click(screen.getByText("Router"));

  // Only one action node exists (the router); the "Configure action
  // node" button is unique to it. The trigger row's button is
  // "Configure trigger node".
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );

  await waitFor(() =>
    expect(screen.getByTestId("router-routes-field")).toBeInTheDocument(),
  );

  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });

  // Add two rows; leave label of the SECOND empty — triggers a per-row error.
  await user.click(screen.getByRole("button", { name: /^add route$/i }));
  await user.type(screen.getByLabelText("Route 1 label"), "happy");
  await user.type(screen.getByLabelText("Route 1 input"), "x");
  await user.type(screen.getByLabelText("Route 1 value"), "y");
  await user.click(screen.getByRole("button", { name: /^add route$/i }));

  expect(
    screen.getByTestId("router-route-row-1-error"),
  ).toHaveTextContent(/label is required/i);
  expect(within(modal).getByRole("button", { name: /^save$/i })).toBeDisabled();
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();
});
