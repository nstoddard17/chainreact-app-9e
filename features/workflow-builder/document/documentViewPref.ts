/**
 * Device-local builder-view preference (5.DUAL-BUILDER-1 / CS-1).
 *
 * Same SSR-safe `chainreact:` localStorage convention as
 * `hooks/useLeftAgentRail.ts`: guarded reads/writes, fail-safe defaults, no
 * cross-tab sync, never workflow data. A DB-backed preference is a deliberate
 * NON-goal of this slice (planning doc §9 — no migration).
 *
 * Resolution: the per-workflow override wins, then the device-wide value,
 * then "visual". Invalid or inaccessible storage always resolves to "visual".
 */

export type BuilderViewMode = "visual" | "document";

const BASE_KEY = "chainreact:builder:viewMode";

function perWorkflowKey(workflowId: string): string {
  return `${BASE_KEY}:${workflowId}`;
}

function parseViewMode(raw: string | null): BuilderViewMode | null {
  return raw === "visual" || raw === "document" ? raw : null;
}

export function readBuilderViewPref(workflowId?: string): BuilderViewMode {
  if (typeof window === "undefined") return "visual";
  try {
    if (workflowId) {
      const perWorkflow = parseViewMode(
        window.localStorage.getItem(perWorkflowKey(workflowId)),
      );
      if (perWorkflow) return perWorkflow;
    }
    return parseViewMode(window.localStorage.getItem(BASE_KEY)) ?? "visual";
  } catch {
    return "visual";
  }
}

export function writeBuilderViewPref(view: BuilderViewMode, workflowId?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BASE_KEY, view);
    if (workflowId) {
      window.localStorage.setItem(perWorkflowKey(workflowId), view);
    }
  } catch {
    // Storage unavailable (private mode, quota) — the in-session state still
    // works; we just don't persist. Same posture as useLeftAgentRail.
  }
}

/** Exposed for tests that need to clear persisted state between runs. */
export const __BUILDER_VIEW_PREF_BASE_KEY__ = BASE_KEY;
export const __builderViewPrefKeyForWorkflow__ = perWorkflowKey;
