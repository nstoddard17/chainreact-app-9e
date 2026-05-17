/**
 * Tests for features/workflow-builder/panels/AddNodeMenu.
 *
 * The picker reads the slice for hasTrigger and dispatches addTrigger /
 * addAction / addActionFromMeta. Slice 3.2 extends the action picker
 * with a Native section sourced from `lib/api/discovery.listNativeActions`,
 * mocked here so tests don't hit fetch.
 */

const mockListNativeActions = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddNodeMenu } from "@/features/workflow-builder/panels/AddNodeMenu";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import type { ActionMeta } from "@/contracts/actionMeta";

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [
  { id: "slack", displayName: "Slack" },
  { id: "gmail", displayName: "Gmail" },
];

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
  __resetNativeActionsCacheForTests();
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

  it("opens the trigger provider list and dispatches addTrigger on pick", async () => {
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add trigger/i }));
    const triggerList = screen.getByRole("list", { name: /trigger providers/i });
    await user.click(
      screen.getByRole("button", { name: /^Slack$/ }),
    );
    expect(triggerList).not.toBeInTheDocument();
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

  it("dispatches addAction with the picked provider", async () => {
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const user = userEvent.setup();
    render(
      <AddNodeMenu
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.click(screen.getByRole("button", { name: /^Gmail$/ }));
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[1]).toMatchObject({ kind: "action", provider: "gmail" });
  });

  it("renders an empty-state message when no providers are available", async () => {
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
