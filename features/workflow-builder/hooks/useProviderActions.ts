"use client";

import { useEffect, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import {
  DiscoveryApiError,
  listProviderActions,
} from "@/lib/api/discovery";

/**
 * Per-provider action-metadata loader.
 *
 * Slice 3.4 — companion to Slice 3.2's `useNativeActions` and Slice 3.3's
 * `useNativeTriggers`. Same shape (loading / list / error), but
 * parameterized on `provider` so the picker can drill into one provider
 * at a time without prefetching the full cross-provider catalog.
 *
 * Per docs/rules/workflow-builder-ui.md: hooks call the typed client
 * API; components consume hooks. This hook does NOT import services /
 * repositories and does NOT call fetch directly.
 *
 * Caching: a single module-scoped `Map<provider, Promise>` so a
 * second mount with the same provider id reuses the in-flight or
 * resolved promise. Failed loads are evicted from the cache so a
 * retry mount re-fetches (mirrors the native hooks). Tests reset via
 * `__resetProviderActionsCacheForTests`.
 *
 * Why per-provider rather than one combined cache:
 *   - Catalogs grow per-provider. Loading Slack's actions when the
 *     user opens the picker for Gmail is wasted work.
 *   - `/api/providers/<id>/actions` is the supported public shape;
 *     there is no `/api/providers/actions` cross-provider endpoint.
 *
 * `provider === null` is a valid signal that "no provider is selected
 * right now" — the hook short-circuits to an idle empty state. This
 * keeps the picker's drill-in / drill-out useState narrow (no second
 * "should I render the loader?" check at the call site).
 */

const cache = new Map<string, Promise<readonly ActionMeta[]>>();

function fetchOnce(provider: string): Promise<readonly ActionMeta[]> {
  const existing = cache.get(provider);
  if (existing) return existing;
  const promise = listProviderActions(provider);
  cache.set(provider, promise);
  return promise;
}

export interface UseProviderActionsResult {
  actions: readonly ActionMeta[];
  loading: boolean;
  error: string | null;
}

const IDLE_RESULT: UseProviderActionsResult = Object.freeze({
  actions: [],
  loading: false,
  error: null,
});

export function useProviderActions(
  provider: string | null,
): UseProviderActionsResult {
  const [state, setState] = useState<UseProviderActionsResult>(() =>
    provider === null ? IDLE_RESULT : { actions: [], loading: true, error: null },
  );

  useEffect(() => {
    if (provider === null) {
      setState(IDLE_RESULT);
      return;
    }
    let cancelled = false;
    setState({ actions: [], loading: true, error: null });
    fetchOnce(provider)
      .then((result) => {
        if (cancelled) return;
        setState({ actions: result, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        cache.delete(provider);
        const message =
          err instanceof DiscoveryApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : `Failed to load actions for '${provider}'.`;
        setState({ actions: [], loading: false, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return state;
}

/**
 * Lookup helper for a provider action by its `${provider}:${type}` key,
 * scoped to the actions list the hook has surfaced. Returns undefined
 * when the list hasn't loaded yet or the key isn't registered.
 */
export function findProviderActionByKey(
  actions: readonly ActionMeta[],
  key: string,
): ActionMeta | undefined {
  return actions.find((a) => a.key === key);
}

/**
 * Test-only: clear the per-provider promise cache. Production code never
 * calls this — the cache is keyed for the session lifetime.
 */
export function __resetProviderActionsCacheForTests(): void {
  cache.clear();
}
