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
 * Slice 3.7 — adds `getProviderActionsCached(provider)` (non-hook
 * accessor over the same module-scoped promise cache) and
 * `useProviderActionsForProviders(providerIds)` (single-hook
 * multi-provider loader for the variable picker). The new hook fans
 * out across a variable number of provider ids WITHOUT calling
 * `useProviderActions` in a loop — that would violate the Rules of
 * Hooks if the number/order of providers changed between renders.
 * The new hook keeps a stable hook profile (one useState, one
 * useEffect) and drives all fetches through the shared cache.
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

/**
 * Non-hook accessor over the module-scoped promise cache. Returns the
 * existing in-flight / resolved promise for a provider, or starts a
 * fresh fetch and caches the promise. Failed fetches are NOT cached
 * here — the caller is responsible for evicting via the rejection
 * branch of the returned promise. (Hooks below do the eviction; tests
 * use `__resetProviderActionsCacheForTests`.)
 *
 * Slice 3.7 exposes this so `useProviderActionsForProviders` can drive
 * multi-provider loads from a single useEffect without re-entering the
 * single-provider `useProviderActions` in a loop.
 */
export function getProviderActionsCached(
  provider: string,
): Promise<readonly ActionMeta[]> {
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
    getProviderActionsCached(provider)
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

// ─── Slice 3.7 — multi-provider loader ──────────────────────────────────────

export interface UseProviderActionsForProvidersResult {
  /**
   * Resolved actions keyed by provider id. Missing entries mean the
   * provider's catalog hasn't resolved yet (loading) OR failed (see
   * `errors`). Empty arrays mean the provider resolved with no metas.
   */
  byProvider: Readonly<Record<string, readonly ActionMeta[]>>;
  /** True while ANY of the supplied provider catalogs is still loading. */
  loading: boolean;
  /** Per-provider error messages. Empty when all loads succeed. */
  errors: Readonly<Record<string, string>>;
}

const EMPTY_MULTI_RESULT: UseProviderActionsForProvidersResult = Object.freeze({
  byProvider: {},
  loading: false,
  errors: {},
});

/**
 * Stable-profile multi-provider catalog loader.
 *
 * Per the Slice 3.7 brief: do NOT call `useProviderActions(provider)`
 * dynamically in a loop. This hook keeps a fixed hook profile
 * (one useState, one useEffect) regardless of how many provider ids
 * the caller passes. All fetches go through the shared module cache
 * so the per-provider hook and the multi-provider hook stay in sync —
 * a provider loaded by one is already resolved for the other.
 *
 * The provider id list is treated as an unordered set: a stable
 * canonical-sorted-join key drives the effect dependency so the
 * effect only re-runs when the SET of providers changes, not when
 * the caller passes a freshly-allocated array of the same ids.
 *
 * Empty input → idle frozen result, no fetches.
 */
export function useProviderActionsForProviders(
  providerIds: readonly string[],
): UseProviderActionsForProvidersResult {
  // Canonicalize for both effect deps + dedup before fetching.
  const canonicalIds = [...new Set(providerIds)].sort();
  const depsKey = canonicalIds.join("|");

  const [state, setState] = useState<UseProviderActionsForProvidersResult>(
    EMPTY_MULTI_RESULT,
  );

  useEffect(() => {
    if (canonicalIds.length === 0) {
      setState(EMPTY_MULTI_RESULT);
      return;
    }
    let cancelled = false;
    setState({ byProvider: {}, loading: true, errors: {} });

    const byProvider: Record<string, readonly ActionMeta[]> = {};
    const errors: Record<string, string> = {};
    let remaining = canonicalIds.length;

    function maybeCommit(): void {
      if (cancelled) return;
      remaining -= 1;
      if (remaining === 0) {
        setState({
          byProvider: { ...byProvider },
          loading: false,
          errors: { ...errors },
        });
      }
    }

    for (const id of canonicalIds) {
      getProviderActionsCached(id)
        .then((result) => {
          byProvider[id] = result;
          maybeCommit();
        })
        .catch((err) => {
          cache.delete(id);
          errors[id] =
            err instanceof DiscoveryApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : `Failed to load actions for '${id}'.`;
          maybeCommit();
        });
    }

    return () => {
      cancelled = true;
    };
    // depsKey is the canonical-sorted-join of provider ids. Re-running
    // when the SET of providers changes is correct; re-running on
    // every render with a fresh array reference would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  return state;
}

/**
 * Test-only: clear the per-provider promise cache. Production code never
 * calls this — the cache is keyed for the session lifetime.
 */
export function __resetProviderActionsCacheForTests(): void {
  cache.clear();
}
