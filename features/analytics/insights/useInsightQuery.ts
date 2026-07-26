"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectedAnalyticsQuery,
  ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import { queryInsight } from "@/lib/api/analytics";

/**
 * The ONE request-lifecycle hook for connected Custom Insights (CD-3A) — the
 * saved widget and the builder preview both run on it, so their behavior can
 * never drift.
 *
 * Owns: query execution, debouncing, cancellation of superseded requests,
 * stale/out-of-order response protection, explicit refresh (cache bypass),
 * retry, prior-result retention across a failed refresh (with explicit stale
 * messaging — never silently), and last-success time tracking.
 *
 * Does NOT own: catalog capability rules, dashboard persistence, chart
 * rendering, connection authorization, or any provider-specific behavior.
 */

export interface InsightFailure {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export type InsightQueryState =
  | { status: "idle" }
  | { status: "loading"; prior: ConnectedAnalyticsResult | null }
  | {
      status: "ok";
      result: ConnectedAnalyticsResult;
      /** Epoch ms of the last successful load (client clock; display only). */
      lastSuccessAt: number;
      /** Set when the LATEST attempt failed and this result is retained prior
       * data — the UI must say so, never present it as fresh. */
      refreshError: InsightFailure | null;
      /**
       * The serialized query this result answered (CD-5B). Hook state lags the
       * caller's query by one effect tick, so a caller that switches queries
       * (exploration drill / Back) needs this to tell whether `result` belongs
       * to the query it is currently asking about or to the previous one.
       */
      queryKey: string;
    }
  | { status: "error"; failure: InsightFailure };

export function useInsightQuery(
  query: ConnectedAnalyticsQuery | null,
  opts: { debounceMs?: number } = {},
): {
  state: InsightQueryState;
  /** Explicit cache-bypassing refresh (the supported provider-refresh path). */
  refresh: () => void;
  /** Re-run cache-first (after a transient failure). */
  retry: () => void;
} {
  const debounceMs = opts.debounceMs ?? 0;
  const [state, setState] = useState<InsightQueryState>({ status: "idle" });

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  // Last successful result for the CURRENT query key — retained across a
  // failed refresh of the same question, discarded when the question changes.
  const lastOkRef = useRef<{ key: string; result: ConnectedAnalyticsResult; at: number } | null>(
    null,
  );
  const queryKey = query ? JSON.stringify(query) : null;
  const queryRef = useRef(query);
  queryRef.current = query;

  const execute = useCallback(
    (mode: "load" | "refresh" | "retry") => {
      const q = queryRef.current;
      if (!q) return;
      const key = JSON.stringify(q);
      const seq = ++seqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;
      const prior = lastOkRef.current?.key === key ? lastOkRef.current : null;
      setState({ status: "loading", prior: prior?.result ?? null });
      queryInsight(q, {
        ...(mode === "refresh" ? { refresh: true } : {}),
        signal: controller.signal,
      })
        .then((out) => {
          if (seq !== seqRef.current) return; // superseded — ignore stale response
          inFlightRef.current = false;
          if (out.ok) {
            const at = Date.now();
            lastOkRef.current = { key, result: out.result, at };
            setState({ status: "ok", result: out.result, lastSuccessAt: at, refreshError: null, queryKey: key });
            return;
          }
          const failure: InsightFailure = {
            code: out.code,
            message: out.message,
            ...(out.retryAfterSeconds !== undefined
              ? { retryAfterSeconds: out.retryAfterSeconds }
              : {}),
          };
          if (prior) {
            // Same question, previously loaded: keep showing it WITH the
            // failure surfaced ("Couldn't refresh — showing previously saved
            // data."), matching the server's own stale-fallback posture.
            setState({
              status: "ok",
              result: prior.result,
              lastSuccessAt: prior.at,
              refreshError: failure,
              queryKey: key,
            });
            return;
          }
          setState({ status: "error", failure });
        })
        .catch((err: unknown) => {
          if (seq !== seqRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          inFlightRef.current = false;
          const failure: InsightFailure = {
            code: "ANALYTICS_QUERY_FAILED",
            message: "Couldn't load this insight.",
          };
          if (prior) {
            setState({
              status: "ok",
              result: prior.result,
              lastSuccessAt: prior.at,
              refreshError: failure,
              queryKey: key,
            });
          } else {
            setState({ status: "error", failure });
          }
        });
    },
    [],
  );

  useEffect(() => {
    if (!queryKey) {
      seqRef.current += 1; // invalidate anything in flight
      abortRef.current?.abort();
      inFlightRef.current = false;
      setState({ status: "idle" });
      return;
    }
    const timer = setTimeout(() => execute("load"), debounceMs);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [queryKey, debounceMs, execute]);

  const refresh = useCallback(() => {
    // A refresh while one is running would be a request storm knob — ignore.
    if (inFlightRef.current) return;
    execute("refresh");
  }, [execute]);

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    execute("retry");
  }, [execute]);

  return { state, refresh, retry };
}
