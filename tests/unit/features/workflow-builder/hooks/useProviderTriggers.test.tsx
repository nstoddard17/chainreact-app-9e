/**
 * Tests for features/workflow-builder/hooks/useProviderTriggers — Slice 3.10.
 *
 * Per-provider variant for triggers. Mirrors the shape of
 * useProviderActions.test.tsx exactly so the two hooks stay
 * symmetric — anyone adding a new behavior to one should add the
 * matching test to the other.
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

import { renderHook, waitFor } from "@testing-library/react";
import {
  __resetProviderTriggersCacheForTests,
  findProviderTriggerByKey,
  useProviderTriggers,
} from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { TriggerMeta } from "@/contracts/triggerMeta";

const githubMeta: TriggerMeta = {
  key: "github:new_commit",
  provider: "github",
  type: "new_commit",
  displayName: "New Commit",
  description: "Fires on push.",
  category: "developer",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

const slackMeta: TriggerMeta = {
  key: "slack:slack.message.channel",
  provider: "slack",
  type: "slack.message.channel",
  displayName: "New Message in Channel",
  description: "Slack message.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

beforeEach(() => {
  mockListProviderTriggers.mockReset();
  __resetProviderTriggersCacheForTests();
});

describe("useProviderTriggers — idle", () => {
  it("returns the frozen idle state when provider is null without fetching", () => {
    const { result } = renderHook(() => useProviderTriggers(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.triggers).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockListProviderTriggers).not.toHaveBeenCalled();
  });
});

describe("useProviderTriggers — fetch happy path", () => {
  it("starts loading then resolves with the provider's catalog", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([githubMeta]);
    const { result } = renderHook(() => useProviderTriggers("github"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.triggers).toEqual([githubMeta]);
    expect(result.current.error).toBeNull();
    expect(mockListProviderTriggers).toHaveBeenCalledWith("github");
  });

  it("returns the empty-array resolution for providers without trigger metadata", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useProviderTriggers("slack"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.triggers).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe("useProviderTriggers — error path", () => {
  it("surfaces the error message when the fetch fails", async () => {
    mockListProviderTriggers.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.triggers).toEqual([]);
    expect(result.current.error).toBe("offline");
  });

  it("falls back to a generic message for unknown thrown values", async () => {
    mockListProviderTriggers.mockRejectedValueOnce("nope");
    const { result } = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/Failed to load triggers for 'github'/);
  });
});

describe("useProviderTriggers — caching", () => {
  it("same-provider re-entry reuses the in-flight / resolved promise", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([githubMeta]);
    const first = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(1);
    expect(second.result.current.triggers).toEqual([githubMeta]);
  });

  it("different providers trigger independent fetches and do not cross-contaminate", async () => {
    mockListProviderTriggers
      .mockResolvedValueOnce([githubMeta])
      .mockResolvedValueOnce([slackMeta]);
    const a = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useProviderTriggers("slack"));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(2);
    expect(a.result.current.triggers).toEqual([githubMeta]);
    expect(b.result.current.triggers).toEqual([slackMeta]);
  });

  it("re-fetches after a failure (cache eviction)", async () => {
    mockListProviderTriggers.mockRejectedValueOnce(new Error("first"));
    const first = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(first.result.current.error).toBe("first"));

    mockListProviderTriggers.mockResolvedValueOnce([githubMeta]);
    const second = renderHook(() => useProviderTriggers("github"));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.triggers).toEqual([githubMeta]);
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(2);
  });
});

describe("useProviderTriggers — provider-id changes", () => {
  it("rerender with a new provider id triggers a new fetch and replaces state", async () => {
    mockListProviderTriggers
      .mockResolvedValueOnce([githubMeta])
      .mockResolvedValueOnce([slackMeta]);
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useProviderTriggers(p),
      { initialProps: { p: "github" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.triggers).toEqual([githubMeta]);

    rerender({ p: "slack" });
    await waitFor(() => expect(result.current.triggers).toEqual([slackMeta]));
    expect(mockListProviderTriggers).toHaveBeenNthCalledWith(2, "slack");
  });

  it("rerender to null short-circuits back to idle without fetching", async () => {
    mockListProviderTriggers.mockResolvedValueOnce([githubMeta]);
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useProviderTriggers(p),
      { initialProps: { p: "github" as string | null } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ p: null });
    await waitFor(() => {
      expect(result.current.triggers).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
    expect(mockListProviderTriggers).toHaveBeenCalledTimes(1);
  });
});

describe("findProviderTriggerByKey", () => {
  it("returns the matching meta or undefined", () => {
    expect(findProviderTriggerByKey([githubMeta], "github:new_commit")).toBe(
      githubMeta,
    );
    expect(
      findProviderTriggerByKey([githubMeta], "github:nonexistent"),
    ).toBeUndefined();
    expect(findProviderTriggerByKey([], "github:new_commit")).toBeUndefined();
  });
});
