"use client";

import { useConfigSlice } from "../state/configSlice";
import {
  useUpstreamVariables,
  type UseUpstreamVariablesResult,
} from "./useUpstreamVariables";

/**
 * Convenience hook — picker sources for the currently-open config rail.
 *
 * Slice 3.7 — every text-style field renderer that wants the variable
 * picker calls this. Wraps the two underlying hooks
 * (`configSlice.activeNodeId` selector + `useUpstreamVariables`) so
 * renderers stay one-liner-thin and the picker plumbing stays in one
 * place.
 *
 * Why a separate hook (rather than the renderers calling both
 * directly): keeps the renderer ↔ slice coupling explicit and named.
 * When a future surface (e.g. an inline AI-rewrite affordance)
 * needs the same picker sources, it imports the same convenience
 * hook instead of re-deriving the wiring.
 *
 * Returns the same shape as `useUpstreamVariables` (sources / loading).
 * Returns an empty result when no node is active — picker buttons in
 * renderers will hide themselves on `sources.length === 0`.
 */
export function useActiveNodeUpstreamVariables(): UseUpstreamVariablesResult {
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  return useUpstreamVariables(activeNodeId);
}
