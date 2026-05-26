/**
 * Slice 3.4 integration test — full add-provider-action → configure →
 * save round trip through WorkflowBuilder.
 *
 *   1. Render WorkflowBuilder hydrated with an empty workflow.
 *   2. Add a Slack trigger via the trigger picker (legacy provider path
 *      still in use; provider-trigger wrappers are deferred).
 *   3. Open the action picker, click the GitHub provider button (drill-in).
 *   4. Pick "Add Comment" from the GitHub action list.
 *   5. Verify the action node has provider=github, type=add_comment.
 *   6. Click Configure to open the modal.
 *   7. ConfigModalShell loads the github catalog through
 *      useProviderActions and renders the meta's fields via SchemaForm.
 *   8. Edit the Repository field → modal Save writes the new config
 *      into graphSlice.
 *   9. Toolbar Save calls updateWorkflow with the configured provider
 *      action.
 *  10. Run Now panel must NOT appear (workflow's trigger is Slack, not
 *      native:manual.run).
 *
 * Pins the architectural boundaries from Slice 3.2 / 3.3 / 3.4:
 *   - Modal Save updates pending graph state only.
 *   - Toolbar Save persists via updateWorkflow.
 *   - useProviderActions is the only listProviderActions caller.
 *   - The legacy bare addAction({provider}) path is not reachable
 *     through this UI (drill-in always picks a meta).
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

import { openLastNodeOfKind } from "./helpers/openLastNodeOfKind";
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
import type { WorkflowDetail } from "@/contracts/workflow";

const addCommentMeta: ActionMeta = {
  key: "github:add_comment",
  provider: "github",
  type: "add_comment",
  displayName: "Add Comment",
  description: "Add a comment to a GitHub issue or PR.",
  category: "developer",
  requiresIntegration: true,
  fields: [
    {
      name: "repository",
      label: "Repository",
      type: "text",
      required: true,
      placeholder: "octocat/hello-world",
    },
    {
      name: "issueNumber",
      label: "Issue or PR Number",
      type: "number",
      required: true,
      numeric: { min: 1, integer: true, step: 1 },
    },
    {
      name: "body",
      label: "Body",
      type: "textarea",
      required: true,
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
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
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [
  { id: "github", displayName: "GitHub" },
  { id: "gmail", displayName: "Gmail" },
];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
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

it("end-to-end: drill into provider, pick action from metadata, configure, save modal, save workflow", async () => {
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "github" ? [addCommentMeta] : [],
  );
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

  // 1. Add a Slack trigger via the Slice 3.10 drill-in path.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(
      screen.getByRole("list", { name: /trigger providers/i }),
    ).toBeInTheDocument();
  });
  await user.click(
    screen.getByRole("button", { name: /browse slack triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Slack Message")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Slack Message"));

  // 2. Open the action picker, drill into the GitHub provider.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse github actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Add Comment")).toBeInTheDocument();
  });

  // 3. Pick the Add Comment action.
  await user.click(screen.getByText("Add Comment"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action");
  expect(action).toBeDefined();
  expect(action!.provider).toBe("github");
  expect(action!.type).toBe("add_comment");

  // 4. Open the modal via Configure.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByLabelText("Repository")).toBeInTheDocument();
  });
  expect(screen.getByLabelText("Issue or PR Number")).toBeInTheDocument();
  expect(screen.getByLabelText("Body")).toBeInTheDocument();

  // 5. Edit Repository → modal Save writes the new config.
  await user.type(screen.getByLabelText("Repository"), "octocat/hello-world");
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  expect(
    useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === action!.id)!.config,
  ).toMatchObject({ repository: "octocat/hello-world" });
  expect(useConfigSlice.getState().drafts[action!.id]!.isDirty).toBe(false);

  // 6. Toolbar Save — updateWorkflow called with the configured action.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const callBody = mockUpdateWorkflow.mock.calls[0]![1];
  const persistedAction = callBody.draftDefinition.nodes.find(
    (n: { kind: string }) => n.kind === "action",
  );
  expect(persistedAction.provider).toBe("github");
  expect(persistedAction.type).toBe("add_comment");
  expect(persistedAction.config).toMatchObject({
    repository: "octocat/hello-world",
  });

  // 7. Run Now panel not present (trigger is Slack, not native:manual.run).
  expect(
    screen.queryByRole("region", { name: /manual run/i }),
  ).not.toBeInTheDocument();
});

it("drill-in for a provider with no shipped metadata renders the empty-state hint", async () => {
  mockListProviderActions.mockImplementation(async () => []);
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // Same Slack-trigger setup via the Slice 3.10 drill-in.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(
      screen.getByRole("list", { name: /trigger providers/i }),
    ).toBeInTheDocument();
  });
  await user.click(
    screen.getByRole("button", { name: /browse slack triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Slack Message")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Slack Message"));

  // Drill into Gmail (no metadata in this test).
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse gmail actions/i }),
  );
  await waitFor(() => {
    expect(
      screen.getByText(/hasn.t shipped action metadata yet/i),
    ).toBeInTheDocument();
  });
  // Going back works.
  await user.click(
    screen.getByRole("button", { name: /back to action picker/i }),
  );
  expect(
    screen.getByRole("list", { name: /action providers/i }),
  ).toBeInTheDocument();
});
