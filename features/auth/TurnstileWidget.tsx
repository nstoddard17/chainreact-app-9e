"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (SEC-3).
 *
 * Renders the bot-protection challenge on public auth forms (sign-up, sign-in,
 * password reset). The widget injects a single-use token into a hidden form field
 * (`cf-turnstile-response`) which the form's server action forwards to
 * `verifyTurnstileToken` for server-side verification.
 *
 * Renders NOTHING when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset — so local/dev
 * (and the existing auth tests) run untouched. In production, with the key set,
 * the widget appears and the server enforces the token (fail-closed).
 *
 * Uses explicit rendering (the script is loaded with `render=explicit`) because
 * the widget mounts inside a client component after the script may already have
 * loaded — implicit auto-scan wouldn't catch it reliably.
 */

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; theme?: "auto" | "light" | "dark"; callback?: (token: string) => void },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function ensureScript(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      // If it already loaded, turnstile is present; the check above handles it.
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    void ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      // Guard against a double render (StrictMode remount).
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget already gone — nothing to clean up.
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // No site key → render nothing (widget disabled; server skips enforcement).
  if (!siteKey) return null;

  return <div ref={containerRef} data-testid="turnstile-widget" className="min-h-[65px]" />;
}
