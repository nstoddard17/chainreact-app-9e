/**
 * Slice 3.11 integration test — full Slack provider-trigger flow through
 * the real WorkflowBuilder shell. Mirrors the GitHub test at
 * `provider-trigger-config.test.tsx` for the second covered provider.
 *
 *   1. Render the builder hydrated with an empty workflow.
 *   2. Open the trigger picker, drill into Slack.
 *   3. Pick "New Message in Channel" — picker dispatches addTriggerFromMeta.
 *   4. Verify the trigger node carries provider="slack" + type="message.channel".
 *      Slack `type` values are dotted ("message.channel") — the picker
 *      and addTriggerFromMeta path must preserve dots end-to-end.
 *   5. Open the trigger config rail → SchemaForm renders the provider
 *      trigger's fields (Channel ID).
 *   6. Type a channel id → configSlice draft flips dirty.
 *   7. Modal Save → graphSlice.pendingNodes carries the persisted config.
 *      Modal Save MUST NOT trigger updateWorkflow (no hidden autosave) or
 *      activation (no hidden webhook subscription create from Save).
 *   8. Toolbar Save → updateWorkflow called once with the configured
 *      trigger.
 *   9. Add a downstream action → its variable picker exposes the Slack
 *      trigger's payloadShape under the canonical `trigger` alias.
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
  listAiActions: () => Promise.resolve([]),
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

const newMessageChannelMeta: TriggerMeta = {
  key: "slack:message.channel",
  provider: "slack",
  type: "message.channel",
  displayName: "New Message in Channel",
  description:
    "Fires when a message is posted to a public Slack channel. Optionally filter to a single channel by id.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      label: "Channel ID (optional)",
      type: "text",
      required: false,
      placeholder: "C0123456789",
    },
  ],
  payloadShape: [
    { name: "text", type: "string", description: "Message text." },
    { name: "user", type: "string", description: "Sender user id." },
    { name: "channel", type: "string", description: "Channel id." },
    { name: "ts", type: "string", description: "Slack message timestamp." },
  ],
  displayOrder: 10,
};

const reactionAddedMeta: TriggerMeta = {
  key: "slack:reaction_added",
  provider: "slack",
  type: "reaction_added",
  displayName: "Reaction Added",
  description: "Fires when a reaction is added.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "reactionEmoji",
      label: "Emoji (optional)",
      type: "text",
      required: false,
      placeholder: "thumbsup",
    },
  ],
  payloadShape: [
    { name: "reaction", type: "string" },
    { name: "user", type: "string" },
  ],
  displayOrder: 50,
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

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "slack" ? [newMessageChannelMeta, reactionAddedMeta] : [],
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("end-to-end: pick Slack message.channel via drill-in, configure, save, downstream picker sees payloadShape", async () => {
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

  // 2. Drill into the Slack provider.
  await user.click(
    screen.getByRole("button", { name: /browse slack triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("New Message in Channel")).toBeInTheDocument();
  });
  // Both Slack triggers from the mocked catalog render.
  expect(screen.getByText("Reaction Added")).toBeInTheDocument();

  // 3. Pick the New Message in Channel trigger.
  await user.click(screen.getByText("New Message in Channel"));

  // 4. Trigger node is in the graph with provider=slack + type=message.channel.
  //    Slack uses dotted type strings — guard the dot survives the meta →
  //    graphSlice → pendingNodes plumbing.
  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger");
  expect(trigger).toBeDefined();
  expect(trigger!.provider).toBe("slack");
  expect(trigger!.type).toBe("message.channel");
  expect(trigger!.type).toContain(".");

  // 5. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(screen.getByLabelText(/channel id \(optional\)/i)).toBeInTheDocument();
  });
  // Header shows the meta's displayName.
  expect(screen.getByText("New Message in Channel")).toBeInTheDocument();

  // 6. Type a channel id — configSlice draft flips dirty.
  await user.type(
    screen.getByLabelText(/channel id \(optional\)/i),
    "C0123456789",
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
  ).toMatchObject({ channelId: "C0123456789" });
  expect(useConfigSlice.getState().drafts[trigger!.id]!.isDirty).toBe(false);

  // Modal Save MUST NOT have called updateWorkflow yet — Slice 3.10
  // boundary: modal Save writes pending config only, no hidden autosave,
  // no hidden activation.
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
  expect(persistedTrigger.provider).toBe("slack");
  expect(persistedTrigger.type).toBe("message.channel");
  expect(persistedTrigger.config).toMatchObject({
    channelId: "C0123456789",
  });

  // 9. Add a downstream native action and open its variable picker — the
  //    Slack trigger's payloadShape must surface under the canonical
  //    `trigger` alias.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });
  await user.click(screen.getByText("HTTP Request"));

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /insert variable into url/i }),
    ).toBeInTheDocument();
  });
  await user.click(
    screen.getByRole("button", { name: /insert variable into url/i }),
  );

  // The trigger source section is rendered with the Slack trigger's
  // displayName and its payloadShape fields are visible.
  await waitFor(() => {
    expect(screen.getByText("New Message in Channel")).toBeInTheDocument();
  });
  expect(
    screen.getByLabelText("Insert {{trigger.text}}"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Insert {{trigger.user}}"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Insert {{trigger.channel}}"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Insert {{trigger.ts}}"),
  ).toBeInTheDocument();

  // 10. Regression guard: only one updateWorkflow call total. No save
  //     leaked out of the picker / variable plumbing / view-only render.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
