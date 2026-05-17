"use client";

import { useEffect, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import {
  DiscoveryApiError,
  listNativeActions,
} from "@/lib/api/discovery";

/**
 * Client hook that loads the native-action metadata catalog once per
 * session. Slice 3.2 consumes this from AddNodeMenu (to list native
 * actions) and ConfigModalShell (to look up the active node's meta).
 *
 * Per docs/rules/workflow-builder-ui.md: hooks call the typed client
 * API; components consume hooks. This hook does NOT import services or
 * repositories, and does NOT call fetch directly.
 *
 * The catalog never changes during a session (metas are hand-maintained
 * imports validated at module load), so a single module-scoped Promise
 * caches the response across consumers. Tests can reset it via
 * `__resetNativeActionsCacheForTests`.
 */

let cached: Promise<readonly ActionMeta[]> | null = null;

function fetchOnce(): Promise<readonly ActionMeta[]> {
  if (!cached) {
    cached = listNativeActions();
  }
  return cached;
}

export interface UseNativeActionsResult {
  actions: readonly ActionMeta[];
  loading: boolean;
  error: string | null;
}

export function useNativeActions(): UseNativeActionsResult {
  const [actions, setActions] = useState<readonly ActionMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOnce()
      .then((result) => {
        if (cancelled) return;
        setActions(result);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        cached = null;
        const message =
          err instanceof DiscoveryApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load native actions.";
        setError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { actions, loading, error };
}

/**
 * Lookup helper for a native action by its `${provider}:${type}` key.
 * Returns undefined when the actions list hasn't loaded yet or the key
 * isn't registered.
 */
export function findNativeActionByKey(
  actions: readonly ActionMeta[],
  key: string,
): ActionMeta | undefined {
  return actions.find((a) => a.key === key);
}

/**
 * Test-only: reset the module-scoped cache. Production code never calls
 * this — the hook trusts the cache for the session lifetime.
 */
export function __resetNativeActionsCacheForTests(): void {
  cached = null;
}
