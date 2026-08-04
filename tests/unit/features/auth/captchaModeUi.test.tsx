/**
 * UI behavior of the auth forms under the central CAPTCHA policy
 * (LOCAL-AUTH-CAPTCHA-BYPASS-1).
 *
 * Mock boundaries: the TurnstileWidget (Cloudflare boundary — a real widget
 * needs the external challenge script) and the policy RESOLUTION entrypoints
 * (`resolveBrowserCaptchaMode` / `isTurnstileWidgetConfigured`) so each case
 * pins one environment outcome. The policy DECISION itself is never mocked —
 * its full environment matrix is proven unmocked in
 * tests/unit/core/security/captchaPolicy.test.ts. The hook wiring (post-mount
 * hostname re-check) is exercised for real here.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = jest.fn();
jest.mock("@/app/auth/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Scenario knobs — reset per test.
const scenario = {
  mode: "disabled" as "required" | "disabled",
  modeByHostname: null as ((hostname?: string) => "required" | "disabled") | null,
  widgetConfigured: false,
};

jest.mock("@/core/security/turnstile", () => {
  const actual = jest.requireActual("@/core/security/turnstile");
  return {
    ...actual,
    resolveBrowserCaptchaMode: jest.fn((hostname?: string) =>
      scenario.modeByHostname ? scenario.modeByHostname(hostname) : scenario.mode,
    ),
    isTurnstileWidgetConfigured: jest.fn(() => scenario.widgetConfigured),
  };
});

// Cloudflare boundary: "solve" mints a token, "expire" reports expiry — the
// same callbacks the real widget fires.
jest.mock("@/features/auth/TurnstileWidget", () => ({
  TurnstileWidget: ({
    onVerify,
    onExpire,
  }: {
    onVerify: (token: string) => void;
    onExpire: () => void;
  }) => (
    <div data-testid="turnstile-widget">
      <button type="button" data-testid="solve-captcha" onClick={() => onVerify("tok-solved")}>
        solve
      </button>
      <button type="button" data-testid="expire-captcha" onClick={() => onExpire()}>
        expire
      </button>
    </div>
  ),
}));

import { AuthForm } from "@/features/auth/AuthForm";
import { signIn } from "@/app/auth/actions";
import { CAPTCHA_MISCONFIGURED_MESSAGE } from "@/features/auth/useCaptchaMode";
import { resolveBrowserCaptchaMode } from "@/core/security/turnstile";

beforeEach(() => {
  mockSignIn.mockReset();
  scenario.mode = "disabled";
  scenario.modeByHostname = null;
  scenario.widgetConfigured = false;
  (resolveBrowserCaptchaMode as jest.Mock).mockClear();
});

function renderSignIn() {
  return render(<AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…" />);
}

async function fillCredentials() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "dev@example.test");
  await user.type(screen.getByLabelText("Password"), "password123");
  return user;
}

describe("disabled mode (local loopback / hosted v2-dev)", () => {
  it("renders no widget, no hidden token field, and submit is immediately enabled", () => {
    renderSignIn();
    expect(screen.queryByTestId("turnstile-widget")).toBeNull();
    expect(document.querySelector('input[name="cf-turnstile-response"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
  });

  it("submits without any captcha token and the FormData carries no token field", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "Invalid login credentials." });
    renderSignIn();
    const user = await fillCredentials();
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    const formData = mockSignIn.mock.calls[0]![1] as FormData;
    expect(formData.get("cf-turnstile-response")).toBeNull();
  });

  it("still surfaces normal credential errors (bypass hides nothing)", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "Invalid login credentials." });
    renderSignIn();
    const user = await fillCredentials();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid login credentials/i);
  });

  it("re-checks the policy with the real browser hostname after mount", async () => {
    renderSignIn();
    await waitFor(() =>
      expect(resolveBrowserCaptchaMode).toHaveBeenCalledWith("localhost"),
    );
  });
});

describe("required mode with the widget configured (production posture)", () => {
  beforeEach(() => {
    scenario.mode = "required";
    scenario.widgetConfigured = true;
  });

  it("renders the widget and blocks submission until a token exists", async () => {
    renderSignIn();
    expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    await fillCredentials();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("submits WITH the real token once solved", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "Invalid login credentials." });
    renderSignIn();
    const user = await fillCredentials();
    await user.click(screen.getByTestId("solve-captcha"));
    const submit = screen.getByRole("button", { name: "Sign in" });
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
    const formData = mockSignIn.mock.calls[0]![1] as FormData;
    expect(formData.get("cf-turnstile-response")).toBe("tok-solved");
  });

  it("an expired token disables submit again until re-solved", async () => {
    renderSignIn();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("solve-captcha"));
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
    await user.click(screen.getByTestId("expire-captcha"));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});

describe("required mode with the site key MISSING (misconfiguration)", () => {
  beforeEach(() => {
    scenario.mode = "required";
    scenario.widgetConfigured = false;
  });

  it("fails visibly and blocks submission — never a silent bypass", async () => {
    renderSignIn();
    expect(screen.getByRole("alert")).toHaveTextContent(CAPTCHA_MISCONFIGURED_MESSAGE);
    expect(screen.queryByTestId("turnstile-widget")).toBeNull();
    await fillCredentials();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe("post-mount hostname revocation (LAN visit to a dev server)", () => {
  it("flips from disabled to required once the non-loopback hostname is known", async () => {
    // SSR/first render sees no hostname → disabled; the mount effect reports a
    // hostname the policy rejects → required. jsdom's hostname is "localhost",
    // so any DEFINED hostname stands in for the LAN address here.
    scenario.modeByHostname = (hostname) => (hostname === undefined ? "disabled" : "required");
    scenario.widgetConfigured = true;
    renderSignIn();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled(),
    );
    expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
  });
});
