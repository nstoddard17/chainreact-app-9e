/**
 * Tests for features/workflow-builder/panels/TriggerPicker — Slice 3.10.
 *
 * The picker now mirrors ActionPicker's two-view-mode shape: list mode
 * (Native + Providers sections) and provider-mode drill-in.
 *
 * Contracts under test:
 *   - List mode renders Native + Providers sections.
 *   - Picking a native trigger fires onPickNative.
 *   - Clicking a provider enters provider mode (back button + triggers
 *     view).
 *   - Provider mode shows loading / error / empty / list states.
 *   - Picking a provider trigger fires onPickProviderTrigger with the
 *     meta — NOT the legacy bare-add path.
 *   - Back returns to list mode without firing either callback.
 *   - Per-provider promise cache short-circuits a same-session
 *     re-entry.
 */

const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriggerPicker } from "@/features/workflow-builder/panels/TriggerPicker";
import type { ProviderOption } from "@/features/workflow-builder/panels/AddNodeMenu";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { TriggerMeta } from "@/contracts/triggerMeta";

const manualMeta: TriggerMeta = {
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

const newCommitMeta: TriggerMeta = {
  key: "github:new_commit",
  provider: "github",
  type: "new_commit",
  displayName: "New Commit",
  description: "Fires when a push lands.",
  category: "developer",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

const githubProvider: ProviderOption = { id: "github", displayName: "GitHub" };
const gmailProvider: ProviderOption = { id: "gmail", displayName: "Gmail" };

function renderPicker(
  overrides: Partial<ComponentProps<typeof TriggerPicker>> = {},
) {
  const onPickNative = jest.fn();
  const onPickProviderTrigger = jest.fn();
  const utils = render(
    <TriggerPicker
      nativeTriggers={[manualMeta]}
      nativeLoading={false}
      nativeError={null}
      triggerProviders={[githubProvider, gmailProvider]}
      onPickNative={onPickNative}
      onPickProviderTrigger={onPickProviderTrigger}
      {...overrides}
    />,
  );
  return { ...utils, onPickNative, onPickProviderTrigger };
}

beforeEach(() => {
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  __resetProviderTriggersCacheForTests();
});

describe("TriggerPicker — list mode", () => {
  it("renders Native + Providers sections", () => {
    renderPicker();
    expect(
      screen.getByRole("list", { name: /native triggers list/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /trigger providers/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
  });

  it("fires onPickNative when a native trigger is picked", async () => {
    const user = userEvent.setup();
    const { onPickNative, onPickProviderTrigger } = renderPicker();
    await user.click(screen.getByText("Manual Trigger"));
    expect(onPickNative).toHaveBeenCalledTimes(1);
    expect(onPickNative).toHaveBeenCalledWith(manualMeta);
    expect(onPickProviderTrigger).not.toHaveBeenCalled();
  });

  it("forwards native loading state", () => {
    renderPicker({ nativeLoading: true, nativeTriggers: [] });
    expect(
      screen.getByText(/loading native triggers/i),
    ).toBeInTheDocument();
  });

  it("forwards native error state", () => {
    renderPicker({ nativeError: "boom", nativeTriggers: [] });
    expect(screen.getByRole("alert")).toHaveTextContent(/boom/i);
  });

  it("shows 'No native triggers available' when the native list is empty", () => {
    renderPicker({ nativeTriggers: [] });
    expect(
      screen.getByText(/no native triggers available/i),
    ).toBeInTheDocument();
  });

  it("shows 'No trigger providers available' when the provider list is empty", () => {
    renderPicker({ triggerProviders: [] });
    expect(
      screen.getByText(/no trigger providers available/i),
    ).toBeInTheDocument();
  });
});

describe("TriggerPicker — provider drill-in", () => {
  it("clicking a provider enters provider mode and loads its triggers", async () => {
    mockListProviderTriggers.mockImplementationOnce(async (p: string) => {
      expect(p).toBe("github");
      return [newCommitMeta];
    });
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    expect(
      screen.getByRole("button", { name: /back to trigger picker/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(1);
    expect(mockListProviderTriggers).toHaveBeenCalledWith("github");
  });

  it("provider mode shows a per-provider loading line until the catalog resolves", async () => {
    let resolveFetch: (v: readonly TriggerMeta[]) => void = () => {};
    mockListProviderTriggers.mockReturnValueOnce(
      new Promise<readonly TriggerMeta[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    expect(screen.getByText(/loading github triggers/i)).toBeInTheDocument();
    resolveFetch([newCommitMeta]);
    await waitFor(() => {
      expect(screen.queryByText(/loading github triggers/i)).not.toBeInTheDocument();
    });
  });

  it("provider mode surfaces an inline error when the catalog fetch fails", async () => {
    mockListProviderTriggers.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/offline/i);
    });
  });

  it("provider mode shows a 'hasn't shipped trigger metadata yet' hint when triggers[] is empty", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse gmail triggers/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/hasn.t shipped trigger metadata yet/i),
      ).toBeInTheDocument();
    });
  });

  it("fires onPickProviderTrigger with the meta — NOT the legacy bare-add path", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([newCommitMeta]);
    const user = userEvent.setup();
    const { onPickProviderTrigger, onPickNative } = renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    await user.click(screen.getByText("New Commit"));
    expect(onPickProviderTrigger).toHaveBeenCalledTimes(1);
    expect(onPickProviderTrigger).toHaveBeenCalledWith(newCommitMeta);
    // onPickNative is the native-only callback; provider picks must not
    // collide with it.
    expect(onPickNative).not.toHaveBeenCalled();
  });

  it("Back returns to list mode and does NOT fire onPickProviderTrigger", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([newCommitMeta]);
    const user = userEvent.setup();
    const { onPickProviderTrigger } = renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /back to trigger picker/i }),
    );
    expect(
      screen.getByRole("list", { name: /native triggers list/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /trigger providers/i }),
    ).toBeInTheDocument();
    expect(onPickProviderTrigger).not.toHaveBeenCalled();
  });

  it("per-provider cache short-circuits a same-session re-entry", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([newCommitMeta]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /back to trigger picker/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(1);
  });

  it("drilling into different providers triggers separate fetches", async () => {
    mockListProviderTriggers
      .mockResolvedValueOnce([newCommitMeta])
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("New Commit")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /back to trigger picker/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /browse gmail triggers/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/hasn.t shipped trigger metadata yet/i),
      ).toBeInTheDocument();
    });
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(2);
    expect(mockListProviderTriggers).toHaveBeenNthCalledWith(1, "github");
    expect(mockListProviderTriggers).toHaveBeenNthCalledWith(2, "gmail");
  });

  it("provider mode renders the provider display name in the header", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([newCommitMeta]);
    const user = userEvent.setup();
    renderPicker();
    await user.click(
      screen.getByRole("button", { name: /browse github triggers/i }),
    );
    const view = await screen.findByRole("region", {
      name: /github triggers/i,
    });
    expect(within(view).getByText("GitHub")).toBeInTheDocument();
  });
});
