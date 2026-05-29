/**
 * Slice 3.10 integration test — full provider-trigger flow through the
 * real WorkflowBuilder shell.
 *
 *   1. Render the builder hydrated with an empty workflow.
 *   2. Open the trigger picker, drill into GitHub.
 *   3. Pick "New Commit" — the picker dispatches addTriggerFromMeta.
 *   4. Verify the trigger node carries provider="github" + type="new_commit".
 *   5. Open the trigger config rail → SchemaForm renders the provider
 *      trigger's fields (Repository, Branch).
 *   6. Type a repository → configSlice draft flips dirty.
 *   7. Modal Save → graphSlice.pendingNodes carries the persisted config.
 *   8. Toolbar Save → updateWorkflow is called with the configured
 *      trigger; no activation API call is made from save.
 *   9. Add a downstream action → its variable picker exposes the
 *      provider trigger's payloadShape under the `trigger` alias.
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
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

const newCommitMeta: TriggerMeta = {
  key: "github:new_commit",
  provider: "github",
  type: "new_commit",
  displayName: "New Commit",
  description: "Fires when a push lands on the configured repository.",
  category: "developer",
  activation: "webhook",
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
      name: "branch",
      label: "Branch (optional)",
      type: "text",
      required: false,
      placeholder: "main",
    },
  ],
  payloadShape: [
    { name: "repository", type: "string", description: "owner/repo." },
    { name: "branch", type: "string", description: "Branch the push landed on." },
    { name: "after", type: "string", description: "Post-push commit SHA." },
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

const triggerProviders = [{ id: "github", displayName: "GitHub" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta]);
  mockListNativeTriggers.mockReset();
  // Slice 3.10 surface: the picker also still lists native triggers.
  // None registered for this test means the user has to drill into a
  // provider — which is the path being exercised.
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "github" ? [newCommitMeta] : [],
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("end-to-end: pick GitHub new_commit via drill-in, configure, save, downstream picker sees payloadShape", async () => {
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

  // 1. Open the trigger picker.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));

  // 2. Drill into the GitHub provider.
  await user.click(
    screen.getByRole("button", { name: /browse github triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("New Commit")).toBeInTheDocument();
  });

  // 3. Pick the New Commit trigger.
  await user.click(screen.getByText("New Commit"));

  // 4. Trigger node is in the graph with provider=github + type=new_commit.
  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger");
  expect(trigger).toBeDefined();
  expect(trigger!.provider).toBe("github");
  expect(trigger!.type).toBe("new_commit");
  // Slice 3.10 regression guard: legacy bare-add path is NOT used —
  // node.type must be set to the meta's type.
  expect(trigger!.type).not.toBe("");

  // 5. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(screen.getByLabelText("Repository")).toBeInTheDocument();
  });
  expect(screen.getByLabelText("Branch (optional)")).toBeInTheDocument();
  // The header shows the meta's displayName + description. (Slice
  // 4.BUILDER-NODE-IDENTITY-1: the canvas card now also shows the node name, so
  // scope this to the config panel.)
  expect(
    within(screen.getByRole("complementary", { name: /node configuration/i })).getByText(
      "New Commit",
    ),
  ).toBeInTheDocument();

  // 6. Type a repository — configSlice draft flips dirty.
  await user.type(
    screen.getByLabelText("Repository"),
    "octocat/hello-world",
  );
  expect(useConfigSlice.getState().drafts[trigger!.id]!.isDirty).toBe(true);

  // 7. Modal Save — graphSlice.pendingNodes carries the config.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  expect(
    useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === trigger!.id)!.config,
  ).toMatchObject({ repository: "octocat/hello-world" });
  expect(useConfigSlice.getState().drafts[trigger!.id]!.isDirty).toBe(false);

  // Modal Save must NOT have called updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 8. Toolbar Save — persists workflow with the provider-trigger config.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; provider: string; type: string; config: Record<string, unknown> }>;
  const persistedTrigger = persistedNodes.find((n) => n.kind === "trigger")!;
  expect(persistedTrigger.provider).toBe("github");
  expect(persistedTrigger.type).toBe("new_commit");
  expect(persistedTrigger.config).toMatchObject({
    repository: "octocat/hello-world",
  });

  // 9. Add a downstream native action and open its variable picker — the
  //    GitHub trigger's payloadShape must surface under the canonical
  //    `trigger` alias (Slice 3.10 useUpstreamVariables extension).
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });
  await user.click(screen.getByText("HTTP Request"));

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  // Variable picker button appears once the upstream catalog resolves.
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /insert variable into url/i }),
    ).toBeInTheDocument();
  });
  await user.click(
    screen.getByRole("button", { name: /insert variable into url/i }),
  );

  // The trigger source section is rendered with the provider trigger's
  // displayName and its payloadShape fields are visible (after expansion
  // — the trigger source expands by default).
  await waitFor(() => {
    // The variable-source section is grouped under the trigger's displayName;
    // the canvas card also shows that label, so at least one occurrence is expected.
    expect(screen.getAllByText("New Commit").length).toBeGreaterThanOrEqual(1);
  });
  // payloadShape outputs render as insertable buttons.
  expect(
    screen.getByLabelText("Insert {{trigger.repository}}"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Insert {{trigger.branch}}"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Insert {{trigger.after}}"),
  ).toBeInTheDocument();

  // 10. Regression guard: only one updateWorkflow call total. No save
  //     leaked out of the picker / variable plumbing / view-only render.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
