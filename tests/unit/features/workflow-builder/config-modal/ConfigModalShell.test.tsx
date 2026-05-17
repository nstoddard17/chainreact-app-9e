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
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigModalShell } from "@/features/workflow-builder/config-modal/ConfigModalShell";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
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
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
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

  it("Cancel discards the draft and closes the rail without changing graphSlice", async () => {
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
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    // Modal closes (returns null).
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

describe("ConfigModalShell — provider trigger placeholder (Slice 3.4 deferred surface)", () => {
  it("renders a 'Provider-trigger configuration arrives in a later slice' notice", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "message_received" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    expect(
      screen.getByText(/Provider-trigger configuration arrives in a later slice/i),
    ).toBeInTheDocument();
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

describe("ConfigModalShell — non-native trigger placeholder", () => {
  it("renders a 'Provider-trigger configuration arrives in a later slice' notice", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "message_received" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    expect(
      screen.getByText(/Provider-trigger configuration arrives in a later slice/i),
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
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

  it("does NOT fetch provider actions when the active node is a provider trigger", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "message_received" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    await waitFor(() => {
      expect(
        screen.getByText(/Provider-trigger configuration arrives/i),
      ).toBeInTheDocument();
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
