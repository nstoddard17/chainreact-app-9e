"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided build SESSION switch.
 *
 * "Session active" is the one bit the guided card cannot derive from workflow
 * state alone: it means "the user is being walked through finishing THIS
 * workflow in the rail". Everything else (which stage, what's left) stays a
 * pure projection over readiness — see `deriveGuidedBuildStage`.
 *
 * A session STARTS when a React Agent apply produces a new review session
 * (`reviewSessionToken` bump while the apply notice is up). It survives page
 * reloads and OAuth popups via a per-workflow localStorage FLAG — the flag is
 * just "1" under a workflow-scoped key: no config, no tokens, no provider
 * data, nothing sensitive ever enters storage. It ENDS when the user exits the
 * guided card, and its storage is cleared once the workflow reaches `active`
 * (so a finished journey doesn't resurrect on the next visit — the in-memory
 * session stays up long enough to show the "complete" state).
 *
 * The logged-out local-only builder never has a session (no account, no
 * connections, no server workflow).
 */

const STORAGE_PREFIX = "chainreact:builder:guidedBuild:";

function storageKey(workflowId: string): string {
  return `${STORAGE_PREFIX}${workflowId}`;
}

function readStoredFlag(workflowId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(workflowId)) === "1";
  } catch {
    return false;
  }
}

function writeStoredFlag(workflowId: string, active: boolean): void {
  try {
    if (active) window.localStorage.setItem(storageKey(workflowId), "1");
    else window.localStorage.removeItem(storageKey(workflowId));
  } catch {
    // Storage unavailable (private mode) — the session still works in-memory;
    // it just won't survive a reload.
  }
}

export interface UseGuidedBuildSessionInput {
  readonly workflowId: string;
  readonly localOnly?: boolean;
  /** Monotonic review-session id from `useAgentReviewSession`. */
  readonly reviewSessionToken: number;
  /** Truthy while the post-apply notice is up (a fresh apply just happened). */
  readonly hasApplyNotice: boolean;
  /** Live lifecycle state (server prop). */
  readonly workflowState: string;
}

export interface GuidedBuildSession {
  readonly active: boolean;
  /** User-initiated exit (the card's close). Clears memory + storage. */
  readonly exit: () => void;
}

export function useGuidedBuildSession(
  input: UseGuidedBuildSessionInput,
): GuidedBuildSession {
  const { workflowId, localOnly, reviewSessionToken, hasApplyNotice, workflowState } = input;

  // Restore from storage on mount / workflow switch (reload + OAuth resume).
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (localOnly) {
      setActive(false);
      return;
    }
    setActive(readStoredFlag(workflowId));
  }, [workflowId, localOnly]);

  // Start on a NEW review session while the apply notice is up. The token also
  // bumps for stale/failed/restore/template notices — hasApplyNotice keeps the
  // trigger scoped to notice-producing paths, and starting the guided walk on a
  // restore/template apply is exactly the desired behavior (same finish work).
  const prevTokenRef = useRef(reviewSessionToken);
  useEffect(() => {
    if (reviewSessionToken === prevTokenRef.current) return;
    prevTokenRef.current = reviewSessionToken;
    if (localOnly || !hasApplyNotice) return;
    setActive(true);
    writeStoredFlag(workflowId, true);
  }, [reviewSessionToken, hasApplyNotice, workflowId, localOnly]);

  // A finished journey must not resurrect on the next visit: once the workflow
  // is ACTIVE, drop the stored flag but keep the in-memory session so the card
  // can show its "complete" state until the user closes it.
  useEffect(() => {
    if (active && workflowState === "active") {
      writeStoredFlag(workflowId, false);
    }
  }, [active, workflowState, workflowId]);

  const exit = useCallback(() => {
    setActive(false);
    writeStoredFlag(workflowId, false);
  }, [workflowId]);

  return { active, exit };
}
