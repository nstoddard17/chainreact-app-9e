"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OAUTH_POPUP_RETURN_SURFACE,
  parseOAuthPopupMessage,
} from "@/core/integrations/oauthPopupBridge";
import { startOAuth } from "@/lib/api/integrations";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided Connect stage's popup controller.
 *
 * Launches the EXISTING OAuth flow (the same connect POST the Apps page uses —
 * account binding, role gates, and encryption all stay server-owned) in a
 * POPUP, so the builder page never navigates and the draft + conversation +
 * stage survive untouched. Completion is detected two ways, both server-truth:
 *
 *   1. postMessage from the fixed completion page — accepted ONLY when the
 *      event origin is this window's own origin AND the message nonce matches
 *      the attempt this hook generated. Then `onRefreshConnections()` re-asks
 *      the server.
 *   2. The popup simply closing — `onRefreshConnections()` runs as a fallback,
 *      so a missed/blocked message degrades to a refresh, never a wrong state.
 *
 * The hook never claims "connected" itself — the card reads that from the
 * refreshed server-resolved connection signal. Attempt status here only drives
 * the button's transient states (launching / waiting / failed / canceled).
 *
 * No secret ever passes through this hook: the connect POST returns a provider
 * authorize URL, the completion message carries {provider, status, stable
 * error code, nonce}, and the attempt nonce is local randomness.
 */

export type GuidedConnectAttemptStatus =
  | "idle"
  | "launching"
  | "waiting"
  | "completed"
  | "failed"
  | "canceled"
  | "popup_blocked";

export interface GuidedConnectAttempt {
  readonly provider: string;
  readonly status: GuidedConnectAttemptStatus;
  /** Stable redacted code for `failed` (never a raw provider error). */
  readonly errorCode?: string;
}

export interface UseGuidedConnectInput {
  /** Re-resolve the server connection signal (from `useBuilderReadiness`). */
  readonly onRefreshConnections: () => void;
}

export interface GuidedConnectController {
  /** The single in-flight/last attempt (one popup at a time), or null. */
  readonly attempt: GuidedConnectAttempt | null;
  /** Launch (or retry) the popup connect flow for one provider. */
  readonly connect: (provider: string) => void;
}

const POPUP_FEATURES = "popup,width=620,height=760,noopener=no";
const CLOSE_WATCH_MS = 500;
/** Grace after close for the completion message to arrive before "canceled". */
const CANCEL_GRACE_MS = 1500;

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface ActiveAttempt {
  provider: string;
  nonce: string;
  popup: Window | null;
  closeWatch: number | null;
  cancelGrace: number | null;
  settled: boolean;
}

export function useGuidedConnect(
  input: UseGuidedConnectInput,
): GuidedConnectController {
  const { onRefreshConnections } = input;
  const [attempt, setAttempt] = useState<GuidedConnectAttempt | null>(null);
  const activeRef = useRef<ActiveAttempt | null>(null);
  const refreshRef = useRef(onRefreshConnections);
  refreshRef.current = onRefreshConnections;

  const clearTimers = useCallback((a: ActiveAttempt | null) => {
    if (!a) return;
    if (a.closeWatch !== null) window.clearInterval(a.closeWatch);
    if (a.cancelGrace !== null) window.clearTimeout(a.cancelGrace);
    a.closeWatch = null;
    a.cancelGrace = null;
  }, []);

  // One always-on completion listener, validated by ORIGIN + parse + NONCE.
  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      const msg = parseOAuthPopupMessage(event.data);
      if (!msg) return;
      const active = activeRef.current;
      if (!active || active.settled || msg.nonce !== active.nonce) return;

      active.settled = true;
      clearTimers(active);
      // The completion page closes itself; make sure regardless.
      try {
        active.popup?.close();
      } catch {
        /* already closed / cross-origin mid-flow — ignore */
      }
      refreshRef.current();
      setAttempt(
        msg.status === "connected"
          ? { provider: active.provider, status: "completed" }
          : {
              provider: active.provider,
              status: "failed",
              ...(msg.errorCode ? { errorCode: msg.errorCode } : {}),
            },
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [clearTimers]);

  // Unmount: stop watching. The popup (if any) is left to finish on its own;
  // the next mount's readiness resolve reflects whatever it did.
  useEffect(
    () => () => {
      clearTimers(activeRef.current);
      activeRef.current = null;
    },
    [clearTimers],
  );

  const connect = useCallback(
    (provider: string) => {
      // One popup at a time: settle (and close) any previous attempt first.
      const prev = activeRef.current;
      if (prev) {
        prev.settled = true;
        clearTimers(prev);
        try {
          prev.popup?.close();
        } catch {
          /* ignore */
        }
      }

      const nonce = makeNonce();
      const active: ActiveAttempt = {
        provider,
        nonce,
        popup: null,
        closeWatch: null,
        cancelGrace: null,
        settled: false,
      };
      activeRef.current = active;
      setAttempt({ provider, status: "launching" });

      void startOAuth(provider, {
        returnContext: { surface: OAUTH_POPUP_RETURN_SURFACE, nonce },
      })
        .then(({ redirectUrl }) => {
          if (activeRef.current !== active || active.settled) return;
          const popup = window.open(redirectUrl, `chainreact-oauth-${provider}`, POPUP_FEATURES);
          if (!popup) {
            active.settled = true;
            setAttempt({ provider, status: "popup_blocked" });
            return;
          }
          active.popup = popup;
          setAttempt({ provider, status: "waiting" });

          // Fallback completion path: the popup closed (user finished, canceled,
          // or the message was missed). Refresh from the server either way; if
          // no completion message lands within the grace window, show retry.
          active.closeWatch = window.setInterval(() => {
            if (!popup.closed) return;
            if (active.closeWatch !== null) window.clearInterval(active.closeWatch);
            active.closeWatch = null;
            if (active.settled) return;
            refreshRef.current();
            active.cancelGrace = window.setTimeout(() => {
              if (active.settled) return;
              active.settled = true;
              setAttempt({ provider, status: "canceled" });
            }, CANCEL_GRACE_MS);
          }, CLOSE_WATCH_MS);
        })
        .catch(() => {
          if (activeRef.current !== active || active.settled) return;
          active.settled = true;
          // startOAuth surfaces only typed/stable route codes; keep it generic.
          setAttempt({ provider, status: "failed", errorCode: "connect_failed" });
        });
    },
    [clearTimers],
  );

  return { attempt, connect };
}
