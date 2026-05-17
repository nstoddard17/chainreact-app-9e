/**
 * Tests for features/workflow-builder/panels/AddNodeMenu.
 *
 * The picker reads the slice for hasTrigger and dispatches addTrigger /
 * addAction / addActionFromMeta. Slice 3.2 extends the action picker
 * with a Native section sourced from `lib/api/discovery.listNativeActions`,
 * mocked here so tests don't hit fetch.
 */

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (provider: string) => mockListProviderActions(provider),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddNodeMenu } from "@/features/workflow-builder/panels/AddNodeMenu";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [
  { id: "slack", displayName: "Slack" },
  { id: "gmail", displayName: "Gmail" },
];

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
  payloadShape: [],
  displayOrder: 10,
};

const scheduledTriggerMeta: TriggerMeta = {
  key: "native:schedule.fired",
  provider: "native",
  type: "schedule.fired",
  displayName: "Scheduled Trigger",
  description: "Fires on a cron expression.",
  category: "scheduling",
  activation: "scheduled",
  requiresIntegration: false,
  fields: [
    {
      name: "cronExpression",
      label: "Cron Expression",
      type: "cron",
      required: true,
      placeholder: "0 9 * * 1-5",
    },
  ],
  payloadShape: [],
  displayOrder: 20,
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
      options: [{ value: "GET", label: "GET" }],
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
};

const delayMeta: ActionMeta = {
  ...httpRequestMeta,
  key: "native:delay",
  type: "delay",
  displayName: "Delay",
  description: "Pause the workflow.",
  category: "scheduling",
  displayOrder: 30,
  fields: [
    {
      name: "seconds",
      label: "Seconds",
      type: "number",
      required: true,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
  ],
};

beforeEach(() => {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta, delayMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([
    manualTriggerMeta,
    scheduledTriggerMeta,
  ]);
  mockListProviderActions.mockReset();
  // Default: every provider returns an empty actions list. Individual
  // drill-in tests override per-provider with mockResolvedValueOnce.
  mockListProviderActions.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
});

describe("AddNodeMenu", () => {
  it("disables 'Add action' until a trigger exists", () => {
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(screen.getByRole("button", { name: /add action/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add trigger/i })).toBeEnabled();
  });

  it("opens the trigger picker (provider sub-section) and dispatches addTrigger on pick", async () => {
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(screen.getByRole("list", { name: /trigger providers/i })).toBeInTheDocument();
    });
    const providerList = screen.getByRole("list", { name: /trigger providers/i });
    await user.click(
      within(providerList).getByRole("button", { name: /^Slack$/ }),
    );
    expect(providerList).not.toBeInTheDocument();
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "trigger", provider: "slack" });
  });

  it("after a trigger is added, 'Add trigger' is disabled and 'Add action' is enabled", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    expect(screen.getByRole("button", { name: /add trigger/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add action/i })).toBeEnabled();
  });

  it("clicking a provider button drills into that provider's actions (no bare-add dispatch — Slice 3.4)", async () => {
    // Slice 3.4 removed the legacy bare addAction({provider}) path from
    // the picker. Clicking a provider now opens its action drill-in
    // (loading state surfaces immediately, async list resolves below).
    // The slice's addAction action itself is still exported for tests
    // / future surfaces — see graphSlice.test.ts.
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.click(
      screen.getByRole("button", { name: /browse gmail actions/i }),
    );
    expect(
      screen.getByRole("button", { name: /back to action picker/i }),
    ).toBeInTheDocument();
    // No action node added by the drill-in itself.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
  });

  it("renders an empty-state message when no trigger providers are available", async () => {
    const user = userEvent.setup();
    render(<AddNodeMenu triggerProviders={[]} actionProviders={actionProviders} />);
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    expect(screen.getByText(/no trigger providers/i)).toBeInTheDocument();
  });

  it("shows a Native section in the action picker with metadata-driven entries", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("list", { name: /native actions list/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    expect(screen.getByText("Delay")).toBeInTheDocument();
    expect(screen.getByText("Send an HTTP request.")).toBeInTheDocument();
  });

  it("dispatches addActionFromMeta with default config when a native action is picked", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const httpRequestWithDefault: ActionMeta = {
      ...httpRequestMeta,
      fields: [
        ...httpRequestMeta.fields,
        {
          name: "timeoutSeconds",
          label: "Timeout",
          type: "number",
          required: false,
          defaultValue: 15,
          numeric: { min: 1, max: 30, integer: true, step: 1 },
        },
      ],
    };
    mockListNativeActions.mockResolvedValueOnce([httpRequestWithDefault]);
    __resetNativeActionsCacheForTests();

    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await waitFor(() => {
      expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    });
    await user.click(screen.getByText("HTTP Request"));
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({
      kind: "action",
      provider: "native",
      type: "http_request",
      config: { timeoutSeconds: 15 },
    });
  });

  it("renders a loading state while native actions resolve", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    let resolveFetch: (v: readonly ActionMeta[]) => void = () => {};
    mockListNativeActions.mockReturnValueOnce(
      new Promise<readonly ActionMeta[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    __resetNativeActionsCacheForTests();

    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add action/i }));
    expect(screen.getByText(/loading native actions/i)).toBeInTheDocument();
    resolveFetch([]);
    await waitFor(() => {
      expect(screen.queryByText(/loading native actions/i)).not.toBeInTheDocument();
    });
  });

  it("surfaces an inline error when native actions fail to load", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    mockListNativeActions.mockRejectedValueOnce(new Error("offline"));
    __resetNativeActionsCacheForTests();
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/offline/i);
    });
  });
});

// ─── Slice 3.3 — native trigger picker ───────────────────────────────────────

describe("AddNodeMenu — native triggers section", () => {
  it("shows a Native section in the trigger picker with metadata-driven entries", async () => {
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("list", { name: /native triggers list/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
    expect(screen.getByText(/Runs when you click Run Now/i)).toBeInTheDocument();
  });

  it("dispatches addTriggerFromMeta when a native trigger is picked (manual.run, no default config)", async () => {
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Manual Trigger"));
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      kind: "trigger",
      provider: "native",
      type: "manual.run",
      config: {},
    });
  });

  it("dispatches addTriggerFromMeta when a native trigger with a defaulted field is picked", async () => {
    const scheduledWithDefault: TriggerMeta = {
      ...scheduledTriggerMeta,
      fields: [
        {
          ...scheduledTriggerMeta.fields[0]!,
          defaultValue: "0 9 * * 1-5",
        },
      ],
    };
    mockListNativeTriggers.mockResolvedValueOnce([scheduledWithDefault]);
    __resetNativeTriggersCacheForTests();

    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Scheduled Trigger"));
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      kind: "trigger",
      provider: "native",
      type: "schedule.fired",
      config: { cronExpression: "0 9 * * 1-5" },
    });
  });

  it("hides the trigger picker after a native trigger is added (single-trigger guard)", async () => {
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Manual Trigger"));
    expect(
      screen.queryByRole("list", { name: /native triggers list/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add trigger/i })).toBeDisabled();
  });

  it("renders a loading state while native triggers resolve", async () => {
    let resolveFetch: (v: readonly TriggerMeta[]) => void = () => {};
    mockListNativeTriggers.mockReturnValueOnce(
      new Promise<readonly TriggerMeta[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    __resetNativeTriggersCacheForTests();

    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    expect(screen.getByText(/loading native triggers/i)).toBeInTheDocument();
    resolveFetch([]);
    await waitFor(() => {
      expect(
        screen.queryByText(/loading native triggers/i),
      ).not.toBeInTheDocument();
    });
  });

  it("surfaces an inline error when native triggers fail to load", async () => {
    mockListNativeTriggers.mockRejectedValueOnce(new Error("trigger-offline"));
    __resetNativeTriggersCacheForTests();
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/trigger-offline/i);
    });
  });

  it("renders 'No native triggers available' when the catalog is empty", async () => {
    mockListNativeTriggers.mockResolvedValueOnce([]);
    __resetNativeTriggersCacheForTests();
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/no native triggers available/i),
      ).toBeInTheDocument();
    });
  });
});
