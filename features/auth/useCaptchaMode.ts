"use client";

import { useEffect, useState } from "react";
import {
  browserSupabaseTargetClass,
  isTurnstileWidgetConfigured,
  resolveBrowserCaptchaMode,
} from "@/core/security/turnstile";

/**
 * Client adapter for the central CAPTCHA policy (LOCAL-AUTH-CAPTCHA-BYPASS-1,
 * message routing corrected in LOCAL-AUTH-CAPTCHA-BYPASS-2).
 *
 * Resolves the mode WITHOUT a hostname on the server render and the first
 * client render (they must produce identical HTML — no hydration fork), then
 * re-resolves with `window.location.hostname` after mount. The only flow that
 * changes anything post-mount is the abnormal one: a non-loopback visit to a
 * local dev server (LAN IP), which revokes the local bypass and flips the form
 * back to "required".
 *
 * `captchaMisconfiguredMessage` is the fail-visible state: this environment
 * requires CAPTCHA but the public site key is missing. Forms must BLOCK
 * submission and render the message — never silently fall back to submitting
 * without a token. BYPASS-2: when that state arises on a LOCAL DEV SERVER
 * because the build targets the PRODUCTION Supabase project (the reproduced
 * `npm run dev` + production-pointing `.env.local` case), the message tells
 * the developer how to get a working local setup instead of dead-ending with
 * "contact the site owner". The developer variant is gated on
 * `NODE_ENV === "development"`, so hosted builds can never render it.
 */
export function useCaptchaMode(): {
  /** True when this environment must submit a real Turnstile token. */
  captchaRequired: boolean;
  /** Required AND the widget can actually render (site key present). */
  showCaptchaWidget: boolean;
  /** Required but the site key is missing — block submit, show the message. */
  captchaMisconfigured: boolean;
  /** User-facing copy for the misconfigured state; null when not misconfigured. */
  captchaMisconfiguredMessage: string | null;
} {
  const [hostname, setHostname] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const captchaRequired = resolveBrowserCaptchaMode(hostname) === "required";
  const widgetConfigured = isTurnstileWidgetConfigured();
  const captchaMisconfigured = captchaRequired && !widgetConfigured;

  let captchaMisconfiguredMessage: string | null = null;
  if (captchaMisconfigured) {
    captchaMisconfiguredMessage =
      process.env.NODE_ENV === "development" &&
      browserSupabaseTargetClass() === "production"
        ? CAPTCHA_PRODUCTION_TARGET_ON_DEV_SERVER_MESSAGE
        : CAPTCHA_MISCONFIGURED_MESSAGE;
  }

  return {
    captchaRequired,
    showCaptchaWidget: captchaRequired && widgetConfigured,
    captchaMisconfigured,
    captchaMisconfiguredMessage,
  };
}

/** User-facing copy for the required-but-unconfigured state (shared by the auth forms). */
export const CAPTCHA_MISCONFIGURED_MESSAGE =
  "Sign-in security check isn't configured for this environment. This environment requires " +
  "a CAPTCHA, but no CAPTCHA site key is set — contact the site owner. Submissions are " +
  "disabled rather than skipping the check.";

/**
 * Developer-facing copy for the state Marcus reproduced (BYPASS-2): a local
 * dev server whose build targets the PRODUCTION Supabase project. CAPTCHA
 * stays required and submission stays blocked — production is never weakened —
 * but the message names the actual way out.
 */
export const CAPTCHA_PRODUCTION_TARGET_ON_DEV_SERVER_MESSAGE =
  "This local dev server is pointed at the PRODUCTION Supabase project, where the CAPTCHA " +
  "security check is always required — sign-in is blocked here rather than weakening " +
  "production. For local development, run `npm run dev:devdb` (uses the development " +
  "project, no CAPTCHA needed) instead of `npm run dev`.";
