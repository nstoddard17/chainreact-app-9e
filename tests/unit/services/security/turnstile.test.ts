/**
 * @jest-environment node
 *
 * Tests for services/security/turnstile (SEC-3). Verification is Supabase-native
 * (the app forwards the token via `captchaToken`, Supabase verifies it), so this
 * module only owns the shared token plumbing: reading the token from the form and
 * reporting whether the widget is configured.
 */

import {
  isTurnstileWidgetConfigured,
  readCaptchaToken,
  TURNSTILE_FIELD_NAME,
} from "@/services/security/turnstile";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isTurnstileWidgetConfigured", () => {
  it("reflects the public site key", () => {
    expect(isTurnstileWidgetConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "sitek";
    expect(isTurnstileWidgetConfigured()).toBe(true);
  });
});

describe("readCaptchaToken", () => {
  it("returns the token when present", () => {
    const fd = new FormData();
    fd.set(TURNSTILE_FIELD_NAME, "tok-123");
    expect(readCaptchaToken(fd)).toBe("tok-123");
  });

  it("returns undefined when the field is absent (dev / not configured)", () => {
    expect(readCaptchaToken(new FormData())).toBeUndefined();
  });

  it("returns undefined for an empty-string token", () => {
    const fd = new FormData();
    fd.set(TURNSTILE_FIELD_NAME, "");
    expect(readCaptchaToken(fd)).toBeUndefined();
  });

  it("uses the standard Turnstile field name", () => {
    expect(TURNSTILE_FIELD_NAME).toBe("cf-turnstile-response");
  });
});
