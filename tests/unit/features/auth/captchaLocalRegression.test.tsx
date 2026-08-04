/**
 * LOCAL-AUTH-CAPTCHA-BYPASS-2 — regression tests for the REAL reproduced
 * failure, running the REAL policy (no mock of @/core/security/turnstile).
 *
 * Reproduced state (2026-08-03, Marcus's session): a plain `npm run dev`
 * server whose `.env.local` targets the PRODUCTION Supabase project rendered
 * the sign-in form as required + no site key — red configuration error,
 * disabled submit — on localhost. Policy resolution was correct (production
 * target must stay fail-closed), but the message dead-ended a developer with
 * "contact the site owner". These tests pin:
 *   1. the intended local state (development target + localhost + no key)
 *      renders NO error, NO widget, and an enabled submit, and
 *   2. the reproduced state keeps blocking but shows the actionable
 *      developer-facing guidance (this failed before the BYPASS-2 repair).
 *
 * Env control: NODE_ENV / NEXT_PUBLIC_SUPABASE_URL are set per test —
 * `resolveBrowserCaptchaMode` reads process.env at call time under Jest.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = jest.fn();
jest.mock("@/app/auth/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

import { AuthForm } from "@/features/auth/AuthForm";
import { signIn } from "@/app/auth/actions";
import {
  CAPTCHA_MISCONFIGURED_MESSAGE,
  CAPTCHA_PRODUCTION_TARGET_ON_DEV_SERVER_MESSAGE,
} from "@/features/auth/useCaptchaMode";

const DEV_SUPABASE = "https://syvnzqzctnywakgyykmz.supabase.co";
const PROD_SUPABASE = "https://qcepijemjlkssfkvzlio.supabase.co";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// process.env is an exotic object — plain string assignment is the only
// mutation Node reliably honours (defineProperty silently misbehaves).
const mutableEnv = process.env as Record<string, string | undefined>;

function setEnv(nodeEnv: string, supabaseUrl: string | undefined): void {
  mutableEnv.NODE_ENV = nodeEnv;
  if (supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; // "no site key" in every case here
}

afterEach(() => {
  mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  if (ORIGINAL_SITE_KEY === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ORIGINAL_SITE_KEY;
  mockSignIn.mockReset();
});

function renderSignIn() {
  return render(<AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…" />);
}

describe("intended local state — development target + localhost + no site key", () => {
  // jsdom's window.location.hostname is "localhost".
  it("renders no configuration error, no widget, and an enabled submit; submit omits the token field", async () => {
    setEnv("development", DEV_SUPABASE);
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "Invalid login credentials." });
    renderSignIn();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("turnstile-widget")).toBeNull();
    expect(document.querySelector('input[name="cf-turnstile-response"]')).toBeNull();

    const submit = screen.getByRole("button", { name: "Sign in" });
    expect(submit).not.toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "dev@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(submit);
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    const formData = mockSignIn.mock.calls[0]![1] as FormData;
    expect(formData.get("cf-turnstile-response")).toBeNull();

    // The bypass hides nothing: the normal credential error still surfaces.
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid login credentials/i);
  });

  it("mode stays disabled after the mount-time hostname re-check (no permanent required fallback)", async () => {
    setEnv("development", DEV_SUPABASE);
    renderSignIn();
    // The post-mount effect re-resolves with the real hostname; on loopback the
    // submit must STAY enabled — the bug class where the form starts required
    // and never updates (or flips required after mount) would fail here.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("reproduced state — PRODUCTION target on a local dev server, no site key", () => {
  it("keeps CAPTCHA required and submission blocked, but shows the actionable developer guidance", () => {
    setEnv("development", PROD_SUPABASE);
    renderSignIn();

    // Fail-closed is preserved: no bypass, submit disabled.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.queryByTestId("turnstile-widget")).toBeNull();

    // BYPASS-2: the developer is told the actual way out (dev:devdb), not
    // "contact the site owner". This assertion FAILED before the repair.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(CAPTCHA_PRODUCTION_TARGET_ON_DEV_SERVER_MESSAGE);
    expect(alert).toHaveTextContent(/npm run dev:devdb/);
  });
});

describe("hosted misconfiguration — production build, no site key", () => {
  it("shows the generic owner-facing message (never local developer internals)", () => {
    setEnv("production", PROD_SUPABASE);
    renderSignIn();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(CAPTCHA_MISCONFIGURED_MESSAGE);
    expect(alert).not.toHaveTextContent(/dev:devdb/);
  });
});
