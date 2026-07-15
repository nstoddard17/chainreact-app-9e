"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (SEC-3).
 *
 * Renders the bot-protection challenge on the public auth forms. The solved token
 * is surfaced via `onVerify` (the parent stores it and submits it in the
 * `cf-turnstile-response` field, which the server action forwards to Supabase's
 * `captchaToken`). We deliberately disable Turnstile's own hidden input
 * (`response-field: false`) so the PARENT is the single source of truth for the
 * token — no duplicate form fields, and the parent can clear it deterministically.
 *
 * Token lifecycle:
 *   - solved            → `onVerify(token)`
 *   - expired / errored → `onExpire()` (parent clears + disables submit)
 *   - `resetSignal` bump → `turnstile.reset()` mints a FRESH token (used after a
 *     failed submit, since a Turnstile token is single-use and Supabase has now
 *     redeemed it).
 *
 * Renders NOTHING when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset — so local/dev
 * (and the existing auth tests) run untouched.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "auto" | "light" | "dark";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  "timeout-callback"?: () => void;
  "response-field"?: boolean;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
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

export function TurnstileWidget({
  onVerify,
  onExpire,
  resetSignal = 0,
}: {
  /** Called with the solved token — parent submits it + enables the button. */
  onVerify: (token: string) => void;
  /** Called when the token expires/errors — parent clears it + disables the button. */
  onExpire: () => void;
  /** Increment to force a fresh token (e.g. after a failed submit). */
  resetSignal?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callbacks without forcing a widget re-render.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    void ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return; // guard StrictMode double-mount
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        // Parent owns the hidden input — avoid a duplicate injected field.
        "response-field": false,
        callback: (token) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current(),
        "error-callback": () => onExpireRef.current(),
        "timeout-callback": () => onExpireRef.current(),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Already gone.
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // Force a fresh token when asked (post-failure). Clear the stale one first.
  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      onExpireRef.current();
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // Not ready yet — the managed widget will re-solve on its own.
      }
    }
  }, [resetSignal]);

  if (!siteKey) return null;

  return <div ref={containerRef} data-testid="turnstile-widget" className="min-h-[65px]" />;
}
