/**
 * Tests for features/workflow-builder/hooks/useNativeTriggers.
 *
 * Slice 3.3 — mirror of the Slice 3.2 useNativeActions test shape so a
 * future reader can audit symmetry at a glance.
 */

const mockListNativeTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeTriggers: () => mockListNativeTriggers(),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { renderHook, waitFor } from "@testing-library/react";
import {
  __resetNativeTriggersCacheForTests,
  findNativeTriggerByKey,
  useNativeTriggers,
} from "@/features/workflow-builder/hooks/useNativeTriggers";
import type { TriggerMeta } from "@/contracts/triggerMeta";

const meta: TriggerMeta = {
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

beforeEach(() => {
  mockListNativeTriggers.mockReset();
  __resetNativeTriggersCacheForTests();
});

describe("useNativeTriggers", () => {
  it("returns loading initially, then resolves with the catalog", async () => {
    mockListNativeTriggers.mockResolvedValueOnce([meta]);
    const { result } = renderHook(() => useNativeTriggers());
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.triggers).toEqual([meta]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the error message when the fetch fails", async () => {
    mockListNativeTriggers.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useNativeTriggers());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.triggers).toEqual([]);
    expect(result.current.error).toBe("offline");
  });

  it("caches the response across hook instances", async () => {
    mockListNativeTriggers.mockResolvedValueOnce([meta]);
    const first = renderHook(() => useNativeTriggers());
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
    });
    const second = renderHook(() => useNativeTriggers());
    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
    });
    expect(mockListNativeTriggers).toHaveBeenCalledTimes(1);
    expect(second.result.current.triggers).toEqual([meta]);
  });

  it("re-fetches after a failure clears the cache", async () => {
    mockListNativeTriggers.mockRejectedValueOnce(new Error("first"));
    const first = renderHook(() => useNativeTriggers());
    await waitFor(() => {
      expect(first.result.current.error).toBe("first");
    });

    mockListNativeTriggers.mockResolvedValueOnce([meta]);
    const second = renderHook(() => useNativeTriggers());
    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
    });
    expect(second.result.current.triggers).toEqual([meta]);
    expect(mockListNativeTriggers).toHaveBeenCalledTimes(2);
  });

  it("uses DiscoveryApiError.message verbatim when one is thrown", async () => {
    mockListNativeTriggers.mockRejectedValueOnce(
      Object.assign(new Error("session expired"), {
        name: "DiscoveryApiError",
        code: "UNAUTHENTICATED",
        status: 401,
      }),
    );
    const { result } = renderHook(() => useNativeTriggers());
    await waitFor(() => {
      expect(result.current.error).toBe("session expired");
    });
  });
});

describe("findNativeTriggerByKey", () => {
  it("returns the matching meta or undefined", () => {
    expect(findNativeTriggerByKey([meta], "native:manual.run")).toBe(meta);
    expect(findNativeTriggerByKey([meta], "native:nope")).toBeUndefined();
    expect(findNativeTriggerByKey([], "native:manual.run")).toBeUndefined();
  });
});
