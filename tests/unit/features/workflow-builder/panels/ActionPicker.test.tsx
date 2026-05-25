/**
 * Tests for features/workflow-builder/panels/ActionPicker — Slice 3.4.
 *
 * The picker is extracted from AddNodeMenu so it can own its own
 * drill-in state. Tests target the picker in isolation rather than
 * through the AddNodeMenu shell so list / provider modes are clean
 * to assert.
 *
 * Picker contracts under test:
 *   - List mode renders Native + Providers sections.
 *   - Picking a native action fires onPickAction with the meta.
 *   - Clicking a provider enters provider mode (back button + actions
 *     view).
 *   - Provider mode shows loading / error / empty / list states.
 *   - Picking a provider action fires onPickAction with that meta.
 *   - Back returns to list mode without firing onPickAction.
 *   - Per-provider promise cache short-circuits a same-session
 *     re-entry.
 */

const mockListProviderActions = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listProviderActions: (p: string) => mockListProviderActions(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionPicker } from "@/features/workflow-builder/panels/ActionPicker";
import type { ProviderOption } from "@/features/workflow-builder/panels/AddNodeMenu";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import type { ActionMeta } from "@/contracts/actionMeta";

const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Send an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const addCommentMeta: ActionMeta = {
  key: "github:add_comment",
  provider: "github",
  type: "add_comment",
  displayName: "Add Comment",
  description: "Add a comment to an issue or PR.",
  category: "developer",
  requiresIntegration: true,
  fields: [],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const createIssueMeta: ActionMeta = {
  key: "github:create_issue",
  provider: "github",
  type: "create_issue",
  displayName: "Create Issue",
  description: "Create a new GitHub issue.",
  category: "developer",
  requiresIntegration: true,
  fields: [],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

const githubProvider: ProviderOption = { id: "github", displayName: "GitHub" };
const gmailProvider: ProviderOption = { id: "gmail", displayName: "Gmail" };

function renderPicker(
  overrides: Partial<ComponentProps<typeof ActionPicker>> = {},
) {
  const onPickAction = jest.fn();
  const utils = render(
    <ActionPicker
      nativeActions={[httpRequestMeta]}
      nativeLoading={false}
      nativeError={null}
      actionProviders={[githubProvider, gmailProvider]}
      onPickAction={onPickAction}
      {...overrides}
    />,
  );
  return { ...utils, onPickAction };
}

beforeEach(() => {
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  __resetProviderActionsCacheForTests();
});

describe("ActionPicker — list mode", () => {
  it("renders Native + Providers sections", () => {
    renderPicker();
    expect(
      screen.getByRole("list", { name: /native actions list/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /action providers/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });

  it("fires onPickAction when a native action is picked", async () => {
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    await user.click(screen.getByText("HTTP Request"));
    expect(onPickAction).toHaveBeenCalledTimes(1);
    expect(onPickAction).toHaveBeenCalledWith(httpRequestMeta);
  });

  it("forwards native loading state", () => {
    renderPicker({ nativeLoading: true, nativeActions: [] });
    expect(
      screen.getByText(/loading native actions/i),
    ).toBeInTheDocument();
  });

  it("forwards native error state", () => {
    renderPicker({ nativeError: "boom", nativeActions: [] });
    expect(screen.getByRole("alert")).toHaveTextContent(/boom/i);
  });

  it("shows 'No native actions available' when the native list is empty", () => {
    renderPicker({ nativeActions: [] });
    expect(
      screen.getByText(/no native actions available/i),
    ).toBeInTheDocument();
  });

  it("shows 'No action providers available' when the provider list is empty", () => {
    renderPicker({ actionProviders: [] });
    expect(
      screen.getByText(/no action providers available/i),
    ).toBeInTheDocument();
  });
});

describe("ActionPicker — provider drill-in", () => {
  it("clicking a provider enters provider mode and loads its actions", async () => {
    mockListProviderActions.mockImplementationOnce(async (p: string) => {
      expect(p).toBe("github");
      return [createIssueMeta, addCommentMeta];
    });
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    // Provider view rendered with back button.
    expect(
      screen.getByRole("button", { name: /back to action picker/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Create Issue")).toBeInTheDocument();
    });
    expect(screen.getByText("Add Comment")).toBeInTheDocument();
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
    expect(mockListProviderActions).toHaveBeenCalledWith("github");
  });

  it("provider mode shows a per-provider loading line until the catalog resolves", async () => {
    let resolveFetch: (v: readonly ActionMeta[]) => void = () => {};
    mockListProviderActions.mockReturnValueOnce(
      new Promise<readonly ActionMeta[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    expect(screen.getByText(/loading github actions/i)).toBeInTheDocument();
    resolveFetch([createIssueMeta]);
    await waitFor(() => {
      expect(screen.queryByText(/loading github actions/i)).not.toBeInTheDocument();
    });
  });

  it("provider mode surfaces an inline error when the catalog fetch fails", async () => {
    mockListProviderActions.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/offline/i);
    });
  });

  it("provider mode shows a 'hasn't shipped action metadata yet' hint when actions[] is empty", async () => {
    mockListProviderActions.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse gmail actions/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/hasn.t shipped action metadata yet/i),
      ).toBeInTheDocument();
    });
  });

  it("fires onPickAction with the provider-action meta when a provider action is picked", async () => {
    mockListProviderActions.mockResolvedValueOnce([createIssueMeta, addCommentMeta]);
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Add Comment")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Comment"));
    expect(onPickAction).toHaveBeenCalledTimes(1);
    expect(onPickAction).toHaveBeenCalledWith(addCommentMeta);
  });

  it("Back returns to list mode and does NOT fire onPickAction", async () => {
    mockListProviderActions.mockResolvedValueOnce([createIssueMeta]);
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Create Issue")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /back to action picker/i }),
    );
    // Back to list mode — native + provider sections visible again.
    expect(
      screen.getByRole("list", { name: /native actions list/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /action providers/i }),
    ).toBeInTheDocument();
    expect(onPickAction).not.toHaveBeenCalled();
  });

  it("per-provider cache short-circuits a same-session re-entry", async () => {
    mockListProviderActions.mockResolvedValueOnce([createIssueMeta]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Create Issue")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /back to action picker/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Create Issue")).toBeInTheDocument();
    });
    // Only one fetch despite two drill-ins.
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
  });

  it("drilling into different providers triggers separate fetches", async () => {
    mockListProviderActions
      .mockResolvedValueOnce([createIssueMeta])
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Create Issue")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /back to action picker/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /browse gmail actions/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/hasn.t shipped action metadata yet/i),
      ).toBeInTheDocument();
    });
    expect(mockListProviderActions).toHaveBeenCalledTimes(2);
    expect(mockListProviderActions).toHaveBeenNthCalledWith(1, "github");
    expect(mockListProviderActions).toHaveBeenNthCalledWith(2, "gmail");
  });

  it("Back stays scoped: list mode regenerates onPickAction wiring for native picks too", async () => {
    mockListProviderActions.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    const { onPickAction } = renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /back to action picker/i }),
    );
    // Native list is back; native click still wires up.
    await user.click(screen.getByText("HTTP Request"));
    expect(onPickAction).toHaveBeenCalledTimes(1);
    expect(onPickAction).toHaveBeenCalledWith(httpRequestMeta);
  });

  it("provider mode renders the provider display name in the header", async () => {
    mockListProviderActions.mockResolvedValueOnce([createIssueMeta]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github actions/i }),
    );
    const view = await screen.findByRole("region", {
      name: /github actions/i,
    });
    expect(within(view).getByText("GitHub")).toBeInTheDocument();
  });
});
