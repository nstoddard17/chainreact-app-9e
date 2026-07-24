/**
 * Slice 3.DISCORD-4 integration test — Discord `assign_role` config
 * end-to-end through the WorkflowBuilder shell.
 *
 * Exercises the THREE-FIELD cascade:
 *   - guildId → discord:guilds (no deps).
 *   - userId → discord:members (deps: ["guildId"]).
 *   - roleId → discord:roles (deps: ["guildId"]).
 *
 * Both `userId` and `roleId` depend on `guildId` — when the guild
 * changes, both child pickers re-fetch with the new guildId dep.
 * This is a wider cascade than send_message's two-field chain.
 *
 * Verifies that the persisted config preserves V1 camelCase field
 * names (`guildId`, `userId`, `roleId` — NOT snake_case, NOT
 * `memberId`).
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

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { openLastNodeOfKind } from "../helpers/openLastNodeOfKind";
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
import { discordAssignRoleMeta } from "@/integrations/discord/actions/assignRole.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "../helpers/comboboxField";

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
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "discord", displayName: "Discord" }];

const GUILD_ID = "111111111111111111";
const GUILD_LABEL = "ChainReact HQ";
const USER_ID = "555555555555555555";
const USER_LABEL = "alice";
const ROLE_ID = "666666666666666666";
const ROLE_LABEL = "Moderator";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "discord" ? [discordAssignRoleMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "discord:guilds") {
      return Promise.resolve({
        ok: true as const,
        source,
        items: [{ value: GUILD_ID, label: GUILD_LABEL }],
        hasMore: false,
      });
    }
    if (source === "discord:members") {
      return Promise.resolve({
        ok: true as const,
        source,
        items: [{ value: USER_ID, label: USER_LABEL }],
        hasMore: false,
      });
    }
    if (source === "discord:roles") {
      return Promise.resolve({
        ok: true as const,
        source,
        items: [{ value: ROLE_ID, label: ROLE_LABEL }],
        hasMore: false,
      });
    }
    return Promise.resolve({
      ok: false,
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source '${source}' (test mock).`,
    });
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Discord assign_role meta exposes 3 fields with both children depending on guildId — meta guard", () => {
  expect(discordAssignRoleMeta.fields.map((f) => f.name)).toEqual([
    "guildId",
    "userId",
    "roleId",
  ]);
  const byName = new Map(
    discordAssignRoleMeta.fields.map((f) => [f.name, f]),
  );
  expect(byName.get("guildId")!.optionsSource).toBe("discord:guilds");
  expect(byName.get("guildId")!.dependsOn).toBeUndefined();
  expect(byName.get("userId")!.optionsSource).toBe("discord:members");
  expect(byName.get("userId")!.dependsOn).toBe("guildId");
  expect(byName.get("roleId")!.optionsSource).toBe("discord:roles");
  expect(byName.get("roleId")!.dependsOn).toBe("guildId");
});

it("end-to-end: guild → members + roles wide cascade → Save persists exact camelCase config", async () => {
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

  // 2. Add Discord → Assign Role.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse discord actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Assign Role")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Assign Role"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("discord");
  expect(action.type).toBe("assign_role");

  // 3. Open config rail. BOTH userId and roleId have dependsOn=guildId,
  // so BOTH render as the cascade's "Select Server first" passive
  // trigger (data-testid="combobox-parent-missing") until guild is
  // picked. Pattern matches hubspot-create-deal-config.test.tsx
  // line 308-311.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^server$/i })).toBeInTheDocument();
  });
  expect(screen.getAllByTestId("combobox-parent-missing")).toHaveLength(2);

  // 4. Pick guild — triggers discord:guilds fetch.
  await pickComboboxOption(user, /^server$/i, GUILD_LABEL);
  expect(useConfigSlice.getState().drafts[action.id]!.values.guildId).toBe(GUILD_ID);

  // 5. Member + Role comboboxes become real role=combobox once guild
  // is set. Pick member — cascade fetches discord:members with
  // deps.guildId.
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^member$/i })).toBeInTheDocument();
  });
  await pickComboboxOption(user, /^member$/i, USER_LABEL);
  await waitFor(() => {
    const calls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "discord:members",
    );
    expect(calls.length).toBeGreaterThan(0);
  });
  const memberCalls = mockFetchOptionsSource.mock.calls.filter(
    (c) => c[0] === "discord:members",
  );
  expect(memberCalls[memberCalls.length - 1]![1]).toMatchObject({
    deps: { guildId: GUILD_ID },
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.userId).toBe(USER_ID);

  // 6. Pick role — cascade fetches discord:roles with deps.guildId.
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^role$/i })).toBeInTheDocument();
  });
  await pickComboboxOption(user, /^role$/i, ROLE_LABEL);
  await waitFor(() => {
    const calls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "discord:roles",
    );
    expect(calls.length).toBeGreaterThan(0);
  });
  const roleCalls = mockFetchOptionsSource.mock.calls.filter(
    (c) => c[0] === "discord:roles",
  );
  expect(roleCalls[roleCalls.length - 1]![1]).toMatchObject({
    deps: { guildId: GUILD_ID },
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.roleId).toBe(ROLE_ID);

  // 7. Modal Save → Toolbar Save → persisted config preserves
  // V1 camelCase (guildId / userId / roleId — NOT memberId / roleID).
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig).toEqual({
    guildId: GUILD_ID,
    userId: USER_ID,
    roleId: ROLE_ID,
  });
  expect(pendingConfig.memberId).toBeUndefined();
  expect(pendingConfig.guild_id).toBeUndefined();

  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; config: Record<string, unknown> }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.config).toEqual({
    guildId: GUILD_ID,
    userId: USER_ID,
    roleId: ROLE_ID,
  });
});
