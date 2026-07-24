/**
 * Slice 3.35 integration test — Slack `send_channel_message` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Proves that the messaging Group A meta plus the Slice 3.32 async
 * `slack:channels` options source compose with the existing builder
 * shell:
 *   - the `channel` field renders as an async combobox sourced from
 *     `slack:channels`,
 *   - the `text` field renders as a textarea,
 *   - selecting a channel writes the underlying channel id (not the
 *     `#name` label) into the draft,
 *   - Modal Save flushes the draft into pendingNodes,
 *   - Modal Save does NOT call updateWorkflow,
 *   - Toolbar Save persists the same shape through `updateWorkflow`.
 *
 * Out of scope: per-action integration tests for the other 7 Group A
 * actions. Per the Slack action metadata plan (§8.3), one canonical
 * builder-shell test per UX shape is sufficient — the registry +
 * provider-route tests cover meta correctness for every action.
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
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

// The async `channel` combobox loads via the typed options client.
// Mock so the picker renders deterministic items without a real
// network round-trip.
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
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
import { slackSendChannelMessageMeta } from "@/integrations/slack/actions/sendChannelMessage.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "./helpers/comboboxField";

const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual",
  description: "Fired manually via Run Now.",
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
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "slack" ? [slackSendChannelMessageMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "slack:channels") {
      return {
        ok: true,
        source: "slack:channels",
        items: [
          {
            value: "C01ABC23DEF",
            label: "#general",
            description: "Company-wide announcements",
          },
          { value: "C02XYZ45GHI", label: "#engineering" },
        ],
        hasMore: false,
      };
    }
    return {
      ok: false,
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source '${source}'.`,
    };
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Slack send_channel_message meta declares channel as combobox+slack:channels and text as textarea (Slice 3.35 — meta guard)", () => {
  const channel = slackSendChannelMessageMeta.fields.find(
    (f) => f.name === "channel",
  );
  expect(channel).toBeDefined();
  expect(channel!.type).toBe("combobox");
  expect(channel!.optionsSource).toBe("slack:channels");
  expect(channel!.required).toBe(true);

  const text = slackSendChannelMessageMeta.fields.find((f) => f.name === "text");
  expect(text).toBeDefined();
  expect(text!.type).toBe("textarea");
  expect(text!.required).toBe(true);
});

it("end-to-end: async channel combobox → message textarea → Modal Save (draft only) → Toolbar Save (updateWorkflow with channel id + text)", async () => {
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

  // 1. Trigger.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Drill into Slack → Send Channel Message.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Send Channel Message")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Send Channel Message"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("slack");
  expect(action.type).toBe("send_channel_message");

  // 3. Open config rail. channel = async combobox; text = textarea.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^channel$/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();

  // 4. Pick a channel via the async picker. Saved value is the
  //    underlying channel id, not the visible label.
  await pickComboboxOption(user, /^channel$/i, "#engineering");
  expect(useConfigSlice.getState().drafts[action.id]!.values.channel).toBe(
    "C02XYZ45GHI",
  );
  expect(mockFetchOptionsSource).toHaveBeenCalled();
  expect(mockFetchOptionsSource.mock.calls[0]![0]).toBe("slack:channels");

  // 5. Type the message body.
  await user.type(
    screen.getByRole("textbox", { name: /^message$/i }),
    "Build is green",
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.text).toBe(
    "Build is green",
  );

  // 6. Modal Save flushes the draft into pendingNodes.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.channel).toBe("C02XYZ45GHI");
  expect(pendingConfig.text).toBe("Build is green");
  expect(pendingConfig.threadTs).toBeUndefined();

  // Modal Save MUST NOT call updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 7. Toolbar Save persists.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{
    kind: string;
    provider: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("slack");
  expect(persistedAction.type).toBe("send_channel_message");
  expect(persistedAction.config.channel).toBe("C02XYZ45GHI");
  expect(persistedAction.config.text).toBe("Build is green");
  expect(persistedAction.config.threadTs).toBeUndefined();

  // Single updateWorkflow call — picker / textarea interactions must
  // not double-fire workflow persistence.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
