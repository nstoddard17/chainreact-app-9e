/**
 * TEAM-INVITATION-EMAIL-1 — the invitation URL must survive the whole auth
 * round trip. The accept page bounces a signed-out visitor to sign-in with
 * `returnTo=/invitations/accept?token=…`; a brand-new invitee then clicks
 * through to sign-up. These tests pin that BOTH cross-links (sign-in ⇄
 * sign-up) carry the invitation returnTo forward, that the signup flow posts
 * it back through the form, and that a hostile returnTo is dropped by
 * `safeReturnPath` (no open redirect).
 */
import { render, screen } from "@testing-library/react";

import SignUpPage from "@/app/auth/sign-up/page";
import SignInPage from "@/app/auth/sign-in/page";

const INVITE_PATH = "/invitations/accept?token=raw-token-abc";
const ENCODED = encodeURIComponent(INVITE_PATH);

describe("invitation returnTo across the auth pages", () => {
  it("sign-in carries the invitation returnTo into its 'Sign up free' link", async () => {
    render(
      await SignInPage({ searchParams: Promise.resolve({ returnTo: INVITE_PATH }) }),
    );
    const signUpLink = screen.getByRole("link", { name: /sign up free/i });
    expect(signUpLink).toHaveAttribute(
      "href",
      `/auth/sign-up?returnTo=${ENCODED}`,
    );
  });

  it("sign-up carries the invitation returnTo back into its 'Sign in' link", async () => {
    render(
      await SignUpPage({ searchParams: Promise.resolve({ returnTo: INVITE_PATH }) }),
    );
    const signInLink = screen.getByRole("link", { name: /^sign in$/i });
    expect(signInLink).toHaveAttribute(
      "href",
      `/auth/sign-in?returnTo=${ENCODED}`,
    );
  });

  it("sign-up posts the invitation returnTo through the form (hidden field)", async () => {
    const { container } = render(
      await SignUpPage({ searchParams: Promise.resolve({ returnTo: INVITE_PATH }) }),
    );
    const hidden = container.querySelector(
      'input[name="returnTo"]',
    ) as HTMLInputElement | null;
    expect(hidden).not.toBeNull();
    expect(hidden!.value).toBe(INVITE_PATH);
  });

  it("drops an absolute/hostile returnTo (no open redirect via the invite flow)", async () => {
    for (const evil of ["https://evil.example/phish", "//evil.example/phish"]) {
      const { unmount } = render(
        await SignInPage({ searchParams: Promise.resolve({ returnTo: evil }) }),
      );
      // safeReturnPath falls back to /workflows, which is the default → no carry.
      expect(screen.getByRole("link", { name: /sign up free/i })).toHaveAttribute(
        "href",
        "/auth/sign-up",
      );
      unmount();
    }
  });
});
