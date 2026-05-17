/**
 * Tests for features/workflow-builder/hooks/useProviderActions.
 *
 * Slice 3.4 — per-provider variant of useNativeActions / useNativeTriggers.
 * Same shape contract; parameterized on provider id.
 *
 * Coverage:
 *   - idle when provider is null
 *   - loading → resolved happy path per provider
 *   - error path surfaces the message
 *   - per-provider promise cache short-circuits same-provider reentries
 *   - different providers trigger independent fetches
 *   - failure evicts the cache so a retry mount re-fetches
 *   - provider id parameter change re-fetches the new one and replaces
 *     state cleanly
 *   - DiscoveryApiError.message passthrough
 *   - findProviderActionByKey lookup helper
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
  findProviderActionByKey,
  useProviderActions,
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
};

const gmailMeta: ActionMeta = {
  key: "gmail:send_email",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
  description: "Send a gmail message.",
  category: "email",
  requiresIntegration: true,
  fields: [],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
};

beforeEach(() => {
  mockListProviderActions.mockReset();
  __resetProviderActionsCacheForTests();
});

describe("useProviderActions — idle", () => {
  it("returns the frozen idle state when provider is null without fetching", () => {
    const { result } = renderHook(() => useProviderActions(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockListProviderActions).not.toHaveBeenCalled();
  });
});

describe("useProviderActions — fetch happy path", () => {
  it("starts loading then resolves with the provider's catalog", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubMeta]);
    const { result } = renderHook(() => useProviderActions("github"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.actions).toEqual([githubMeta]);
    expect(result.current.error).toBeNull();
    expect(mockListProviderActions).toHaveBeenCalledWith("github");
  });

  it("returns the empty-array resolution for providers without metadata", async () => {
    mockListProviderActions.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useProviderActions("gmail"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe("useProviderActions — error path", () => {
  it("surfaces the error message when the fetch fails", async () => {
    mockListProviderActions.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBe("offline");
  });

  it("uses DiscoveryApiError.message verbatim", async () => {
    mockListProviderActions.mockRejectedValueOnce(
      Object.assign(new Error("auth required"), {
        name: "DiscoveryApiError",
        code: "UNAUTHENTICATED",
        status: 401,
      }),
    );
    const { result } = renderHook(() => useProviderActions("github"));
    await waitFor(() => {
      expect(result.current.error).toBe("auth required");
    });
  });

  it("falls back to a generic message for unknown thrown values", async () => {
    mockListProviderActions.mockRejectedValueOnce("nope");
    const { result } = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/Failed to load actions for 'github'/);
  });
});

describe("useProviderActions — caching", () => {
  it("same-provider re-entry reuses the in-flight / resolved promise", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubMeta]);
    const first = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
    expect(second.result.current.actions).toEqual([githubMeta]);
  });

  it("different providers trigger independent fetches", async () => {
    mockListProviderActions
      .mockResolvedValueOnce([githubMeta])
      .mockResolvedValueOnce([gmailMeta]);
    const a = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    const b = renderHook(() => useProviderActions("gmail"));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(mockListProviderActions).toHaveBeenCalledTimes(2);
    expect(a.result.current.actions).toEqual([githubMeta]);
    expect(b.result.current.actions).toEqual([gmailMeta]);
  });

  it("re-fetches after a failure (cache eviction)", async () => {
    mockListProviderActions.mockRejectedValueOnce(new Error("first"));
    const first = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(first.result.current.error).toBe("first"));

    mockListProviderActions.mockResolvedValueOnce([githubMeta]);
    const second = renderHook(() => useProviderActions("github"));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.actions).toEqual([githubMeta]);
    expect(mockListProviderActions).toHaveBeenCalledTimes(2);
  });
});

describe("useProviderActions — provider-id changes", () => {
  it("rerender with a new provider id triggers a new fetch and replaces state", async () => {
    mockListProviderActions
      .mockResolvedValueOnce([githubMeta])
      .mockResolvedValueOnce([gmailMeta]);
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useProviderActions(p),
      { initialProps: { p: "github" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.actions).toEqual([githubMeta]);

    rerender({ p: "gmail" });
    await waitFor(() => expect(result.current.actions).toEqual([gmailMeta]));
    expect(mockListProviderActions).toHaveBeenNthCalledWith(2, "gmail");
  });

  it("rerender to null short-circuits back to idle without fetching", async () => {
    mockListProviderActions.mockResolvedValueOnce([githubMeta]);
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useProviderActions(p),
      { initialProps: { p: "github" as string | null } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ p: null });
    await waitFor(() => {
      expect(result.current.actions).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
    expect(mockListProviderActions).toHaveBeenCalledTimes(1);
  });
});

describe("findProviderActionByKey", () => {
  it("returns the matching meta or undefined", () => {
    expect(findProviderActionByKey([githubMeta], "github:add_comment")).toBe(
      githubMeta,
    );
    expect(
      findProviderActionByKey([githubMeta], "github:create_issue"),
    ).toBeUndefined();
    expect(
      findProviderActionByKey([], "github:add_comment"),
    ).toBeUndefined();
  });
});
