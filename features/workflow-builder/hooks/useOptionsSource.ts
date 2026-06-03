"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOptionsSource,
  type OptionItem,
  type OptionsApiErrorCode,
} from "@/lib/api/options";

/**
 * Slice 3.31 — client hook that wraps `lib/api/options.ts` and surfaces
 * a discriminated state machine the picker renderers branch on.
 *
 * Plan reference: docs/slices/phase-3/options-source-plan.md §6.
 *
 * Responsibilities the hook owns:
 *   - Debounce `query` by 250 ms so a typing burst coalesces into one
 *     fetch.
 *   - Abort in-flight fetches when (source / deps / debouncedQuery /
 *     enabled / refetch tick) changes or the component unmounts. Stale
 *     responses NEVER overwrite newer state.
 *   - Map the discriminated API response to a finite render-friendly
 *     state union: idle / loading / ready / empty / error / disconnected.
 *   - Expose a `refetch()` action so error / disconnected states can
 *     retry without remounting.
 *
 * Responsibilities the hook deliberately does NOT take on:
 *   - It does NOT import `services/options/_registry.ts` (or anything
 *     from `services/` / `repositories/`). Server-only modules are
 *     fenced off by the structural boundary test.
 *   - It does NOT cache across mounts. Each mount fetches fresh. A
 *     module-scoped cache is a v2 concern with its own invalidation
 *     surface (integration disconnect, workflow edit, etc.).
 *   - It does NOT inspect the resolver's `requiredDeps`. The caller
 *     owns "is the dependsOn parent set? if not, pass enabled=false."
 *     If the caller forgets, the route returns MISSING_DEPENDENCY and
 *     the hook surfaces it as `status: "error"` with `missingDependency`
 *     populated.
 *   - It does NOT mutate `configSlice` or any workflow state. The
 *     picker calls `onChange` exactly like static-option pickers do.
 *   - It does NOT know provider-specific logic. Behavior is uniform
 *     across `slack:channels`, `airtable:tables`, `native:examples`,
 *     etc. — provider-specific concerns live in the resolver server-
 *     side.
 *
 * The hook mirrors the shape conventions of
 * `useProviderActions` (Slice 3.4): single useState, single fetching
 * useEffect, lazy initial state, AbortController cleanup. The new
 * twist is the explicit `status` union — the previous hooks used a
 * looser `{loading, error, data}` shape because their renderers only
 * needed three states.
 */

const DEBOUNCE_MS = 250;

export interface UseOptionsSourceArgs {
  /**
   * The `<provider>:<resource>` key. `null` signals "no source yet"
   * (the field has static options OR the caller hasn't decided which
   * source to load). The hook short-circuits to idle without fetching.
   */
  source: string | null;
  /**
   * `dependsOn` parent values, keyed by parent field name. Empty or
   * whitespace-only values are still serialized by the typed client;
   * the route trims them and treats as missing.
   */
  deps?: Readonly<Record<string, string>>;
  /**
   * Raw, un-debounced search input. The hook holds an internal
   * debounced copy and only re-fetches after 250 ms of idle typing.
   */
  query?: string;
  /**
   * When `false`, the hook returns the frozen idle state without
   * fetching. Used when a dependsOn parent is unset OR the integration
   * is known-disconnected upstream and the caller wants to avoid the
   * round-trip.
   *
   * Defaults to true so callers can omit it on the simple path.
   */
  enabled?: boolean;
  /**
   * Optional workflow id (Slice 4.ACCOUNT-MODEL-22D-1). Forwarded to the
   * options route as provenance for the later 22D-2 credential-policy slice.
   * PLUMBING ONLY — it changes no request outcome today, and is deliberately
   * NOT part of the effect's re-run key: a builder edits exactly one workflow
   * per mount, so it is read at fetch time via a ref without re-triggering the
   * debounce / abort machinery. Most callers leave it unset until 22D-2.
   */
  workflowId?: string;
}

export type UseOptionsSourceState =
  | { status: "idle"; items: readonly OptionItem[]; hasMore: false }
  | { status: "loading"; items: readonly OptionItem[]; hasMore: boolean }
  | { status: "ready"; items: readonly OptionItem[]; hasMore: boolean }
  | { status: "empty"; items: readonly OptionItem[]; hasMore: false }
  | {
      status: "error";
      items: readonly OptionItem[];
      hasMore: false;
      code: OptionsApiErrorCode;
      message: string;
      missingDependency?: string;
    }
  | {
      status: "disconnected";
      items: readonly OptionItem[];
      hasMore: false;
      provider: string;
      message: string;
    }
  // 4.TEAM-WORKFLOWS-2 (TW-2) — distinct owner-gated states for the 22D-2
  // credential policy. Both carry the provider so the renderer can name it, and
  // neither offers a retry (refetch would just re-return the same gated code).
  // `owner-gated` (NOT_WORKFLOW_OWNER): a non-creator editing a personal-provider
  // node — the server fetched NOTHING, so there is nothing to retry.
  | {
      status: "owner-gated";
      items: readonly OptionItem[];
      hasMore: false;
      provider: string;
      message: string;
    }
  // `owner-must-connect` (OWNER_MUST_CONNECT): the workflow owner is editing but
  // hasn't connected this personal provider.
  | {
      status: "owner-must-connect";
      items: readonly OptionItem[];
      hasMore: false;
      provider: string;
      message: string;
    };

export interface UseOptionsSourceResult {
  state: UseOptionsSourceState;
  /**
   * Re-run the current fetch (same source / deps / debouncedQuery).
   * Used by the renderer's "Try again" button. Safe to call from any
   * state — the effect will abort an in-flight fetch first.
   */
  refetch: () => void;
}

const IDLE_STATE: UseOptionsSourceState = Object.freeze({
  status: "idle",
  items: [] as readonly OptionItem[],
  hasMore: false,
}) as UseOptionsSourceState;

function canonicalDepsKey(deps?: Readonly<Record<string, string>>): string {
  if (!deps) return "";
  const entries = Object.entries(deps);
  if (entries.length === 0) return "";
  return entries
    .slice()
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function extractProvider(source: string): string {
  const idx = source.indexOf(":");
  return idx === -1 ? source : source.slice(0, idx);
}

export function useOptionsSource(
  args: UseOptionsSourceArgs,
): UseOptionsSourceResult {
  const { source, deps, query, enabled, workflowId } = args;
  const isEnabled = enabled !== false;
  const trimmedQuery = (query ?? "").trim();
  const depsKey = canonicalDepsKey(deps);
  const isActive = source !== null && isEnabled;

  // Keep the latest `deps` reachable inside the effect without forcing
  // re-runs on every render. The canonical depsKey is the dependency;
  // depsRef.current is the value the effect actually serializes into
  // the request.
  const depsRef = useRef<Readonly<Record<string, string>> | undefined>(deps);
  depsRef.current = deps;

  // 22D-1 provenance plumbing — read at fetch time, intentionally NOT an effect
  // dependency (see the field doc on UseOptionsSourceArgs.workflowId).
  const workflowIdRef = useRef<string | undefined>(workflowId);
  workflowIdRef.current = workflowId;

  // Track the (source, depsKey) the current items belong to. When the
  // user only changes `query` for the same source/deps, the loading
  // state preserves items so the dropdown doesn't flicker. When the
  // source or deps change, items reset to [] because they belong to a
  // different fetch.
  const lastShapeRef = useRef<string>("");

  const [debouncedQuery, setDebouncedQuery] = useState<string>(trimmedQuery);
  const [refetchTick, setRefetchTick] = useState(0);
  const [state, setState] = useState<UseOptionsSourceState>(IDLE_STATE);

  // Debounce query. When `trimmedQuery` changes, schedule a write to
  // `debouncedQuery` 250 ms later; cancel if it changes again before
  // the timer fires. The fetching effect depends on `debouncedQuery`
  // (not `trimmedQuery`), so rapid typing produces ONE fetch.
  useEffect(() => {
    if (debouncedQuery === trimmedQuery) return;
    const id = setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [trimmedQuery, debouncedQuery]);

  // Fetch effect. Keyed on the stable canonical inputs (source,
  // isEnabled, depsKey, debouncedQuery, refetchTick). Aborting on
  // cleanup gives us stale-response protection — the resolved promise
  // checks `signal.aborted` before touching state.
  useEffect(() => {
    if (!isActive) {
      lastShapeRef.current = "";
      setState(IDLE_STATE);
      return;
    }
    const controller = new AbortController();

    const shapeKey = `${source} ${depsKey}`;
    const sameShape = lastShapeRef.current === shapeKey;
    lastShapeRef.current = shapeKey;

    // Enter loading. Preserve previous items only when (source, deps)
    // is unchanged so query-only refetches don't flicker; reset on a
    // shape change because the previous items belong to a different
    // fetch.
    setState((prev) => ({
      status: "loading",
      items:
        sameShape && (prev.status === "ready" || prev.status === "loading")
          ? prev.items
          : [],
      hasMore:
        sameShape && (prev.status === "ready" || prev.status === "loading")
          ? prev.hasMore
          : false,
    }));

    const currentDeps = depsRef.current;
    const hasDeps =
      currentDeps !== undefined && Object.keys(currentDeps).length > 0;

    const currentWorkflowId = workflowIdRef.current;

    fetchOptionsSource(source as string, {
      ...(debouncedQuery.length > 0 && { q: debouncedQuery }),
      ...(hasDeps && { deps: currentDeps as Readonly<Record<string, string>> }),
      ...(currentWorkflowId !== undefined &&
        currentWorkflowId.length > 0 && { workflowId: currentWorkflowId }),
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.ok) {
          if (response.items.length === 0) {
            setState({
              status: "empty",
              items: [],
              hasMore: false,
            });
          } else {
            setState({
              status: "ready",
              items: response.items,
              hasMore: response.hasMore,
            });
          }
          return;
        }
        if (response.code === "INTEGRATION_DISCONNECTED") {
          setState({
            status: "disconnected",
            items: [],
            hasMore: false,
            provider: extractProvider(source as string),
            message: response.message,
          });
          return;
        }
        // 4.TEAM-WORKFLOWS-2 (TW-2) — owner-gated credential states. Mapped to
        // distinct statuses (not the generic `error`) so renderers show a
        // typed, retry-less affordance.
        if (response.code === "NOT_WORKFLOW_OWNER") {
          setState({
            status: "owner-gated",
            items: [],
            hasMore: false,
            provider: extractProvider(source as string),
            message: response.message,
          });
          return;
        }
        if (response.code === "OWNER_MUST_CONNECT") {
          setState({
            status: "owner-must-connect",
            items: [],
            hasMore: false,
            provider: extractProvider(source as string),
            message: response.message,
          });
          return;
        }
        setState({
          status: "error",
          items: [],
          hasMore: false,
          code: response.code,
          message: response.message,
          ...(response.missingDependency !== undefined && {
            missingDependency: response.missingDependency,
          }),
        });
      })
      .catch((err: unknown) => {
        // AbortError reaches here only when the underlying fetch
        // rejects with it; the client typically re-throws aborts but
        // a transport-layer throw can still land. Either way: bail.
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({
          status: "error",
          items: [],
          hasMore: false,
          code: "UNKNOWN",
          message:
            err instanceof Error ? err.message : "Couldn't load options.",
        });
      });

    return () => {
      controller.abort();
    };
    // depsKey is the canonical-sorted-join of dep entries. Re-running
    // when the SET of deps changes is correct; re-running on every
    // render with a fresh object reference would thrash. depsRef.current
    // carries the live value into the closure at fetch time.
  }, [source, isEnabled, depsKey, debouncedQuery, refetchTick, isActive]);

  const refetch = useCallback(() => {
    setRefetchTick((tick) => tick + 1);
  }, []);

  return { state, refetch };
}
