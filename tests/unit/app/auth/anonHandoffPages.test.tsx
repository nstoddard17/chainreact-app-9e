/**
 * ANON-BUILDER-3 Scope B — the cross-browser localStorage caveat is surfaced in
 * the auth-gate UX: when the user arrives via an anonymous-draft gate
 * (returnTo=/start/continue), the sign-up / sign-in pages show a "finish in this
 * same browser" note and the contextual reason. Without that returnTo, neither
 * appears.
 */
import { render, screen } from "@testing-library/react";

// The server actions are imported by the pages; they create the supabase client
// lazily inside the action, so importing them here is inert.
import SignUpPage from "@/app/auth/sign-up/page";
import SignInPage from "@/app/auth/sign-in/page";

describe("anonymous-draft auth gate UX", () => {
  it("sign-up shows the same-browser note + contextual reason in the restore flow", async () => {
    render(await SignUpPage({ searchParams: Promise.resolve({ returnTo: "/start/continue", reason: "save" }) }));
    expect(screen.getByTestId("auth-same-browser-note")).toHaveTextContent(/same browser/i);
    expect(screen.getByTestId("auth-reason")).toHaveTextContent(
      "Create an account to save this workflow.",
    );
  });

  it("sign-in shows the same-browser note + contextual reason in the restore flow", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({ returnTo: "/start/continue", reason: "activate" }) }));
    expect(screen.getByTestId("auth-same-browser-note")).toHaveTextContent(/same browser/i);
    expect(screen.getByTestId("auth-reason")).toHaveTextContent(
      "Sign in to activate this workflow.",
    );
  });

  it("shows neither note nor reason for a normal sign-up (no returnTo)", async () => {
    render(await SignUpPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByTestId("auth-same-browser-note")).toBeNull();
    expect(screen.queryByTestId("auth-reason")).toBeNull();
  });

  it("does not show the same-browser note for a non-restore returnTo", async () => {
    render(await SignUpPage({ searchParams: Promise.resolve({ returnTo: "/workflows" }) }));
    expect(screen.queryByTestId("auth-same-browser-note")).toBeNull();
  });
});
