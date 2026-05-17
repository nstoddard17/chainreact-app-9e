/**
 * Tests for features/workflow-builder/hooks/useNativeActions.
 *
 * Mocks the discovery typed-client so the hook exercises its state
 * transitions (loading → loaded / failed) without a fetch.
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

import { renderHook, waitFor } from "@testing-library/react";
import {
  __resetNativeActionsCacheForTests,
  findNativeActionByKey,
  useNativeActions,
} from "@/features/workflow-builder/hooks/useNativeActions";
import type { ActionMeta } from "@/contracts/actionMeta";

const meta: ActionMeta = {
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
};

beforeEach(() => {
  mockListNativeActions.mockReset();
  __resetNativeActionsCacheForTests();
});

describe("useNativeActions", () => {
  it("returns loading initially, then resolves with the catalog", async () => {
    mockListNativeActions.mockResolvedValueOnce([meta]);
    const { result } = renderHook(() => useNativeActions());
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.actions).toEqual([meta]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the error message when the fetch fails", async () => {
    mockListNativeActions.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useNativeActions());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBe("offline");
  });

  it("caches the response across hook instances", async () => {
    mockListNativeActions.mockResolvedValueOnce([meta]);
    const first = renderHook(() => useNativeActions());
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
    });
    const second = renderHook(() => useNativeActions());
    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
    });
    expect(mockListNativeActions).toHaveBeenCalledTimes(1);
    expect(second.result.current.actions).toEqual([meta]);
  });

  it("re-fetches after a failure clears the cache", async () => {
    mockListNativeActions.mockRejectedValueOnce(new Error("first"));
    const first = renderHook(() => useNativeActions());
    await waitFor(() => {
      expect(first.result.current.error).toBe("first");
    });

    mockListNativeActions.mockResolvedValueOnce([meta]);
    const second = renderHook(() => useNativeActions());
    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
    });
    expect(second.result.current.actions).toEqual([meta]);
    expect(mockListNativeActions).toHaveBeenCalledTimes(2);
  });
});

describe("findNativeActionByKey", () => {
  it("returns the matching meta or undefined", () => {
    expect(findNativeActionByKey([meta], "native:http_request")).toBe(meta);
    expect(findNativeActionByKey([meta], "native:nope")).toBeUndefined();
    expect(findNativeActionByKey([], "native:http_request")).toBeUndefined();
  });
});
