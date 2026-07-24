"use client";

import { useEffect, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import { DiscoveryApiError, listAiActions } from "@/lib/api/discovery";

/**
 * ChainReact AI action catalog hook (AI-PROVIDER-4 CS-4).
 *
 * Mirrors `useNativeActions` exactly — session-cached, typed-client-only,
 * no direct fetch, no services/repositories import. Separate from the
 * native catalog because the two are distinct product surfaces with their
 * own picker sections and (for AI) their own server-side visibility gate.
 *
 * Visibility is SERVER-driven: the route returns an empty list while the
 * AI processor is disabled, so the client never reads a server-only env
 * var and never advertises a capability that cannot execute. An empty
 * catalog is a normal, honest state — the picker hides the section.
 *
 * GATED like `useProviderActions(null)`: callers pass `enabled: false`
 * when the current context has no AI node, and NO fetch is made and no
 * cache entry created. Only the action picker (which must decide whether
 * to show the AI section) enables it unconditionally — a builder session
 * that never touches AI never calls the endpoint.
 */

let cached: Promise<readonly ActionMeta[]> | null = null;

function fetchOnce(): Promise<readonly ActionMeta[]> {
  if (!cached) {
    cached = listAiActions();
  }
  return cached;
}

export interface UseAiActionsResult {
  actions: readonly ActionMeta[];
  loading: boolean;
  error: string | null;
}

const IDLE: UseAiActionsResult = { actions: [], loading: false, error: null };

export function useAiActions(enabled: boolean): UseAiActionsResult {
  const [actions, setActions] = useState<readonly ActionMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
              : "Failed to load ChainReact AI actions.";
        setError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return IDLE;
  return { actions, loading, error };
}

/** Lookup helper for an AI action by its `${provider}:${type}` key. */
export function findAiActionByKey(
  actions: readonly ActionMeta[],
  key: string,
): ActionMeta | undefined {
  return actions.find((a) => a.key === key);
}

/** Test-only: reset the module-scoped cache. */
export function __resetAiActionsCacheForTests(): void {
  cached = null;
}
