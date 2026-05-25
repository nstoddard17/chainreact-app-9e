/**
 * Tests for useProviderActionsForProviders — Slice 3.7.
 *
 * The Slice 3.7 brief explicitly forbids calling `useProviderActions`
 * in a loop. This hook is the stable-profile alternative. Tests pin:
 *   - One fetch per unique provider id (shared with the per-provider
 *     cache).
 *   - Stable behavior when the input array reference changes but the
 *     id set doesn't (no thrashing fetches).
 *   - Empty-input idle.
 *   - Mixed success / failure produces a populated `byProvider` map
 *     plus the per-provider error string.
 *   - Failures are EVICTED from the cache (next mount re-fetches).
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

import { renderHook, waitFor } from "@testing-library/react";
import {
  __resetProviderActionsCacheForTests,
  useProviderActionsForProviders,
} from "@/features/workflow-builder/hooks/useProviderActions";
import type { ActionMeta } from "@/contracts/actionMeta";

const githubMeta: ActionMeta = {
  key: "github:add_comment",
  provider: "github",
  type: "add_comment",
  displayName: "Add Comment",
  description: "Add a comment.",
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

const gmailMeta: ActionMeta = {
  ...githubMeta,
  key: "gmail:send_email",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
};

beforeEach(() => {
  mockListProviderActions.mockReset();
  __resetProviderActionsCacheForTests();
});

describe("useProviderActionsForProviders — empty input", () => {
  it("returns the frozen idle result without fetching", async () => {
    const { result } = renderHook(() =>
      useProviderActionsForProviders([]),
    );
    expect(result.current.byProvider).toEqual({});
    expect(result.current.loading).toBe(false);
    expect(result.current.errors).toEqual({});
    expect(mockListProviderActions).not.toHaveBeenCalled();
  });
});

describe("useProviderActionsForProviders — happy path", () => {
  it("resolves multiple providers and stores them by id", async () => {
    mockListProviderActions.mockImplementation(async (p: string) =>
      p === "github" ? [githubMeta] : p === "gmail" ? [gmailMeta] : [],
    );
    const { result } = renderHook(() =>
      useProviderActionsForProviders(["github", "gmail"]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byProvider).toEqual({
      github: [githubMeta],
      gmail: [gmailMeta],
    });
    expect(result.current.errors).toEqual({});
    expect(mockListProviderActions).toHaveBeenCalledTimes(2);
  });

  it("dedups input ids so the same provider isn't fetched twice", async () => {
    mockListProviderActions.mockResolvedValue([githubMeta]);
    const { result } = renderHook(() =>
      useProviderActionsForProviders(["github", "github", "github"]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.current.byProvider)).toEqual(["github"]);
  });
});

describe("useProviderActionsForProviders — stability across input renames", () => {
  it("does NOT re-fetch when the input array reference changes but the id set doesn't", async () => {
    mockListProviderActions.mockResolvedValue([githubMeta]);
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) =>
        useProviderActionsForProviders(ids),
      { initialProps: { ids: ["github"] as readonly string[] } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);

    rerender({ ids: ["github"] }); // fresh array, same set
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-fetch when the same ids are passed in a different order", async () => {
    mockListProviderActions.mockResolvedValue([githubMeta]);
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) =>
        useProviderActionsForProviders(ids),
      { initialProps: { ids: ["github", "gmail"] as readonly string[] } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialCount = mockListProviderActions.mock.calls.length;

    rerender({ ids: ["gmail", "github"] }); // same set, reversed order
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(initialCount);
  });

  it("re-fetches the NEW id when the set changes (adding a provider)", async () => {
    mockListProviderActions.mockImplementation(async (p: string) =>
      p === "github" ? [githubMeta] : p === "gmail" ? [gmailMeta] : [],
    );
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) =>
        useProviderActionsForProviders(ids),
      { initialProps: { ids: ["github"] as readonly string[] } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);

    rerender({ ids: ["github", "gmail"] }); // ADD gmail
    await waitFor(() => {
      expect(result.current.byProvider.gmail).toEqual([gmailMeta]);
    });
    expect(mockListProviderActions).toHaveBeenCalledWith("gmail");
  });
});

describe("useProviderActionsForProviders — error path", () => {
  it("captures per-provider errors and still resolves loading: false", async () => {
    mockListProviderActions.mockImplementation(async (p: string) => {
      if (p === "github") return [githubMeta];
      throw new Error(`offline for ${p}`);
    });
    const { result } = renderHook(() =>
      useProviderActionsForProviders(["github", "gmail"]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byProvider.github).toEqual([githubMeta]);
    expect(result.current.errors.gmail).toMatch(/offline for gmail/);
  });

  it("evicts failures from the cache so a remount can retry", async () => {
    mockListProviderActions.mockRejectedValueOnce(new Error("first"));
    const first = renderHook(() =>
      useProviderActionsForProviders(["github"]),
    );
    await waitFor(() =>
      expect(first.result.current.errors.github).toBe("first"),
    );

    mockListProviderActions.mockResolvedValueOnce([githubMeta]);
    const second = renderHook(() =>
      useProviderActionsForProviders(["github"]),
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.byProvider.github).toEqual([githubMeta]);
    expect(mockListProviderActions).toHaveBeenCalledTimes(2);
  });
});
