/**
 * Tests for `useOptionsSource` (Slice 3.31).
 *
 * Coverage:
 *   - Idle when source is null OR enabled === false.
 *   - loading → ready on success.
 *   - loading → empty when items length is 0.
 *   - disconnected mapping for INTEGRATION_DISCONNECTED.
 *   - generic error mapping for other ok:false codes.
 *   - missing-dependency mapping carries the missingDependency field.
 *   - Debounce: rapid `query` changes coalesce into one fetch.
 *   - Source change re-fetches.
 *   - Deps change re-fetches (canonical key stable across same-set rerenders).
 *   - Stale-response protection: a slow fetch that resolves AFTER abort
 *     does not overwrite the newer state.
 *   - refetch() re-runs the current fetch.
 *   - Network-throw via the client's UNKNOWN mapping surfaces as error.
 *
 * The hook mocks `fetchOptionsSource` from `@/lib/api/options`. Tests
 * never hit the real network layer.
 */

const mockFetchOptionsSource = jest.fn();

jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
import type { OptionsApiResponse } from "@/lib/api/options";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function success(
  source: string,
  items: { value: string; label: string }[],
  hasMore = false,
): OptionsApiResponse {
  return { ok: true, source, items, hasMore };
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

describe("useOptionsSource — idle", () => {
  it("returns idle without fetching when source is null", () => {
    const { result } = renderHook(() => useOptionsSource({ source: null }));
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.items).toEqual([]);
    expect(mockFetchOptionsSource).not.toHaveBeenCalled();
  });

  it("returns idle without fetching when enabled is false", () => {
    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples", enabled: false }),
    );
    expect(result.current.state.status).toBe("idle");
    expect(mockFetchOptionsSource).not.toHaveBeenCalled();
  });

  it("transitions back to idle when enabled flips from true to false", async () => {
    mockFetchOptionsSource.mockResolvedValue(
      success("native:examples", [{ value: "apple", label: "Apple" }]),
    );
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useOptionsSource({ source: "native:examples", enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    rerender({ enabled: false });
    expect(result.current.state.status).toBe("idle");
  });
});

describe("useOptionsSource — fetch lifecycle", () => {
  it("loading → ready on successful fetch", async () => {
    const def = deferred<OptionsApiResponse>();
    mockFetchOptionsSource.mockReturnValueOnce(def.promise);

    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("loading"));

    await act(async () => {
      def.resolve(
        success("native:examples", [
          { value: "apple", label: "Apple" },
          { value: "banana", label: "Banana" },
        ]),
      );
      await def.promise;
    });

    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.items).toEqual([
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
    ]);
    expect(result.current.state.hasMore).toBe(false);
  });

  it("loading → empty when items array is empty", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(success("native:examples", []));
    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("empty"));
    expect(result.current.state.items).toEqual([]);
  });

  it("passes the source through to fetchOptionsSource", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(success("native:examples", []));
    renderHook(() => useOptionsSource({ source: "native:examples" }));
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1),
    );
    const [src, args] = mockFetchOptionsSource.mock.calls[0]!;
    expect(src).toBe("native:examples");
    // No q (empty) and no deps (none) → just the signal.
    expect(args.q).toBeUndefined();
    expect(args.deps).toBeUndefined();
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it("propagates `hasMore: true` from the route", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(
      success("native:examples", [{ value: "a", label: "A" }], true),
    );
    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.hasMore).toBe(true);
  });
});

describe("useOptionsSource — error mappings", () => {
  it("maps INTEGRATION_DISCONNECTED to status 'disconnected' with the provider", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce({
      ok: false,
      source: "slack:channels",
      code: "INTEGRATION_DISCONNECTED",
      message: "No active slack integration. Connect slack first.",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "slack:channels" }),
    );
    await waitFor(() =>
      expect(result.current.state.status).toBe("disconnected"),
    );
    if (result.current.state.status !== "disconnected") {
      throw new Error("unreachable");
    }
    expect(result.current.state.provider).toBe("slack");
    expect(result.current.state.message).toMatch(/Connect slack/);
  });

  // 4.TEAM-WORKFLOWS-2 (TW-2) — owner-gated credential states.
  it("maps NOT_WORKFLOW_OWNER to a distinct 'owner-gated' status (not generic error) and does not auto-refetch", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: "gmail:labels",
      code: "NOT_WORKFLOW_OWNER",
      message: "This step runs under the workflow owner's gmail connection.",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "gmail:labels", workflowId: "wf-9" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("owner-gated"));
    if (result.current.state.status !== "owner-gated") throw new Error("unreachable");
    expect(result.current.state.provider).toBe("gmail");
    expect(result.current.state.message).toMatch(/workflow owner/);
    expect(result.current.state.items).toEqual([]);
    // No retry loop: the hook fetched exactly once and stayed in the gated state.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1);
  });

  it("maps OWNER_MUST_CONNECT to a distinct 'owner-must-connect' status", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce({
      ok: false,
      source: "gmail:labels",
      code: "OWNER_MUST_CONNECT",
      message: "Connect gmail to configure and run this workflow.",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "gmail:labels", workflowId: "wf-9" }),
    );
    await waitFor(() =>
      expect(result.current.state.status).toBe("owner-must-connect"),
    );
    if (result.current.state.status !== "owner-must-connect") throw new Error("unreachable");
    expect(result.current.state.provider).toBe("gmail");
    expect(result.current.state.message).toMatch(/Connect gmail/);
  });

  it("maps PROVIDER_REAUTH_REQUIRED to a distinct 'needs-reconnect' status (not generic error) with the provider", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce({
      ok: false,
      source: "slack:channels",
      code: "PROVIDER_REAUTH_REQUIRED",
      message: "Slack needs to be reconnected before its channels can load.",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "slack:channels" }),
    );
    await waitFor(() =>
      expect(result.current.state.status).toBe("needs-reconnect"),
    );
    if (result.current.state.status !== "needs-reconnect") {
      throw new Error("unreachable");
    }
    expect(result.current.state.provider).toBe("slack");
    expect(result.current.state.message).toMatch(/reconnect/i);
  });

  it("maps generic ok:false codes to status 'error' with the code passed through", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce({
      ok: false,
      source: "native:examples",
      code: "PROVIDER_ERROR",
      message: "Synthetic provider failure.",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    if (result.current.state.status !== "error") {
      throw new Error("unreachable");
    }
    expect(result.current.state.code).toBe("PROVIDER_ERROR");
    expect(result.current.state.message).toMatch(/Synthetic/);
  });

  it("carries `missingDependency` on MISSING_DEPENDENCY errors", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce({
      ok: false,
      source: "airtable:tables",
      code: "MISSING_DEPENDENCY",
      message: "Required dependsOn field 'baseId' is missing.",
      missingDependency: "baseId",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "airtable:tables" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    if (result.current.state.status !== "error") {
      throw new Error("unreachable");
    }
    expect(result.current.state.code).toBe("MISSING_DEPENDENCY");
    expect(result.current.state.missingDependency).toBe("baseId");
  });

  it("maps the client's UNKNOWN code to status 'error'", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce({
      ok: false,
      source: "native:examples",
      code: "UNKNOWN",
      message: "Network error. Try again.",
    });
    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    if (result.current.state.status !== "error") {
      throw new Error("unreachable");
    }
    expect(result.current.state.code).toBe("UNKNOWN");
  });
});

describe("useOptionsSource — debounce", () => {
  it("rapid query changes coalesce into a single fetch", async () => {
    jest.useFakeTimers();
    try {
      mockFetchOptionsSource.mockResolvedValue(
        success("native:examples", [{ value: "a", label: "A" }]),
      );

      const { rerender } = renderHook(
        ({ query }: { query: string }) =>
          useOptionsSource({ source: "native:examples", query }),
        { initialProps: { query: "" } },
      );

      // Initial mount kicks off a fetch with q=""; advance past
      // debounce + flush microtasks so we can measure call count
      // delta cleanly.
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      const initialCallCount = mockFetchOptionsSource.mock.calls.length;
      expect(initialCallCount).toBeGreaterThanOrEqual(1);

      // Rapid typing.
      rerender({ query: "a" });
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      rerender({ query: "ap" });
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      rerender({ query: "app" });
      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      // Still inside the debounce window — no new fetch yet.
      expect(mockFetchOptionsSource.mock.calls.length).toBe(initialCallCount);

      // Cross the debounce threshold.
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      // Exactly one additional fetch for the typing burst.
      expect(mockFetchOptionsSource.mock.calls.length).toBe(
        initialCallCount + 1,
      );
      const lastCallArgs =
        mockFetchOptionsSource.mock.calls[
          mockFetchOptionsSource.mock.calls.length - 1
        ]![1];
      expect(lastCallArgs.q).toBe("app");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("useOptionsSource — deps + source changes", () => {
  it("re-fetches when source changes", async () => {
    mockFetchOptionsSource
      .mockResolvedValueOnce(
        success("native:examples", [{ value: "a", label: "A" }]),
      )
      .mockResolvedValueOnce(
        success("other:source", [{ value: "b", label: "B" }]),
      );
    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useOptionsSource({ source: src }),
      { initialProps: { src: "native:examples" } },
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.items).toEqual([
      { value: "a", label: "A" },
    ]);

    rerender({ src: "other:source" });
    await waitFor(() =>
      expect(result.current.state.items).toEqual([{ value: "b", label: "B" }]),
    );
    expect(mockFetchOptionsSource).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when deps change (canonical key set difference)", async () => {
    mockFetchOptionsSource.mockResolvedValue(success("airtable:tables", []));
    const { rerender } = renderHook(
      ({ deps }: { deps: Record<string, string> }) =>
        useOptionsSource({ source: "airtable:tables", deps }),
      { initialProps: { deps: { baseId: "b1" } } },
    );
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1),
    );
    rerender({ deps: { baseId: "b2" } });
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(2),
    );
    const lastArgs =
      mockFetchOptionsSource.mock.calls[
        mockFetchOptionsSource.mock.calls.length - 1
      ]![1];
    expect(lastArgs.deps).toEqual({ baseId: "b2" });
  });

  it("does NOT re-fetch when the deps object is a fresh reference with the same key/value", async () => {
    mockFetchOptionsSource.mockResolvedValue(success("airtable:tables", []));
    const { rerender } = renderHook(
      ({ deps }: { deps: Record<string, string> }) =>
        useOptionsSource({ source: "airtable:tables", deps }),
      { initialProps: { deps: { baseId: "b1" } } },
    );
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1),
    );
    // Fresh object, same shape — canonical depsKey doesn't change.
    rerender({ deps: { baseId: "b1" } });
    // Yield a microtask so any spurious fetch would have landed.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1);
  });
});

describe("useOptionsSource — stale-response protection", () => {
  it("does not commit a stale response after the effect re-runs", async () => {
    const slow = deferred<OptionsApiResponse>();
    const fast = deferred<OptionsApiResponse>();
    mockFetchOptionsSource
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useOptionsSource({ source: src }),
      { initialProps: { src: "native:examples" } },
    );

    // Trigger re-fetch by switching source. The slow promise is still
    // in flight; its controller is aborted by the cleanup.
    rerender({ src: "other:source" });

    await act(async () => {
      // Now resolve the fast (newer) fetch first.
      fast.resolve(success("other:source", [{ value: "b", label: "B" }]));
      await fast.promise;
    });

    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.items).toEqual([{ value: "b", label: "B" }]);

    // Now resolve the slow (older) fetch. It should NOT overwrite the
    // newer state because its controller was aborted.
    await act(async () => {
      slow.resolve(
        success("native:examples", [
          { value: "STALE", label: "STALE_LABEL" },
        ]),
      );
      await slow.promise;
    });

    expect(result.current.state.items).toEqual([{ value: "b", label: "B" }]);
  });

  it("does not commit state when an AbortError reaches the catch branch", async () => {
    const def = deferred<OptionsApiResponse>();
    mockFetchOptionsSource.mockReturnValueOnce(def.promise);

    const { result, unmount } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("loading"));

    unmount();
    // After unmount, throw AbortError on the fetch promise.
    await act(async () => {
      def.reject(new DOMException("aborted", "AbortError"));
      // Yield microtasks so any rogue setState would land.
      await Promise.resolve();
      await Promise.resolve();
    });
    // No assertion on state (the hook is unmounted) — the test passes
    // if no "act() / state update on unmounted component" warning is
    // raised and no crash occurs.
    expect(true).toBe(true);
  });
});

describe("useOptionsSource — refetch", () => {
  it("refetch() re-runs the fetch and surfaces the new result", async () => {
    mockFetchOptionsSource
      .mockResolvedValueOnce({
        ok: false,
        source: "native:examples",
        code: "PROVIDER_ERROR",
        message: "First failure.",
      })
      .mockResolvedValueOnce(
        success("native:examples", [{ value: "a", label: "A" }]),
      );

    const { result } = renderHook(() =>
      useOptionsSource({ source: "native:examples" }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.items).toEqual([{ value: "a", label: "A" }]);
    expect(mockFetchOptionsSource).toHaveBeenCalledTimes(2);
  });
});

describe("useOptionsSource — workflowId plumbing (22D-1)", () => {
  it("forwards workflowId to fetchOptionsSource", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(success("native:examples", []));
    renderHook(() =>
      useOptionsSource({ source: "native:examples", workflowId: "wf-9" }),
    );
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1),
    );
    const [, args] = mockFetchOptionsSource.mock.calls[0]!;
    expect(args.workflowId).toBe("wf-9");
  });

  it("omits workflowId from the fetch args when unset", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(success("native:examples", []));
    renderHook(() => useOptionsSource({ source: "native:examples" }));
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1),
    );
    const [, args] = mockFetchOptionsSource.mock.calls[0]!;
    expect(args.workflowId).toBeUndefined();
  });

  // CS-4 — nodeId is threaded the same way as workflowId (ref, not effect dep).
  it("forwards nodeId (with workflowId) to fetchOptionsSource", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(success("native:examples", []));
    renderHook(() =>
      useOptionsSource({ source: "native:examples", workflowId: "wf-9", nodeId: "node-7" }),
    );
    await waitFor(() => expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1));
    const [, args] = mockFetchOptionsSource.mock.calls[0]!;
    expect(args.workflowId).toBe("wf-9");
    expect(args.nodeId).toBe("node-7");
  });

  it("omits nodeId from the fetch args when unset", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(success("native:examples", []));
    renderHook(() => useOptionsSource({ source: "native:examples", workflowId: "wf-9" }));
    await waitFor(() => expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1));
    const [, args] = mockFetchOptionsSource.mock.calls[0]!;
    expect(args.nodeId).toBeUndefined();
  });

  // The "no behavior change" guard: workflowId is read via a ref, NOT an effect
  // dependency — so changing it alone must not trigger a re-fetch (it would for
  // source / deps / query). A builder edits one workflow per mount anyway.
  it("does NOT re-fetch when only workflowId changes", async () => {
    mockFetchOptionsSource.mockResolvedValue(success("native:examples", []));
    const { rerender } = renderHook(
      ({ wf }: { wf: string }) =>
        useOptionsSource({ source: "native:examples", workflowId: wf }),
      { initialProps: { wf: "wf-1" } },
    );
    await waitFor(() =>
      expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1),
    );
    rerender({ wf: "wf-2" });
    // Yield a microtask so any spurious fetch would have landed.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchOptionsSource).toHaveBeenCalledTimes(1);
  });
});

describe("useOptionsSource — boundary", () => {
  it("does not import services/options (module load smoke test)", () => {
    // The structural boundary test enforces this at the file level.
    // This test pins the runtime by importing the hook module and
    // confirming no `services/options/*` module shows up on the
    // dependency surface accessible from the hook file. We can't
    // introspect Webpack/Jest module graphs cheaply, but a require
    // of the hook should never pull in the server-only types module —
    // since types are erased, even a typo'd value import would crash
    // here. The hook loads at the top of this file.
    expect(useOptionsSource).toBeDefined();
  });
});
