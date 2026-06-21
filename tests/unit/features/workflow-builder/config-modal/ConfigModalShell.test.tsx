/**
 * Tests for features/workflow-builder/config-modal/ConfigModalShell.
 *
 * Covers the Slice 3.2 surface: opens for the active node, renders
 * SchemaForm from the matched ActionMeta, dispatches save through
 * graphSlice, discard/cancel through configSlice, and the router-
 * routes placeholder banner.
 */

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

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigModalShell } from "@/features/workflow-builder/config-modal/ConfigModalShell";
import { BuilderRightDrawer } from "@/features/workflow-builder/layout/BuilderRightDrawer";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

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
      placeholder: "https://api.example.com",
    },
    {
      name: "timeoutSeconds",
      label: "Timeout",
      type: "number",
      required: false,
      defaultValue: 15,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const routerMeta: ActionMeta = {
  ...httpRequestMeta,
  key: "native:router",
  type: "router",
  displayName: "Router",
  description: "Route execution down one of many labeled paths.",
  category: "logic",
  fields: [
    {
      name: "routes",
      label: "Routes",
      type: "router-routes",
      required: true,
    },
    {
      name: "defaultRoute",
      label: "Default Route",
      type: "text",
      required: false,
    },
  ],
};

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

beforeEach(() => {
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta, routerMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([
    manualTriggerMeta,
    scheduledTriggerMeta,
  ]);
  mockListProviderActions.mockReset();
  // Default: every provider returns an empty actions list; individual
  // provider-action tests override per-provider as needed.
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  // Default: every provider returns an empty triggers list; individual
  // provider-trigger tests (Slice 3.10) override per-provider as needed.
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function bootWithNativeAction(): { nodeId: string } {
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice.getState().addTrigger({ provider: "slack" });
  const node = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
  useConfigSlice
    .getState()
    .openNode({ nodeId: node.id, initialValues: node.config });
  return { nodeId: node.id };
}

describe("ConfigModalShell — closed state", () => {
  it("renders nothing when no node is active", () => {
    const { container } = render(<ConfigModalShell />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ConfigModalShell — selected-node tabs (BUILDER-CONFIG-TABS-1)", () => {
  function configTab(name: RegExp) {
    return within(screen.getByTestId("config-node-tabs")).getByRole("tab", { name });
  }

  it("shows ONE Setup | Test | Data strip with Setup active by default; Advanced hidden", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    await waitFor(() => expect(screen.getByLabelText("URL")).toBeInTheDocument());
    const tabs = within(screen.getByTestId("config-node-tabs")).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Setup", "Test", "Data"]);
    expect(configTab(/^Setup$/).getAttribute("aria-selected")).toBe("true");
    // The Setup form is the default content.
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.queryByTestId("config-tab-empty-state")).toBeNull();
  });

  it("Test tab shows a polished empty state and hides the Setup form", async () => {
    bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => expect(screen.getByLabelText("URL")).toBeInTheDocument());
    await user.click(configTab(/^Test$/));
    const panel = screen.getByTestId("config-tab-empty-state");
    expect(panel.getAttribute("data-tab")).toBe("test");
    expect(panel.textContent).toMatch(/test this step/i);
    // Setup form fields are not shown while on Test.
    expect(screen.queryByLabelText("URL")).toBeNull();
  });

  it("Data tab absorbs Variables/Results/Data Inspector as a user-facing empty state (no raw JSON/schema)", async () => {
    bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => expect(screen.getByLabelText("URL")).toBeInTheDocument());
    await user.click(configTab(/^Data$/));
    const panel = screen.getByTestId("config-tab-empty-state");
    expect(panel.getAttribute("data-tab")).toBe("data");
    expect(panel.textContent).toMatch(/variables available from the trigger/i);
    expect(panel.textContent).not.toMatch(/JSON|schema/i);
  });

  it("returns to the Setup form when Setup is reselected; fields still render + save", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => expect(screen.getByLabelText("URL")).toBeInTheDocument());
    await user.click(configTab(/^Data$/));
    expect(screen.queryByLabelText("URL")).toBeNull();
    await user.click(configTab(/^Setup$/));
    // The real config form is back and still saves into graphSlice.
    await user.type(screen.getByLabelText("URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(
      useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId)?.config,
    ).toMatchObject({ url: "https://example.com" });
  });
});

describe("ConfigModalShell — native action open state", () => {
  it("renders the node's displayName + description in the header", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    });
    expect(screen.getByText("Send an HTTP request.")).toBeInTheDocument();
  });

  it("renders fields from the active meta through SchemaForm", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Timeout")).toBeInTheDocument();
  });

  it("seeds the form with the node's current config values", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Timeout")).toHaveValue(15);
    });
  });

  it("typing in a field flips the draft dirty-state on", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("URL"), "https://x");
    expect(useConfigSlice.getState().drafts[nodeId]!.isDirty).toBe(true);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("Save writes the draft into graphSlice and marks the draft saved", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const persisted = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId);
    expect(persisted?.config).toMatchObject({
      url: "https://example.com",
      timeoutSeconds: 15,
    });
    expect(useConfigSlice.getState().drafts[nodeId]!.isDirty).toBe(false);
  });

  it("Cancel on a dirty draft warns first, then Discard closes the rail without changing graphSlice", async () => {
    const { nodeId } = bootWithNativeAction();
    const before = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId)!.config;
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("URL"), "https://nope");
    // C — Cancel on a dirty draft asks before discarding (no silent loss).
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(
      screen.getByTestId("config-modal-discard-confirm"),
    ).toBeInTheDocument();
    expect(useConfigSlice.getState().activeNodeId).toBe(nodeId); // still open
    await user.click(screen.getByTestId("config-modal-discard-confirm-button"));
    // Modal closes (returns null) and graphSlice is unchanged.
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    const after = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId)!.config;
    expect(after).toEqual(before);
  });

  it("Save button is disabled while the draft is clean", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});

describe("ConfigModalShell — C: unsaved-edit discard guard", () => {
  it("Cancel on a dirty draft warns instead of silently discarding; draft is preserved", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("URL"), "https://keep.me");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(
      screen.getByTestId("config-modal-discard-confirm"),
    ).toBeInTheDocument();
    // Still open; the in-progress edit survives the warning.
    expect(useConfigSlice.getState().activeNodeId).toBe(nodeId);
    expect(useConfigSlice.getState().drafts[nodeId]!.values.url).toBe(
      "https://keep.me",
    );
  });

  it("'Keep editing' dismisses the warning and preserves the in-progress field value", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("URL"), "https://keep.me");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await user.click(screen.getByTestId("config-modal-discard-keep"));
    expect(
      screen.queryByTestId("config-modal-discard-confirm"),
    ).not.toBeInTheDocument();
    expect(useConfigSlice.getState().activeNodeId).toBe(nodeId);
    expect(screen.getByLabelText("URL")).toHaveValue("https://keep.me");
    expect(useConfigSlice.getState().drafts[nodeId]!.isDirty).toBe(true);
  });

  it("Cancel on a CLEAN draft closes immediately without a warning", async () => {
    bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(
      screen.queryByTestId("config-modal-discard-confirm"),
    ).not.toBeInTheDocument();
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });
});

describe("ConfigModalShell — BUILDER-DATA-MAP-MVP-1: single panel close control", () => {
  it("renders no inner close (×) control inside the config content", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    // The duplicate inner close was removed — the only panel close lives in
    // the drawer header. The shell itself exposes no close affordance.
    expect(
      screen.queryByRole("button", { name: /close configuration/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /close drawer/i }),
    ).not.toBeInTheDocument();
  });

  it("exposes exactly one close control for the config panel when wrapped in the drawer", async () => {
    bootWithNativeAction();
    render(
      <BuilderRightDrawer title="Node configuration" onClose={() => {}}>
        <ConfigModalShell />
      </BuilderRightDrawer>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeInTheDocument();
    });
    // Only the drawer's "Close drawer" × should be present — no duplicate.
    const closeControls = screen.getAllByRole("button", { name: /close/i });
    expect(closeControls).toHaveLength(1);
    expect(closeControls[0]).toHaveAttribute("aria-label", "Close drawer");
  });
});

describe("ConfigModalShell — native router (Slice 3.6 routes editor)", () => {
  it("renders the routes field through the RouterRoutesField renderer", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice.getState().addActionFromMeta(routerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("Router")).toBeInTheDocument();
    });
    // The dedicated renderer (not the keyvalue stub) is what shows up.
    expect(screen.getByTestId("router-routes-field")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^add route$/i }),
    ).toBeInTheDocument();
  });

  it("no longer renders the Slice 3.2 'Router routes need a dedicated editor' banner", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice.getState().addActionFromMeta(routerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("Router")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Router routes need a dedicated editor/i),
    ).not.toBeInTheDocument();
  });

  it("disables Save while the routes field is invalid (empty routes), enables once a valid route is added", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice.getState().addActionFromMeta(routerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByTestId("router-routes-field")).toBeInTheDocument();
    });

    // Empty + dirty? Even after Add route → still no label, still invalid.
    await user.click(screen.getByRole("button", { name: /^add route$/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    // Fill the label → routes valid → Save enables.
    await user.type(screen.getByLabelText("Route 1 label"), "happy");
    await user.type(
      screen.getByLabelText("Route 1 input"),
      // user-event v14 escapes `{` by doubling it; type `{{{{x}}` to
      // produce the literal `{{x}}` inside the input.
      "{{{{trigger.foo}}",
    );
    await user.type(screen.getByLabelText("Route 1 value"), "yes");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });

  it("Save with a valid route writes the runtime-schema-shaped routes into graphSlice", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice.getState().addActionFromMeta(routerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByTestId("router-routes-field")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^add route$/i }));
    await user.type(screen.getByLabelText("Route 1 label"), "happy");
    await user.type(
      screen.getByLabelText("Route 1 input"),
      // user-event v14 escapes `{` by doubling it; type `{{{{x}}` to
      // produce the literal `{{x}}` inside the input.
      "{{{{trigger.foo}}",
    );
    await user.type(screen.getByLabelText("Route 1 value"), "yes");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const persisted = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === node.id);
    expect(persisted?.config).toMatchObject({
      routes: [
        {
          label: "happy",
          condition: {
            input: "{{trigger.foo}}",
            operator: "equals",
            value: "yes",
          },
        },
      ],
    });
  });
});

// ─── Slice 3.10 — provider-trigger config rendering ──────────────────────────

const githubNewCommitMeta: TriggerMeta = {
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
  payloadShape: [],
  displayOrder: 10,
};

describe("ConfigModalShell — provider trigger SchemaForm (Slice 3.10)", () => {
  it("renders the provider trigger's displayName + description from TriggerMeta", async () => {
    mockListProviderTriggers.mockImplementation(async (p: string) =>
      p === "github" ? [githubNewCommitMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(githubNewCommitMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Fires when a push lands on the configured repository/),
    ).toBeInTheDocument();
  });

  it("renders the provider trigger's fields through SchemaForm", async () => {
    mockListProviderTriggers.mockImplementation(async (p: string) =>
      p === "github" ? [githubNewCommitMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(githubNewCommitMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Branch (optional)")).toBeInTheDocument();
  });

  it("typing flips the configSlice draft dirty-state on (no save / no fetch fired)", async () => {
    mockListProviderTriggers.mockImplementation(async (p: string) =>
      p === "github" ? [githubNewCommitMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(githubNewCommitMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    await user.type(
      screen.getByLabelText("Repository"),
      "octocat/hello-world",
    );
    expect(useConfigSlice.getState().drafts[node.id]!.isDirty).toBe(true);
  });

  it("modal Save writes the draft into graphSlice.pendingNodes (no updateWorkflow / no activation)", async () => {
    mockListProviderTriggers.mockImplementation(async (p: string) =>
      p === "github" ? [githubNewCommitMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(githubNewCommitMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    await user.type(
      screen.getByLabelText("Repository"),
      "octocat/hello-world",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(
      useGraphSlice
        .getState()
        .pendingNodes.find((n) => n.id === node.id)!.config,
    ).toMatchObject({ repository: "octocat/hello-world" });
    // Slice 3.10 invariant: modal Save mutates pendingNodes only.
    // It does NOT call updateWorkflow and does NOT fire any activation
    // — confirmed by the absence of any extra discovery calls.
    expect(mockListProviderTriggers).toHaveBeenCalledWith("github");
  });

  it("Cancel discards the draft and closes the rail", async () => {
    mockListProviderTriggers.mockImplementation(async (p: string) =>
      p === "github" ? [githubNewCommitMeta] : [],
    );
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(githubNewCommitMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Repository"), "octocat/x");
    // C — Cancel on a dirty draft confirms before discarding.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await user.click(screen.getByTestId("config-modal-discard-confirm-button"));
    // Draft reset; rail closed.
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    expect(useConfigSlice.getState().drafts[node.id]!.isDirty).toBe(false);
  });

  it("renders the missing-meta alert when the provider has no meta for that type", async () => {
    // Default mock returns [] — the configured trigger meta isn't in
    // the provider catalog so the lookup misses.
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "ghost.trigger" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/No metadata/i);
    });
  });

  it("does NOT fetch provider triggers when the trigger node has no type yet (bare-add path)", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    // Bare-add path: provider only, no type. The hook short-circuits
    // to null so no /api/providers/<p>/triggers call is made.
    const node = useGraphSlice.getState().addTrigger({ provider: "slack" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/No metadata/i);
    });
    expect(mockListProviderTriggers).not.toHaveBeenCalled();
  });

  it("does NOT fetch provider triggers when the active node is a native trigger", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(scheduledTriggerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
    });
    expect(mockListProviderTriggers).not.toHaveBeenCalled();
  });
});

describe("ConfigModalShell — missing meta", () => {
  it("renders an alert when the active node's meta isn't in the catalog", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice
      .getState()
      .addAction({ provider: "native", type: "ghost_action" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/No metadata/i);
    });
  });
});

// ─── Slice 3.3 — native trigger rendering ────────────────────────────────────

describe("ConfigModalShell — native trigger open state", () => {
  it("renders the trigger's displayName + description from TriggerMeta", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(scheduledTriggerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("Scheduled Trigger")).toBeInTheDocument();
    });
    expect(screen.getByText("Fires on a cron expression.")).toBeInTheDocument();
  });

  it("renders the trigger's fields through SchemaForm (cronExpression)", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(scheduledTriggerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Cron Expression")).toBeInTheDocument();
    });
  });

  it("renders a fields-less manual trigger without crashing", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(manualTriggerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    });
    // SchemaForm's empty-fields hint surfaces when fields[] is empty.
    expect(
      screen.getByText(/this action has no configurable fields/i),
    ).toBeInTheDocument();
  });

  it("Save writes the trigger draft into graphSlice (cron edit)", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(scheduledTriggerMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Cron Expression")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Cron Expression"), "*/15 * * * *");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    const persisted = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === node.id);
    expect(persisted?.config).toMatchObject({
      cronExpression: "*/15 * * * *",
    });
  });
});

describe("ConfigModalShell — non-native trigger with no registered meta (Slice 3.10)", () => {
  it("renders the missing-meta alert when no provider trigger meta is registered for the type", async () => {
    // Slice 3.10 replaced the "arrives in a later slice" placeholder
    // with a SchemaForm path. Providers that haven't shipped trigger
    // metadata yet now surface the standard missing-meta alert, just
    // like provider actions do under the same conditions.
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "message_received" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/No metadata/i);
    });
  });
});

describe("ConfigModalShell — missing trigger meta", () => {
  it("renders an alert mentioning 'trigger' for an unknown native trigger key", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "native", type: "ghost_trigger" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /No metadata for trigger/i,
      );
    });
  });
});

// ─── Slice 3.4 — provider action rendering ────────────────────────────────────

const githubAddCommentMeta: ActionMeta = {
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
      defaultValue: "",
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

function bootWithProviderAction(meta: ActionMeta) {
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice.getState().addTrigger({ provider: "slack" });
  const node = useGraphSlice.getState().addActionFromMeta(meta);
  useConfigSlice
    .getState()
    .openNode({ nodeId: node.id, initialValues: node.config });
  return { nodeId: node.id };
}

describe("ConfigModalShell — provider action open state", () => {
  it("looks up the meta through useProviderActions(provider) and renders displayName + description", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubAddCommentMeta]);
    bootWithProviderAction(githubAddCommentMeta);
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("Add Comment")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Add a comment to a GitHub issue or PR."),
    ).toBeInTheDocument();
    expect(mockListProviderActions).toHaveBeenCalledWith("github");
  });

  it("renders the provider meta's fields through SchemaForm", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubAddCommentMeta]);
    bootWithProviderAction(githubAddCommentMeta);
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Issue or PR Number")).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toBeInTheDocument();
  });

  it("Save writes the provider-action draft into graphSlice", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubAddCommentMeta]);
    const { nodeId } = bootWithProviderAction(githubAddCommentMeta);
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Repository"), "octocat/hello-world");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    const persisted = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId);
    expect(persisted?.config).toMatchObject({
      repository: "octocat/hello-world",
    });
    expect(useConfigSlice.getState().drafts[nodeId]!.isDirty).toBe(false);
  });

  it("Cancel discards the provider-action draft without touching graphSlice config", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubAddCommentMeta]);
    const { nodeId } = bootWithProviderAction(githubAddCommentMeta);
    const before = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId)!.config;
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Repository"), "abandoned");
    // C — Cancel on a dirty draft confirms before discarding.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await user.click(screen.getByTestId("config-modal-discard-confirm-button"));
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    const after = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId)!.config;
    expect(after).toEqual(before);
  });

  it("Save button is disabled while the provider-action draft is clean", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubAddCommentMeta]);
    bootWithProviderAction(githubAddCommentMeta);
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("surfaces a per-provider loading state while the provider catalog resolves", async () => {
    let resolveFetch: (v: readonly ActionMeta[]) => void = () => {};
    mockListProviderActions.mockReturnValueOnce(
      new Promise<readonly ActionMeta[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    bootWithProviderAction(githubAddCommentMeta);
    render(<ConfigModalShell />);
    expect(screen.getByText(/^loading…$/i)).toBeInTheDocument();
    resolveFetch([githubAddCommentMeta]);
    await waitFor(() => {
      expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    });
  });

  it("surfaces an alert when the provider catalog fetch fails", async () => {
    mockListProviderActions.mockRejectedValueOnce(new Error("github offline"));
    bootWithProviderAction(githubAddCommentMeta);
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/github offline/i);
    });
  });

  it("renders the missing-meta alert (with 'action' label) for an unknown provider action key", async () => {
    // Catalog resolves to a different action — the lookup misses.
    mockListProviderActions.mockResolvedValueOnce([
      {
        ...githubAddCommentMeta,
        key: "github:create_issue",
        type: "create_issue",
        displayName: "Create Issue",
      },
    ]);
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice.getState().addAction({
      provider: "github",
      type: "ghost_action",
    });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /No metadata for action/i,
      );
    });
  });
});

describe("ConfigModalShell — provider-action lookup gating", () => {
  it("does NOT fetch provider actions when the active node is a native action (no useless work)", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    });
    expect(mockListProviderActions).not.toHaveBeenCalled();
  });

  it("does NOT fetch provider ACTIONS when the active node is a provider trigger", async () => {
    // Slice 3.10 — provider triggers now route through their own
    // catalog hook. The provider-actions catalog must remain untouched
    // so a trigger-only mount doesn't waste a fetch on the wrong list.
    mockListProviderTriggers.mockResolvedValue([]);
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "message_received" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      // The empty provider-triggers catalog resolves to a missing-meta
      // alert (Slack hasn't shipped meta yet at this slice's coverage).
      expect(screen.getByRole("alert")).toHaveTextContent(/No metadata/i);
    });
    expect(mockListProviderActions).not.toHaveBeenCalled();
  });

  it("does NOT fetch provider actions when the action node has no type yet", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    // addAction with no type → provider-action lookup is skipped
    // because there's no `${provider}:${type}` to look up.
    const node = useGraphSlice.getState().addAction({ provider: "github" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    // Renders the missing-meta alert.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/No metadata/i);
    });
    expect(mockListProviderActions).not.toHaveBeenCalled();
  });
});

describe("ConfigModalShell — node rename (Slice 4.BUILDER-NODE-IDENTITY-1)", () => {
  it("renders a Node name input whose placeholder is the metadata default", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    // Wait for the meta to load (the header shows the action's display name).
    await waitFor(() => expect(screen.getByText("HTTP Request")).toBeInTheDocument());
    const input = screen.getByTestId("node-name-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("HTTP Request");
  });

  it("typing a name writes displayName to graphSlice + marks the graph dirty (no planner call)", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await waitFor(() => expect(screen.getByTestId("node-name-input")).toBeInTheDocument());
    await user.type(screen.getByTestId("node-name-input"), "Notify Support Team");
    expect(
      useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId)!.displayName,
    ).toBe("Notify Support Team");
    expect(useGraphSlice.getState().isDirty).toBe(true);
    // Rename is a pure state mutation — it does not change the node's identity.
    const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId)!;
    expect(node.id).toBe(nodeId);
    expect(node.provider).toBe("native");
    expect(node.type).toBe("http_request");
  });

  it("clearing the name resets displayName to the default (undefined)", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    useGraphSlice.getState().renameNode(nodeId, "Temp");
    render(<ConfigModalShell />);
    await waitFor(() => expect(screen.getByTestId("node-name-input")).toBeInTheDocument());
    await user.clear(screen.getByTestId("node-name-input"));
    expect(
      useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId)!.displayName,
    ).toBeUndefined();
  });
});

// BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-SYNC — an external config sync (Agent rail "Update step")
// updates the VISIBLE field in the open config panel, not just the graph node.
describe("ConfigModalShell — external config sync (rail Update step)", () => {
  it("reflects an externally-synced value in the visible field (no stale value)", async () => {
    const { nodeId } = bootWithNativeAction();
    render(<ConfigModalShell />);
    const url = (await screen.findByLabelText("URL")) as HTMLInputElement;
    expect(url.value).toBe(""); // initial

    // Simulate the rail update: graph node config changed + the open draft synced.
    act(() => {
      useGraphSlice.getState().updateNodeConfig(nodeId, { url: "https://synced.example" });
      useConfigSlice.getState().applyExternalConfig({ nodeId, values: { url: "https://synced.example" } });
    });

    await waitFor(() => expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe("https://synced.example"));
  });

  it("does not overwrite an unrelated in-progress edit in the panel", async () => {
    const { nodeId } = bootWithNativeAction();
    const user = userEvent.setup();
    render(<ConfigModalShell />);
    await screen.findByLabelText("URL");
    await user.type(screen.getByLabelText("URL"), "https://typed.example"); // manual panel edit

    // The rail updates a DIFFERENT field (Timeout) on the same node.
    act(() => {
      useGraphSlice.getState().updateNodeConfig(nodeId, { url: "https://typed.example", timeoutSeconds: 20 });
      useConfigSlice.getState().applyExternalConfig({ nodeId, values: { timeoutSeconds: 20 } });
    });

    // The manual URL edit is preserved; the synced Timeout shows the new value.
    expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe("https://typed.example");
    await waitFor(() => expect((screen.getByLabelText("Timeout") as HTMLInputElement).value).toBe("20"));
  });
});
