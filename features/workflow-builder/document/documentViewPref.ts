/**
 * Device-local builder-view preference (5.DUAL-BUILDER-1 / CS-1).
 *
 * Same SSR-safe `chainreact:` localStorage convention as
 * `hooks/useLeftAgentRail.ts`: guarded reads/writes, fail-safe defaults, no
 * cross-tab sync, never workflow data.
 *
 * BUILDER-VIEW-DEFAULT-1 delivered the DB-backed layer this file's original
 * slice deferred: `user_profiles.default_builder_view`, resolved server-side
 * and threaded in as `serverDefault`. Resolution order:
 *   per-workflow key (what you last used on THIS workflow, this device)
 *   → serverDefault (your explicit account-level choice)
 *   → device-wide key (last used anywhere on this device)
 *   → "visual".
 * Invalid or inaccessible storage always falls through safely.
 */

export type BuilderViewMode = "visual" | "document";

const BASE_KEY = "chainreact:builder:viewMode";

function perWorkflowKey(workflowId: string): string {
  return `${BASE_KEY}:${workflowId}`;
}

function parseViewMode(raw: string | null): BuilderViewMode | null {
  return raw === "visual" || raw === "document" ? raw : null;
}

export function readBuilderViewPref(
  workflowId?: string,
  serverDefault?: BuilderViewMode | null,
): BuilderViewMode {
  const fallback = serverDefault ?? "visual";
  if (typeof window === "undefined") return fallback;
  try {
    if (workflowId) {
      const perWorkflow = parseViewMode(
        window.localStorage.getItem(perWorkflowKey(workflowId)),
      );
      if (perWorkflow) return perWorkflow;
    }
    if (serverDefault) return serverDefault;
    return parseViewMode(window.localStorage.getItem(BASE_KEY)) ?? "visual";
  } catch {
    return fallback;
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

/**
 * BUILDER-VIEW-QA-1 — per-workflow "chooser resolved" marker (sessionStorage).
 *
 * Browser-QA defect: after dismissing the first-open chooser, BACK then
 * FORWARD remounts the builder from Next's router cache — whose payload was
 * rendered with `justCreated=true` — and the in-component dismissal state is
 * lost, so the chooser re-opened on the SAME workflow. The marker records
 * "this workflow's chooser was chosen or dismissed" for the browsing session;
 * the chooser's mount condition consults it. sessionStorage (not local):
 * back/forward and refresh live within a session, and the one-shot marker
 * shouldn't accumulate per-workflow keys forever. Same SSR-guarded, fail-safe
 * posture as the prefs above.
 */
const CHOOSER_RESOLVED_PREFIX = "chainreact:builder:viewChooserResolved:";

export function markViewChooserResolved(workflowId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${CHOOSER_RESOLVED_PREFIX}${workflowId}`, "true");
  } catch {
    // Storage unavailable — the in-session React state still suppresses the
    // chooser until the next full remount; never an error.
  }
}

export function hasResolvedViewChooser(workflowId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.sessionStorage.getItem(`${CHOOSER_RESOLVED_PREFIX}${workflowId}`) === "true"
    );
  } catch {
    return false;
  }
}

/** Exposed for tests that need to clear persisted state between runs. */
export const __BUILDER_VIEW_PREF_BASE_KEY__ = BASE_KEY;
export const __builderViewPrefKeyForWorkflow__ = perWorkflowKey;
export const __viewChooserResolvedKeyForWorkflow__ = (workflowId: string): string =>
  `${CHOOSER_RESOLVED_PREFIX}${workflowId}`;
