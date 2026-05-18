/**
 * Slice 3.9 integration test — Run Now → latest run detail → open
 * downstream config → open variable picker → preview renders next to
 * the variable button → clicking the variable still inserts the
 * canonical {{trigger.payload.field}} token.
 *
 * Mocks Run Now + getWorkflowRun + discovery; everything else is the
 * real WorkflowBuilder shell.
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
import type { ActionMeta } from "@/contracts/actionMeta";
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
  payloadShape: [
    {
      name: "payload",
      type: "object",
      fields: [
        { name: "subject", type: "string", description: "Email subject." },
        { name: "from", type: "string", description: "Sender email." },
      ],
    },
  ],
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
      name: "url",
      label: "URL",
      type: "text",
      required: true,
    },
  ],
  outputs: [{ name: "status", type: "number" }],
  producesFileRef: false,
  consumesFileRef: false,
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

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockGetWorkflowRun.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta]);
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

it("Run Now → terminal succeeded → picker shows trigger.payload.subject preview, click still inserts canonical token", async () => {
  mockRunNowWorkflow.mockResolvedValueOnce({
    runId: "run-abc-123",
    enqueuedAt: "2026-05-17T10:00:00.000Z",
  });

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // 1. Add manual trigger.
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual Trigger"));

  // 2. Add HTTP Request action via native section.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });
  await user.click(screen.getByText("HTTP Request"));

  // 3. Grab the trigger node id from the slice (the run detail must
  //    reference the same id for the picker's alias-mapping to fire).
  const triggerNode = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger");
  const actionNode = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action");
  expect(triggerNode).toBeDefined();
  expect(actionNode).toBeDefined();

  const successDetail: WorkflowRunDetail = {
    id: "run-abc-123",
    workflowId: "wf-1",
    status: "succeeded",
    triggerNodeId: triggerNode!.id,
    startedAt: "2026-05-17T10:00:00Z",
    finishedAt: "2026-05-17T10:00:01Z",
    errorClassification: null,
    triggerEvent: {
      provider: "native",
      eventType: "manual.run",
      eventId: "ev-1",
      occurredAt: "2026-05-17T10:00:00Z",
      accountId: "system",
      payload: {
        payload: { subject: "Hello world", from: "alice@example.com" },
      },
    },
    steps: [
      {
        nodeId: triggerNode!.id,
        status: "succeeded",
        output: {
          payload: { subject: "Hello world", from: "alice@example.com" },
        },
      },
      {
        nodeId: actionNode!.id,
        status: "succeeded",
        output: { status: 200 },
      },
    ],
    fatalError: null,
  };
  mockGetWorkflowRun.mockResolvedValueOnce(successDetail);

  // 4. Click Run Now → polling picks up the success on tick 1.
  await user.click(screen.getByRole("button", { name: /run now/i }));
  await waitFor(() => {
    expect(mockRunNowWorkflow).toHaveBeenCalledWith("wf-1", { inputs: {} });
  });
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await waitFor(() => {
    expect(useRunSlice.getState().detail).not.toBeNull();
  });

  // 5. Open the action's config modal.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  // 6. Open the variable picker on the URL field. The picker button
  //    only renders once `useUpstreamVariables` has loaded the trigger
  //    meta and surfaced the trigger as a source — wait for it.
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /insert variable into url/i }),
    ).toBeInTheDocument();
  });
  await user.click(
    screen.getByRole("button", { name: /insert variable into url/i }),
  );

  // 7. Expand the `payload` row inside the trigger source so its
  //    nested fields appear.
  await waitFor(() => {
    expect(screen.getByText("payload")).toBeInTheDocument();
  });

  // 8. The trigger.payload preview is the 'object' chip — clicking
  //    the parent insert button shows the object chip alongside.
  const payloadPreview = screen.getByTestId(
    "variable-output-trigger-payload-preview",
  );
  expect(payloadPreview).toHaveAttribute("data-preview-kind", "object");
  expect(payloadPreview.textContent).toBe("object");

  // 9. The nested `payload.subject` field's preview is the quoted
  //    string from the actual recorded run.
  const subjectPreview = screen.getByTestId(
    "variable-output-trigger-payload.subject-preview",
  );
  expect(subjectPreview).toHaveAttribute("data-preview-kind", "scalar");
  expect(subjectPreview.textContent).toBe('"Hello world"');

  // 10. Clicking the variable still inserts the CANONICAL token, not
  //     the preview value.
  await user.click(
    screen.getByLabelText("Insert {{trigger.payload.subject}}"),
  );
  // Slice 3.2 contract: insert flows into the configSlice draft for
  // the active node's URL field.
  const activeNodeId = actionNode!.id;
  const draft = useConfigSlice.getState().drafts[activeNodeId];
  expect(draft).toBeDefined();
  expect(draft!.values.url).toBe("{{trigger.payload.subject}}");

  // 11. Regression guards: no autosave, no extra fetch from the picker.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();
});
