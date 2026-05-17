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
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
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
      type: "keyvalue",
      required: true,
      keyValueMaxRows: 32,
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
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
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

describe("ConfigModalShell — router placeholder", () => {
  it("shows the placeholder banner when the active meta is native:router", async () => {
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
      screen.getByText(/Router routes need a dedicated editor/i),
    ).toBeInTheDocument();
  });
});

describe("ConfigModalShell — non-native node", () => {
  it("renders a 'Provider-action configuration arrives in Slice 3.4' notice", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const node = useGraphSlice
      .getState()
      .addAction({ provider: "slack", type: "send_channel_message" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    expect(
      screen.getByText(/Provider-action configuration arrives in Slice 3.4/i),
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
  it("renders a 'Provider-trigger configuration arrives in Slice 3.4' notice", async () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const node = useGraphSlice
      .getState()
      .addTrigger({ provider: "slack", type: "message_received" });
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
    render(<ConfigModalShell />);
    expect(
      screen.getByText(/Provider-trigger configuration arrives in Slice 3.4/i),
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
