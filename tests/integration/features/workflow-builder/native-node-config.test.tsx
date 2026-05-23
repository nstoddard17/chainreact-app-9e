/**
 * Slice 3.2 integration test — full add-native-action → configure →
 * save round trip through the real WorkflowBuilder shell.
 *
 * Verifies the user-facing flow end-to-end with mocked `lib/api/*`:
 *   1. Sign in (mocked).
 *   2. Render WorkflowBuilder.
 *   3. Add a trigger (provider Slack, legacy path).
 *   4. Add a native HTTP Request action via the Native section.
 *   5. Click Configure on the action → SchemaForm renders.
 *   6. Edit URL.
 *   7. Save (modal) → graphSlice node.config updated.
 *   8. Save (workflow toolbar) → updateWorkflow called with the new config.
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
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
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
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

const slackTriggerMeta: TriggerMeta = {
  key: "slack:slack.message.channel",
  provider: "slack",
  type: "slack.message.channel",
  displayName: "Slack Message",
  description: "Slack message in a channel.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Send an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [
    {
      name: "method",
      label: "Method",
      type: "select",
      required: true,
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ],
    },
    {
      name: "url",
      label: "URL",
      type: "text",
      required: true,
    },
    {
      name: "timeoutSeconds",
      label: "Timeout",
      type: "number",
      required: false,
      defaultValue: 15,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
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
  createdAt: "2026-05-06T00:00:00Z",
  updatedAt: "2026-05-06T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "slack" ? [slackTriggerMeta] : [],
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

it("end-to-end: add native action, configure, save modal, save workflow", async () => {
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

  // 1. Add Slack trigger via the Slice 3.10 drill-in.
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await user.click(
    screen.getByRole("button", { name: /browse slack triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Slack Message")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Slack Message"));

  // 2. Open the action picker, pick the native HTTP Request action.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });
  await user.click(screen.getByText("HTTP Request"));

  // 3. Verify the action node appeared with provider=native + default config.
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.provider === "native");
  expect(action).toBeDefined();
  expect(action!.type).toBe("http_request");
  expect(action!.config).toEqual({ timeoutSeconds: 15 });

  // 4. Click Configure to open the modal.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  // 5. Edit URL field.
  await user.type(screen.getByLabelText("URL"), "https://api.example.com");
  expect(useConfigSlice.getState().drafts[action!.id]!.isDirty).toBe(true);

  // 6. Save modal — writes draft into graphSlice. The modal save and
  // toolbar save share the accessible name "Save"; scope to the modal
  // aside element to pick the right one.
  const modal = screen.getByRole("complementary", { name: /node configuration/i });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  expect(
    useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === action!.id)!.config,
  ).toMatchObject({
    url: "https://api.example.com",
    timeoutSeconds: 15,
  });
  expect(useConfigSlice.getState().drafts[action!.id]!.isDirty).toBe(false);

  // 7. Toolbar Save — calls updateWorkflow with the persisted config.
  // Toolbar save is the only Save button OUTSIDE the modal aside.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSaveButton = allSaveButtons.find(
    (btn) => !modal.contains(btn),
  )!;
  await user.click(toolbarSaveButton);

  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const callBody = mockUpdateWorkflow.mock.calls[0]![1];
  const persistedAction = callBody.draftDefinition.nodes.find(
    (n: { provider: string }) => n.provider === "native",
  );
  expect(persistedAction.config).toMatchObject({
    url: "https://api.example.com",
    timeoutSeconds: 15,
  });
});
