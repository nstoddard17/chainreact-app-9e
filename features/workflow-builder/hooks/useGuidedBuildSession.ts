"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided build SESSION switch.
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — rebuilt so it can no longer resume a
 * journey for work that was never saved.
 *
 * "Session active" is the one bit the guided card cannot derive from workflow
 * state alone: it means "the user is being walked through finishing THIS
 * workflow in the rail". Everything else (which stage, what's left) stays a pure
 * projection over readiness — see `deriveGuidedBuildStage`.
 *
 * ## What changed, and why
 *
 * The original implementation stored a durable per-workflow boolean ("1") the
 * moment a React Agent apply landed on the LOCAL DRAFT. That marker outlived the
 * draft: apply → don't save → leave → return, and the flag was still there, so
 * "Finish setting up this workflow" reappeared for nodes that no longer existed
 * anywhere. localStorage alone was allowed to resume setup, which made a
 * client-side hint an independent source of truth about the server's workflow.
 *
 * The rule now:
 *
 *   - An UNSAVED guided session lives in memory only. It starts on an apply and
 *     ends when the page does. Nothing is written; leaving ends it.
 *   - A SAVED guided session persists a hint BOUND TO THE SAVED GRAPH REVISION.
 *     On return the hint is honoured only if it still matches the workflow's
 *     current saved revision and that workflow actually has steps. Any other
 *     hint is stale by definition and is deleted on sight — including the legacy
 *     `"1"` marker, which carries no revision and can never match.
 *
 * The hint is therefore a CACHE of "this saved revision was mid-setup", never a
 * claim about what exists. The stage itself is still derived from the saved
 * workflow + current readiness; nothing about it is stored.
 *
 * Storage contents remain trivially non-sensitive: a schema version and an
 * opaque revision string (the workflow's `updatedAt`). No config, no tokens, no
 * provider data, no transcript.
 *
 * The logged-out local-only builder never has a session (no account, no
 * connections, no server workflow).
 */

const STORAGE_PREFIX = "chainreact:builder:guidedBuild:";
/** Bumped whenever the stored shape changes; older payloads are dropped, not migrated. */
const HINT_VERSION = 2;

interface GuidedBuildHint {
  readonly v: number;
  /** The saved workflow revision this hint was bound to (`updatedAt`). */
  readonly savedGraphVersion: string;
}

function storageKey(workflowId: string): string {
  return `${STORAGE_PREFIX}${workflowId}`;
}

/**
 * Read the hint. Anything unparseable, wrong-version, or shaped differently —
 * notably the legacy `"1"` marker this slice replaces — reads as absent, which
 * makes the caller delete it.
 */
function readHint(workflowId: string): GuidedBuildHint | null {
  try {
    const raw = window.localStorage.getItem(storageKey(workflowId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const hint = parsed as Partial<GuidedBuildHint>;
    if (hint.v !== HINT_VERSION) return null;
    if (typeof hint.savedGraphVersion !== "string" || hint.savedGraphVersion.length === 0) {
      return null;
    }
    return { v: HINT_VERSION, savedGraphVersion: hint.savedGraphVersion };
  } catch {
    return null;
  }
}

function writeHint(workflowId: string, savedGraphVersion: string): void {
  try {
    const hint: GuidedBuildHint = { v: HINT_VERSION, savedGraphVersion };
    window.localStorage.setItem(storageKey(workflowId), JSON.stringify(hint));
  } catch {
    // Storage unavailable (private mode) — the session still works in-memory;
    // it just won't survive a reload. Never a failure the user must see.
  }
}

function clearHint(workflowId: string): void {
  try {
    window.localStorage.removeItem(storageKey(workflowId));
  } catch {
    /* storage unavailable — nothing to clear */
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
  /**
   * The workflow's CURRENT saved revision (`graphSlice.hydratedRevision`). Null
   * until the builder has hydrated — the restore decision waits for it rather
   * than guessing.
   */
  readonly savedGraphVersion: string | null;
  /** True when the SAVED workflow has no steps (an empty workflow has no setup journey). */
  readonly savedWorkflowEmpty: boolean;
  /** True while the local draft has unsaved edits — an unsaved session is never persisted. */
  readonly draftIsDirty: boolean;
  /** False once nothing is left to connect/configure/test/activate. */
  readonly hasRemainingSetupWork: boolean;
}

export interface GuidedBuildSession {
  readonly active: boolean;
  /** User-initiated exit (the card's close). Clears memory + storage. */
  readonly exit: () => void;
  /**
   * Drop the session because the work it referred to is gone or was replaced —
   * a discarded preview, a restored checkpoint, a replaced workflow. Same effect
   * as `exit`, named for the reason so call sites read honestly.
   */
  readonly invalidate: () => void;
}

export function useGuidedBuildSession(
  input: UseGuidedBuildSessionInput,
): GuidedBuildSession {
  const {
    workflowId,
    localOnly,
    reviewSessionToken,
    hasApplyNotice,
    workflowState,
    savedGraphVersion,
    savedWorkflowEmpty,
    draftIsDirty,
    hasRemainingSetupWork,
  } = input;

  const [active, setActive] = useState(false);

  // Switching workflows always starts from "no session"; the restore below then
  // decides, once the new workflow's saved revision is known.
  const restoredForRef = useRef<string | null>(null);
  const prevWorkflowRef = useRef<string | null>(null);
  if (prevWorkflowRef.current !== workflowId) {
    prevWorkflowRef.current = workflowId;
    restoredForRef.current = null;
  }

  // Restore — the ONLY path that turns a stored hint back into a live session,
  // and it refuses unless the hint still describes the workflow that just loaded.
  useEffect(() => {
    if (localOnly) {
      setActive(false);
      return;
    }
    // Wait for hydration rather than judging the hint against an unknown revision.
    if (savedGraphVersion === null) return;
    if (restoredForRef.current === workflowId) return;
    restoredForRef.current = workflowId;

    const hint = readHint(workflowId);
    if (!hint) {
      // Includes the legacy "1" marker: unparseable → treated as stale → removed.
      clearHint(workflowId);
      return;
    }
    if (savedWorkflowEmpty || hint.savedGraphVersion !== savedGraphVersion) {
      clearHint(workflowId);
      return;
    }
    setActive(true);
  }, [workflowId, localOnly, savedGraphVersion, savedWorkflowEmpty]);

  // Start on a NEW review session while the apply notice is up. IN MEMORY ONLY —
  // an applied-but-unsaved change must not survive leaving the page.
  const prevTokenRef = useRef(reviewSessionToken);
  useEffect(() => {
    if (reviewSessionToken === prevTokenRef.current) return;
    prevTokenRef.current = reviewSessionToken;
    if (localOnly || !hasApplyNotice) return;
    setActive(true);
  }, [reviewSessionToken, hasApplyNotice, localOnly]);

  // Persist (and re-bind) the hint exactly when the guided work has been SAVED:
  // an active session, a clean draft, and a non-empty saved workflow at a known
  // revision. Each later save re-binds it to the new revision, so the hint can
  // never outlive the graph it describes.
  useEffect(() => {
    if (!active || localOnly) return;
    if (draftIsDirty || savedWorkflowEmpty) return;
    if (!savedGraphVersion) return;
    if (workflowState === "active" || !hasRemainingSetupWork) return;
    writeHint(workflowId, savedGraphVersion);
  }, [
    active,
    localOnly,
    draftIsDirty,
    savedWorkflowEmpty,
    savedGraphVersion,
    workflowState,
    hasRemainingSetupWork,
    workflowId,
  ]);

  // A finished journey must not resurrect on the next visit: once the workflow
  // is ACTIVE, or nothing is left to set up, drop the stored hint but keep the
  // in-memory session so the card can show its "complete" state.
  useEffect(() => {
    if (!active) return;
    if (workflowState === "active" || !hasRemainingSetupWork) {
      clearHint(workflowId);
    }
  }, [active, workflowState, hasRemainingSetupWork, workflowId]);

  const endSession = useCallback(() => {
    setActive(false);
    clearHint(workflowId);
  }, [workflowId]);

  return { active, exit: endSession, invalidate: endSession };
}

/** Exposed for tests that need to seed / clear the persisted hint. */
export const __GUIDED_BUILD_STORAGE_PREFIX__ = STORAGE_PREFIX;
export const __GUIDED_BUILD_HINT_VERSION__ = HINT_VERSION;
