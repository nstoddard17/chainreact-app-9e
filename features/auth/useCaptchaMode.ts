"use client";

import { useEffect, useState } from "react";
import {
  isTurnstileWidgetConfigured,
  resolveBrowserCaptchaMode,
} from "@/core/security/turnstile";

/**
 * Client adapter for the central CAPTCHA policy (LOCAL-AUTH-CAPTCHA-BYPASS-1).
 *
 * Resolves the mode WITHOUT a hostname on the server render and the first
 * client render (they must produce identical HTML — no hydration fork), then
 * re-resolves with `window.location.hostname` after mount. The only flow that
 * changes anything post-mount is the abnormal one: a non-loopback visit to a
 * local dev server (LAN IP), which revokes the local bypass and flips the form
 * back to "required".
 *
 * `captchaMisconfigured` is the fail-visible state: this environment requires
 * CAPTCHA but the public site key is missing. Forms must BLOCK submission and
 * say so — never silently fall back to submitting without a token.
 */
export function useCaptchaMode(): {
  /** True when this environment must submit a real Turnstile token. */
  captchaRequired: boolean;
  /** Required AND the widget can actually render (site key present). */
  showCaptchaWidget: boolean;
  /** Required but the site key is missing — block submit, show the error. */
  captchaMisconfigured: boolean;
} {
  const [hostname, setHostname] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const captchaRequired = resolveBrowserCaptchaMode(hostname) === "required";
  const widgetConfigured = isTurnstileWidgetConfigured();
  return {
    captchaRequired,
    showCaptchaWidget: captchaRequired && widgetConfigured,
    captchaMisconfigured: captchaRequired && !widgetConfigured,
  };
}

/** User-facing copy for the required-but-unconfigured state (shared by the auth forms). */
export const CAPTCHA_MISCONFIGURED_MESSAGE =
  "Sign-in security check isn't configured for this environment. This environment requires " +
  "a CAPTCHA, but no CAPTCHA site key is set — contact the site owner. Submissions are " +
  "disabled rather than skipping the check.";
