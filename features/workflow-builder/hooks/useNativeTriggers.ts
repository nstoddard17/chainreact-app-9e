"use client";

import { useEffect, useState } from "react";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  DiscoveryApiError,
  listNativeTriggers,
} from "@/lib/api/discovery";

/**
 * Client hook that loads the native-trigger metadata catalog once per
 * session. Slice 3.3 consumes this from AddNodeMenu (to list native
 * triggers in the trigger picker) and ConfigModalShell (to look up the
 * active trigger node's meta).
 *
 * Per docs/rules/workflow-builder-ui.md: hooks call the typed client
 * API; components consume hooks. This hook does NOT import services or
 * repositories, and does NOT call fetch directly.
 *
 * The catalog never changes during a session (metas are hand-maintained
 * imports validated at module load), so a single module-scoped Promise
 * caches the response across consumers. Tests can reset it via
 * `__resetNativeTriggersCacheForTests`.
 *
 * Mirrors the shape of `useNativeActions` deliberately — keeping the
 * two hooks symmetric makes ConfigModalShell's meta-lookup branch trivial
 * and lets the AddNodeMenu trigger / action sections share the same
 * loading / error / empty UX without abstraction.
 */

let cached: Promise<readonly TriggerMeta[]> | null = null;

function fetchOnce(): Promise<readonly TriggerMeta[]> {
  if (!cached) {
    cached = listNativeTriggers();
  }
  return cached;
}

export interface UseNativeTriggersResult {
  triggers: readonly TriggerMeta[];
  loading: boolean;
  error: string | null;
}

export function useNativeTriggers(): UseNativeTriggersResult {
  const [triggers, setTriggers] = useState<readonly TriggerMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOnce()
      .then((result) => {
        if (cancelled) return;
        setTriggers(result);
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
              : "Failed to load native triggers.";
        setError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { triggers, loading, error };
}

/**
 * Lookup helper for a native trigger by its `${provider}:${type}` key.
 * Returns undefined when the triggers list hasn't loaded yet or the key
 * isn't registered.
 */
export function findNativeTriggerByKey(
  triggers: readonly TriggerMeta[],
  key: string,
): TriggerMeta | undefined {
  return triggers.find((t) => t.key === key);
}

/**
 * Test-only: reset the module-scoped cache. Production code never calls
 * this — the hook trusts the cache for the session lifetime.
 */
export function __resetNativeTriggersCacheForTests(): void {
  cached = null;
}
