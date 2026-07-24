/**
 * Tests for features/workflow-builder/panels/AddNodePanel.
 *
 * AddNodePanel (Slice 4.BUILDER-ADD-FLOW-1) is a searchable modal that
 * composes the existing TriggerPicker / ActionPicker. The picker
 * internals (graphSlice dispatch, drill-in semantics) are still covered
 * by `TriggerPicker.test.tsx` + `ActionPicker.test.tsx`. This file
 * targets the panel-specific contracts: modal chrome, search filtering,
 * provider icons in chips, mode switching, and insert-context plumbing.
 */
const mockListNativeActions = jest.fn<
  Promise<readonly unknown[]>,
  []
>(async () => []);
const mockListNativeTriggers = jest.fn<
  Promise<readonly unknown[]>,
  []
>(async () => []);
const mockListProviderActions = jest.fn<
  Promise<readonly unknown[]>,
  [string]
>(async (_p: string) => []);
const mockListProviderTriggers = jest.fn<
  Promise<readonly unknown[]>,
  [string]
>(async (_p: string) => []);
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

import type * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AddNodePanel,
  type ProviderOption,
} from "@/features/workflow-builder/panels/AddNodePanel";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

const triggerProviders: readonly ProviderOption[] = [
  { id: "slack", displayName: "Slack", iconUrl: "/integrations/slack.svg" },
  { id: "github", displayName: "GitHub", iconUrl: "/integrations/github.svg" },
  // Intentionally no iconUrl — exercises the fallback path.
  { id: "monday", displayName: "Monday" },
];
const actionProviders: readonly ProviderOption[] = [
  { id: "slack", displayName: "Slack", iconUrl: "/integrations/slack.svg" },
  { id: "gmail", displayName: "Gmail", iconUrl: "/integrations/gmail.svg" },
];
const providerIcons: Readonly<Record<string, string>> = {
  slack: "/integrations/slack.svg",
  github: "/integrations/github.svg",
  gmail: "/integrations/gmail.svg",
};

const manualTrigger: TriggerMeta = {
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

const scheduledTrigger: TriggerMeta = {
  key: "native:schedule.fired",
  provider: "native",
  type: "schedule.fired",
  displayName: "Scheduled Trigger",
  description: "Fires on a cron schedule.",
  category: "logic",
  activation: "scheduled",
  requiresIntegration: false,
  fields: [],
  payloadShape: [],
  displayOrder: 20,
};

const slackMessageTrigger: TriggerMeta = {
  key: "slack:slack.message.channel",
  provider: "slack",
  type: "slack.message.channel",
  displayName: "Slack Message in a channel",
  description: "Fires when a new message is posted.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

const httpRequestAction: ActionMeta = {
  key: "native:http.request",
  provider: "native",
  type: "http.request",
  displayName: "HTTP Request",
  description: "Make an HTTP request to any URL.",
  fields: [],
  payloadShape: [],
  category: "data",
  requiresIntegration: false,
  hasSideEffects: true,
  destructive: false,
  riskLevel: "medium",
  displayOrder: 10,
} as unknown as ActionMeta;

beforeEach(() => {
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestAction]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTrigger, scheduledTrigger]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
});

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof AddNodePanel>> = {},
) {
  const onPickTrigger = jest.fn();
  const onPickAction = jest.fn();
  const onClose = jest.fn();
  const result = render(
    <AddNodePanel
      mode={{ kind: "trigger" }}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      providerIcons={providerIcons}
      onPickTrigger={onPickTrigger}
      onPickAction={onPickAction}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...result, onPickTrigger, onPickAction, onClose };
}

describe("AddNodePanel — chrome", () => {
  it("renders the modal landmark + dialog role + dynamic title for trigger mode", () => {
    renderPanel({ mode: { kind: "trigger" } });
    expect(screen.getByTestId("add-node-panel")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: /choose a trigger/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /choose a trigger/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'Choose an action' title for action mode", () => {
    renderPanel({ mode: { kind: "action" } });
    expect(
      screen.getByRole("heading", { name: /choose an action/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'Insert action' title for insertAction mode (with edge id)", () => {
    renderPanel({ mode: { kind: "insertAction", edgeId: "e-42" } });
    expect(
      screen.getByRole("heading", { name: /insert action/i }),
    ).toBeInTheDocument();
  });

  it("close × calls onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(
      screen.getByRole("button", { name: /close add-node panel/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop closes the panel; clicks inside the card don't", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    const card = screen.getByRole("dialog");
    await user.click(card);
    expect(onClose).not.toHaveBeenCalled();
    // Click the outer overlay region directly.
    const overlay = screen.getByTestId("add-node-panel");
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc closes the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc with defaultPrevented does NOT close (nested popovers can swallow Esc)", () => {
    const { onClose } = renderPanel();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("AddNodePanel — search", () => {
  it("filters native triggers by the search input (case-insensitive)", async () => {
    const user = userEvent.setup();
    renderPanel({ mode: { kind: "trigger" } });
    await waitFor(() => {
      expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
      expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("searchbox", { name: /search add-node panel/i }),
      "sched",
    );
    expect(screen.queryByText("Manual Trigger")).toBeNull();
    expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
  });

  it("filters native actions by the search input", async () => {
    const user = userEvent.setup();
    renderPanel({ mode: { kind: "action" } });
    await waitFor(() => {
      expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("searchbox", { name: /search add-node panel/i }),
      "zzz nothing matches",
    );
    expect(screen.queryByText("HTTP Request")).toBeNull();
    expect(screen.getByText(/no matches in native actions/i)).toBeInTheDocument();
  });

  it("provider chips stay visible regardless of search query (discoverability)", async () => {
    const user = userEvent.setup();
    renderPanel({ mode: { kind: "trigger" } });
    await user.type(
      screen.getByRole("searchbox", { name: /search add-node panel/i }),
      "no-match-query",
    );
    expect(
      screen.getByRole("button", { name: /browse slack triggers/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /browse github triggers/i }),
    ).toBeInTheDocument();
  });
});

describe("AddNodePanel — provider icons", () => {
  it("renders provider chip icons in trigger-mode list", async () => {
    renderPanel({ mode: { kind: "trigger" } });
    const slackChip = await screen.findByRole("button", {
      name: /browse slack triggers/i,
    });
    const slackImg = within(slackChip).getByTestId("picker-provider-icon");
    expect(slackImg.querySelector("img")?.getAttribute("src")).toBe(
      "/integrations/slack.svg",
    );
  });

  it("falls back to initial-letter chip when iconUrl is absent for a provider", async () => {
    renderPanel({ mode: { kind: "trigger" } });
    const mondayChip = await screen.findByRole("button", {
      name: /browse monday triggers/i,
    });
    // Monday provider has no iconUrl in the map above.
    expect(
      within(mondayChip).getByTestId("picker-provider-icon-fallback"),
    ).toBeInTheDocument();
  });

  it("renders provider chip icons in action-mode list", async () => {
    renderPanel({ mode: { kind: "action" } });
    const gmailChip = await screen.findByRole("button", {
      name: /browse gmail actions/i,
    });
    expect(
      within(gmailChip).getByTestId("picker-provider-icon"),
    ).toBeInTheDocument();
  });
});

describe("AddNodePanel — pick + close", () => {
  it("selecting a native trigger calls onPickTrigger + onClose", async () => {
    const user = userEvent.setup();
    const { onPickTrigger, onClose } = renderPanel({ mode: { kind: "trigger" } });
    await waitFor(() => screen.getByText("Manual Trigger"));
    await user.click(screen.getByText("Manual Trigger"));
    expect(onPickTrigger).toHaveBeenCalledWith(manualTrigger);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selecting a provider trigger drills in + then calls onPickTrigger + onClose", async () => {
    const user = userEvent.setup();
    mockListProviderTriggers.mockResolvedValueOnce([slackMessageTrigger]);
    const { onPickTrigger, onClose } = renderPanel({ mode: { kind: "trigger" } });
    await user.click(
      await screen.findByRole("button", { name: /browse slack triggers/i }),
    );
    await waitFor(() =>
      screen.getByText("Slack Message in a channel"),
    );
    await user.click(screen.getByText("Slack Message in a channel"));
    expect(onPickTrigger).toHaveBeenCalledWith(slackMessageTrigger);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selecting an action in default action mode forwards insertContext: null", async () => {
    const user = userEvent.setup();
    const { onPickAction, onClose } = renderPanel({ mode: { kind: "action" } });
    await waitFor(() => screen.getByText("HTTP Request"));
    await user.click(screen.getByText("HTTP Request"));
    expect(onPickAction).toHaveBeenCalledWith(httpRequestAction, null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selecting an action in insertAction mode forwards { edgeId } as insertContext", async () => {
    const user = userEvent.setup();
    const { onPickAction, onClose } = renderPanel({
      mode: { kind: "insertAction", edgeId: "e-42" },
    });
    await waitFor(() => screen.getByText("HTTP Request"));
    await user.click(screen.getByText("HTTP Request"));
    expect(onPickAction).toHaveBeenCalledWith(httpRequestAction, {
      edgeId: "e-42",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AddNodePanel — provider-agnostic UI", () => {
  it("has no per-provider string branches in the rendered markup (chips name from data)", async () => {
    renderPanel({
      mode: { kind: "trigger" },
      triggerProviders: [
        { id: "totally-fictional", displayName: "Totally Fictional" },
      ],
    });
    expect(
      await screen.findByRole("button", {
        name: /browse totally fictional triggers/i,
      }),
    ).toBeInTheDocument();
  });
});
