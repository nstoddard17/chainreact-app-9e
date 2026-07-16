/**
 * Slice 3.37 integration test — Slack `invite_users_to_channel` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for Group C (channel management). Proves the
 * shape `{channel (combobox), users (string-array), sendInviteNotification
 * (boolean)}` round-trips through the builder shell:
 *   - channel renders as async combobox sourced from `slack:channels`,
 *   - users renders as the per-chip option picker (CONFIG-UX sweep:
 *     string-array + `slack:users` optionsSource + allowManualEntry —
 *     gmail labelIds pattern),
 *   - picking a person stores the stable U-id VALUE; manual entry still
 *     appends a raw typed id,
 *   - sendInviteNotification renders as a Radix Switch,
 *   - selecting a channel writes the underlying channel id,
 *   - the users draft is a `string[]` (NOT CSV-encoded text),
 *   - Modal Save flushes draft into pendingNodes,
 *   - Modal Save does NOT call updateWorkflow,
 *   - Toolbar Save persists once via `updateWorkflow` with channel id,
 *     `users: string[]`, and sendInviteNotification.
 *
 * Out of scope: integration tests for the other 11 Group C actions —
 * they share the channel-picker + scalar-field shapes; registry tests
 * cover their meta correctness per-action.
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
import { slackInviteUsersToChannelMeta } from "@/integrations/slack/actions/channels/inviteUsersToChannel.meta";
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
    p === "slack" ? [slackInviteUsersToChannelMeta] : [],
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
          { value: "C01ABC23DEF", label: "#general" },
          { value: "C02XYZ45GHI", label: "#engineering" },
        ],
        hasMore: false,
      };
    }
    if (source === "slack:users") {
      return {
        ok: true,
        source: "slack:users",
        items: [
          { value: "U01ABC23DEF", label: "Alice Anderson" },
          { value: "U02XYZ45GHI", label: "Bob Brown" },
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

it("Slack invite_users_to_channel meta declares channel (combobox), users (string-array), sendInviteNotification (boolean) — Slice 3.37 meta guard", () => {
  const channel = slackInviteUsersToChannelMeta.fields.find(
    (f) => f.name === "channel",
  );
  expect(channel).toBeDefined();
  expect(channel!.type).toBe("combobox");
  expect(channel!.optionsSource).toBe("slack:channels");
  expect(channel!.required).toBe(true);

  const users = slackInviteUsersToChannelMeta.fields.find(
    (f) => f.name === "users",
  );
  expect(users).toBeDefined();
  expect(users!.type).toBe("string-array");
  expect(users!.required).toBe(true);
  // CONFIG-UX sweep: per-chip picker over the registered slack:users
  // resolver; manual entry keeps the paste/wire-an-id path.
  expect(users!.optionsSource).toBe("slack:users");
  expect(users!.allowManualEntry).toBe(true);

  const flag = slackInviteUsersToChannelMeta.fields.find(
    (f) => f.name === "sendInviteNotification",
  );
  expect(flag).toBeDefined();
  expect(flag!.type).toBe("boolean");
  expect(flag!.required).toBe(true);
  expect(flag!.defaultValue).toBeUndefined();
});

it("end-to-end: pick channel + add two users (picker option + manual entry) + toggle notification → Modal Save (draft only) → Toolbar Save (updateWorkflow once with users:string[])", async () => {
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

  // 2. Drill into Slack → Invite Users to Channel.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Invite Users to Channel")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Invite Users to Channel"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("slack");
  expect(action.type).toBe("invite_users_to_channel");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^channel$/i }),
    ).toBeInTheDocument();
  });
  // Users renders as the per-chip option picker (add-button trigger), not a
  // free-text input.
  expect(screen.getByTestId("string-array-users-add")).toBeInTheDocument();
  expect(
    screen.queryByRole("textbox", { name: /^user ids$/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("switch", { name: /send invite notification/i }),
  ).toBeInTheDocument();

  // 4. Pick channel — combobox writes id, not label.
  await pickComboboxOption(user, /^channel$/i, "#engineering");
  expect(useConfigSlice.getState().drafts[action.id]!.values.channel).toBe(
    "C02XYZ45GHI",
  );

  // 5. Add two user chips. First by picking a resolver option (stores the
  //    stable U-id VALUE, shows the friendly label), second via manual
  //    entry (paste-a-raw-id path preserved by allowManualEntry).
  await user.click(screen.getByTestId("string-array-users-add"));
  await user.click(await screen.findByText("Alice Anderson"));
  await user.type(await screen.findByPlaceholderText(/U01ABC23DEF/i), "U99MANUAL00");
  await user.click(await screen.findByTestId("string-array-manual-entry"));

  // Draft holds a real string[] of U-ids (NOT CSV, NOT JSON-encoded, NOT labels).
  const usersDraft = useConfigSlice.getState().drafts[action.id]!.values.users;
  expect(Array.isArray(usersDraft)).toBe(true);
  expect(usersDraft).toEqual(["U01ABC23DEF", "U99MANUAL00"]);

  // 6. Toggle Send Invite Notification on.
  await user.click(
    screen.getByRole("switch", { name: /send invite notification/i }),
  );
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.sendInviteNotification,
  ).toBe(true);

  // 7. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.channel).toBe("C02XYZ45GHI");
  expect(pendingConfig.users).toEqual(["U01ABC23DEF", "U99MANUAL00"]);
  expect(Array.isArray(pendingConfig.users)).toBe(true);
  expect(pendingConfig.sendInviteNotification).toBe(true);

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 8. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("invite_users_to_channel");
  expect(persistedAction.config.channel).toBe("C02XYZ45GHI");
  expect(persistedAction.config.users).toEqual([
    "U01ABC23DEF",
    "U99MANUAL00",
  ]);
  expect(Array.isArray(persistedAction.config.users)).toBe(true);
  expect(persistedAction.config.sendInviteNotification).toBe(true);

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
