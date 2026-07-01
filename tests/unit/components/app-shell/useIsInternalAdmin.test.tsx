/**
 * Tests for components/app-shell/useIsInternalAdmin (internal-admin nav gate hook).
 *
 * Business rule: default false; flips true only when the caller-only status check
 * confirms it; fails closed on error. A module-level single-flight cache dedupes
 * the request across the desktop + mobile nav — reset between cases.
 */
import { renderHook, waitFor } from "@testing-library/react";

const mockFetchStatus = jest.fn();
jest.mock("@/lib/api/internalAdmin", () => ({
  fetchIsInternalAdmin: (...a: unknown[]) => mockFetchStatus(...a),
}));

import {
  useIsInternalAdmin,
  __resetInternalAdminStatusCache,
} from "@/components/app-shell/useIsInternalAdmin";

beforeEach(() => {
  mockFetchStatus.mockReset();
  __resetInternalAdminStatusCache();
});

describe("useIsInternalAdmin", () => {
  it("starts false and flips true once the check resolves true", async () => {
    mockFetchStatus.mockResolvedValue(true);
    const { result } = renderHook(() => useIsInternalAdmin());
    expect(result.current).toBe(false); // default before the async resolves
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays false when the check resolves false", async () => {
    mockFetchStatus.mockResolvedValue(false);
    const { result } = renderHook(() => useIsInternalAdmin());
    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("fails closed to false when the check rejects", async () => {
    mockFetchStatus.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useIsInternalAdmin());
    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("single-flights: two mounts share ONE underlying request (dedup)", async () => {
    mockFetchStatus.mockResolvedValue(true);
    const a = renderHook(() => useIsInternalAdmin());
    const b = renderHook(() => useIsInternalAdmin());
    await waitFor(() => expect(a.result.current).toBe(true));
    await waitFor(() => expect(b.result.current).toBe(true));
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);
  });

  it("cache reset forces a fresh request", async () => {
    mockFetchStatus.mockResolvedValue(true);
    renderHook(() => useIsInternalAdmin());
    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalledTimes(1));
    __resetInternalAdminStatusCache();
    renderHook(() => useIsInternalAdmin());
    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalledTimes(2));
  });
});
