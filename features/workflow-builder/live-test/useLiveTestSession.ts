"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelLiveTest,
  getLiveTestStatus,
  LiveTestApiError,
  prepareLiveTest,
  startLiveTest,
  type LiveTestAdvisory,
  type LiveTestSessionStatusDto,
  type PrepareLiveTestResponse,
} from "@/lib/api/liveTest";
import { useRunSlice } from "../state/runSlice";

/**
 * Client state machine for one Run Live Test journey (WORKFLOW-LIVE-TEST-4 §3-§5).
 *
 * Phases mirror the SERVER lifecycle — the hook never invents a state the session table can't
 * confirm on the next poll:
 *
 *   idle → preparing → reviewing (disclosure; nothing has happened server-side beyond an
 *   awaiting-consent row) → starting → active (the polled session DTO is the single source of
 *   truth: waiting_for_trigger / trigger_received / running / succeeded / failed / cancelled /
 *   expired) → closed.
 *
 * While `active`, polling `getLiveTestStatus` every few seconds IS the capture loop — each poll
 * asks the server to perform one bounded advancement tick. The nonce from prepare lives only in
 * this hook's memory and is sent exactly once, on the explicit Start action.
 *
 * When the session reaches `running`, the run id is handed to the builder's EXISTING latest-run
 * tracker (`runSlice.startTracking`) so the canonical run renders through the same results
 * surface every other run uses — no parallel run-view is invented.
 */

export type LiveTestPhase =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "reviewing"; prep: PrepareLiveTestResponse }
  | { kind: "starting"; prep: PrepareLiveTestResponse }
  | { kind: "active"; session: LiveTestSessionStatusDto; advisory: LiveTestAdvisory | null }
  | {
      kind: "error";
      message: string;
      /** Typed recovery the UI can offer for this failure. */
      recovery: "re_prepare" | "open_validation" | "cancel_existing" | "retry_start" | "none";
      /** For cancel_existing: the occupying session to cancel. */
      blockingSessionId: string | null;
      /** Retained so retry_start can re-enter the consent flow without re-preparing. */
      prep: PrepareLiveTestResponse | null;
    };

const POLL_INTERVAL_MS = 4000;

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);

function errorPhase(err: unknown, prep: PrepareLiveTestResponse | null): LiveTestPhase {
  if (err instanceof LiveTestApiError) {
    switch (err.code) {
      case "not_ready":
        return {
          kind: "error",
          message: "Finish setting up this workflow before running a live test.",
          recovery: "open_validation",
          blockingSessionId: null,
          prep: null,
        };
      case "session_in_progress":
        return {
          kind: "error",
          message: "A live test for this workflow is already in progress.",
          recovery: "cancel_existing",
          blockingSessionId: err.sessionId,
          prep: null,
        };
      case "stale_definition":
      case "stale_connections":
      case "session_expired":
      case "session_cancelled":
      case "session_not_found":
      case "conflict":
        return {
          kind: "error",
          message: err.message,
          recovery: "re_prepare",
          blockingSessionId: null,
          prep: null,
        };
      case "baseline_failed":
        return {
          kind: "error",
          message: "Couldn't start listening. Nothing was started — try again.",
          recovery: "retry_start",
          blockingSessionId: null,
          prep,
        };
      default:
        return {
          kind: "error",
          message: err.message,
          recovery: "none",
          blockingSessionId: null,
          prep: null,
        };
    }
  }
  return {
    kind: "error",
    message: err instanceof Error ? err.message : "Live test failed.",
    recovery: "none",
    blockingSessionId: null,
    prep: null,
  };
}

export interface UseLiveTestSessionResult {
  phase: LiveTestPhase;
  /** True while any request is in flight (disables the triggering buttons). */
  busy: boolean;
  /** Open the flow: prepare a session and show the disclosure. */
  openLiveTest(): Promise<void>;
  /** The explicit consent action — begins listening. */
  startListening(): Promise<void>;
  /** Cancel the active session (listening/awaiting states only). */
  cancelSession(): Promise<void>;
  /** Cancel the OTHER session blocking prepare, then re-prepare. */
  cancelBlockingAndRetry(): Promise<void>;
  /** Close the modal. An active listening session keeps running server-side until cancelled/TTL. */
  close(): void;
}

export function useLiveTestSession(input: {
  workflowId: string | null;
  onOpenValidation?: (() => void) | undefined;
}): UseLiveTestSessionResult {
  const { workflowId } = input;
  const [phase, setPhase] = useState<LiveTestPhase>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const startTracking = useRunSlice((s) => s.startTracking);
  // The latest phase for interval callbacks without re-registering timers on every state change.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const trackedRunRef = useRef<string | null>(null);

  const openLiveTest = useCallback(async () => {
    if (!workflowId) return;
    setBusy(true);
    setPhase({ kind: "preparing" });
    try {
      const prep = await prepareLiveTest(workflowId);
      setPhase({ kind: "reviewing", prep });
    } catch (err) {
      const next = errorPhase(err, null);
      // not_ready jumps straight into the existing validation rail — the disclosure modal
      // would have nothing truthful to show.
      if (next.kind === "error" && next.recovery === "open_validation") {
        input.onOpenValidation?.();
        setPhase({ kind: "idle" });
      } else {
        setPhase(next);
      }
    } finally {
      setBusy(false);
    }
  }, [workflowId, input]);

  const startListening = useCallback(async () => {
    const current = phaseRef.current;
    const prep =
      current.kind === "reviewing" || current.kind === "starting"
        ? current.prep
        : current.kind === "error"
          ? current.prep
          : null;
    if (!workflowId || !prep) return;
    setBusy(true);
    setPhase({ kind: "starting", prep });
    try {
      const result = await startLiveTest(workflowId, prep.sessionId, prep.nonce);
      setPhase({ kind: "active", session: result.session, advisory: null });
    } catch (err) {
      setPhase(errorPhase(err, prep));
    } finally {
      setBusy(false);
    }
  }, [workflowId]);

  const cancelSession = useCallback(async () => {
    const current = phaseRef.current;
    if (!workflowId) return;
    const sessionId =
      current.kind === "active"
        ? current.session.sessionId
        : current.kind === "reviewing" || current.kind === "starting"
          ? current.prep.sessionId
          : null;
    if (!sessionId) return;
    setBusy(true);
    try {
      const result = await cancelLiveTest(workflowId, sessionId);
      setPhase({ kind: "active", session: result.session, advisory: null });
    } catch (err) {
      if (err instanceof LiveTestApiError && err.code === "execution_already_started") {
        // Too late to cancel — keep polling; the session (and run) tell the honest story.
        return;
      }
      setPhase(errorPhase(err, null));
    } finally {
      setBusy(false);
    }
  }, [workflowId]);

  const cancelBlockingAndRetry = useCallback(async () => {
    const current = phaseRef.current;
    if (!workflowId) return;
    if (current.kind !== "error" || !current.blockingSessionId) return;
    setBusy(true);
    try {
      await cancelLiveTest(workflowId, current.blockingSessionId);
    } catch {
      // Cancel can 404/409 if the other session just finished — re-prepare decides what's true.
    } finally {
      setBusy(false);
    }
    await openLiveTest();
  }, [workflowId, openLiveTest]);

  const close = useCallback(() => {
    setPhase({ kind: "idle" });
    trackedRunRef.current = null;
  }, []);

  // Status polling while active — the serverless capture loop's client half.
  useEffect(() => {
    if (phase.kind !== "active") return;
    if (TERMINAL_STATUSES.has(phase.session.status)) return;
    if (!workflowId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const result = await getLiveTestStatus(workflowId, phase.session.sessionId);
        if (cancelled) return;
        setPhase({
          kind: "active",
          session: result.session,
          advisory: result.advisory ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LiveTestApiError && err.code === "session_not_found") {
          setPhase(errorPhase(err, null));
        }
        // Transient poll failures: keep the last-known state; the next tick retries.
      }
    };
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, workflowId]);

  // Hand the canonical run to the builder's existing latest-run tracker exactly once.
  useEffect(() => {
    if (phase.kind !== "active") return;
    const runId = phase.session.workflowRunId;
    if (!workflowId || !runId) return;
    if (trackedRunRef.current === runId) return;
    trackedRunRef.current = runId;
    startTracking({ workflowId, runId });
  }, [phase, workflowId, startTracking]);

  return {
    phase,
    busy,
    openLiveTest,
    startListening,
    cancelSession,
    cancelBlockingAndRetry,
    close,
  };
}
