"use client";

import { useEffect, useState } from "react";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  DiscoveryApiError,
  listProviderTriggers,
} from "@/lib/api/discovery";

/**
 * Per-provider trigger-metadata loader.
 *
 * Slice 3.10 — companion to Slice 3.4's `useProviderActions`. Same
 * shape (loading / list / error), but loads TriggerMeta instead of
 * ActionMeta and hits the `/api/providers/<id>/triggers` route.
 *
 * Scope (intentional, per Slice 3.10 plan):
 *   - Single-provider variant ONLY. Workflows have at most one
 *     trigger, so the multi-provider fan-out hook
 *     (`useProviderActionsForProviders`) has no analog here — and
 *     adding one would be premature.
 *   - Module-scoped promise cache keyed by provider id. Mirrors
 *     `useProviderActions` so the two hooks behave identically from
 *     a caller's perspective.
 *   - `provider === null` short-circuits to an idle empty state so
 *     the picker / config modal can wire the hook without a
 *     conditional render gate.
 *
 * Per docs/rules/workflow-builder-ui.md: hooks call the typed client
 * API; components consume hooks. This hook does NOT import services /
 * repositories and does NOT call fetch directly.
 *
 * Failed loads are evicted from the cache so a retry mount re-fetches
 * (mirrors the action hook). Tests reset via
 * `__resetProviderTriggersCacheForTests`.
 */

const cache = new Map<string, Promise<readonly TriggerMeta[]>>();

/**
 * Non-hook accessor over the module-scoped promise cache. Returns the
 * existing in-flight / resolved promise for a provider, or starts a
 * fresh fetch and caches the promise. Failed fetches are NOT cached
 * here — the hook below does the eviction; tests use
 * `__resetProviderTriggersCacheForTests`.
 *
 * Exposed so future surfaces (e.g. an agent that wants to inspect a
 * provider's trigger catalog without re-entering the hook) can drive
 * the same cache.
 */
export function getProviderTriggersCached(
  provider: string,
): Promise<readonly TriggerMeta[]> {
  const existing = cache.get(provider);
  if (existing) return existing;
  const promise = listProviderTriggers(provider);
  cache.set(provider, promise);
  return promise;
}

export interface UseProviderTriggersResult {
  triggers: readonly TriggerMeta[];
  loading: boolean;
  error: string | null;
}

const IDLE_RESULT: UseProviderTriggersResult = Object.freeze({
  triggers: [],
  loading: false,
  error: null,
});

export function useProviderTriggers(
  provider: string | null,
): UseProviderTriggersResult {
  const [state, setState] = useState<UseProviderTriggersResult>(() =>
    provider === null ? IDLE_RESULT : { triggers: [], loading: true, error: null },
  );

  useEffect(() => {
    if (provider === null) {
      setState(IDLE_RESULT);
      return;
    }
    let cancelled = false;
    setState({ triggers: [], loading: true, error: null });
    getProviderTriggersCached(provider)
      .then((result) => {
        if (cancelled) return;
        setState({ triggers: result, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        cache.delete(provider);
        const message =
          err instanceof DiscoveryApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : `Failed to load triggers for '${provider}'.`;
        setState({ triggers: [], loading: false, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return state;
}

/**
 * Lookup helper for a provider trigger by its `${provider}:${type}`
 * key, scoped to the triggers list the hook has surfaced. Returns
 * undefined when the list hasn't loaded yet or the key isn't
 * registered.
 */
export function findProviderTriggerByKey(
  triggers: readonly TriggerMeta[],
  key: string,
): TriggerMeta | undefined {
  return triggers.find((t) => t.key === key);
}

/**
 * Test-only: clear the per-provider promise cache. Production code
 * never calls this — the cache is keyed for the session lifetime.
 */
export function __resetProviderTriggersCacheForTests(): void {
  cache.clear();
}
