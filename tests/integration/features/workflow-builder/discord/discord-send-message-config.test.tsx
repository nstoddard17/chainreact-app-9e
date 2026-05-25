/**
 * Slice 3.DISCORD-4 integration test — Discord `send_message` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Exercises:
 *   - guild → channel cascade (`discord:guilds` → `discord:channels`
 *     with `requiredDeps: ["guildId"]`).
 *   - message textarea.
 *   - Modal Save → Toolbar Save → exactly-once `updateWorkflow` with
 *     EXACT V1 camelCase runtime field names (`guildId`, `channelId`,
 *     `message` — NOT `guild_id` / `channel_id` / `body`).
 *
 * Mirrors `mailchimp-add-subscriber-config.test.tsx` shape — same
 * mock boundary, same WorkflowBuilder render + Trigger → Action →
 * Configure flow, same Modal/Toolbar Save split.
 *
 * Out of scope (covered separately):
 *   - The Discord resolver server-side logic — covered by
 *     `tests/unit/integrations/discord/options/*.test.ts`.
 *   - Discord ActionMeta shape (field names, sensitive outputs, risk
 *     classification) — covered by
 *     `tests/unit/integrations/discord/discoveryRegistry.test.ts`.
 *   - Provider route wire shape — covered by
 *     `tests/unit/app/api/providers/providers-route.test.ts`.
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
import { discordSendMessageMeta } from "@/integrations/discord/actions/sendMessage.meta";
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
const CHANNEL_ID = "222222222222222222";
const CHANNEL_LABEL = "#general";
const MESSAGE = "Hello from ChainReact! <@333>";

function guildsResponse() {
  return {
    ok: true as const,
    source: "discord:guilds",
    items: [
      { value: GUILD_ID, label: GUILD_LABEL },
      { value: "999999999999999999", label: "Other Server" },
    ],
    hasMore: false,
  };
}

function channelsResponse() {
  return {
    ok: true as const,
    source: "discord:channels",
    items: [
      { value: CHANNEL_ID, label: CHANNEL_LABEL },
      { value: "444444444444444444", label: "#random" },
    ],
    hasMore: false,
  };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "discord" ? [discordSendMessageMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "discord:guilds") return Promise.resolve(guildsResponse());
    if (source === "discord:channels") return Promise.resolve(channelsResponse());
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

it("Discord send_message meta exposes the 3 schema fields with V1 camelCase preserved — Slice 3.DISCORD-4 meta guard", () => {
  const names = discordSendMessageMeta.fields.map((f) => f.name);
  expect(names).toEqual(["guildId", "channelId", "message"]);
  expect(names).not.toContain("guild_id");
  expect(names).not.toContain("channel_id");

  const byName = new Map(
    discordSendMessageMeta.fields.map((f) => [f.name, f]),
  );

  // Cascade wiring.
  expect(byName.get("guildId")!.optionsSource).toBe("discord:guilds");
  expect(byName.get("guildId")!.dependsOn).toBeUndefined();
  expect(byName.get("channelId")!.optionsSource).toBe("discord:channels");
  expect(byName.get("channelId")!.dependsOn).toBe("guildId");

  // Message body.
  expect(byName.get("message")!.type).toBe("textarea");
  expect(byName.get("message")!.required).toBe(true);

  // Risk: medium / not destructive.
  expect(discordSendMessageMeta.riskLevel).toBe("medium");
  expect(discordSendMessageMeta.isDestructive).toBe(false);
  expect(discordSendMessageMeta.requiresConfirmation).toBe(false);
});

it("end-to-end: pick guild → channel cascade → fill message → Modal Save → Toolbar Save persists ONCE with EXACT camelCase field names", async () => {
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
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Drill into Discord → Send Message.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse discord actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Send Message")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Send Message"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("discord");
  expect(action.type).toBe("send_message");

  // 3. Open config rail. The Channel field has dependsOn=guildId →
  // renders as the cascade's "Select Server first" passive trigger
  // (data-testid="combobox-parent-missing") until guild is picked.
  // Pattern matches hubspot-create-deal-config.test.tsx line 308-311.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^server$/i })).toBeInTheDocument();
  });
  expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();

  // 4. Pick guild → fetches discord:guilds.
  await pickComboboxOption(user, /^server$/i, GUILD_LABEL);
  await waitFor(() => {
    const calls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "discord:guilds",
    );
    expect(calls.length).toBeGreaterThan(0);
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.guildId).toBe(GUILD_ID);

  // 5. Channel combobox becomes a real role=combobox once guild is set,
  // then re-fetches discord:channels with deps.guildId.
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^channel$/i })).toBeInTheDocument();
  });
  await pickComboboxOption(user, /^channel$/i, CHANNEL_LABEL);
  await waitFor(() => {
    const channelsCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "discord:channels",
    );
    expect(channelsCalls.length).toBeGreaterThan(0);
  });
  // Verify deps.guildId was passed.
  const channelsCalls = mockFetchOptionsSource.mock.calls.filter(
    (c) => c[0] === "discord:channels",
  );
  const lastChannelsCall = channelsCalls[channelsCalls.length - 1]!;
  expect(lastChannelsCall[1]).toMatchObject({
    deps: { guildId: GUILD_ID },
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.channelId).toBe(CHANNEL_ID);

  // 6. Fill message.
  await user.type(screen.getByRole("textbox", { name: /^message$/i }), MESSAGE);
  expect(useConfigSlice.getState().drafts[action.id]!.values.message).toBe(MESSAGE);

  // 7. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;

  // CRITICAL: V1 camelCase preservation — guildId / channelId / message
  // (NOT guild_id / channel_id / body).
  expect(pendingConfig.guildId).toBe(GUILD_ID);
  expect(pendingConfig.channelId).toBe(CHANNEL_ID);
  expect(pendingConfig.message).toBe(MESSAGE);
  expect(pendingConfig.guild_id).toBeUndefined();
  expect(pendingConfig.channel_id).toBeUndefined();
  expect(pendingConfig.body).toBeUndefined();

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
  expect(persistedAction.provider).toBe("discord");
  expect(persistedAction.type).toBe("send_message");
  expect(persistedAction.config).toEqual({
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    message: MESSAGE,
  });

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
