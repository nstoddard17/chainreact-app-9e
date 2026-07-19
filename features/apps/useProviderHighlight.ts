"use client";

import { useEffect, useRef, useState } from "react";

const HIGHLIGHT_MS = 2600;

/**
 * 5.ONBOARD-1 Batch 3 — `/apps?highlight=<provider>` handling.
 *
 * One-shot: on mount, scrolls the matching provider card into view (smooth
 * only when the user hasn't asked for reduced motion) and returns the provider
 * id as the transient "highlighted" value for ~2.6s. The query param is
 * CONSUMED via history.replaceState immediately, so reload/back/forward never
 * replay the scroll. Navigation/attention only — Connect/Reconnect are never
 * clicked and no permission check is bypassed (the card's own gated buttons
 * remain the only path).
 */
export function useProviderHighlight(provider: string | null): string | null {
  const [active, setActive] = useState<string | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!provider || firedRef.current) return;
    firedRef.current = true;

    try {
      window.history.replaceState(null, "", "/apps");
    } catch {
      /* history unavailable — ref guard still prevents replays */
    }

    const el = document.querySelector<HTMLElement>(
      `[data-provider-id="${CSS.escape(provider)}"]`,
    );
    if (!el) return; // unknown/filtered provider → quiet no-op

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    el.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setActive(provider);
  }, [provider]);

  // Auto-clear lives in its own effect keyed on `active`, NOT alongside the
  // one-shot block above: React re-runs effects (StrictMode double-invoke in
  // dev, and future re-mounts), and a timer created inside the ref-guarded
  // effect would be cleared by that run's cleanup while the guard prevents a
  // replacement from ever being scheduled — leaving the highlight stuck on
  // forever. Keyed on `active`, the timer is always re-created after cleanup.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return active;
}
