jest.mock("@/lib/api/analytics", () => ({ queryInsight: jest.fn() }));

import { act, renderHook, waitFor } from "@testing-library/react";
import { queryInsight } from "@/lib/api/analytics";
import type { InsightQueryOutcome } from "@/lib/api/analytics";
import { useInsightQuery } from "@/features/analytics/insights/useInsightQuery";
import type { ConnectedAnalyticsQuery } from "@/contracts/connectedAnalytics";
import { kpiResult } from "./fixtures";

const mockQuery = queryInsight as jest.MockedFunction<typeof queryInsight>;

const QUERY: ConnectedAnalyticsQuery = {
  source: "acme",
  dataset: "orders",
  measure: "order_count",
  dimension: null,
  range: { preset: "30d" },
  chart: "kpi",
};

function deferred(): {
  promise: Promise<InsightQueryOutcome>;
  resolve: (v: InsightQueryOutcome) => void;
} {
  let resolve!: (v: InsightQueryOutcome) => void;
  const promise = new Promise<InsightQueryOutcome>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("useInsightQuery", () => {
  it("null query stays idle and sends nothing", () => {
    const { result } = renderHook(() => useInsightQuery(null));
    expect(result.current.state.status).toBe("idle");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("loads exactly the query it was given and reports success", async () => {
    mockQuery.mockResolvedValue({ ok: true, result: kpiResult() });
    const { result } = renderHook(() => useInsightQuery(QUERY));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toEqual(QUERY);
    // Initial load is cache-first, never a refresh bypass.
    expect(mockQuery.mock.calls[0]![1]).not.toMatchObject({ refresh: true });
  });

  it("maps a typed failure into the error state", async () => {
    mockQuery.mockResolvedValue({
      ok: false,
      code: "RATE_LIMITED",
      message: "Try again shortly.",
      retryAfterSeconds: 30,
    });
    const { result } = renderHook(() => useInsightQuery(QUERY));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    if (state.status !== "error") throw new Error("expected error");
    expect(state.failure).toEqual({
      code: "RATE_LIMITED",
      message: "Try again shortly.",
      retryAfterSeconds: 30,
    });
  });

  it("explicit refresh bypasses cache; a failed refresh KEEPS prior data with stale messaging", async () => {
    mockQuery.mockResolvedValueOnce({ ok: true, result: kpiResult() });
    const { result } = renderHook(() => useInsightQuery(QUERY));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));

    mockQuery.mockResolvedValueOnce({
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Provider down.",
    });
    act(() => result.current.refresh());
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status).toBe("ok");
      if (s.status === "ok") expect(s.refreshError).not.toBeNull();
    });
    expect(mockQuery.mock.calls[1]![1]).toMatchObject({ refresh: true });
    const s = result.current.state;
    if (s.status !== "ok") throw new Error("expected retained ok state");
    expect(s.result.value).toBe(1234); // prior data retained
    expect(s.refreshError?.code).toBe("PROVIDER_ERROR"); // and honestly flagged
  });

  it("ignores stale out-of-order responses when the query changes", async () => {
    const first = deferred();
    const second = deferred();
    mockQuery.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ q }) => useInsightQuery(q), {
      initialProps: { q: QUERY },
    });
    // Let the first request actually leave before the query changes.
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
    rerender({ q: { ...QUERY, measure: "gross_amount" } });
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(2));

    // The SECOND (current) response lands first…
    act(() =>
      second.resolve({
        ok: true,
        result: kpiResult({ measure: { id: "gross_amount", label: "Gross" }, value: 999 }),
      }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    // …then the stale first response arrives and must be discarded.
    act(() => first.resolve({ ok: true, result: kpiResult({ value: 1 }) }));
    await new Promise((r) => setTimeout(r, 0));
    const s = result.current.state;
    if (s.status !== "ok") throw new Error("expected ok");
    expect(s.result.value).toBe(999);
  });

  it("debounces rapid query changes into one request", async () => {
    jest.useFakeTimers();
    try {
      mockQuery.mockResolvedValue({ ok: true, result: kpiResult() });
      const { rerender } = renderHook(({ q }) => useInsightQuery(q, { debounceMs: 400 }), {
        initialProps: { q: QUERY },
      });
      rerender({ q: { ...QUERY, measure: "m2" } });
      rerender({ q: { ...QUERY, measure: "m3" } });
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect((mockQuery.mock.calls[0]![0] as ConnectedAnalyticsQuery).measure).toBe("m3");
    } finally {
      jest.useRealTimers();
    }
  });

  it("aborts the in-flight request on unmount", async () => {
    const never = deferred();
    mockQuery.mockReturnValue(never.promise);
    const { unmount } = renderHook(() => useInsightQuery(QUERY));
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
    const signal = (mockQuery.mock.calls[0]![1] as { signal?: AbortSignal }).signal;
    expect(signal).toBeDefined();
    unmount();
    expect(signal!.aborted).toBe(true);
  });
});
